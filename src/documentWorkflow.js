import { generateProductCode } from './data.js'

export function orderStageForAction(previousStage, action, hasReceipts = false) {
  if (action === 'save' && (previousStage === 'draft' || previousStage === 'ordered')) return previousStage
  if (action === 'command' && previousStage === 'draft') return 'ordered'
  if (action === 'cancel' && previousStage === 'ordered' && !hasReceipts) return 'cancelled'
  if (action === 'receive' && previousStage === 'ordered') return 'ordered'
  return null
}

export function hasLinkedReceipts(orderId, invoices) {
  return Boolean(orderId) && invoices.some(invoice => invoice.purchaseOrderId === orderId)
}

export function prepareInlineSupplier(values, suppliers, makeId) {
  const name = String(values.name || '').trim()
  if (!name) throw new Error('Renseigne le nom du fournisseur.')
  if (suppliers.some(row => row.name.trim().toLocaleLowerCase('fr') === name.toLocaleLowerCase('fr')))
    throw new Error('Ce fournisseur existe déjà.')
  return { id: makeId(), name, contact: String(values.contact || '').trim(),
    phone: String(values.phone || '').trim(), email: String(values.email || '').trim(),
    address: String(values.address || '').trim(), note: '' }
}

export function prepareInlineProduct(values, families, catalog, makeId) {
  const name = String(values.name || '').trim()
  const volume = String(values.volume || '').trim()
  const category = String(values.category || '').trim()
  const variantName = String(values.variant || '').trim()
  const code = String(values.code || '').trim().toUpperCase()
  const unitsPerCase = Number(values.unitsPerCase)
  if (!name || !volume || !category) throw new Error('Renseigne le nom, le volume et la catégorie.')
  if (!Number.isInteger(unitsPerCase) || unitsPerCase < 1) throw new Error('Les unités par caisse doivent être un entier positif.')
  const key = [name, category].map(value => value.toLocaleLowerCase('fr')).join('|')
  if (families.some(row => [row.name, row.category].map(value => value.toLocaleLowerCase('fr')).join('|') === key))
    throw new Error('Cette fiche existe déjà. Choisis sa variante dans le catalogue.')
  if (catalog.some(row => row.code.toLocaleLowerCase('fr') === code.toLocaleLowerCase('fr')))
    throw new Error('Ce code produit existe déjà.')
  const fullName = [name, variantName, volume].filter(Boolean).join(' ').toLocaleLowerCase('fr')
  if (catalog.some(row => [row.brand, row.variant, row.format].filter(Boolean).join(' ').toLocaleLowerCase('fr') === fullName))
    throw new Error('Ce nom complet existe déjà.')
  const family = { id: makeId(), name, category }
  const variant = { familyId: family.id, code: code || generateProductCode(category, catalog), variant: variantName, format: volume, unitsPerCase, margin: null,
    picture: null, published: false }
  return { family, variant }
}
