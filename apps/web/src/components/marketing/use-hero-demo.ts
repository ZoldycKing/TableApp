'use client'

import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { useMotionPlayback } from '@/components/motion/use-motion-playback'
import { useViewTransition } from '@/components/motion/use-view-transition'

type Phase = 'filling' | 'tap' | 'detail' | 'catalog'
type Step = { delay: number; kind: 'fly' | 'land' | 'tap' | 'detail' | 'catalog'; position?: number }

/** One demonstration, with a clock that preserves its place during pauses. */
export function useHeroDemo(root: RefObject<HTMLElement | null>, count: number) {
  const [phase, setPhase] = useState<Phase>('filling')
  const [flying, setFlying] = useState<number | null>(null)
  const [landed, setLanded] = useState(0)
  const [pick, setPick] = useState(0)
  const [step, setStep] = useState(0)
  const [automatic, setAutomatic] = useState(true)
  const [paused, setPaused] = useState(false)
  const remaining = useRef(0)
  const { playing, reduced } = useMotionPlayback(root)
  const { change, skip, settle } = useViewTransition()
  const running = automatic && playing && !paused && !reduced

  const sequence = useMemo(() => {
    const steps: Step[] = []
    for (let position = 0; position < count; position += 1) {
      steps.push({ delay: position === 0 ? 0 : 280, kind: 'fly', position })
      steps.push({ delay: 620, kind: 'land', position })
    }
    steps.push({ delay: 900, kind: 'tap' }, { delay: 560, kind: 'detail' }, { delay: 3000, kind: 'catalog' })
    return steps
  }, [count])

  useEffect(() => {
    if (!reduced) return
    setAutomatic(false)
    setFlying(null)
    setLanded(count)
    setPhase('catalog')
  }, [count, reduced])

  useEffect(() => {
    if (!playing || paused || reduced) skip()
  }, [playing, paused, reduced, skip])

  useEffect(() => {
    const next = sequence[step]
    if (!running || !next) return
    let fired = false
    const started = performance.now()
    const timer = window.setTimeout(() => {
      fired = true
      if (next.kind === 'fly') setFlying(next.position!)
      else if (next.kind === 'land') {
        setFlying(null)
        setLanded(next.position! + 1)
      } else if (next.kind === 'tap') setPhase('tap')
      else if (next.kind === 'detail') change(() => setPhase('detail'))
      else {
        change(() => setPhase('catalog'))
        setAutomatic(false)
      }
      remaining.current = sequence[step + 1]?.delay ?? 0
      setStep(step + 1)
    }, remaining.current)

    return () => {
      window.clearTimeout(timer)
      if (!fired) remaining.current = Math.max(0, remaining.current - (performance.now() - started))
    }
  }, [running, sequence, step, change])

  const open = (position: number) => {
    setAutomatic(false)
    setPaused(false)
    change(() => {
      setPick(position)
      setFlying(null)
      setLanded(count)
      setPhase('detail')
    })
  }

  const back = () => {
    setAutomatic(false)
    setPaused(false)
    change(() => {
      setFlying(null)
      setLanded(count)
      setPhase('catalog')
    })
  }

  const replay = () => {
    if (reduced) { back(); return }
    // Restart immediately so a page snapshot cannot intercept the pause button.
    settle()
    remaining.current = 0
    setStep(0)
    setPick(0)
    setFlying(null)
    setLanded(0)
    setPhase('filling')
    setPaused(false)
    setAutomatic(true)
  }

  return { phase, flying, landed, pick, automatic, paused, running, reduced, open, back, replay,
    togglePause: () => {
      // A pending replay must commit before the user's newer pause request.
      settle()
      setPaused((value) => !value)
    } }
}
