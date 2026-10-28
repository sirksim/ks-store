import { derive, productName } from './data.js'

const decimal = value => Number.isFinite(Number(value)) ? String(Number(value)).replace('.', ',') : ''
const escapeCell = value => {
  let text = value == null ? '' : String(value)
  if (/^[=+@-]/.test(text) && !/^-?\d+(,\d+)?$/.test(text)) text = `'${text}`
  return /[;"\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}
export const encodeCsv = rows => '\uFEFF' + rows.map(row => row.map(escapeCell).join(';')).join('\r\n') + '\r\n'

const selectedCell = (kind, item, id) => {
  if (id === 'lineCount') return item.lines.length
  if (id === 'publicationStatus') return item.published ? 'Publié' : 'Non publié'
  if (id === 'publishedCount') return item.variants.filter(variant => variant.published).length
  if (id === 'productName' && kind === 'ventes') return item.product ? productName(item.product) : item.productCode
  if (id === 'supplierName') return item.supplier?.name || ''
  if (id === 'variance') return item.hasVariance ? 'Écart' : ''
  const value = item[id]
  return typeof value === 'number' ? decimal(value) : value ?? ''
}

export function selectedTableRows(kind, items, visibleColumns) {
  const headers = visibleColumns.map(column => column.header)
  const values = item => visibleColumns.map(column => selectedCell(kind, item, column.id))
  if (kind === 'produits') {
    return [
      [...headers, 'Code variante', 'Variante', 'Volume', 'Unités/caisse', 'Coût moyen/caisse (G)', 'Coût moyen/unité (G)', 'Marge cible (%)', 'Prix conseillé (G)', 'Stock'],
      ...items.flatMap(family => family.variants.map(variant => [
        ...values(family), variant.code, variant.variant, variant.format, variant.unitsPerCase,
        decimal(variant.casePrice), decimal(variant.cogAvgPrice), decimal(variant.targetMargin),
        decimal(variant.suggestedPrice), variant.stock,
      ])),
    ]
  }
  if (kind === 'receptions') {
    return [
      [...headers, 'Code produit', 'Produit reçu', 'Caisses', 'Prix réel/caisse (G)', 'Unités reçues', 'Montant ligne (G)', 'Notes ligne'],
      ...items.flatMap(invoice => invoice.lines.map(line => [
        ...values(invoice), line.productCode, line.product ? productName(line.product) : line.productCode,
        line.cases, decimal(line.casePrice), line.units, decimal(line.cost), line.note || '',
      ])),
    ]
  }
  if (kind === 'commandes') {
    return [
      [...headers, 'Code produit', 'Produit commandé', 'Caisses prévues', 'Prix prévu/caisse (G)', 'Caisses reçues', 'Caisses restantes', 'Caisses en plus', 'Écart prix/caisse (G)'],
      ...items.flatMap(order => order.lines.map(line => [
        ...values(order), line.productCode, line.product ? productName(line.product) : line.productCode,
        line.cases, decimal(line.casePrice), line.receivedCases, line.remainingCases,
        line.excessCases, decimal(line.priceDifference),
      ])),
    ]
  }
  return [headers, ...items.map(values)]
}

export function reportRows(kind, state) {
  const report = derive(state)
  switch (kind) {
    case 'synthese': {
      const t = report.totals
      return [
        ['Indicateur', 'Valeur'],
        ['Chiffre d’affaires confirmé (G)', decimal(t.revenue)],
        ['Coût des ventes confirmées (G)', decimal(t.costSold)],
        ['Bénéfice brut réalisé (G)', decimal(t.grossProfit)],
        ['Marge brute réelle (%)', decimal(t.margin)],
        ['Dépenses (G)', decimal(t.expenses)],
        ['Résultat estimé (G)', decimal(t.net)],
        ['Ventes confirmées', t.confirmedCount],
        ['Unités vendues', t.unitsSold],
        ['Unités en stock', t.stock],
      ]
    }
    case 'produits':
      return [
        ['Code', 'Nom', 'Catégorie', 'Variante', 'Volume', 'Unités/caisse', 'Prix caisse moyen (G)', 'Coût moyen d’achat / unité (G)', 'Marge cible (%)', 'Prix conseillé (G)'],
        ...report.products.map(p => [p.code, p.brand, p.product, p.variant, p.format, p.unitsPerCase, decimal(p.casePrice), decimal(p.cogAvgPrice), decimal(p.targetMargin), decimal(p.suggestedPrice)]),
      ]
    case 'stock':
      return [
        ['Code', 'Nom', 'Format', 'Prix conseillé (G)', 'Unités reçues', 'Unités vendues confirmées', 'Stock restant', 'Bénéfice brut réalisé (G)'],
        ...report.products.map(p => [p.code, p.shortName, p.format, decimal(p.suggestedPrice), p.unitsReceived, p.sold, p.stock, decimal(p.profit)]),
      ]
    case 'receptions':
      return [
        ['Date de réception', 'Fournisseur', 'N° facture', 'N° PO', 'Total facture (G)', 'Code', 'Nom complet', 'Caisses', 'Prix réel/caisse (G)', 'Unités reçues', 'Montant ligne (G)', 'Notes facture', 'Notes ligne'],
        ...report.invoices.flatMap(invoice => invoice.lines.map(r => [invoice.date, invoice.supplier, invoice.number, invoice.purchaseOrderNumber, decimal(invoice.total), r.productCode, r.product ? productName(r.product) : '', r.cases, decimal(r.casePrice), r.units, decimal(r.cost), invoice.note, r.note])),
      ]
    case 'commandes':
      return [
        ['N° PO', 'Date', 'Fournisseur', 'État', 'Total prévu (G)', 'Total reçu (G)', 'Code', 'Produit', 'Caisses prévues', 'Prix prévu/caisse (G)', 'Caisses reçues', 'Caisses restantes', 'Caisses en plus', 'Écart prix/caisse (G)'],
        ...report.purchaseOrders.flatMap(order => order.lines.map(line => [order.number, order.date, order.supplier?.name || '', order.status,
          decimal(order.plannedTotal), decimal(order.receivedTotal), line.productCode,
          line.product ? productName(line.product) : line.productCode, line.cases, decimal(line.casePrice),
          line.receivedCases, line.remainingCases, line.excessCases, decimal(line.priceDifference)])),
      ]
    case 'ventes':
      return [
        ['Date', 'N° commande', 'Client', 'Référence libre', 'Code', 'Nom complet', 'Quantité', 'Prix réel/unité (G)', 'Coût unitaire à la date (G)', 'Total vente (G)', 'Coût total (G)', 'Bénéfice brut réel (G)', 'Marge réelle (%)', 'Statut', 'Mode de paiement', 'Notes'],
        ...report.sales.map(s => [s.date, s.order, s.customerName, s.client, s.productCode, s.product ? productName(s.product) : '', s.quantity, decimal(s.unitPrice), s.validCost ? decimal(s.unitCost) : '', decimal(s.revenue), s.validCost ? decimal(s.cost) : '', s.validCost ? decimal(s.profit) : '', s.validCost ? decimal(s.margin) : '', s.status, s.payment, s.note]),
      ]
    case 'fournisseurs':
    case 'clients': {
      const rows = kind === 'fournisseurs' ? state.suppliers || [] : state.customers || []
      return [['Nom', 'Contact principal', 'Téléphone', 'Email', 'Adresse', 'Notes'],
        ...rows.map(row => [row.name, row.contact, row.phone, row.email, row.address, row.note])]
    }
    case 'depenses':
      return [
        ['Date', 'Catégorie', 'Description', 'Montant (G)', 'Payé par', 'Notes'],
        ...state.expenses.map(e => [e.date, e.category, e.description, decimal(e.amount), e.paidBy, e.note]),
      ]
    default:
      throw new Error('Rapport inconnu.')
  }
}

export function downloadCsv(rows, filename) {
  const blob = new Blob([encodeCsv(rows)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export function exportReportCsv(kind, state) {
  downloadCsv(reportRows(kind, state), `ks-${kind}-${new Date().toISOString().slice(0, 10)}.csv`)
}
