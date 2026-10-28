import test from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { useTable } from '@tanstack/react-table'
import { dataTableFeatures, searchAcrossRow, textColumnFilter } from './tableConfig.js'

const data = [
  { id: 'a', supplier: 'Alpha', total: 100, searchTerms: 'Blanc' },
  { id: 'b', supplier: 'Beta', total: 300, searchTerms: 'Rouge' },
  { id: 'c', supplier: 'Alpha', total: 200, searchTerms: 'Rosé' },
]
const columns = [
  { accessorKey: 'supplier', header: 'Fournisseur' },
  { accessorKey: 'total', header: 'Total' },
]

function renderTable(initialState) {
  let table
  function Probe() {
    table = useTable({ features: dataTableFeatures, data, columns, getRowId: row => row.id,
      defaultColumn: { filterFn: textColumnFilter }, globalFilterFn: searchAcrossRow,
      initialState: { pagination: { pageSize: 2 }, ...initialState } })
    return React.createElement('span', null, table.getRowModel().rows.length)
  }
  renderToStaticMarkup(React.createElement(Probe))
  return table
}

test('v9 filters, sorts and paginates the rows used by the app', () => {
  const table = renderTable({ columnFilters: [{ id: 'supplier', value: 'alp' }],
    sorting: [{ id: 'total', desc: true }] })
  assert.deepEqual(table.getFilteredRowModel().rows.map(row => row.id), ['a', 'c'])
  assert.deepEqual(table.getRowModel().rows.map(row => row.id), ['c', 'a'])
  assert.equal(table.getPageCount(), 1)
})

test('v9 global search, selection and column visibility remain available', () => {
  const table = renderTable({ globalFilter: 'rouge', rowSelection: { b: true },
    columnVisibility: { total: false } })
  assert.deepEqual(table.getFilteredRowModel().rows.map(row => row.id), ['b'])
  assert.deepEqual(table.getSelectedRowModel().rows.map(row => row.id), ['b'])
  assert.deepEqual(table.getRowModel().rows[0].getVisibleCells().map(cell => cell.column.id), ['supplier'])
  assert.equal(table.getAllLeafColumns().find(column => column.id === 'total').getCanHide(), true)
})

test('v9 pagination keeps selected rows from another page', () => {
  const table = renderTable({ rowSelection: { c: true } })
  assert.deepEqual(table.getRowModel().rows.map(row => row.id), ['a', 'b'])
  assert.deepEqual(table.getSelectedRowModel().rows.map(row => row.id), ['c'])
  assert.equal(table.getPageCount(), 2)
})

test('multi-value filters match any selected value and combine across columns', () => {
  const table = renderTable({ columnFilters: [
    { id: 'supplier', value: ['Alpha', 'Beta'] },
    { id: 'total', value: ['100', '300'] },
  ] })
  assert.deepEqual(table.getFilteredRowModel().rows.map(row => row.id), ['a', 'b'])
  assert.deepEqual(renderTable({ columnFilters: [{ id: 'supplier', value: [] }] })
    .getFilteredRowModel().rows.map(row => row.id), ['a', 'b', 'c'])
})
