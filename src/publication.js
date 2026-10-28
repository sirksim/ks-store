export const selectedRows = (rows, selection) => rows.filter(row => selection[String(row.id || row.code)])

export function updatePublication(products, codes, published) {
  const selected = new Set(codes)
  return products.map(product => selected.has(product.code) && Boolean(product.published) !== published
    ? { ...product, published } : product)
}
