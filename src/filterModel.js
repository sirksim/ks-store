export const toggleValue = (selected, value) => selected.includes(value)
  ? selected.filter(item => item !== value) : [...selected, value]

const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr')

export function matchesCatalog(product, query, categories, stock) {
  const matchesText = !query || normalize(`${product.name} ${product.code} ${product.category} ${product.volume}`).includes(normalize(query))
  return matchesText && (!categories.length || categories.includes(product.category)) &&
    (stock === 'all' || (stock === 'available') === product.available)
}

export function sortCatalogProducts(products, sort) {
  if (sort === 'name') return [...products].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'fr'))
  if (sort === 'category') return [...products].sort((a, b) =>
    String(a.category || '').localeCompare(String(b.category || ''), 'fr') ||
    String(a.name || '').localeCompare(String(b.name || ''), 'fr'))
  return products
}

export const catalogViewForScreen = (view, mobile) => mobile ? 'cards' : view
