import { tableFeatures, rowPaginationFeature, createPaginatedRowModel } from '@tanstack/react-table'

export const catalogPageSizes = [12, 24, 48]
export const catalogTableFeatures = tableFeatures({
  rowPaginationFeature,
  paginatedRowModel: createPaginatedRowModel(),
})
export const catalogColumns = [{ accessorKey: 'code', header: 'Référence' }]
export const catalogPageSize = value => catalogPageSizes.includes(Number(value)) ? Number(value) : 12
export const suggestedPriceLabel = value => Number(value) > 0
  ? `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(Number(value))} G`
  : 'Prix indisponible'
