'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'

/** Measured rows, with focused editors kept mounted even while scrolling. */
export function useVirtualRows(root: RefObject<HTMLElement | null>, keys: string[], estimate: number, pinned: number[] = []) {
  const heights = useRef(new Map<string, number>())
  const observer = useRef<ResizeObserver | null>(null)
  const nodes = useRef(new Map<string, HTMLElement>())
  const [revision, setRevision] = useState(0)
  const [viewport, setViewport] = useState({ top: 0, height: 480 })
  const enabled = keys.length > 60
  const onScroll = useCallback(() => {
    const node = root.current
    if (node) setViewport({ top: node.scrollTop, height: node.clientHeight || 480 })
  }, [root])
  useEffect(() => {
    onScroll()
    if (typeof ResizeObserver === 'undefined') return
    const resize = new ResizeObserver(onScroll)
    if (root.current) resize.observe(root.current)
    observer.current = new ResizeObserver(entries => {
      let changed = false
      for (const entry of entries) {
        const key = (entry.target as HTMLElement).dataset.virtualKey
        const size = entry.target.getBoundingClientRect().height
        if (key && size > 0 && Math.abs((heights.current.get(key) ?? estimate) - size) > 0.5) { heights.current.set(key, size); changed = true }
      }
      if (changed) setRevision(value => value + 1)
    })
    root.current?.querySelectorAll<HTMLElement>('[data-virtual-key]').forEach(node => observer.current?.observe(node))
    return () => { resize.disconnect(); observer.current?.disconnect(); observer.current = null }
  }, [root, estimate, onScroll])
  const measure = useCallback((node: HTMLElement | null) => {
    if (node?.dataset.virtualKey) {
      const old = nodes.current.get(node.dataset.virtualKey)
      if (old && old !== node) observer.current?.unobserve(old)
      nodes.current.set(node.dataset.virtualKey, node); observer.current?.observe(node)
    } else if (!node) queueMicrotask(() => {
      for (const [key, element] of nodes.current) if (!element.isConnected) { observer.current?.unobserve(element); nodes.current.delete(key) }
    })
  }, [])
  const layout = useMemo(() => {
    let total = 0
    const rows = keys.map((key, index) => { const size = heights.current.get(key) ?? estimate; const item = { index, key, start: total, size }; total += size; return item })
    return { rows, total }
  }, [keys, estimate, revision])
  const keep = new Set(pinned)
  const items = enabled ? layout.rows.filter(row => keep.has(row.index) || row.start + row.size >= viewport.top - estimate * 5 && row.start <= viewport.top + viewport.height + estimate * 5) : layout.rows
  return { items, total: layout.total, measure, onScroll, enabled }
}
