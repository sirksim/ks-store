export const STORAGE_KEY = 'ks-gestion-v1'
const searchKey = value => String(value || '').trim().toLocaleLowerCase('fr')

export const initialState = {
  settings: { margin: 30, priceStep: 25 },
  families: [],
  products: [],
  invoices: [],
  suppliers: [],
  customers: [],
  purchaseOrders: [],
  sales: [],
  expenses: [],
}

export const cloneInitial = () => structuredClone(initialState)
export const uid = () => globalThis.crypto?.randomUUID?.() || `id-${Date.now()}-${Math.random().toString(36).slice(2)}`
export const productName = product => [product.brand, product.variant, product.format].filter(Boolean).join(' ')
export const shortName = product => [product.brand, product.variant].filter(Boolean).join(' ')

const codeAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const productCodePrefix = category => String(category || '').normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3)

export function generateProductCode(category, products, fillRandom = bytes => globalThis.crypto.getRandomValues(bytes)) {
  const prefix = productCodePrefix(category)
  if (!prefix) return ''
  const used = new Set(products.map(product => product.code.toUpperCase()))
  for (let attempt = 0; attempt < 100; attempt++) {
    const bytes = new Uint8Array(8)
    fillRandom(bytes)
    const code = `${prefix}-${[...bytes].map(byte => codeAlphabet[byte & 31]).join('')}`
    if (!used.has(code)) return code
  }
  throw new Error('Impossible de créer un code produit unique.')
}

export function catalogProducts(state) {
  const families = new Map((state.families || []).map(family => [family.id, family]))
  return (state.products || []).map(variant => {
    const family = families.get(variant.familyId)
    return { ...variant, brand: family?.name || '', product: family?.category || '',
      format: variant.format || family?.volume || '' }
  })
}

export function findProduct(products, query) {
  const key = searchKey(query)
  if (!key) return null
  return products.find(product => searchKey(product.code) === key || searchKey(productName(product)) === key ||
    searchKey([product.brand, product.product, product.variant, product.format].filter(Boolean).join(' ')) === key) || null
}

export function upgradeProductFamilies(state) {
  const identities = new Map()
  const familyIds = new Map()
  const legacySizes = new Map()
  const families = []
  for (const family of state.families) {
    const identity = [family.name, family.category].map(searchKey).join('|')
    const canonical = identities.get(identity)
    familyIds.set(family.id, canonical?.id || family.id)
    legacySizes.set(family.id, family.volume || '')
    if (!canonical) {
      const { volume, ...rest } = family
      identities.set(identity, rest)
      families.push(rest)
    }
  }
  const products = state.products.map(product => ({ ...product,
    familyId: familyIds.get(product.familyId) || product.familyId,
    format: product.format || legacySizes.get(product.familyId) || '' }))
  return { ...state, families, products }
}

const collections = ['families', 'products', 'invoices', 'suppliers', 'customers', 'purchaseOrders', 'sales', 'expenses']
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const identifier = value => typeof value === 'string' && value.trim().length > 0
const validRows = (rows, key) => rows.every(row => object(row) && identifier(row[key])) &&
  new Set(rows.map(row => row[key])).size === rows.length

export function normalizeState(saved) {
  if (!object(saved) || Object.keys(saved).sort().join('|') !== [...collections, 'settings'].sort().join('|') ||
    !collections.every(kind => Array.isArray(saved[kind])) || !object(saved.settings) ||
    !Number.isFinite(saved.settings.margin) || !Number.isFinite(saved.settings.priceStep) || saved.settings.priceStep <= 0 ||
    !collections.every(kind => validRows(saved[kind], kind === 'products' ? 'code' : 'id'))) return null
  const families = new Set(saved.families.map(row => row.id))
  const products = new Set(saved.products.map(row => row.code))
  const suppliers = new Set(saved.suppliers.map(row => row.id))
  const customers = new Set(saved.customers.map(row => row.id))
  const orders = new Set(saved.purchaseOrders.map(row => row.id))
  if (saved.products.some(row => !identifier(row.familyId) || !families.has(row.familyId) ||
      !Number.isFinite(row.unitsPerCase) || row.unitsPerCase <= 0) ||
    saved.invoices.some(row => !Array.isArray(row.lines) || !Object.hasOwn(row, 'supplierId') ||
      !Object.hasOwn(row, 'purchaseOrderId') || (row.supplierId && !suppliers.has(row.supplierId)) ||
      (row.purchaseOrderId && !orders.has(row.purchaseOrderId)) ||
      row.lines.some(line => !object(line) || !identifier(line.id) || !products.has(line.productCode))) ||
    saved.purchaseOrders.some(row => !Array.isArray(row.lines) || (row.supplierId && !suppliers.has(row.supplierId)) ||
      row.lines.some(line => !object(line) || !identifier(line.id) || !products.has(line.productCode))) ||
    saved.sales.some(row => !Object.hasOwn(row, 'customerId') || !products.has(row.productCode) ||
      (row.customerId && !customers.has(row.customerId)))) return null
  const upgraded = upgradeProductFamilies(saved)
  const variantKeys = upgraded.products.map(product => [product.familyId, searchKey(product.variant), searchKey(product.format)].join('|'))
  if (upgraded.products.some(product => !identifier(product.format)) || new Set(variantKeys).size !== variantKeys.length) return null
  return upgraded
}

export function loadState(storage = globalThis.localStorage) {
  try { return normalizeState(JSON.parse(storage.getItem(STORAGE_KEY))) || cloneInitial() }
  catch { return cloneInitial() }
}

export function nextPurchaseOrderNumber(orders, date) {
  const year = String(date || '').slice(0, 4)
  const used = new Set(orders.map(order => searchKey(order.number)))
  let sequence = 1
  while (used.has(searchKey(`PO-${year}-${String(sequence).padStart(4, '0')}`))) sequence++
  return `PO-${year}-${String(sequence).padStart(4, '0')}`
}

export function derivePurchaseOrders(state, invoices = state.invoices || []) {
  const products = new Map(catalogProducts(state).map(product => [product.code, product]))
  const suppliers = new Map((state.suppliers || []).map(row => [row.id, row]))
  return (state.purchaseOrders || []).map(order => {
    const receivedInvoices = invoices.filter(invoice => invoice.purchaseOrderId === order.id)
    const received = new Map()
    for (const invoice of receivedInvoices) for (const line of invoice.lines || []) {
      const previous = received.get(line.productCode) || { cases: 0, cost: 0 }
      received.set(line.productCode, { cases: previous.cases + Number(line.cases),
        cost: previous.cost + Number(line.cases) * Number(line.casePrice) })
    }
    const lines = (order.lines || []).map(line => {
      const actual = received.get(line.productCode) || { cases: 0, cost: 0 }
      return { ...line, product: products.get(line.productCode), receivedCases: actual.cases,
        remainingCases: Math.max(0, Number(line.cases) - actual.cases), actualCost: actual.cost,
        excessCases: Math.max(0, actual.cases - Number(line.cases)),
        priceDifference: actual.cases ? actual.cost / actual.cases - Number(line.casePrice) : 0 }
    })
    const plannedCodes = new Set(lines.map(line => line.productCode))
    const unexpected = [...received].filter(([code]) => !plannedCodes.has(code))
    const hasVariance = lines.some(line => line.excessCases || line.priceDifference) || unexpected.length > 0
    const plannedTotal = lines.reduce((sum, line) => sum + Number(line.cases) * Number(line.casePrice), 0)
    const receivedTotal = receivedInvoices.reduce((sum, invoice) => sum + (invoice.lines || []).reduce((part, line) =>
      part + Number(line.cases) * Number(line.casePrice), 0), 0)
    const status = order.stage === 'cancelled' ? 'Annulé' : order.stage === 'draft' ? 'Brouillon'
      : receivedInvoices.length === 0 ? 'Commandé'
        : lines.every(line => line.remainingCases === 0) ? 'Reçu' : 'Partiellement reçu'
    return { ...order, supplier: suppliers.get(order.supplierId), lines, receivedInvoices,
      plannedTotal, receivedTotal, status, hasVariance, unexpected }
  })
}

export function derive(state) {
  const products = catalogProducts(state)
  const suppliers = new Map((state.suppliers || []).map(row => [row.id, row]))
  const customers = new Map((state.customers || []).map(row => [row.id, row]))
  const orderNumbers = new Map((state.purchaseOrders || []).map(row => [row.id, row.number]))
  const lookup = new Map(products.map(product => [product.code, product]))
  const invoices = (state.invoices || []).map(invoice => {
    const lines = (invoice.lines || []).map(line => {
      const product = lookup.get(line.productCode)
      const units = product ? Number(line.cases) * Number(product.unitsPerCase) : 0
      const cost = Number(line.cases) * Number(line.casePrice)
      return { ...line, date: invoice.date, invoiceId: invoice.id, invoiceNumber: invoice.number,
        supplier: invoice.supplier, product, units, cost }
    })
    return { ...invoice, supplier: suppliers.get(invoice.supplierId)?.name || invoice.supplier || '',
      purchaseOrderNumber: orderNumbers.get(invoice.purchaseOrderId) || '',
      lines, total: lines.reduce((sum, line) => sum + line.cost, 0) }
  })
  const receipts = invoices.flatMap(invoice => invoice.lines)
  const receiptMap = new Map()
  for (const receipt of receipts) {
    if (!receipt.product || !receipt.date) continue
    const group = receiptMap.get(receipt.productCode) || []
    group.push(receipt)
    receiptMap.set(receipt.productCode, group)
  }
  const historyMap = new Map()
  for (const [code, group] of receiptMap) {
    let units = 0
    let cost = 0
    historyMap.set(code, [...group].sort((a, b) => a.date.localeCompare(b.date)).map(receipt => {
      units += receipt.units
      cost += receipt.cost
      return { date: receipt.date, units, cost }
    }))
  }
  const productRows = products.map(product => {
    const bought = receiptMap.get(product.code) || []
    const unitsReceived = bought.reduce((sum, receipt) => sum + receipt.units, 0)
    const purchaseCost = bought.reduce((sum, receipt) => sum + receipt.cost, 0)
    const casesReceived = bought.reduce((sum, receipt) => sum + Number(receipt.cases), 0)
    const unitCost = unitsReceived ? purchaseCost / unitsReceived : 0
    const casePrice = casesReceived ? purchaseCost / casesReceived : 0
    const targetMargin = Number(product.margin ?? state.settings.margin)
    const step = Math.max(1, Number(state.settings.priceStep) || 25)
    const suggestedPrice = unitCost && targetMargin < 100 ? Math.ceil((unitCost / (1 - targetMargin / 100)) / step) * step : 0
    return { ...product, name: productName(product), shortName: shortName(product),
      unitsReceived, casesReceived, purchaseCost, casePrice, unitCost, cogAvgPrice: unitCost, targetMargin,
      suggestedPrice, sold: 0, profit: 0, stock: unitsReceived }
  })
  const rowMap = new Map(productRows.map(row => [row.code, row]))
  const sales = (state.sales || []).map(sale => {
    const product = lookup.get(sale.productCode)
    const history = historyMap.get(sale.productCode) || []
    let low = 0
    let high = history.length
    while (low < high) {
      const mid = Math.floor((low + high) / 2)
      if (history[mid].date <= sale.date) low = mid + 1
      else high = mid
    }
    const unitsAtDate = low ? history[low - 1].units : 0
    const costAtDate = low ? history[low - 1].cost : 0
    const unitCost = unitsAtDate ? costAtDate / unitsAtDate : 0
    const quantity = Number(sale.quantity) || 0
    const price = Number(sale.unitPrice) || 0
    const revenue = quantity * price
    const cost = quantity * unitCost
    const profit = revenue - cost
    const margin = revenue ? profit / revenue * 100 : 0
    const validCost = Boolean(unitsAtDate)
    if (sale.status === 'Confirmée/Vendue' && product && validCost) {
      const row = rowMap.get(product.code)
      row.sold += quantity
      row.profit += profit
      row.stock -= quantity
    }
    return { ...sale, customerName: customers.get(sale.customerId)?.name || '',
      product, unitCost, revenue, cost, profit, margin, validCost }
  })
  const confirmed = sales.filter(sale => sale.status === 'Confirmée/Vendue' && sale.product && sale.validCost)
  const revenue = confirmed.reduce((sum, sale) => sum + sale.revenue, 0)
  const costSold = confirmed.reduce((sum, sale) => sum + sale.cost, 0)
  const grossProfit = confirmed.reduce((sum, sale) => sum + sale.profit, 0)
  const expenses = (state.expenses || []).reduce((sum, expense) => sum + Number(expense.amount || 0), 0)
  const totals = {
    revenue, costSold, grossProfit, expenses, net: grossProfit - expenses,
    margin: revenue ? grossProfit / revenue * 100 : 0,
    unitsSold: confirmed.reduce((sum, sale) => sum + Number(sale.quantity), 0),
    stock: productRows.reduce((sum, product) => sum + product.stock, 0),
    confirmedCount: confirmed.length,
  }
  const families = (state.families || []).map(family => {
    const variants = productRows.filter(row => row.familyId === family.id)
    return { ...family, variants, variantCount: variants.length,
      searchTerms: variants.map(row => `${row.code} ${row.variant}`).join(' '),
      stock: variants.reduce((sum, row) => sum + row.stock, 0) }
  })
  return { products: productRows, families, invoices, receipts, sales, totals,
    purchaseOrders: derivePurchaseOrders(state, invoices) }
}

export const money = value => `${new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value) || 0)} G`
export const percent = value => `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(Number(value) || 0)} %`
