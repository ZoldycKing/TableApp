'use client'

import { useEffect, useRef, useState, type RefObject } from 'react'
import { useMotionPlayback } from '@/components/motion/use-motion-playback'
import { useViewTransition } from '@/components/motion/use-view-transition'

type Phase = 'table' | 'catalog' | 'mobile' | 'detail'
const SEQUENCE = [
  { delay: 3800, phase: 'catalog' },
  { delay: 3400, phase: 'mobile' },
  { delay: 3800, phase: 'catalog' },
] as const

/** One table/catalog/phone pass, then a catalog that stays available. */
export function useHeroDemo(root: RefObject<HTMLElement | null>) {
  const [phase, setPhase] = useState<Phase>('table')
  const [pick, setPick] = useState(0)
  const [step, setStep] = useState(0)
  const [automatic, setAutomatic] = useState(true)
  const [paused, setPaused] = useState(false)
  const [clockRevision, setClockRevision] = useState(0)
  const clockVersion = useRef(0)
  const remaining = useRef<number>(SEQUENCE[0].delay)
  const { playing, reduced } = useMotionPlayback(root)
  const { change, skip, settle } = useViewTransition()
  const running = automatic && playing && !paused && !reduced

  useEffect(() => {
    if (!reduced) return
    settle()
    setAutomatic(false)
    setPhase('catalog')
  }, [reduced, settle])

  useEffect(() => {
    if (!playing || reduced) skip()
  }, [playing, reduced, skip])

  useEffect(() => {
    const next = SEQUENCE[step]
    if (!running || !next) return
    let fired = false
    const version = clockVersion.current
    const started = performance.now()
    const timer = window.setTimeout(() => {
      fired = true
      remaining.current = SEQUENCE[step + 1]?.delay ?? 0
      change(() => {
        setPhase(next.phase)
        setStep(step + 1)
        if (step === SEQUENCE.length - 1) setAutomatic(false)
      })
    }, remaining.current)
    return () => {
      window.clearTimeout(timer)
      if (!fired && clockVersion.current === version) {
        remaining.current = Math.max(0, remaining.current - (performance.now() - started))
      }
    }
  }, [running, step, change, clockRevision])

  const open = (position: number) => {
    setAutomatic(false)
    setPaused(false)
    change(() => { setPick(position); setPhase('detail') })
  }

  const back = () => {
    setAutomatic(false)
    setPaused(false)
    change(() => setPhase('catalog'))
  }

  const replay = () => {
    settle()
    if (reduced) { setPhase('catalog'); return }
    clockVersion.current += 1
    setClockRevision(clockVersion.current)
    remaining.current = SEQUENCE[0].delay
    setStep(0)
    setPick(0)
    setPhase('table')
    setPaused(false)
    setAutomatic(true)
  }

  const togglePause = () => {
    settle()
    setPaused((value) => !value)
  }

  return { phase, pick, automatic, paused, running, reduced, open, back, replay, togglePause }
}
