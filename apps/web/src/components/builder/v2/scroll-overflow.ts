import { useEffect, type RefObject } from 'react'

/** Marks a horizontal scroller where a side still has hidden tabs, so the edge can fade. */
export function useScrollOverflow(ref: RefObject<HTMLElement | null>, watch: readonly unknown[] = []) {
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => {
      el.toggleAttribute('data-overflow-start', el.scrollLeft > 1)
      el.toggleAttribute('data-overflow-end', el.scrollLeft + el.clientWidth < el.scrollWidth - 1)
    }
    update()
    el.addEventListener('scroll', update, { passive: true })
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update)
    observer?.observe(el)
    const fonts = document.fonts?.ready.then(update)
    return () => {
      el.removeEventListener('scroll', update)
      observer?.disconnect()
      void fonts
    }
  }, [ref, ...watch])
}
