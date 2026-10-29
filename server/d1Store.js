import { derive, normalizeState, saleLines, saleNumber } from '../src/data.js'

const COLLECTIONS = ['families', 'products', 'invoices', 'suppliers', 'customers', 'purchaseOrders', 'sales', 'expenses']
const idFor = (kind, row) => kind === 'products' ? row.code : row.id
const bad = (message, status = 400) => Object.assign(new Error(message), { status })

function invalidReference({ kind, id, payload, deleted }, state) {
  const exists = (collection, target) => !target || state[collection].some(row => String(idFor(collection, row)) === String(target))
  if (kind === 'invoices') {
    const invoices = deleted ? state.invoices.filter(row => row.id !== id) : [...state.invoices.filter(row => row.id !== id), payload]
    const receipts = derive({ ...state, invoices }).receipts
    if (state.sales.some(sale => sale.status === 'Confirmée/Vendue' && saleLines(sale).some(line =>
      !receipts.some(receipt => receipt.productCode === line.productCode && receipt.date <= sale.date))))
      return 'Cette réception est nécessaire à une vente confirmée.'
  }
  if (kind === 'settings' && deleted) return 'Les paramètres ne peuvent pas être supprimés.'
  if (deleted) {
    if (kind === 'families' && state.products.some(row => row.familyId === id)) return 'Cette fiche contient encore des variantes.'
    if (kind === 'products' && (state.invoices.some(row => row.lines?.some(line => line.productCode === id)) ||
      state.purchaseOrders.some(row => row.lines?.some(line => line.productCode === id)) || state.sales.some(row => saleLines(row).some(line => line.productCode === id)))) return 'Ce produit est utilisé par une opération.'
    if (kind === 'suppliers' && (state.invoices.some(row => row.supplierId === id) || state.purchaseOrders.some(row => row.supplierId === id))) return 'Ce fournisseur est utilisé par une opération.'
    if (kind === 'customers' && state.sales.some(row => row.customerId === id)) return 'Ce client est utilisé par une vente.'
    if (kind === 'purchaseOrders' && state.invoices.some(row => row.purchaseOrderId === id)) return 'Ce PO possède des factures liées.'
    return null
  }
  if (kind === 'products' && !exists('families', payload.familyId)) return 'La fiche produit est introuvable.'
  if (kind === 'invoices' && (!exists('suppliers', payload.supplierId) || !exists('purchaseOrders', payload.purchaseOrderId) ||
    payload.lines?.some(line => !exists('products', line.productCode)))) return 'Une référence de cette facture est introuvable.'
  if (kind === 'purchaseOrders' && (!exists('suppliers', payload.supplierId) || payload.lines?.some(line => !exists('products', line.productCode)))) return 'Une référence de ce PO est introuvable.'
  if (kind === 'purchaseOrders' && state.purchaseOrders.some(row => row.id !== id && row.number?.toLocaleLowerCase('fr') === payload.number?.toLocaleLowerCase('fr'))) return 'Ce numéro de PO existe déjà.'
  if (kind === 'sales' && (!exists('customers', payload.customerId) || !Array.isArray(payload.lines) || !payload.lines.length ||
    payload.lines.some(line => !exists('products', line.productCode) || !Number.isInteger(Number(line.quantity)) || Number(line.quantity) < 1 ||
      !Number.isFinite(Number(line.unitPrice)) || Number(line.unitPrice) <= 0))) return 'Une ligne de cette vente est invalide.'
  if (kind === 'sales' && !(payload.number === `LEGACY-${id}` && state.sales.some(row => row.id === id && (!row.number || row.number === payload.number))) &&
    (!/^\d{8}-\d{3}$/.test(payload.number || '') ||
      payload.number.slice(0, 8) !== String(payload.date || '').replaceAll('-', ''))) return 'Numéro de vente invalide.'
  if (kind === 'sales' && state.sales.some(row => row.id !== id && saleNumber(row) === payload.number)) return 'Ce numéro de vente existe déjà.'
  if (kind === 'sales' && payload.status === 'Confirmée/Vendue' && saleLines(payload).some(line =>
    !derive(state).receipts.some(receipt => receipt.productCode === line.productCode && receipt.date <= payload.date)))
    return 'Réception manquante à la date de cette vente.'
  return null
}

const stateFromRows = rows => {
  const state = Object.fromEntries(COLLECTIONS.map(kind => [kind, []]))
  state.settings = { margin: 30, priceStep: 25 }
  const revisions = {}
  for (const row of rows) {
    revisions[`${row.kind}:${row.id}`] = row.revision
    if (row.deleted) continue
    if (row.kind === 'settings') state.settings = JSON.parse(row.payload)
    else if (COLLECTIONS.includes(row.kind)) state[row.kind].push(JSON.parse(row.payload))
  }
  return { state, revisions }
}

export function createD1Store(db) {
  const meta = async key => (await db.prepare('SELECT value FROM meta WHERE key=?').bind(key).first())?.value
  const rows = async (kinds = COLLECTIONS.concat('settings')) =>
    (await db.prepare(`SELECT kind,id,payload,revision,deleted FROM records WHERE kind IN (${kinds.map(() => '?').join(',')})`).bind(...kinds).all()).results
  const currentSeq = async () => Number((await db.prepare('SELECT COALESCE(MAX(seq),0) AS seq FROM changes').first()).seq)
  const readState = async () => stateFromRows(await rows())
  const snapshot = async () => ({ epoch: await meta('epoch'),
    seq: await currentSeq(), ...await readState() })
  const replace = async input => {
    const state = normalizeState(input)
    if (!state) throw bad('Sauvegarde invalide.')
    const statements = [db.prepare('DELETE FROM records'), db.prepare('DELETE FROM changes'), db.prepare('DELETE FROM shares')]
    for (const kind of COLLECTIONS) {
      const records = (state[kind] || []).map(row => {
        const id = idFor(kind, row)
        if (!id) throw bad(`Identifiant manquant dans ${kind}.`)
        return { id: String(id), payload: row }
      })
      statements.push(db.prepare(`INSERT INTO records(kind,id,payload,revision,deleted,op_id)
        SELECT ?,json_extract(value,'$.id'),json_extract(value,'$.payload'),1,0,? || json_extract(value,'$.id')
        FROM json_each(?)`).bind(kind, `import-${crypto.randomUUID()}-`, JSON.stringify(records)))
    }
    statements.push(db.prepare('INSERT INTO records(kind,id,payload,revision,deleted,op_id) VALUES(?,?,?,?,?,?)')
      .bind('settings', 'main', JSON.stringify(state.settings), 1, 0, `import-${crypto.randomUUID()}`))
    statements.push(db.prepare('DELETE FROM changes'))
    statements.push(db.prepare("INSERT INTO meta(key,value) VALUES('epoch',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(crypto.randomUUID()))
    await db.batch(statements)
    return snapshot()
  }
  const apply = async change => {
    const { opId, kind, id, baseRevision, payload, deleted = false } = change || {}
    if (!opId || !id || ![...COLLECTIONS, 'settings'].includes(kind) || !Number.isInteger(baseRevision) || baseRevision < 0) throw bad('Modification invalide.')
    const previous = await db.prepare('SELECT seq,revision FROM changes WHERE op_id=?').bind(opId).first()
    if (previous) return { conflict: false, kind, id, revision: previous.revision, seq: previous.seq }
    const current = await db.prepare('SELECT payload,revision,deleted FROM records WHERE kind=? AND id=?').bind(kind, id).first()
    const revision = current?.revision || 0
    const conflict = reason => ({ conflict: true, kind, id, revision, reason,
      payload: current && !current.deleted ? JSON.parse(current.payload) : null, deleted: Boolean(current?.deleted) })
    if (revision !== baseRevision) return conflict()
    if (!deleted && (!payload || typeof payload !== 'object' || Array.isArray(payload) ||
      (kind !== 'settings' && String(idFor(kind, payload)) !== String(id)))) throw bad('Contenu invalide.')
    const reason = invalidReference({ kind, id, payload, deleted }, (await readState()).state)
    if (reason) return conflict(reason)
    try {
      const updated = await db.prepare(`INSERT INTO records(kind,id,payload,revision,deleted,op_id) VALUES(?,?,?,?,?,?)
        ON CONFLICT(kind,id) DO UPDATE SET payload=excluded.payload,revision=excluded.revision,
          deleted=excluded.deleted,op_id=excluded.op_id WHERE records.revision=? RETURNING revision`)
        .bind(kind, id, deleted ? null : JSON.stringify(payload), revision + 1, deleted ? 1 : 0, opId, baseRevision).first()
      if (!updated) {
        const latest = await db.prepare('SELECT payload,revision,deleted FROM records WHERE kind=? AND id=?').bind(kind, id).first()
        return { conflict: true, kind, id, revision: latest?.revision || 0,
          payload: latest && !latest.deleted ? JSON.parse(latest.payload) : null, deleted: Boolean(latest?.deleted) }
      }
      const committed = await db.prepare('SELECT seq,revision FROM changes WHERE op_id=?').bind(opId).first()
      return { conflict: false, kind, id, revision: committed.revision, seq: committed.seq }
    } catch (error) {
      const committed = await db.prepare('SELECT seq,revision FROM changes WHERE op_id=?').bind(opId).first()
      if (committed) return { conflict: false, kind, id, revision: committed.revision, seq: committed.seq }
      throw error
    }
  }
  const changesSince = async (after, epoch) => {
    const actualEpoch = await meta('epoch')
    if (epoch !== actualEpoch) return { reset: true, ...await snapshot() }
    const changes = (await db.prepare('SELECT seq,kind,id,payload,revision,deleted FROM changes WHERE seq>? ORDER BY seq').bind(after).all()).results
      .map(row => ({ ...row, payload: row.payload ? JSON.parse(row.payload) : null, deleted: Boolean(row.deleted) }))
    return { reset: false, epoch, seq: await currentSeq(), changes }
  }
  const shareStatus = async (kind, id) => Boolean(await db.prepare('SELECT 1 FROM shares WHERE kind=? AND id=? AND active=1').bind(kind, id).first())
  const createShare = async (kind, id, tokenHash) => {
    if (!['invoice', 'order', 'sale'].includes(kind)) throw bad('Type de document invalide.')
    const collection = kind === 'invoice' ? 'invoices' : kind === 'sale' ? 'sales' : 'purchaseOrders'
    const row = await db.prepare('SELECT deleted FROM records WHERE kind=? AND id=?').bind(collection, id).first()
    if (!row || row.deleted) throw bad('Document introuvable.', 404)
    await db.batch([
      db.prepare('UPDATE shares SET active=0 WHERE kind=? AND id=?').bind(kind, id),
      db.prepare('INSERT INTO shares(token_hash,kind,id) VALUES(?,?,?)').bind(tokenHash, kind, id),
    ])
  }
  const revokeShare = async (kind, id) => db.prepare('UPDATE shares SET active=0 WHERE kind=? AND id=?').bind(kind, id).run()
  const sharedDocument = async tokenHash => {
    const share = await db.prepare('SELECT kind,id FROM shares WHERE token_hash=? AND active=1').bind(tokenHash).first()
    if (!share) return null
    const report = derive((await readState()).state)
    const document = share.kind === 'invoice' ? report.invoices.find(row => row.id === share.id)
      : share.kind === 'sale' ? report.sales.find(row => row.id === share.id)
        : report.purchaseOrders.find(row => row.id === share.id)
    return document ? { kind: share.kind, document } : null
  }
  const publicCatalog = async () => {
    const state = stateFromRows(await rows(['families', 'products', 'invoices', 'sales', 'settings'])).state
    return derive(state).products.filter(row => row.published === true).map(row => ({
      code: row.code, name: row.name, shortName: row.shortName, category: row.product, volume: row.format,
      variant: row.variant, picture: row.picture || null, available: row.stock > 0,
      suggestedPrice: row.suggestedPrice,
    }))
  }
  return { snapshot, replace, apply, changesSince, shareStatus, createShare, revokeShare, sharedDocument, publicCatalog }
}
