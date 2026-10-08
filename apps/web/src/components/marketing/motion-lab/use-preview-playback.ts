'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useMotionPlayback } from '@/components/motion/use-motion-playback'
import { useViewTransition } from '@/components/motion/use-view-transition'

/** One visible preview owns the clock; pauses preserve the remaining scene time. */
export function usePreviewPlayback(durations: readonly number[]) {
  const root = useRef<HTMLDivElement>(null)
  const [step, setStep] = useState(0)
  const currentStep = useRef(0)
  const [paused, setPaused] = useState(false)
  const [clockRevision, setClockRevision] = useState(0)
  const clockVersion = useRef(0)
  const remaining = useRef(durations[0] ?? 4000)
  const { playing, reduced } = useMotionPlayback(root)
  const { change, skip, settle } = useViewTransition()
  const running = playing && !paused && !reduced
  const apply = useCallback((next: number) => {
    currentStep.current = next
    setStep(next)
  }, [])

  useEffect(() => {
    if (!playing || reduced) skip()
  }, [playing, reduced, skip])

  useEffect(() => {
    if (!running || durations.length < 2) return
    let fired = false
    const version = clockVersion.current
    const started = performance.now()
    const timer = window.setTimeout(() => {
      fired = true
      const next = (step + 1) % durations.length
      remaining.current = durations[next]!
      change(() => apply(next))
    }, remaining.current)
    return () => {
      window.clearTimeout(timer)
      if (!fired && clockVersion.current === version) {
        remaining.current = Math.max(0, remaining.current - (performance.now() - started))
      }
    }
  }, [running, step, durations, change, apply, clockRevision])

  const resetClock = (next: number) => {
    clockVersion.current += 1
    remaining.current = durations[next] ?? 4000
    setClockRevision(clockVersion.current)
  }

  const select = (next: number) => {
    if (next < 0 || next >= durations.length) return
    settle()
    resetClock(next)
    setPaused(true)
    if (currentStep.current !== next) change(() => apply(next))
  }

  const toggle = () => {
    settle()
    setPaused((value) => !value)
  }

  const replay = () => {
    settle()
    resetClock(0)
    apply(0)
    setPaused(false)
  }

  return { root, step, paused, reduced, running, select, toggle, replay }
}
