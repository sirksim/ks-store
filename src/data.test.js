import test from 'node:test'
import assert from 'node:assert/strict'
import { STORAGE_KEY, catalogProducts, cloneInitial, derive, findProduct, generateProductCode, loadState, nextPurchaseOrderNumber, nextSaleNumber, normalizeState, productCodePrefix } from './data.js'
import { encodeCsv, reportRows, selectedTableRows } from './csv.js'
import { updateFilteredSelection } from './tableSelection.js'

function sampleState() {
  const state = cloneInitial()
  state.families.push({ id: 'family-1', name: 'Maison Exemple', category: 'Boisson', volume: '75 cl' })
  state.products.push({ code: 'TEST-1', familyId: 'family-1', variant: 'Rouge', unitsPerCase: 6, margin: null })
  state.invoices.push({ id: 'invoice-1', date: '2026-10-20', supplierId: null, purchaseOrderId: null,
    number: 'TEST-INV', note: '', lines: [{ id: 'line-1', productCode: 'TEST-1', cases: 1, casePrice: 3000 }] })
  return state
}

test('new installation and reset start with an empty catalogue and default settings', () => {
  const state = cloneInitial()
  assert.deepEqual(state.products, [])
  assert.deepEqual(state.invoices, [])
  assert.deepEqual(state.settings, { margin: 30, priceStep: 25 })
  assert.deepEqual(derive(state).products, [])
})

test('only the current KS storage key and backup format are read', () => {
  const state = sampleState()
  assert.equal(STORAGE_KEY, 'ks-gestion-v1')
  assert.deepEqual(loadState({ getItem: key => key === STORAGE_KEY ? JSON.stringify(state) : null }), normalizeState(state))
  const readKeys = []
  assert.deepEqual(loadState({ getItem: key => { readKeys.push(key); return null } }), cloneInitial())
  assert.deepEqual(readKeys, [STORAGE_KEY])
  assert.equal(normalizeState(state).products[0].format, '75 cl')
  const { families, ...old } = state
  assert.equal(normalizeState(old), null)
  assert.equal(normalizeState({ ...state, receipts: [] }), null)
  assert.equal(normalizeState({ ...state, products: [{ code: 'TEST-2' }] }), null)
})

test('family, receipt, sale and expense calculations use current data', () => {
  const state = sampleState()
  const product = catalogProducts(state)[0]
  assert.equal(findProduct([product], 'Maison Exemple Boisson Rouge 75 cl')?.code, 'TEST-1')
  state.sales.push({ id: 'sale-1', date: '2026-10-21', productCode: 'TEST-1', customerId: null,
    quantity: 2, unitPrice: 800, status: 'Confirmée/Vendue' })
  state.expenses.push({ id: 'expense-1', date: '2026-10-21', category: 'Transport', amount: 100 })
  const report = derive(state)
  assert.equal(report.sales[0].number, 'LEGACY-sale-1')
  assert.equal(report.sales[0].lines.length, 1)
  assert.equal(report.products[0].stock, 4)
  assert.equal(report.totals.revenue, 1600)
  assert.equal(report.totals.net, 500)
  assert.equal(reportRows('receptions', state)[1][2], 'TEST-INV')
})

test('later receipts leave historical sale cost unchanged', () => {
  const state = sampleState()
  state.sales.push({ id: 'sale-1', date: '2026-10-21', productCode: 'TEST-1', customerId: null,
    quantity: 1, unitPrice: 800, status: 'Confirmée/Vendue' })
  const before = derive(state).sales[0].unitCost
  assert.equal(before, 500)
  state.invoices.push({ id: 'invoice-2', date: '2026-10-22', supplierId: null, purchaseOrderId: null,
    number: 'TEST-2', lines: [{ id: 'line-2', productCode: 'TEST-1', cases: 1, casePrice: 6000 }] })
  assert.equal(derive(state).sales[0].unitCost, before)
  assert.equal(derive(state).products[0].stock, 11)
})

test('CSV escapes values and selected rows respect visible columns', () => {
  const state = sampleState()
  state.families[0].name = '=Formula'
  const rows = selectedTableRows('produits', derive(state).families, [
    { id: 'category', header: 'Catégorie' }, { id: 'name', header: 'Produit' },
  ])
  assert.deepEqual(rows[0].slice(0, 2), ['Catégorie', 'Produit'])
  assert.ok(rows[0].includes('Volume'))
  assert.ok(encodeCsv(rows).includes(";'=Formula"))
  assert.deepEqual(selectedTableRows('catalogVariants', [{ code: 'V1', published: true }],
    [{ id: 'code', header: 'Code' }, { id: 'publicationStatus', header: 'Vitrine' }])[1], ['V1', 'Publié'])
  assert.ok(encodeCsv([['Nom'], ['Client; A']]).includes('"Client; A"'))
})

test('legacy size families merge while variants keep codes and formats', () => {
  const state = cloneInitial()
  state.families.push(
    { id: 'a', name: 'Three Sisters Vodka', category: 'Vodka', volume: '375ml' },
    { id: 'b', name: 'Three Sisters Vodka', category: 'Vodka', volume: '200ml' },
  )
  state.products.push(
    { code: 'VOD-1', familyId: 'a', variant: 'Citrus', unitsPerCase: 12 },
    { code: 'VOD-2', familyId: 'b', variant: 'Raspberry', unitsPerCase: 24 },
  )
  const upgraded = normalizeState(state)
  assert.equal(upgraded.families.length, 1)
  assert.deepEqual(upgraded.products.map(row => [row.code, row.familyId, row.format]),
    [['VOD-1', 'a', '375ml'], ['VOD-2', 'a', '200ml']])
  assert.equal(derive(upgraded).products[0].name, 'Three Sisters Vodka Citrus 375ml')
  assert.equal(normalizeState(upgraded).families.length, 1)
  const secondSize = structuredClone(upgraded)
  secondSize.products.push({ code: 'VOD-3', familyId: 'a', variant: 'Citrus', format: '1L', unitsPerCase: 12 })
  assert.ok(normalizeState(secondSize))
  secondSize.products.at(-1).format = '375ml'
  assert.equal(normalizeState(secondSize), null)
})

test('purchase order numbers and filtered selection remain stable', () => {
  assert.equal(nextPurchaseOrderNumber([{ number: 'PO-2026-0001' }], '2026-10-22'), 'PO-2026-0002')
  const selected = updateFilteredSelection({ other: true }, [{ id: 'one' }, { id: 'two' }], true)
  assert.deepEqual(selected, { other: true, one: true, two: true })
  assert.deepEqual(updateFilteredSelection(selected, [{ id: 'one' }, { id: 'two' }], false), { other: true })
})

test('product references use the category and retry local collisions', () => {
  assert.equal(productCodePrefix('Épicerie fine'), 'EPI')
  assert.equal(productCodePrefix('Vin'), 'VIN')
  assert.equal(productCodePrefix('Bi'), 'BI')
  assert.equal(generateProductCode('', []), '')
  let attempt = 0
  const fillRandom = bytes => bytes.fill(attempt++)
  assert.equal(generateProductCode('Beverage', [{ code: 'bev-aaaaaaaa' }], fillRandom), 'BEV-BBBBBBBB')
  assert.equal(attempt, 2)
})

test('sale numbers retry collisions and exhaust the date range', () => {
  const sales = [{ id: 'a', number: '20261028-000' }, { id: 'b', number: '20261028-001' }]
  assert.equal(nextSaleNumber(sales, '2026-10-28', () => 0), '20261028-002')
  assert.equal(nextSaleNumber(sales, '2026-10-29', () => 0), '20261029-000')
  assert.equal(nextSaleNumber(sales, '2026-10-28', () => 0, 'a'), '20261028-000')
  const full = Array.from({ length: 1000 }, (_, i) => ({ id: String(i), number: `20261028-${String(i).padStart(3, '0')}` }))
  assert.throws(() => nextSaleNumber(full, '2026-10-28', () => 0), /1 000/)
})

test('multi-line sales total historical cost and allow negative stock', () => {
  const state = sampleState()
  state.products.push({ code: 'TEST-2', familyId: 'family-1', variant: 'Blanc', format: '75 cl', unitsPerCase: 6 })
  state.invoices[0].lines.push({ id: 'line-2', productCode: 'TEST-2', cases: 1, casePrice: 600 })
  state.sales.push({ id: 'sale-2', date: '2026-10-21', number: '20261021-007', customerId: null,
    status: 'Confirmée/Vendue', lines: [
      { id: 's1', productCode: 'TEST-1', quantity: 7, unitPrice: 800 },
      { id: 's2', productCode: 'TEST-2', quantity: 2, unitPrice: 250 },
    ] })
  const report = derive(state)
  assert.equal(report.sales[0].revenue, 6100)
  assert.equal(report.sales[0].cost, 3700)
  assert.equal(report.sales[0].profit, 2400)
  assert.equal(report.products[0].stock, -1)
  assert.equal(report.products[1].stock, 4)
  assert.equal(report.totals.unitsSold, 9)
  assert.equal(reportRows('ventes', state).length, 3)
  assert.equal(selectedTableRows('ventes', report.sales, [{ id: 'date', header: 'Date' }]).length, 3)
  state.invoices.push({ id: 'invoice-later', date: '2026-10-22', supplierId: null, purchaseOrderId: null,
    lines: [{ id: 'later', productCode: 'TEST-1', cases: 1, casePrice: 9000 }] })
  assert.equal(derive(state).sales[0].cost, 3700)
  assert.ok(normalizeState(state))
})
