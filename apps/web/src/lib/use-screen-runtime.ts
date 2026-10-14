'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { customerCartWorkflow, customerWorkflows, dateInstant, fieldTimeZone } from '@tableapp/schema'
import type { RuntimeApp } from './app-runtime'
import { runtimeQuery, runtimeQueryKey, type RuntimePageRequest } from './runtime-page-types'
import { mergeRuntimePageCache } from './runtime-page-cache'

export type RuntimePageControls = { loading: boolean; error: string | null; onMore: () => void; onRetry: () => void }
export type UseScreenRuntimeOptions = {
  rowId?: string | null
  listStates?: Readonly<Record<string, RuntimePageRequest>>
  cartProductIds?: readonly string[]
  selectedCatalogRow?: { screenId: string; rowId: string } | null
}
type Activity = { key: string; loading: boolean; error: string | null; cursor?: string; attempt: number }
type Cache = { base: RuntimeApp; runtime: RuntimeApp; activity: Record<string, Activity> }
type Result = { ok: true; runtime: RuntimeApp } | { ok: false; error: string; reload?: boolean; reset?: boolean }
const NETWORK_ERROR = 'Не удалось загрузить раздел. Проверьте соединение и попробуйте ещё раз.'
const TARGET_BATCH_SIZE = 100
const BOOKING_REFRESH_MS = 5 * 60_000
const clearCachedRows = (runtime: RuntimeApp): RuntimeApp => ({ ...runtime,
  tables: Object.fromEntries(Object.entries(runtime.tables).map(([tableId, table]) => [tableId, { ...table, rows: [] }])),
  screens: {}, relatedTitles: {}, blocks: {}, lazy: { ...runtime.lazy!, loadedScreenIds: [], loadedRows: {} },
})

export function useScreenRuntime(initial: RuntimeApp, screenId: string, disabled: boolean, options: UseScreenRuntimeOptions = {}) {
  const { refresh } = useRouter()
  const [slice, setSlice] = useState<{ base: RuntimeApp; runtime: RuntimeApp }>({ base: initial, runtime: initial })
  const [failure, setFailure] = useState<{ base: RuntimeApp; screenId: string; error: string } | null>(null)
  const [attempt, setAttempt] = useState(0)
  const legacy = slice.base === initial ? slice.runtime : initial
  const paged = Boolean(initial.lazy?.paged) && !disabled
  const legacyLoading = !disabled && !paged && Boolean(legacy.lazy && !legacy.lazy.loadedScreenIds.includes(screenId))
  const legacyError = failure?.base === initial && failure.screenId === screenId ? failure.error : null
  useEffect(() => {
    if (!legacyLoading || !initial.lazy) return
    let current = true
    setFailure(null)
    import('@/app/runtime-screen-actions').then(({ loadRuntimeScreenAction }) => loadRuntimeScreenAction(initial.app.slug, screenId, initial.lazy!.revision)).then(result => {
      if (!current) return
      if (result.ok) setSlice({ base: initial, runtime: result.runtime })
      else { setFailure({ base: initial, screenId, error: result.error }); if (result.reload) refresh() }
    }).catch(() => { if (current) setFailure({ base: initial, screenId, error: 'Не удалось загрузить раздел. Проверьте соединение и попробуйте ещё раз.' }) })
    return () => { current = false }
  }, [initial, screenId, legacyLoading, attempt, refresh])

  const [snapshot, setSnapshot] = useState<Cache>({ base: initial, runtime: initial, activity: {} })
  const cache = useRef(snapshot)
  const flights = useRef(new Map<string, symbol>())
  const bookingRefresh = useRef({ base: initial, attempts: {} as Record<string, number> })
  useEffect(() => () => { flights.current.clear() }, [])
  if (cache.current.base !== initial) {
    cache.current = { base: initial, runtime: initial, activity: {} }
    flights.current.clear()
    bookingRefresh.current = { base: initial, attempts: {} }
  }
  const cached = snapshot.base === initial ? snapshot.runtime : initial
  const activity = snapshot.base === initial ? snapshot.activity : {}
  const active = initial.app.screens.find(screen => screen.id === screenId)
  const collectionIds = paged && screenId === initial.app.homeScreenId && initial.app.catalogScreenIds
    ? initial.app.catalogScreenIds : paged && active && (active.type === 'list' || active.type === 'tiles') ? [screenId] : []
  const requests = Object.fromEntries(collectionIds.map(id => {
    const state = options.listStates?.[id] ?? {}
    const hub = screenId === initial.app.homeScreenId && initial.app.catalogScreenIds?.includes(id)
    const customer = customerWorkflows(initial.app).find(config => config.listScreenId === id)
    const booking = id === (initial.app.booking?.listScreenId ?? '')
    return [id, runtimeQuery(hub ? { query: options.listStates?.[screenId]?.query ?? '', choiceId: null } : {
      query: state.query ?? '', choiceId: customer || booking ? null : state.choiceId ?? null,
      ...(customer ? { customerSection: state.customerSection ?? 'active' } : {}),
      ...(booking ? { bookingSection: state.bookingSection ?? 'upcoming' } : {}),
    })]
  }))
  const requestSignature = JSON.stringify(requests)
  const wanted = useRef({ base: initial, screenId, requests })
  wanted.current = { base: initial, screenId, requests }

  const update = (change: (value: Cache) => Cache) => {
    if (cache.current.base !== initial) return
    cache.current = change(cache.current)
    setSnapshot(cache.current)
  }
  const setActivity = (slot: string, value: Activity) => update(current => ({ ...current, activity: { ...current.activity, [slot]: value } }))
  const pageWanted = (id: string, key: string) => wanted.current.base === initial && Boolean(wanted.current.requests[id]) && runtimeQueryKey(wanted.current.requests[id]) === key
  const fetchPage = async (id: string, request: RuntimePageRequest, cursor?: string) => {
    if (!paged || !initial.lazy || flights.current.has(`page:${id}`)) return
    const slot = `page:${id}`, key = runtimeQueryKey(request), token = Symbol(slot)
    const currentPage = cache.current.runtime.screens[id]?.page
    if (!pageWanted(id, key) || cursor && (currentPage?.key !== key || currentPage.next !== cursor)) return
    flights.current.set(slot, token)
    setActivity(slot, { key, loading: true, error: null, cursor, attempt })
    try {
      const actions = await import('@/app/runtime-screen-actions')
      const result: Result = await actions.loadRuntimePageAction(initial.app.slug, id, initial.lazy.revision, request, cursor)
      if (flights.current.get(slot) !== token || !pageWanted(id, key)) return
      if (result.ok) {
        const revision = result.runtime.screens[id]?.page?.dataRevision
        const changed = revision && Object.values(cache.current.runtime.screens).some(screen => screen.page && screen.page.dataRevision !== revision)
        if (changed) flights.current.clear()
        update(current => ({ ...current, activity: changed ? {} : current.activity,
          runtime: mergeRuntimePageCache(changed ? clearCachedRows(current.runtime) : current.runtime, result.runtime, { screenId: id, append: Boolean(cursor) && !changed }) }))
        setActivity(slot, { key, loading: false, error: null, attempt })
      } else if (result.reset) {
        flights.current.clear()
        update(current => ({ ...current, runtime: clearCachedRows(current.runtime), activity: {} }))
      } else {
        setActivity(slot, { key, loading: false, error: result.error, cursor, attempt })
        if (result.reload) refresh()
      }
    } catch {
      if (flights.current.get(slot) === token && pageWanted(id, key)) setActivity(slot, { key, loading: false, error: NETWORK_ERROR, cursor, attempt })
    } finally {
      if (flights.current.get(slot) === token) {
        flights.current.delete(slot)
        const pending = cache.current.activity[slot]
        if (cache.current.base === initial && pending?.key === key && pending.loading) setActivity(slot, { ...pending, loading: false })
      }
    }
  }

  useEffect(() => {
    if (!paged) return
    const timers: ReturnType<typeof setTimeout>[] = []
    for (const [id, request] of Object.entries(requests)) {
      const key = runtimeQueryKey(request), page = cache.current.runtime.screens[id]?.page, prior = cache.current.activity[`page:${id}`]
      if (page?.key === key || prior?.key === key && prior.error && prior.attempt === attempt) continue
      if (prior?.key !== key) flights.current.delete(`page:${id}`)
      const delay = page && request.query ? 250 : 0
      timers.push(setTimeout(() => { void fetchPage(id, request) }, delay))
    }
    return () => { timers.forEach(clearTimeout) }
    // Requests are canonicalized above; unrelated row/pending changes must not invalidate an in-flight page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial, paged, requestSignature, cached, attempt])

  useEffect(() => {
    const booking = initial.app.booking, id = booking?.listScreenId ?? initial.app.homeScreenId
    if (!paged || !booking || !id || screenId !== id || !requests[id]) return
    const request = requests[id]!, page = cached.screens[id]?.page, slot = `page:${id}`
    if (!page || page.key !== runtimeQueryKey(request) || flights.current.has(slot) || activity[slot]?.error) return
    const table = cached.tables[booking.tables.visits]
    const dateField = table?.fields.find(field => field.id === booking.visit.start)
    const zone = dateField ? fieldTimeZone(dateField) : 'UTC'
    const after = Math.max(page.asOf, bookingRefresh.current.attempts[id] ?? 0)
    let due = after + BOOKING_REFRESH_MS
    for (const rowId of cached.screens[id]!.rowIds) {
      const row = table?.rows.find(row => row.id === rowId)
      if (!row || ![booking.statuses.booked, booking.statuses.arrived].includes(String(row.data[booking.visit.status]))) continue
      const start = dateInstant(row.data[booking.visit.start], zone), minutes = row.data[booking.visit.minutes]
      const end = start === null ? null : start + (typeof minutes === 'number' && Number.isFinite(minutes) && minutes > 0 ? minutes * 60_000 : 0)
      if (end !== null && end > after) due = Math.min(due, end)
    }
    const timer = setTimeout(() => {
      if (flights.current.has(slot)) return
      bookingRefresh.current.attempts[id] = Date.now()
      void fetchPage(id, request)
    }, Math.max(1_000, due - Date.now()))
    return () => clearTimeout(timer)
    // A fresh first page starts a new fixed-time cursor chain without clearing the visible list while it loads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial, paged, screenId, requestSignature, snapshot])

  const targets: Record<string, string[]> = {}
  const pin = (id: string | undefined, rows: readonly string[]) => {
    if (id && rows.length) targets[id] = [...new Set([...(targets[id] ?? []), ...rows])]
  }
  if (paged && options.rowId && active && (active.type === 'detail' || active.type === 'form' && active.mode === 'edit')) pin(screenId, [options.rowId])
  if (paged && options.selectedCatalogRow) pin(options.selectedCatalogRow.screenId, [options.selectedCatalogRow.rowId])
  if (paged) pin(customerCartWorkflow(initial.app)?.catalog?.detailScreenId, options.cartProductIds ?? [])
  const targetSignature = JSON.stringify(targets)
  const targetWanted = useRef({ base: initial, targets })
  targetWanted.current = { base: initial, targets }
  const fetchRows = async (id: string, ids: string[]) => {
    if (!paged || !initial.lazy || flights.current.has(`rows:${id}`)) return
    const slot = `rows:${id}`, key = JSON.stringify(ids), token = Symbol(slot)
    flights.current.set(slot, token); setActivity(slot, { key, loading: true, error: null, attempt })
    const stillWanted = () => cache.current.base === initial && targetWanted.current.base === initial && ids.every(rowId => targetWanted.current.targets[id]?.includes(rowId))
    try {
      const actions = await import('@/app/runtime-screen-actions')
      const result: Result = await actions.loadRuntimeRowsAction(initial.app.slug, id, initial.lazy.revision, ids)
      if (flights.current.get(slot) !== token || !stillWanted()) return
      if (result.ok) {
        update(current => ({ ...current, runtime: mergeRuntimePageCache(current.runtime, result.runtime, { screenId: id, rowsOnly: true, requestedRows: ids }) }))
        setActivity(slot, { key, loading: false, error: null, attempt })
      } else { setActivity(slot, { key, loading: false, error: result.error, attempt }); if (result.reload) refresh() }
    } catch { if (flights.current.get(slot) === token && stillWanted()) setActivity(slot, { key, loading: false, error: NETWORK_ERROR, attempt }) }
    finally { if (flights.current.get(slot) === token) flights.current.delete(slot) }
  }
  const rowTarget = options.rowId && active && (active.type === 'detail' || active.type === 'form' && active.mode === 'edit')
  const screenMissing = paged && collectionIds.length === 0 && !rowTarget && !cached.lazy?.loadedScreenIds.includes(screenId)
  useEffect(() => {
    if (!paged || !initial.lazy) return
    for (const [id, ids] of Object.entries(targets)) {
      const missing = ids.filter(rowId => !cache.current.runtime.lazy?.loadedRows?.[id]?.includes(rowId)).slice(0, TARGET_BATCH_SIZE), prior = cache.current.activity[`rows:${id}`]
      if (!missing.length || prior?.key === JSON.stringify(missing) && prior.error && prior.attempt === attempt) continue
      if (prior?.key !== JSON.stringify(missing)) flights.current.delete(`rows:${id}`)
      void fetchRows(id, missing)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial, paged, targetSignature, cached, attempt])
  useEffect(() => {
    if (!screenMissing || !initial.lazy) return
    const slot = `screen:${screenId}`, prior = cache.current.activity[slot]
    if (flights.current.has(slot) || prior?.error && prior.attempt === attempt) return
    const token = Symbol(slot); flights.current.set(slot, token)
    setActivity(slot, { key: screenId, loading: true, error: null, attempt })
    const stillWanted = () => wanted.current.base === initial && wanted.current.screenId === screenId && flights.current.get(slot) === token
    import('@/app/runtime-screen-actions').then(actions => actions.loadRuntimeScreenAction(initial.app.slug, screenId, initial.lazy!.revision)).then(result => {
      if (!stillWanted()) return
      if (result.ok) { update(current => ({ ...current, runtime: mergeRuntimePageCache(current.runtime, result.runtime) })); setActivity(slot, { key: screenId, loading: false, error: null, attempt }) }
      else { setActivity(slot, { key: screenId, loading: false, error: result.error, attempt }); if (result.reload) refresh() }
    }).catch(() => { if (stillWanted()) setActivity(slot, { key: screenId, loading: false, error: NETWORK_ERROR, attempt }) }).finally(() => { if (flights.current.get(slot) === token) flights.current.delete(slot) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial, screenId, screenMissing, attempt])

  const pageControls: Record<string, RuntimePageControls> = Object.fromEntries(collectionIds.map(id => {
    const request = requests[id]!, key = runtimeQueryKey(request), pending = activity[`page:${id}`], page = cached.screens[id]?.page
    return [id, { loading: page?.key !== key && !(pending?.key === key && pending.error) || pending?.key === key && pending.loading,
      error: pending?.key === key ? pending.error : null,
      onMore: () => { if (page?.key === key && page.next) void fetchPage(id, request, page.next) },
      onRetry: () => { if (pending?.key === key) void fetchPage(id, request, pending.cursor) },
    }]
  }))
  const viewRuntime = useMemo(() => {
    const stale = collectionIds.filter(id => cached.screens[id]?.page?.key !== runtimeQueryKey(requests[id]!))
    if (!stale.length) return cached
    const screens = { ...cached.screens }
    for (const id of stale) if (screens[id]) screens[id] = { ...screens[id]!, rowIds: [] }
    return { ...cached, screens }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cached, requestSignature])
  const rowError = Object.entries(targets).map(([id, ids]) => {
    const missing = ids.filter(rowId => !cached.lazy?.loadedRows?.[id]?.includes(rowId)).slice(0, TARGET_BATCH_SIZE), prior = activity[`rows:${id}`]
    return prior?.key === JSON.stringify(missing) ? prior.error : null
  }).find(Boolean) ?? null
  const targetLoading = Object.entries(targets).some(([id, ids]) => ids.some(rowId => !cached.lazy?.loadedRows?.[id]?.includes(rowId)))
  const firstPageError = collectionIds.some(id => !cached.screens[id]?.page) ? collectionIds.map(id => pageControls[id]?.error).find(Boolean) ?? null : null
  const pagedError = activity[`screen:${screenId}`]?.error ?? rowError ?? firstPageError
  const pagedLoading = !pagedError && (screenMissing || targetLoading || collectionIds.some(id => !cached.screens[id]?.page))
  return { runtime: paged ? viewRuntime : legacy, loading: paged ? pagedLoading : legacyLoading, error: paged ? pagedError : legacyError,
    retry: () => setAttempt(value => value + 1), pageControls }
}
