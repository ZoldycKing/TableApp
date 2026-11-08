'use client'

import { useEffect, useState, type RefObject } from 'react'

/** Only run automatic demonstrations while someone can actually see them. */
export function useMotionPlayback(ref: RefObject<HTMLElement | null>, threshold = 0.15, rootMargin = '0px') {
  const [state, setState] = useState({ playing: false, reduced: false })

  useEffect(() => {
    const node = ref.current
    if (!node) return
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    let visible = false
    const update = () => setState({
      playing: visible && !document.hidden && !media.matches,
      reduced: media.matches,
    })

    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(
      ([entry]) => {
        visible = Boolean(entry?.isIntersecting) && (entry?.intersectionRatio ?? 1) >= threshold
        update()
      },
      { threshold, rootMargin },
    )
    if (observer) observer.observe(node)
    else visible = true
    update()
    document.addEventListener('visibilitychange', update)
    media.addEventListener('change', update)
    return () => {
      observer?.disconnect()
      document.removeEventListener('visibilitychange', update)
      media.removeEventListener('change', update)
    }
  }, [ref, threshold, rootMargin])

  return state
}
