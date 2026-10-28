import test from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { useTable } from '@tanstack/react-table'
import { matchesCatalog } from './filterModel.js'
import { catalogColumns, catalogPageSize, catalogPageSizes, catalogTableFeatures, suggestedPriceLabel } from './catalogTable.js'

const products = Array.from({ length: 101 }, (_, index) => ({
  code: `P-${index + 1}`, name: `Produit ${index + 1}`, category: index < 50 ? 'A' : 'B',
  available: index % 2 === 0,
}))

function page(data, pageIndex, pageSize) {
  let table
  function Probe() {
    table = useTable({ features: catalogTableFeatures, data, columns: catalogColumns,
      initialState: { pagination: { pageIndex, pageSize } }, getRowId: row => row.code })
    return React.createElement('span', null, table.getRowModel().rows.length)
  }
  renderToStaticMarkup(React.createElement(Probe))
  return table
}

test('catalog price labels distinguish unavailable prices', () => {
  assert.equal(suggestedPriceLabel(0), 'Prix indisponible')
  assert.equal(suggestedPriceLabel(undefined), 'Prix indisponible')
  assert.equal(suggestedPriceLabel(25), '25 G')
})

test('catalog pagination supports every page size and clamps stored preferences', () => {
  for (const size of catalogPageSizes) {
    const first = page(products, 0, size)
    const last = page(products, Math.floor(100 / size), size)
    assert.equal(first.getRowModel().rows.length, size)
    assert.equal(last.getRowModel().rows.at(-1).original.code, 'P-101')
    assert.equal(first.getPageCount(), Math.ceil(101 / size))
  }
  assert.equal(catalogPageSize('24'), 24)
  assert.equal(catalogPageSize('999'), 12)
})

test('filtering before pagination starts the new result set at page one', () => {
  const filtered = products.filter(item => matchesCatalog(item, '', ['B'], 'available'))
  assert.equal(filtered.length, 26)
  const later = page(filtered, 1, 12)
  const reset = page(filtered, 0, 12)
  assert.equal(later.getRowModel().rows[0].original.code, 'P-75')
  assert.equal(reset.getRowModel().rows[0].original.code, 'P-51')
  assert.equal(filtered.length, 26)
  assert.deepEqual(reset.getRowModel().rows.map(row => row.original.code),
    page(filtered, 0, 12).getRowModel().rows.map(row => row.original.code))
})
