import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { createD1Store } from './d1Store.js'
import { derive } from '../src/data.js'
import { renderDocument } from './documentHtml.js'

export function mockD1() {
  const db = new DatabaseSync(':memory:')
  db.exec(readFileSync(new URL('../migrations/0001_initial.sql', import.meta.url), 'utf8'))
  const prepare = sql => ({
    bind(...params) {
      const statement = db.prepare(sql)
      return {
        first: async () => statement.get(...params) || null,
        all: async () => ({ results: statement.all(...params) }),
        run: async () => statement.run(...params),
      }
    },
    first: async () => db.prepare(sql).get() || null,
    run: async () => db.prepare(sql).run(),
  })
  return {
    prepare,
    batch: async statements => {
      db.exec('BEGIN')
      try { for (const statement of statements) await statement.run(); db.exec('COMMIT') }
      catch (error) { db.exec('ROLLBACK'); throw error }
    },
    close: () => db.close(),
  }
}

test('D1 starts empty, publishes only selected variants, and derives stock from transactions', async () => {
  const db = mockD1()
  const store = createD1Store(db)
  try {
    const initial = await store.snapshot()
    assert.deepEqual(initial.state.settings, { margin: 30, priceStep: 25 })
    assert.equal(initial.state.products.length, 0)
    const apply = (kind, id, payload, baseRevision = 0) => store.apply({ opId: crypto.randomUUID(), kind, id, payload, baseRevision })
    assert.equal((await apply('families', 'family-1', { id: 'family-1', name: 'Maison', category: 'Vin', volume: '75 cl' })).conflict, false)
    const product = { code: 'VIN-1', familyId: 'family-1', variant: 'Rouge', unitsPerCase: 6,
      margin: null, picture: 'a-picture.jpg', published: false }
    assert.equal((await apply('products', product.code, product)).conflict, false)
    assert.deepEqual(await store.publicCatalog(), [])
    product.published = true
    const publish = { opId: crypto.randomUUID(), kind: 'products', id: product.code, payload: product, baseRevision: 1 }
    assert.equal((await store.apply(publish)).conflict, false)
    assert.deepEqual(await store.apply(publish), await store.apply(publish))
    assert.equal((await apply('products', product.code, product, 1)).conflict, true)
    assert.equal((await store.publicCatalog())[0].available, false)
    assert.equal((await store.publicCatalog())[0].suggestedPrice, 0)
    await apply('invoices', 'invoice-1', { id: 'invoice-1', date: '2026-10-26', supplierId: null,
      purchaseOrderId: null, lines: [{ id: 'line-1', productCode: 'VIN-1', cases: 1, casePrice: 100 }] })
    assert.equal((await store.publicCatalog())[0].available, true)
    await apply('sales', 'sale-1', { id: 'sale-1', date: '2026-10-26', number: '20261026-001',
      lines: [{ id: 'sale-line-1', productCode: 'VIN-1', quantity: 6, unitPrice: 30 }],
      status: 'Confirmée/Vendue', customerId: null })
    const publicProduct = (await store.publicCatalog())[0]
    assert.equal(publicProduct.available, false)
    assert.equal(publicProduct.picture, 'a-picture.jpg')
    assert.equal(publicProduct.suggestedPrice, 25)
    assert.equal(publicProduct.name, 'Maison Rouge 75 cl')
    assert.equal(publicProduct.shortName, 'Maison Rouge')
    assert.equal(publicProduct.volume, '75 cl')
    assert.deepEqual(Object.keys(publicProduct).sort(), ['available', 'category', 'code', 'name', 'picture', 'shortName', 'suggestedPrice', 'variant', 'volume'])
    product.published = false
    assert.equal((await apply('products', product.code, product, 2)).conflict, false)
    assert.deepEqual(await store.publicCatalog(), [])
  } finally { db.close() }
})

test('D1 replacement resets the epoch and keeps an empty catalogue', async () => {
  const db = mockD1()
  const store = createD1Store(db)
  try {
    const before = await store.snapshot()
    const blank = { families: [], products: [], invoices: [], suppliers: [], customers: [],
      purchaseOrders: [], sales: [], expenses: [], settings: { margin: 25, priceStep: 10 } }
    const after = await store.replace(blank)
    assert.notEqual(after.epoch, before.epoch)
    assert.deepEqual(after.state.products, [])
    assert.deepEqual(after.state.settings, blank.settings)
    assert.equal((await store.changesSince(before.seq, before.epoch)).reset, true)
  } finally { db.close() }
})

test('D1 rejects duplicate sale numbers and missing receipts for confirmed lines', async () => {
  const db = mockD1()
  const store = createD1Store(db)
  const apply = (kind, id, payload, baseRevision = 0, deleted = false) =>
    store.apply({ opId: crypto.randomUUID(), kind, id, payload, baseRevision, deleted })
  try {
    await apply('families', 'f', { id: 'f', name: 'Test', category: 'Boisson' })
    for (const code of ['A', 'B']) await apply('products', code, { code, familyId: 'f', variant: code, format: '75cl', unitsPerCase: 6 })
    const invoice = { id: 'i', date: '2026-10-20', supplierId: null, purchaseOrderId: null,
      lines: [{ id: 'r', productCode: 'A', cases: 1, casePrice: 600 }] }
    await apply('invoices', 'i', invoice)
    const sale = { id: 's', date: '2026-10-21', number: '20261021-001', customerId: null, status: 'Confirmée/Vendue',
      lines: [{ id: 'l1', productCode: 'A', quantity: 8, unitPrice: 200 }, { id: 'l2', productCode: 'B', quantity: 1, unitPrice: 300 }] }
    assert.match((await apply('sales', 's', sale)).reason, /Réception/)
    await apply('invoices', 'i', { ...invoice, lines: [...invoice.lines, { id: 'r2', productCode: 'B', cases: 1, casePrice: 1200 }] }, 1)
    assert.equal((await apply('sales', 's', sale)).conflict, false)
    await store.createShare('sale', 's', 'hash')
    const shared = await store.sharedDocument('hash')
    assert.equal(shared.kind, 'sale')
    assert.equal(shared.document.lines.length, 2)
    assert.equal((await apply('sales', 's2', { ...sale, id: 's2' })).conflict, true)
    assert.match((await apply('invoices', 'i', null, 2, true)).reason, /nécessaire/)
    const report = (await store.snapshot()).state
    assert.equal(derive(report).products.find(row => row.code === 'A').stock, -2)
  } finally { db.close() }
})

test('shared sale HTML shows selling details without private financials or contacts', () => {
  const html = renderDocument({ kind: 'sale', document: { number: '20261021-001', date: '2026-10-21',
    customerName: '<Client>', status: 'Confirmée/Vendue', payment: 'Espèces', revenue: 600,
    cost: 400, profit: 200, phone: 'PRIVATE-PHONE', email: 'PRIVATE-EMAIL',
    lines: [{ id: 'l', productCode: 'A', product: { brand: 'Produit', variant: 'A', format: '75cl' }, quantity: 2, unitPrice: 300, revenue: 600, cost: 400 }] } })
  assert.match(html, /&lt;Client&gt;/)
  assert.match(html, /Produit A 75cl/)
  assert.match(html, /Espèces/)
  assert.doesNotMatch(html, /PRIVATE-|Bénéfice|Coût|400/)
})

test('an existing legacy sale keeps its stable number through edits', async () => {
  const db = mockD1()
  const store = createD1Store(db)
  try {
    const state = { families: [{ id: 'f', name: 'Test', category: 'Boisson' }],
      products: [{ code: 'A', familyId: 'f', variant: 'Rouge', format: '75cl', unitsPerCase: 6 }],
      invoices: [], suppliers: [], customers: [], purchaseOrders: [], expenses: [],
      sales: [{ id: 'old', date: '2026-10-21', productCode: 'A', quantity: 1, unitPrice: 20,
        customerId: null, status: 'En attente' }], settings: { margin: 30, priceStep: 25 } }
    await store.replace(state)
    const edited = { ...state.sales[0], number: 'LEGACY-old', lines: [{ id: 'legacy-old', productCode: 'A', quantity: 2, unitPrice: 20 }] }
    const apply = baseRevision => store.apply({ opId: crypto.randomUUID(), kind: 'sales', id: 'old', baseRevision, payload: edited })
    assert.equal((await apply(1)).conflict, false)
    assert.equal((await apply(2)).conflict, false)
    assert.equal(derive((await store.snapshot()).state).sales[0].number, 'LEGACY-old')
  } finally { db.close() }
})
