'use client'

import { useCallback, useEffect, useRef } from 'react'
import { flushSync } from 'react-dom'

/** Animate a React update without making navigation depend on browser support. */
export function useViewTransition() {
  const mounted = useRef(true)
  const active = useRef<{ transition: ViewTransition; commit: () => void } | null>(null)

  const skip = useCallback(() => {
    const pending = active.current
    if (!pending) return
    pending.transition.skipTransition()
    active.current = null
  }, [])

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      active.current?.transition.skipTransition()
      active.current = null
    }
  }, [])

  const change = useCallback((update: () => void) => {
    // Commit an earlier request before a rapid second interaction supersedes it.
    active.current?.commit()
    skip()
    if (!mounted.current) return
    if (!document.startViewTransition || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      update()
      return
    }

    let committed = false
    const commit = () => {
      if (committed || !mounted.current) return
      committed = true
      flushSync(update)
    }

    try {
      const transition = document.startViewTransition(commit)
      active.current = { transition, commit }
      // Duplicate names or an interrupted snapshot must not break the UI.
      void transition.ready.catch(() => {})
      void transition.updateCallbackDone.catch(() => {})
      void transition.finished.catch(() => {}).finally(() => {
        if (active.current?.transition === transition) active.current = null
      })
    } catch {
      commit()
    }
  }, [skip])

  return { change, skip }
}
