import { readFileSync, globSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { generateProductCode, normalizeState } from '../src/data.js'

const csvPath = process.argv.slice(2).find(arg => !arg.startsWith('--')) || 'alcohol_beverages_family_variants.csv'
const dryRun = process.argv.includes('--dry-run')
const dbPath = globSync('.wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite')
  .find(path => !path.endsWith('metadata.sqlite'))
if (!dbPath) throw new Error('Local D1 database not found')

function parseCsv(text) {
  const rows = []
  let row = [], cell = '', quoted = false
  for (let index = 0; index < text.length; index++) {
    const char = text[index]
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { cell += '"'; index++ }
      else if (char === '"') quoted = false
      else cell += char
    } else if (char === '"') quoted = true
    else if (char === ',') { row.push(cell); cell = '' }
    else if (char === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = '' }
    else cell += char
  }
  if (quoted) throw new Error('Unclosed CSV field')
  if (cell || row.length) { row.push(cell.replace(/\r$/, '')); rows.push(row) }
  return rows
}

const key = (...parts) => parts.map(value => String(value || '').trim().toLocaleLowerCase('fr')).join('|')
const tokens = value => String(value).toLocaleLowerCase('fr').replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/).filter(Boolean)
const similarity = (left, right) => {
  const words = tokens(right), total = tokens(left).length + words.length
  let shared = 0
  for (const word of tokens(left)) {
    const index = words.indexOf(word)
    if (index >= 0) { shared++; words.splice(index, 1) }
  }
  return 2 * shared / total
}
const [header, ...input] = parseCsv(readFileSync(csvPath, 'utf8').replace(/^\uFEFF/, ''))
if (!['family_name,category,variant,volume,units_per_case', 'family_name,category,variant,volume,units_per_case,code'].includes(header?.join(',')))
  throw new Error(`Unexpected CSV header: ${header?.join(',')}`)
const rows = input.map((cells, index) => {
  if (cells.length !== header.length) throw new Error(`Row ${index + 2}: wrong column count`)
  const [name, category, variant, format, quantity, rawCode = ''] = cells.map(value => value.trim())
  const unitsPerCase = Number(quantity)
  if (!name || !category || !format || !Number.isSafeInteger(unitsPerCase) || unitsPerCase < 1)
    throw new Error(`Row ${index + 2}: invalid product fields`)
  return { name, category, variant, format, unitsPerCase, code: rawCode.toUpperCase() }
})
const rowKeys = rows.map(row => key(row.name, row.category, row.variant, row.format))
if (new Set(rowKeys).size !== rows.length) throw new Error('Duplicate family, variant and volume in CSV')

// Match each revised row to the first sample import before writing, preserving its code.
const [oldHeader, ...oldInput] = parseCsv(readFileSync('alcohol_beverages_sample.csv', 'utf8').replace(/^\uFEFF/, ''))
if (oldHeader?.join(',') !== 'name,category,volume(size),units per case') throw new Error('Original sample CSV is missing')
const original = oldInput.map(cells => ({ name: cells[0], category: cells[1], format: cells[2], unitsPerCase: Number(cells[3]) }))
const matchedOriginal = new Map(), usedOriginal = new Set()
for (const row of rows) {
  const brand = row.name.endsWith(row.category) ? row.name.slice(0, -row.category.length).trim() : row.name
  const candidates = original.filter(old => old.category === row.category && old.format === row.format &&
    old.unitsPerCase === row.unitsPerCase && old.name.toLocaleLowerCase('fr').startsWith(brand.toLocaleLowerCase('fr')))
    .map(old => ({ old, score: similarity(old.name, `${row.name} ${row.variant}`) }))
    .sort((a, b) => b.score - a.score)
  if (!candidates.length || candidates[0].score < 0.4 || (candidates[1] && candidates[0].score === candidates[1].score))
    throw new Error(`Ambiguous original sample match: ${row.name} / ${row.variant} / ${row.format}`)
  const old = candidates[0].old
  const oldKey = key(old.name, old.category, old.format)
  if (usedOriginal.has(oldKey)) throw new Error(`Original sample row matched twice: ${old.name}`)
  usedOriginal.add(oldKey)
  matchedOriginal.set(key(row.name, row.category, row.variant, row.format), old)
}
if (rows.length === original.length && usedOriginal.size !== original.length) throw new Error('Unmatched original sample rows')

const db = new DatabaseSync(dbPath)
const active = db.prepare("SELECT kind,id,payload,revision FROM records WHERE deleted=0 AND kind IN ('families','products')").all()
const families = active.filter(record => record.kind === 'families').map(record => ({ ...JSON.parse(record.payload), revision: record.revision }))
const products = active.filter(record => record.kind === 'products').map(record => ({ ...JSON.parse(record.payload), revision: record.revision }))
const oldFamilies = new Map(families.map(family => [key(family.name, family.category, family.volume), family]))
const newFamilies = new Map(families.filter(family => !family.volume).map(family => [key(family.name, family.category), family]))
const pendingFamilies = new Map(), pendingProducts = [], redundant = new Set(), assignedCodes = new Set()
let alreadyPresent = 0
for (const row of rows) {
  const familyKey = key(row.name, row.category)
  let family = newFamilies.get(familyKey)
  const present = family && products.find(product => product.familyId === family.id &&
    key(product.variant, product.format) === key(row.variant, row.format))
  if (present) {
    if ((row.code && row.code !== present.code) || present.unitsPerCase !== row.unitsPerCase) throw new Error(`Existing variant differs: ${row.name} / ${row.variant}`)
    assignedCodes.add(present.code); alreadyPresent++; continue
  }
  const old = matchedOriginal.get(key(row.name, row.category, row.variant, row.format))
  const sourceFamily = oldFamilies.get(key(old.name, old.category, old.format))
  const sourceProducts = sourceFamily ? products.filter(product => product.familyId === sourceFamily.id) : []
  const source = sourceProducts.find(product => !product.variant && !product.format && product.unitsPerCase === row.unitsPerCase)
  if (sourceFamily && (!source || sourceProducts.length !== 1)) throw new Error(`Original family cannot be migrated: ${old.name}`)
  if (source && row.code && row.code !== source.code) throw new Error(`Code mismatch: ${old.name}`)
  if (!family) {
    family = sourceFamily || { id: randomUUID(), revision: 0 }
    newFamilies.set(familyKey, family)
  }
  const code = source?.code || row.code || generateProductCode(row.category, products)
  if (assignedCodes.has(code) || (!source && products.some(product => product.code === code))) throw new Error(`Duplicate code: ${code}`)
  assignedCodes.add(code)
  const product = source || { code, revision: 0, margin: null, picture: null, published: false }
  const updated = { ...product, familyId: family.id, variant: row.variant, format: row.format, unitsPerCase: row.unitsPerCase }
  pendingProducts.push(updated)
  pendingFamilies.set(family.id, { id: family.id, name: row.name, category: row.category, revision: family.revision })
  if (sourceFamily && sourceFamily.id !== family.id) redundant.add(sourceFamily.id)
  if (!source) products.push(updated)
}
// Upgrade unrelated legacy products too, keeping their family and variant codes.
const scheduledCodes = new Set(pendingProducts.map(product => product.code))
for (const legacy of families.filter(family => family.volume && !redundant.has(family.id) && !pendingFamilies.has(family.id))) {
  const familyKey = key(legacy.name, legacy.category)
  const canonical = newFamilies.get(familyKey) || legacy
  newFamilies.set(familyKey, canonical)
  if (canonical.id !== legacy.id) redundant.add(legacy.id)
  else pendingFamilies.set(legacy.id, { id: legacy.id, name: legacy.name, category: legacy.category, revision: legacy.revision })
  for (const product of products.filter(product => product.familyId === legacy.id && !scheduledCodes.has(product.code))) {
    pendingProducts.push({ ...product, familyId: canonical.id, format: product.format || legacy.volume })
    scheduledCodes.add(product.code)
  }
}
console.log(`CSV rows: ${rows.length}; groups: ${new Set(rows.map(row => key(row.name, row.category))).size}; existing: ${alreadyPresent}; variants to migrate: ${pendingProducts.length}; families to update: ${pendingFamilies.size}; families to remove: ${redundant.size}`)
if (dryRun || (!pendingProducts.length && !pendingFamilies.size && !redundant.size)) { db.close(); process.exit(0) }

mkdirSync('.local-archive', { recursive: true })
const backup = join('.local-archive', `ks-local-before-variant-migration-${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`)
db.prepare('VACUUM INTO ?').run(backup)
const insert = db.prepare('INSERT INTO records(kind,id,payload,revision,deleted,op_id) VALUES(?,?,?,1,0,?)')
const update = db.prepare('UPDATE records SET payload=?,revision=revision+1,op_id=? WHERE kind=? AND id=? AND deleted=0')
const remove = db.prepare('UPDATE records SET payload=NULL,revision=revision+1,deleted=1,op_id=? WHERE kind=? AND id=? AND deleted=0')
const payload = value => { const { revision, ...record } = value; return JSON.stringify(record) }
try {
  db.exec('BEGIN IMMEDIATE')
  for (const family of pendingFamilies.values()) {
    if (family.revision) update.run(payload(family), `variant-migration-${randomUUID()}`, 'families', family.id)
    else insert.run('families', family.id, payload(family), `variant-migration-${randomUUID()}`)
  }
  for (const product of pendingProducts) {
    if (product.revision) update.run(payload(product), `variant-migration-${randomUUID()}`, 'products', product.code)
    else insert.run('products', product.code, payload(product), `variant-migration-${randomUUID()}`)
  }
  for (const id of redundant) remove.run(`variant-migration-${randomUUID()}`, 'families', id)
  const state = { families: [], products: [], invoices: [], suppliers: [], customers: [], purchaseOrders: [], sales: [], expenses: [], settings: { margin: 30, priceStep: 25 } }
  for (const record of db.prepare('SELECT kind,payload FROM records WHERE deleted=0').all()) {
    if (record.kind === 'settings') state.settings = JSON.parse(record.payload)
    else if (Object.hasOwn(state, record.kind)) state[record.kind].push(JSON.parse(record.payload))
  }
  if (!normalizeState(state)) throw new Error('Migrated database failed product validation')
  db.exec('COMMIT')
} catch (error) { db.exec('ROLLBACK'); throw error }
console.log(`Migrated local D1. Backup: ${backup}`)
db.close()
