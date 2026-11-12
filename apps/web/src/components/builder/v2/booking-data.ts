'use client'
import { useEffect, useRef, useState } from 'react'
import type { AppV2, AppV2Record } from '@tableapp/schema/app-v2'
import type { BuilderV2DataPage, BuilderV2DataRequest, BuilderV2DataResult } from '@/lib/builder-v2-data-types'
import { readBuilderV2DataAction } from '@/app/builder-v2-data-actions'
import { usePublishedV2 } from './published-context'

export function bookingDays(day: string, week: boolean): string[] {
  const start = new Date(`${day}T12:00:00Z`)
  if (!week) return [day]
  start.setUTCDate(start.getUTCDate() - (start.getUTCDay() + 6) % 7)
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start); date.setUTCDate(start.getUTCDate() + index); return date.toISOString().slice(0, 10)
  })
}
/** Requests each visible day explicitly, so a week spanning two months cannot lose visits. */
export function useBookingCollection(app: AppV2, screenId: string, nodeId: string | undefined, options: { search?: string; days?: readonly string[]; rows?: readonly AppV2Record[]; enabled: boolean }) {
  const published = usePublishedV2()
  const [retry, setRetry] = useState(0), [loadingMore, setLoadingMore] = useState(false)
  const node = app.nodes.find(item => item.id === nodeId)
  const key = JSON.stringify([app.id, node, node && 'sourceId' in node ? app.sources.find(item => item.id === node.sourceId) : null, screenId, options.search ?? '', options.days, published?.revision, published?.dataVersion, retry])
  const [state, setState] = useState<{ key: string; pages: BuilderV2DataPage[]; error: string; loading: boolean }>({ key: '', pages: [], error: '', loading: true })
  const current = useRef(key); current.current = key
  const requests: BuilderV2DataRequest[] = (options.days ?? [undefined]).map(day => ({ nodeId: nodeId ?? '', screenId, search: options.search, ...(day ? { calendarMonth: day.slice(0, 7), calendarDay: day } : {}) }))
  const read = (request: BuilderV2DataRequest): Promise<BuilderV2DataResult> => published ? published.readData(request) : readBuilderV2DataAction(app.id, app, request)
  useEffect(() => {
    if (options.rows || !nodeId || !options.enabled) return
    let cancelled = false
    setState({ key, pages: [], loading: true, error: '' })
    const timer = setTimeout(() => {
      void Promise.all(requests.map(request => read(request))).then(results => {
        if (cancelled) return
        const failed = results.find(result => !result.ok)
        setState({ key, pages: failed ? [] : results.flatMap(result => result.ok ? [result.page] : []), loading: false, error: failed && !failed.ok ? failed.error : '' })
      }).catch(() => { if (!cancelled) setState({ key, pages: [], loading: false, error: 'Не удалось загрузить данные. Попробуйте ещё раз.' }) })
    }, 120)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [key, options.enabled, Boolean(options.rows)])
  const visible = state.key === key ? state : { pages: [], loading: options.enabled && !options.rows, error: '' }
  const loadMore = async () => {
    if (loadingMore) return
    setLoadingMore(true)
    try {
      const pages = await Promise.all(visible.pages.map(async (page, index) => {
        if (!page.next) return page
        const result = await read({ ...requests[index]!, cursor: page.next })
        if (!result.ok) throw new Error(result.error)
        return { ...result.page, rows: [...page.rows, ...result.page.rows] }
      }))
      if (current.current === key) setState({ key, pages, loading: false, error: '' })
    } catch (error) { if (current.current === key) setState(old => ({ ...old, error: error instanceof Error ? error.message : 'Не удалось загрузить данные.' })) }
    finally { setLoadingMore(false) }
  }
  return {
    rows: options.rows ?? visible.pages.flatMap(page => page.rows), total: options.rows?.length ?? visible.pages.reduce((sum, page) => sum + page.total, 0),
    loading: visible.loading, error: visible.error, retry: () => setRetry(value => value + 1), more: visible.pages.some(page => page.next), loadMore, loadingMore,
  }
}
