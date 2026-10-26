import test from 'node:test'
import assert from 'node:assert/strict'
import { parseRoute, pathFor, readTableQuery, writeTableQuery } from './routes.js'

test('direct document and list paths round trip, including encoded IDs', () => {
  assert.equal(pathFor('overview'), '/admin/')
  assert.equal(pathFor('products'), '/admin/products')
  assert.deepEqual(parseRoute(pathFor('invoiceDetail', 'id/é')), { page: 'invoiceDetail', id: 'id/é' })
  assert.deepEqual(parseRoute('/admin/products/family-1'), { page: 'productDetail', id: 'family-1' })
  assert.deepEqual(parseRoute('/purchase-orders/po-1'), { page: 'orderDetail', id: 'po-1' })
  assert.deepEqual(parseRoute('/receipts'), { page: 'receipts', id: null })
  assert.equal(parseRoute('/unknown').page, 'notFound')
})

test('purchase order and receipt editor routes round trip', () => {
  assert.deepEqual(parseRoute(pathFor('orderEditor')), { page: 'orderEditor', id: null })
  assert.deepEqual(parseRoute(pathFor('invoiceEditor')), { page: 'invoiceEditor', id: null })
  assert.deepEqual(parseRoute(pathFor('orderEditor', 'po/é')), { page: 'orderEditor', id: 'po/é' })
  assert.deepEqual(parseRoute(pathFor('invoiceEditor', 'fact/é')), { page: 'invoiceEditor', id: 'fact/é' })
})

test('table query restores search, filters, sorting, page and hidden columns', () => {
  const columns = [{ accessorKey: 'number' }, { accessorKey: 'date' }, { id: 'actions' }]
  const state = readTableQuery('?q=vin&filter.number=ABC&sort=date:desc&hide=number&page=3', columns)
  assert.equal(state.globalFilter, 'vin')
  assert.deepEqual(state.columnFilters, [{ id: 'number', value: 'ABC' }])
  assert.deepEqual(state.sorting, [{ id: 'date', desc: true }])
  assert.equal(state.columnVisibility.number, false)
  assert.equal(state.pagination.pageIndex, 2)
  assert.equal(writeTableQuery('?tab=orders&bad=1', state), 'tab=orders&bad=1&q=vin&filter.number=ABC&sort=date%3Adesc&hide=number&page=3')
})

test('invalid columns and page are ignored while one data column stays visible', () => {
  const columns = [{ accessorKey: 'number' }, { id: 'actions', enableSorting: false }]
  const state = readTableQuery('?filter.fake=x&hide=number&hide=actions&sort=actions:asc&page=-2', columns)
  assert.deepEqual(state.columnFilters, [])
  assert.deepEqual(state.columnVisibility, {})
  assert.deepEqual(state.sorting, [])
  assert.equal(state.pagination.pageIndex, 0)
})
