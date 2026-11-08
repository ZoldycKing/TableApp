'use client'
import { useEffect, useRef, useState } from 'react'
import type { AppV2 } from '@tableapp/schema/app-v2'

// Next copies its own history markers and updates the router only for external history calls.
// Passing __NA/_N back would make it treat our navigation as an internal restore.
export const builderV2HistoryData = () => Object.fromEntries(Object.entries(window.history.state ?? {}).filter(([key]) => key !== '__NA' && key !== '_N'))
type Location = { screenId: string; recordId?: string }
export function useBuilderV2Navigation(app: AppV2, initialScreen?: string, initialRecordId?: string) {
  const normalize = (screenId?: string, recordId?: string): Location => {
    const screen = app.screens.find(screen => screen.id === screenId) ?? app.screens.find(screen => screen.id === app.homeScreenId) ?? app.screens[0]
    return { screenId: screen?.id ?? '', ...(screen?.contextTableId && recordId ? { recordId } : {}) }
  }
  const [location, setLocation] = useState(() => normalize(initialScreen, initialRecordId)), depth = useRef(0)
  const current = useRef({ normalize, location }); current.current = { normalize, location }
  useEffect(() => {
    const key = `${app.id}:${window.location.pathname}`
    const saved = window.history.state?.builderV2Navigation
    depth.current = saved?.key === key && Number.isSafeInteger(saved.depth) ? Math.max(0, saved.depth) : 0
    window.history.replaceState({ ...builderV2HistoryData(), builderV2Navigation: { key, depth: depth.current } }, '', window.location.href)
    const pop = () => { const url = new URL(window.location.href), marker = window.history.state?.builderV2Navigation; depth.current = marker?.key === key && Number.isSafeInteger(marker.depth) ? Math.max(0, marker.depth) : 0; setLocation(current.current.normalize(url.searchParams.get('screen') ?? undefined, url.searchParams.get('row') ?? undefined)) }
    window.addEventListener('popstate', pop); return () => window.removeEventListener('popstate', pop)
  }, [app.id])
  const navigate = (screenId: string, recordId?: string, replace = false) => {
    const next: Location = { screenId, ...(recordId && app.screens.find(screen => screen.id === screenId)?.contextTableId ? { recordId } : {}) }, url = new URL(window.location.href)
    if (next.screenId === location.screenId && next.recordId === location.recordId) return
    if (!replace) depth.current++
    url.searchParams.set('screen', next.screenId)
    if (next.recordId) url.searchParams.set('row', next.recordId); else url.searchParams.delete('row')
    window.history[replace ? 'replaceState' : 'pushState']({ ...builderV2HistoryData(), builderV2Navigation: { key: `${app.id}:${window.location.pathname}`, depth: depth.current } }, '', url)
    setLocation(next)
  }
  const back = (fallbackScreenId?: string) => { if (depth.current > 0) window.history.back(); else navigate(fallbackScreenId ?? app.homeScreenId ?? app.screens.find(screen => !screen.contextTableId)?.id ?? '', undefined, true) }
  return { ...normalize(location.screenId, location.recordId), navigate, back }
}
