import test from 'node:test'
import assert from 'node:assert/strict'
import { STORAGE_KEY, catalogProducts, cloneInitial, derive, findProduct, loadState, nextPurchaseOrderNumber, normalizeState } from './data.js'
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
  assert.deepEqual(loadState({ getItem: key => key === STORAGE_KEY ? JSON.stringify(state) : null }), state)
  const readKeys = []
  assert.deepEqual(loadState({ getItem: key => { readKeys.push(key); return null } }), cloneInitial())
  assert.deepEqual(readKeys, [STORAGE_KEY])
  assert.strictEqual(normalizeState(state), state)
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
  state.invoices.push({ id: 'invoice-2', date: '2026-10-22', supplierId: null, purchaseOrderId: null,
    number: 'TEST-2', lines: [{ id: 'line-2', productCode: 'TEST-1', cases: 1, casePrice: 6000 }] })
  assert.equal(derive(state).sales[0].unitCost, before)
  assert.equal(derive(state).products[0].stock, 11)
})

test('CSV escapes values and selected rows respect visible columns', () => {
  const state = sampleState()
  state.families[0].name = '=Formula'
  const rows = selectedTableRows('produits', derive(state).families, [
    { id: 'volume', header: 'Volume' }, { id: 'name', header: 'Produit' },
  ])
  assert.deepEqual(rows[0].slice(0, 2), ['Volume', 'Produit'])
  assert.ok(encodeCsv(rows).includes(";'=Formula"))
  assert.ok(encodeCsv([['Nom'], ['Client; A']]).includes('"Client; A"'))
})

test('purchase order numbers and filtered selection remain stable', () => {
  assert.equal(nextPurchaseOrderNumber([{ number: 'PO-2026-0001' }], '2026-10-22'), 'PO-2026-0002')
  const selected = updateFilteredSelection({ other: true }, [{ id: 'one' }, { id: 'two' }], true)
  assert.deepEqual(selected, { other: true, one: true, two: true })
  assert.deepEqual(updateFilteredSelection(selected, [{ id: 'one' }, { id: 'two' }], false), { other: true })
})
