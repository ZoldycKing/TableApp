'use client'

import type { ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'

/** Тонкая полоса сверху: показывает, сколько страницы прочитано. */
export function ScrollProgress() {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const update = () => {
      const scrollable = document.documentElement.scrollHeight - window.innerHeight
      setProgress(scrollable > 0 ? Math.min(window.scrollY / scrollable, 1) : 0)
    }
    update()
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [])

  return (
    <div className="fixed inset-x-0 top-0 z-[60] h-[3px] bg-transparent" aria-hidden>
      <div
        className="h-full origin-left bg-sage-500 transition-transform duration-150 ease-out"
        style={{ transform: `scaleX(${progress})` }}
      />
    </div>
  )
}

/**
 * Мягкое световое пятно за курсором.
 * На устройствах без мыши эффект не включается: там он бессмыслен и только
 * тратит кадры.
 */
export function Spotlight({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return

    const onMove = (event: PointerEvent) => {
      const box = node.getBoundingClientRect()
      node.style.setProperty('--spot-x', `${event.clientX - box.left}px`)
      node.style.setProperty('--spot-y', `${event.clientY - box.top}px`)
      node.dataset.spot = 'on'
    }
    const onLeave = () => { node.dataset.spot = 'off' }

    node.addEventListener('pointermove', onMove)
    node.addEventListener('pointerleave', onLeave)
    return () => {
      node.removeEventListener('pointermove', onMove)
      node.removeEventListener('pointerleave', onLeave)
    }
  }, [])

  return (
    <div ref={ref} data-spot="off" className={`spotlight-host ${className}`}>
      {children}
    </div>
  )
}

/** Бегущая строка сценариев. Дублируется, чтобы шов был незаметен. */
export function Marquee({ items }: { items: string[] }) {
  const doubled = [...items, ...items]
  return (
    <div className="marquee-host relative flex overflow-hidden py-1">
      <div className="animate-marquee flex shrink-0 items-center gap-3 pr-3">
        {doubled.map((item, index) => (
          <span
            key={`${item}-${index}`}
            className="flex shrink-0 items-center gap-3 whitespace-nowrap text-sm text-ink-soft"
          >
            {item}
            <span className="h-1 w-1 rounded-full bg-sage-400" />
          </span>
        ))}
      </div>
      <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-20 bg-gradient-to-r from-sand-50 to-transparent" />
      <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-20 bg-gradient-to-l from-sand-50 to-transparent" />
    </div>
  )
}

/** Лёгкий параллакс: элемент отстаёт от прокрутки и создаёт глубину. */
export function Parallax({ children, strength = 24 }: { children: ReactNode; strength?: number }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let frame = 0
    const update = () => {
      frame = 0
      const box = node.getBoundingClientRect()
      const centre = box.top + box.height / 2 - window.innerHeight / 2
      const shift = Math.max(-1, Math.min(1, -centre / window.innerHeight)) * strength
      node.style.transform = `translate3d(0, ${shift.toFixed(1)}px, 0)`
    }
    const onScroll = () => { if (!frame) frame = window.requestAnimationFrame(update) }

    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [strength])

  return <div ref={ref} className="will-change-transform">{children}</div>
}
