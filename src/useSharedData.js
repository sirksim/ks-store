import { useEffect, useRef, useState } from 'react'
import { loadState, normalizeState, STORAGE_KEY } from './data'
import { applyChange, diffState, overlayPending, recordKey } from './syncCore'
import { readSyncCache, writeSyncCache } from './syncCache'

async function request(path, options) {
  const response = await fetch(`/admin${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...options?.headers } })
  const body = await response.json()
  if (!response.ok && response.status !== 409) throw Object.assign(new Error(body.error || 'Serveur indisponible.'), { status: response.status })
  return { response, body }
}

export function useSharedData() {
  const [data, setDisplay] = useState(loadState)
  const [status, setStatus] = useState('connecting')
  const [pendingCount, setPendingCount] = useState(0)
  const [conflicts, setConflicts] = useState([])
  const model = useRef({ remoteState: data, revisions: {}, epoch: null, seq: 0, pending: [], conflicts: {} })
  const displayRef = useRef(data)
  const writing = useRef(Promise.resolve())
  const busy = useRef(false)
  const mounted = useRef(false)
  const publish = () => {
    const next = overlayPending(model.current.remoteState, model.current.pending)
    displayRef.current = next
    setDisplay(next)
    setPendingCount(model.current.pending.length)
    setConflicts(Object.entries(model.current.conflicts).map(([key, value]) => ({ key, ...value })))
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch { /* IndexedDB remains the offline store. */ }
    const copy = structuredClone(model.current)
    writing.current = writing.current.catch(() => {}).then(() => writeSyncCache(copy)).catch(() => {})
  }
  const applySnapshot = snapshot => {
    const m = model.current
    if (m.epoch && m.epoch !== snapshot.epoch && m.pending.length) {
      for (const operation of m.pending) {
        const key = recordKey(operation.kind, operation.id)
        const collection = operation.kind === 'settings' ? [['main', snapshot.state.settings]]
          : (snapshot.state[operation.kind] || []).map(row => [operation.kind === 'products' ? row.code : row.id, row])
        m.conflicts[key] = { kind: operation.kind, id: operation.id, local: operation.payload,
          server: new Map(collection).get(operation.id) || null, revision: snapshot.revisions[key] || 0 }
      }
    }
    m.remoteState = snapshot.state
    m.revisions = snapshot.revisions
    m.epoch = snapshot.epoch
    m.seq = snapshot.seq
    publish()
    setStatus('online')
  }
  const flush = async () => {
    if (busy.current || !model.current.epoch) return false
    busy.current = true
    try {
      while (model.current.pending.length) {
        const m = model.current
        const operation = m.pending[0]
        const key = recordKey(operation.kind, operation.id)
        if (m.conflicts[key]) break
        const { response, body } = await request('/api/change', { method: 'POST', body: JSON.stringify(operation) })
        if (response.status === 409 || body.conflict) {
          m.remoteState = applyChange(m.remoteState, { ...operation, payload: body.payload, deleted: body.deleted })
          m.revisions[key] = body.revision
          const latestLocal = m.pending.filter(item => recordKey(item.kind, item.id) === key).at(-1)?.payload
          m.conflicts[key] = { kind: operation.kind, id: operation.id, local: latestLocal,
            server: body.payload, revision: body.revision, reason: body.reason }
          publish()
          break
        }
        m.pending.shift()
        m.remoteState = applyChange(m.remoteState, operation)
        m.revisions[key] = body.revision
        publish()
      }
      setStatus('online')
      return true
    } catch (error) {
      if (error.status >= 400 && error.status < 500 && model.current.pending.length) {
        const m = model.current
        const operation = m.pending[0]
        const key = recordKey(operation.kind, operation.id)
        const server = operation.kind === 'settings' ? m.remoteState.settings
          : m.remoteState[operation.kind]?.find(row => String(operation.kind === 'products' ? row.code : row.id) === String(operation.id)) || null
        const latestLocal = m.pending.filter(item => recordKey(item.kind, item.id) === key).at(-1)?.payload
        m.conflicts[key] = { kind: operation.kind, id: operation.id, local: latestLocal,
          server, revision: m.revisions[key] || 0, reason: error.message }
        publish()
        setStatus('online')
      } else setStatus('offline')
      return false
    }
    finally { busy.current = false }
  }
  const syncOnce = async () => {
    if (!model.current.epoch) {
      const { body } = await request('/api/snapshot')
      applySnapshot(body)
    } else {
      const m = model.current
      const params = new URLSearchParams({ after: String(m.seq), epoch: m.epoch })
      const { body } = await request(`/api/changes?${params}`)
      if (body.reset) applySnapshot(body)
      else {
        for (const change of body.changes) {
          m.remoteState = applyChange(m.remoteState, change)
          m.revisions[recordKey(change.kind, change.id)] = change.revision
        }
        m.seq = body.seq
        if (body.changes.length) publish()
      }
    }
    if (model.current.epoch) {
      if (!model.current.pending.length) setStatus('online')
      else await flush()
    }
    else setStatus('connecting')
  }
  useEffect(() => {
    mounted.current = true
    ;(async () => {
      try {
        const cached = await readSyncCache()
        if (cached && mounted.current) {
          model.current = cached
          publish()
          setStatus(cached.epoch ? 'offline' : 'connecting')
        }
      } catch { /* Continue with the current local snapshot. */ }
      if (!mounted.current) return
      try { await syncOnce() }
      catch { setStatus(model.current.epoch ? 'offline' : 'unavailable') }
    })()
    const timer = setInterval(() => { syncOnce().catch(() => setStatus(model.current.epoch ? 'offline' : 'unavailable')) }, 5000)
    return () => { mounted.current = false; clearInterval(timer) }
  }, [])
  const setData = updater => {
    const m = model.current
    if (!m.epoch) return
    const previous = displayRef.current
    const next = typeof updater === 'function' ? updater(previous) : updater
    const changes = diffState(previous, next, m.revisions, m.pending)
    if (!changes.length) return
    m.pending.push(...changes)
    publish()
    flush()
  }
  const importBackup = async input => {
    const normalized = normalizeState(input)
    if (!normalized) throw new Error('Sauvegarde invalide.')
    const { body } = await request('/api/replace', { method: 'POST', body: JSON.stringify(normalized) })
    model.current.pending = []
    model.current.conflicts = {}
    applySnapshot(body)
  }
  const resolveConflict = (key, choice, replacementNumber) => {
    const m = model.current
    const conflict = m.conflicts[key]
    if (!conflict) return
    const related = m.pending.filter(item => recordKey(item.kind, item.id) === key)
    m.pending = m.pending.filter(item => recordKey(item.kind, item.id) !== key)
    if (choice === 'local' && related.length) {
      const last = related[related.length - 1]
      const payload = replacementNumber && last.kind === 'purchaseOrders'
        ? { ...last.payload, number: replacementNumber.trim() } : last.payload
      m.pending.unshift({ ...last, payload, opId: crypto.randomUUID(), baseRevision: conflict.revision })
    }
    delete m.conflicts[key]
    publish()
    flush()
  }
  return { data, setData, status, pendingCount, conflicts, resolveConflict, importBackup,
    refresh: () => syncOnce().catch(() => setStatus('offline')) }
}
