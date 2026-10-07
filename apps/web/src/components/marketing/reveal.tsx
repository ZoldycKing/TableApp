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

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) {
      node.dataset.reveal = 'shown'
      return
    }

    const show = () => { node.dataset.reveal = 'shown' }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          window.setTimeout(show, delay)
          observer.unobserve(entry.target)
        }
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.08 },
    )

    observer.observe(node)

    /*
     * Страховка. Наблюдатель молчит, пока страница не отрисовывается — например,
     * во вкладке на фоне или в окне без композитинга. Пропустить анимацию
     * не страшно, а оставить текст невидимым — недопустимо.
     */
    const fallback = window.setTimeout(() => {
      if (node.dataset.reveal !== 'shown') show()
      observer.disconnect()
    }, 2500 + delay)

    return () => {
      observer.disconnect()
      window.clearTimeout(fallback)
    }
  }, [delay])

  return (
    <div ref={ref} data-reveal="" className={className}>
      {children}
    </div>
  )
}
