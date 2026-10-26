import test from 'node:test'
import assert from 'node:assert/strict'
import { cloneInitial } from './data.js'
import { applyChange, diffState, overlayPending } from './syncCore.js'

test('offline changes are queued by record and overlaid on server data', () => {
  const previous = cloneInitial()
  previous.invoices.push({ id: 'invoice-1', note: 'Brouillon' })
  const next = structuredClone(previous)
  next.invoices[0].note = 'Reçue'
  const operations = diffState(previous, next, { 'invoices:invoice-1': 4 })
  assert.equal(operations.length, 1)
  assert.equal(operations[0].baseRevision, 4)
  assert.equal(overlayPending(previous, operations).invoices[0].note, 'Reçue')
  assert.equal(applyChange(previous, { kind: 'invoices', id: 'invoice-1', deleted: true }).invoices.length, 0)
})
