'use client'

import { useEffect, useRef, useState } from 'react'
import { useMotionPlayback } from '@/components/motion/use-motion-playback'

export const CHAPTER_MS = 7000

/**
 * Механика для вариации А3. Полоска ведётся по настоящему времени и пишется
 * прямо в стиль элемента, а не через CSS-анимацию: тогда она и таймер смены
 * идут по одним часам, пройденные главы остаются закрашенными, а пауза
 * под курсором просто замораживает движение и продолжает с того же места.
 *
 * Значение не держим в состоянии: шестьдесят перерисовок в секунду
 * перерисовывали бы и сцену внутри блока.
 */
export function useStoryProgress(count: number) {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)

  const bars = useRef<Array<HTMLSpanElement | null>>([])
  const pausedRef = useRef(false)
  const indexRef = useRef(0)
  const spent = useRef(0)
  const root = useRef<HTMLDivElement>(null)
  const resetTimer = useRef<number | undefined>(undefined)
  const { playing } = useMotionPlayback(root)

  const paint = () => {
    bars.current.forEach((bar, position) => {
      if (!bar) return
      const value =
        position < indexRef.current
          ? 1
          : position === indexRef.current
            ? spent.current / CHAPTER_MS
            : 0
      bar.style.transform = `scaleX(${value})`
    })
  }

  /* Новый круг начинается мягко: полоски гаснут переходом, а не рывком. */
  const softReset = () => {
    bars.current.forEach((bar) => {
      if (bar) bar.style.transition = 'transform 420ms cubic-bezier(0.22, 1, 0.36, 1)'
    })
    window.clearTimeout(resetTimer.current)
    resetTimer.current = window.setTimeout(() => {
      bars.current.forEach((bar) => {
        if (bar) bar.style.transition = ''
      })
    }, 460)
  }

  useEffect(() => {
    pausedRef.current = paused
  }, [paused])

  // Первая отрисовка и переключение руками: без этого полоска без transform
  // показалась бы полной.
  useEffect(paint, [index])

  useEffect(() => {
    if (!playing || paused || count < 1) return

    let frame = 0
    let last = performance.now()

    const tick = (now: number) => {
      /*
       * Кадры не приходят, пока вкладка скрыта, и первый после возврата
       * принёс бы всю пропущенную минуту разом — глава промотнулась бы
       * мгновенно. Поэтому шаг ограничен.
       */
      const delta = Math.min(now - last, 120)
      last = now

      if (!pausedRef.current) {
        spent.current += delta

        if (spent.current >= CHAPTER_MS) {
          spent.current = 0
          const next = (indexRef.current + 1) % count
          if (next === 0) softReset()
          indexRef.current = next
          setIndex(next)
        }

        paint()
      }

      frame = window.requestAnimationFrame(tick)
    }

    frame = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(frame)
  }, [count, playing, paused])

  useEffect(() => () => window.clearTimeout(resetTimer.current), [])

  return {
    index,
    paused,
    bars,
    root,
    show: (position: number) => {
      spent.current = 0
      indexRef.current = position
      setIndex(position)
      paint()
    },
    hover: {
      onMouseEnter: () => setPaused(true),
      onMouseLeave: () => setPaused(false),
    },
  }
}
