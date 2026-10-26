import {
  tableFeatures, columnFilteringFeature, globalFilteringFeature, rowSortingFeature,
  rowPaginationFeature, rowSelectionFeature, columnVisibilityFeature,
  createFilteredRowModel, createSortedRowModel, createPaginatedRowModel, sortFns,
} from '@tanstack/react-table'

export const dataTableFeatures = tableFeatures({
  columnFilteringFeature, globalFilteringFeature, rowSortingFeature, rowPaginationFeature,
  rowSelectionFeature, columnVisibilityFeature,
  filteredRowModel: createFilteredRowModel(),
  sortedRowModel: createSortedRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  sortFns,
})

export const textColumnFilter = (row, id, value) =>
  String(row.getValue(id) ?? '').toLocaleLowerCase('fr').includes(String(value).toLocaleLowerCase('fr'))

export const searchAcrossRow = (row, _id, value) => {
  const query = String(value).toLocaleLowerCase('fr')
  return row.getAllCells().filter(cell => cell.column.accessorFn).some(cell =>
    String(cell.getValue() ?? '').toLocaleLowerCase('fr').includes(query)) ||
    Object.values(row.original).some(cell => (typeof cell === 'string' || typeof cell === 'number') &&
      String(cell).toLocaleLowerCase('fr').includes(query))
}
