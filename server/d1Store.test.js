import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { createD1Store } from './d1Store.js'

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
    await apply('sales', 'sale-1', { id: 'sale-1', date: '2026-10-26', productCode: 'VIN-1',
      quantity: 6, unitPrice: 30, status: 'Confirmée/Vendue', customerId: null })
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
