'use client'

import { useLayoutEffect, useRef } from 'react'

/** A brief entrance; the content and its form state stay mounted. */
export function enterMotion(node: HTMLElement | null, { duration = 420, distance = 12 } = {}) {
  if (!node?.animate) return
  const media = window.matchMedia('(prefers-reduced-motion: reduce)')
  if (media.matches) return
  const animation = node.animate([
    { opacity: 0, transform: `translate3d(0, ${distance}px, 0)` },
    { opacity: 1, transform: 'none' },
  ], { duration, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' })
  const cancel = () => animation.cancel()
  media.addEventListener('change', cancel)
  return () => {
    cancel()
    media.removeEventListener('change', cancel)
  }
}

export function useEnterMotion(key: string) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => enterMotion(ref.current, { duration: 220, distance: 5 }), [key])
  return ref
}
