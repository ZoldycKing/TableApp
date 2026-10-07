'use client'

import { useLayoutEffect, useRef } from 'react'

/** A brief entrance; the content and its form state stay mounted. */
export function enterMotion(node: HTMLElement | null) {
  if (!node?.animate) return
  const media = window.matchMedia('(prefers-reduced-motion: reduce)')
  if (media.matches) return
  const animation = node.animate([
    { opacity: 0, transform: 'translate3d(0, 12px, 0)' },
    { opacity: 1, transform: 'none' },
  ], { duration: 420, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' })
  const cancel = () => animation.cancel()
  media.addEventListener('change', cancel)
  return () => {
    cancel()
    media.removeEventListener('change', cancel)
  }
}

export function useEnterMotion(key: string) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => enterMotion(ref.current), [key])
  return ref
}
