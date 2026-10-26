export function updateFilteredSelection(current, rows, checked) {
  const next = { ...current }
  for (const row of rows) {
    if (checked) next[row.id] = true
    else delete next[row.id]
  }
  return next
}
