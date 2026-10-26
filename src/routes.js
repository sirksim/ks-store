export const listPaths = {
  overview: '/', products: '/products', suppliers: '/suppliers', purchaseOrders: '/purchase-orders',
  receipts: '/receipts', customers: '/customers', sales: '/sales', stock: '/stock',
  expenses: '/expenses', reports: '/reports',
}

const details = {
  productDetail: '/products/', supplierDetail: '/suppliers/', customerDetail: '/customers/',
  orderDetail: '/purchase-orders/', invoiceDetail: '/invoices/',
}

export function pathFor(page, id) {
  if (listPaths[page]) return `/admin${listPaths[page]}`
  if (page === 'orderEditor') return id ? `/admin/purchase-orders/${encodeURIComponent(id)}/edit` : '/admin/purchase-orders/new'
  if (page === 'invoiceEditor') return id ? `/admin/receipts/${encodeURIComponent(id)}/edit` : '/admin/receipts/new'
  return details[page] && id ? `/admin${details[page]}${encodeURIComponent(id)}` : '/admin/'
}

export function parseRoute(pathname) {
  const path = pathname.replace(/^\/admin(?=\/|$)/, '').replace(/\/+$/, '') || '/'
  const list = Object.entries(listPaths).find(([, value]) => value === path)
  if (list) return { page: list[0], id: null }
  if (path === '/purchase-orders/new') return { page: 'orderEditor', id: null }
  if (path === '/receipts/new') return { page: 'invoiceEditor', id: null }
  for (const [page, pattern] of [['orderEditor', /^\/purchase-orders\/([^/]+)\/edit$/], ['invoiceEditor', /^\/receipts\/([^/]+)\/edit$/]]) {
    const match = pattern.exec(path)
    if (match) {
      try { return { page, id: decodeURIComponent(match[1]) } } catch { return { page: 'notFound', id: null } }
    }
  }
  for (const [page, prefix] of Object.entries(details)) {
    if (path.startsWith(prefix) && path.slice(prefix.length) && !path.slice(prefix.length).includes('/')) {
      try { return { page, id: decodeURIComponent(path.slice(prefix.length)) } } catch { break }
    }
  }
  return { page: 'notFound', id: null }
}

export function readTableQuery(search, columns, initialSort = []) {
  const params = new URLSearchParams(search)
  const filterable = new Set(columns.filter(column => column.accessorKey || column.accessorFn)
    .map(column => column.id || column.accessorKey))
  const sortable = new Set(columns.filter(column => (column.accessorKey || column.accessorFn) && column.enableSorting !== false)
    .map(column => column.id || column.accessorKey))
  const columnFilters = [...params].filter(([key, value]) => key.startsWith('filter.') && value && filterable.has(key.slice(7)))
    .map(([key, value]) => ({ id: key.slice(7), value }))
  const hidden = params.getAll('hide').filter(id => filterable.has(id))
  const visibleData = [...filterable].filter(id => !hidden.includes(id))
  const columnVisibility = visibleData.length ? Object.fromEntries(hidden.map(id => [id, false])) : {}
  const sorting = params.getAll('sort').map(value => {
    const [id, direction] = value.split(':')
    return sortable.has(id) && (direction === 'asc' || direction === 'desc') ? { id, desc: direction === 'desc' } : null
  }).filter(Boolean)
  const requestedPage = Number(params.get('page'))
  return {
    globalFilter: params.get('q') || '', columnFilters, columnVisibility,
    sorting: sorting.length ? sorting : initialSort,
    pagination: { pageIndex: Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage - 1 : 0, pageSize: 10 },
  }
}

export function writeTableQuery(search, state) {
  const params = new URLSearchParams(search)
  for (const key of [...params.keys()]) if (key === 'q' || key === 'sort' || key === 'hide' || key === 'page' || key.startsWith('filter.')) params.delete(key)
  if (state.globalFilter) params.set('q', state.globalFilter)
  for (const filter of state.columnFilters) if (filter.value) params.append(`filter.${filter.id}`, String(filter.value))
  for (const sort of state.sorting) params.append('sort', `${sort.id}:${sort.desc ? 'desc' : 'asc'}`)
  for (const [id, visible] of Object.entries(state.columnVisibility)) if (!visible) params.append('hide', id)
  if (state.pagination.pageIndex > 0) params.set('page', String(state.pagination.pageIndex + 1))
  return params.toString()
}

export function replaceQuery(update) {
  const url = new URL(window.location.href)
  update(url.searchParams)
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
}

export function go(to, replace = false) {
  const method = replace ? 'replaceState' : 'pushState'
  const previous = `${window.location.pathname}${window.location.search}`
  window.history[method]({ app: true, fromApp: !replace, previous }, '', to)
  window.dispatchEvent(new Event('app:navigate'))
}
