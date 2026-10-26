export const syncCollections = ['families', 'products', 'suppliers', 'customers', 'purchaseOrders', 'invoices', 'sales', 'expenses']
export const recordId = (kind, record) => kind === 'products' ? record.code : record.id
export const recordKey = (kind, id) => `${kind}:${id}`

export function diffState(previous, next, revisions, pending = []) {
  const changes = []
  for (const kind of [...syncCollections, 'settings']) {
    const before = kind === 'settings' ? [['main', previous.settings]] : (previous[kind] || []).map(row => [recordId(kind, row), row])
    const after = kind === 'settings' ? [['main', next.settings]] : (next[kind] || []).map(row => [recordId(kind, row), row])
    const oldRows = new Map(before)
    const newRows = new Map(after)
    for (const id of new Set([...oldRows.keys(), ...newRows.keys()])) {
      if (JSON.stringify(oldRows.get(id)) === JSON.stringify(newRows.get(id))) continue
      const key = recordKey(kind, id)
      changes.push({ opId: crypto.randomUUID(), kind, id: String(id),
        baseRevision: (revisions[key] || 0) + pending.filter(item => recordKey(item.kind, item.id) === key).length,
        payload: newRows.get(id) || null, deleted: !newRows.has(id) })
    }
  }
  return [...changes.filter(change => !change.deleted), ...changes.filter(change => change.deleted).reverse()]
}

export function applyChange(state, change) {
  if (change.kind === 'settings') return { ...state, settings: change.deleted ? state.settings : change.payload }
  const rows = state[change.kind] || []
  const without = rows.filter(row => String(recordId(change.kind, row)) !== String(change.id))
  return { ...state, [change.kind]: change.deleted ? without : [...without, change.payload] }
}

export const overlayPending = (state, pending) => pending.reduce(applyChange, state)
