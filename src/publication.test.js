import test from 'node:test'
import assert from 'node:assert/strict'
import { selectedRows, updatePublication } from './publication.js'

test('publication changes only selected variants, including mixed states', () => {
  const products = [
    { code: 'A', published: false },
    { code: 'B', published: true },
    { code: 'C', published: false },
  ]
  const published = updatePublication(products, ['A', 'B'], true)
  assert.deepEqual(published.map(row => row.published), [true, true, false])
  assert.strictEqual(published[1], products[1])
  assert.strictEqual(published[2], products[2])
  assert.deepEqual(updatePublication(published, ['A', 'C'], false).map(row => row.published), [false, true, false])
})

test('selection includes rows across pages and after a filter changes', () => {
  const rows = [{ code: 'A' }, { code: 'B' }, { code: 'C' }]
  assert.deepEqual(selectedRows(rows, { A: true, C: true }).map(row => row.code), ['A', 'C'])
})
