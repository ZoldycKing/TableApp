'use client'

import type { ReactNode } from 'react'
import { useEffect, useRef } from 'react'

/**
 * Появление блока при прокрутке.
 * Наблюдатель дешевле обработчика скролла и сам отключается после срабатывания —
 * анимация должна играть один раз, а не дёргаться при каждом проходе.
 */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode
  delay?: number
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const node = ref.current
    if (!node) return

    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (media.matches || typeof IntersectionObserver === 'undefined') {
      node.dataset.reveal = 'shown'
      return
    }

    let timer: number | undefined
    const show = () => {
      window.clearTimeout(timer)
      node.dataset.reveal = 'shown'
    }

    // Arm only after hydration: the server content remains readable if JS fails.
    if (node.dataset.reveal !== 'shown') node.dataset.reveal = 'pending'

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          timer = window.setTimeout(show, delay)
          observer.unobserve(entry.target)
        }
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.08 },
    )

    observer.observe(node)

    const onMotionChange = () => {
      if (!media.matches) return
      show()
      observer.disconnect()
    }
    media.addEventListener('change', onMotionChange)

    return () => {
      observer.disconnect()
      window.clearTimeout(timer)
      media.removeEventListener('change', onMotionChange)
    }
  }, [delay])

  return (
    <div ref={ref} data-reveal="" className={className}>
      {children}
    </div>
  )
}
