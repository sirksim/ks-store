import test from 'node:test'
import assert from 'node:assert/strict'
import { hasLinkedReceipts, orderStageForAction, saleStatusForAction, prepareInlineProduct, prepareInlineSupplier } from './documentWorkflow.js'

test('purchase order transitions require the corresponding action', () => {
  assert.equal(orderStageForAction('draft', 'save'), 'draft')
  assert.equal(orderStageForAction('draft', 'command'), 'ordered')
  assert.equal(orderStageForAction('draft', 'cancel'), null)
  assert.equal(orderStageForAction('ordered', 'save'), 'ordered')
  assert.equal(orderStageForAction('ordered', 'receive'), 'ordered')
  assert.equal(orderStageForAction('ordered', 'cancel'), 'cancelled')
  assert.equal(orderStageForAction('ordered', 'cancel', true), null)
  assert.equal(orderStageForAction('cancelled', 'command'), null)
  assert.equal(orderStageForAction('cancelled', 'receive'), null)
})

test('sale actions advance status and allow reopening', () => {
  assert.equal(saleStatusForAction('En attente', 'save'), 'En attente')
  assert.equal(saleStatusForAction('En attente', 'sell'), 'Confirmée/Vendue')
  assert.equal(saleStatusForAction('En attente', 'cancel'), null)
  assert.equal(saleStatusForAction('Confirmée/Vendue', 'save'), 'Confirmée/Vendue')
  assert.equal(saleStatusForAction('Confirmée/Vendue', 'cancel'), 'Annulée')
  assert.equal(saleStatusForAction('Confirmée/Vendue', 'reopen'), 'En attente')
  assert.equal(saleStatusForAction('Annulée', 'reopen'), 'En attente')
  assert.equal(saleStatusForAction('Annulée', 'sell'), null)
})

test('new orders do not inherit unlinked invoices', () => {
  const invoices = [{ purchaseOrderId: null }, { purchaseOrderId: 'po-1' }]
  assert.equal(hasLinkedReceipts(null, invoices), false)
  assert.equal(hasLinkedReceipts('po-1', invoices), true)
  assert.equal(hasLinkedReceipts('po-2', invoices), false)
})

test('inline creation preserves existing catalog and supplier constraints', () => {
  const supplier = prepareInlineSupplier({ name: ' Maison A ' }, [], () => 'supplier-1')
  assert.equal(supplier.name, 'Maison A')
  assert.throws(() => prepareInlineSupplier({ name: 'maison a' }, [supplier], () => 'duplicate'), /existe déjà/)
  const values = { name: 'Maison', volume: '75 cl', category: 'Vin', variant: 'Rouge', code: ' vin-1 ', unitsPerCase: 6 }
  const { family, variant } = prepareInlineProduct(values, [], [], () => 'family-1')
  assert.equal(variant.code, 'VIN-1')
  assert.equal(variant.familyId, family.id)
  assert.equal(variant.format, '75 cl')
  assert.equal(family.volume, undefined)
  assert.match(prepareInlineProduct({ ...values, code: '', name: 'Autre' }, [], [], () => 'family-2').variant.code, /^VIN-[A-Z2-9]{8}$/)
  assert.throws(() => prepareInlineProduct(values, [family], [], () => 'duplicate'), /fiche existe déjà/)
  assert.throws(() => prepareInlineProduct({ ...values, name: 'Autre' }, [], [{ code: 'VIN-1' }], () => 'duplicate'), /code produit existe déjà/)
})
