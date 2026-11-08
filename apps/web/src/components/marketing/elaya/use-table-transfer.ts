'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useMotionPlayback } from '../../motion/use-motion-playback'
import { transferPaths } from './table-transfer-path'

export type TransferPhase = 'ready' | 'compress' | 'transfer' | 'reveal' | 'hold' | 'exit' | 'rotate'
const CYCLE = 5300
const phaseAt = (time: number): TransferPhase => time < 800 ? 'ready' : time < 1400 ? 'compress'
  : time < 2700 ? 'transfer' : time < 3500 ? 'reveal' : time < 4100 ? 'hold' : time < 4600 ? 'exit' : 'rotate'
const ease = (t: number) => t * t * (3 - 2 * t)
const PATH_SAMPLES = 80
type Point = { x: number; y: number }

/** A shared clock keeps the sheet, travelling icon and phone reveal in the same story. */
export function useTableTransfer() {
  const ref = useRef<HTMLDivElement>(null)
  const scene = useRef<HTMLDivElement>(null)
  const desktopPath = useRef<SVGPathElement>(null)
  const mobilePath = useRef<SVGPathElement>(null)
  const desktopTrack = useRef<SVGPathElement>(null)
  const mobileTrack = useRef<SVGPathElement>(null)
  const traveler = useRef<HTMLDivElement>(null)
  const desktopProgress = useRef<SVGPathElement>(null)
  const mobileProgress = useRef<SVGPathElement>(null)
  const { playing: visible, reduced } = useMotionPlayback(ref, .3)
  const [state, setState] = useState<{ active: number; phase: TransferPhase }>({ active: 0, phase: 'ready' })
  const clock = useRef({ elapsed: 0, active: 0, rotated: false, phase: 'ready' as TransferPhase })
  const geometry = useRef({ width: 0, height: 0, mobile: false, length: 0, lead: 0, arrowLength: 0, flight: '', points: [] as Point[], rest: '' })
  const lastPlayback = useRef<boolean | null>(null)
  const running = visible && !reduced

  const paint = useCallback((time: number) => {
    const node = traveler.current, box = geometry.current
    const progress = box.mobile ? mobileProgress.current : desktopProgress.current
    if (!node || !box.width || !box.length || !box.points.length) return
    const rest = time < 1280 ? 'start' : time >= 2780 ? 'end' : ''
    if (rest) {
      if (box.rest === rest) return
      box.rest = rest
      node.style.opacity = '0'
      progress?.style.setProperty('stroke-dashoffset', rest === 'start' ? '1' : '0')
      return
    }
    box.rest = ''
    const fraction = Math.max(0, Math.min(1, (time - 1400) / 1300))
    const distance = ease(fraction) * box.length
    // Reading SVG geometry after the previous frame's style writes forces layout.
    // Sample only when the responsive path changes, then interpolate in memory.
    const sample = ease(fraction) * PATH_SAMPLES, index = Math.floor(sample)
    const from = box.points[index]!, to = box.points[Math.min(index + 1, PATH_SAMPLES)]!
    const mix = sample - index
    const point = { x: from.x + (to.x - from.x) * mix, y: from.y + (to.y - from.y) * mix }
    const alpha = time < 1280 || time >= 2780 ? 0 : time < 1400 ? (time - 1280) / 120 : time > 2620 ? (2780 - time) / 160 : 1
    node.style.setProperty('--travel-x', `${point.x * box.width / (box.mobile ? 360 : 1200)}px`)
    node.style.setProperty('--travel-y', `${point.y * box.height / (box.mobile ? 608 : 560)}px`)
    node.style.setProperty('--travel-scale', String(time > 2620 ? 1 - .6 * (time - 2620) / 160 : .85 + .15 * Math.min(1, (time - 1280) / 120)))
    node.style.opacity = String(Math.max(0, alpha))
    const visibleProgress = Math.max(0, Math.min(1, (distance - box.lead) / box.arrowLength))
    progress?.style.setProperty('stroke-dashoffset', String(1 - visibleProgress))
  }, [])

  useEffect(() => {
    const node = scene.current
    if (!node) return
    const measure = () => {
      const bounds = node.getBoundingClientRect()
      if (!bounds.width || !bounds.height) return
      const mobile = window.matchMedia('(max-width: 760px)').matches
      const path = mobile ? mobilePath.current : desktopPath.current
      const track = mobile ? mobileTrack.current : desktopTrack.current
      const progress = mobile ? mobileProgress.current : desktopProgress.current
      const tables = [...node.querySelectorAll<HTMLElement>('[data-sheet]')].map(element => element.getBoundingClientRect())
      const phones = [...node.querySelectorAll<HTMLElement>('[data-phone]')].map(element => element.getBoundingClientRect())
      const stack = node.querySelector('[data-table-stack]')?.getBoundingClientRect()
      if (!path || !track || !progress || !stack || !tables.length || !phones.length) return
      const x = (value: number) => Number(((value - bounds.left) * (mobile ? 360 : 1200) / bounds.width).toFixed(2))
      const y = (value: number) => Number(((value - bounds.top) * (mobile ? 608 : 560) / bounds.height).toFixed(2))
      const source = { x: x(stack.left + stack.width / 2), y: y(stack.top + stack.height * (mobile ? .5 : .55)) }
      const start = mobile
        ? { x: x(bounds.left + 56), y: y(Math.max(...tables.map(box => box.bottom)) + 12) }
        : { x: x(Math.max(...tables.map(box => box.right)) + 8), y: source.y }
      const end = mobile
        ? { x: x(Math.min(...phones.map(box => box.left)) - 16), y: y(bounds.top + 400) }
        : { x: x(Math.min(...phones.map(box => box.left)) - 12), y: source.y }
      const paths = transferPaths(source, start, end, mobile)
      const current = geometry.current
      if (current.flight === paths.flight && current.mobile === mobile) {
        current.width = node.clientWidth; current.height = node.clientHeight
        paint(clock.current.elapsed)
        return
      }
      path.setAttribute('d', paths.flight)
      track.setAttribute('d', paths.arrow)
      progress.setAttribute('d', paths.arrow)
      const length = path.getTotalLength?.() ?? 0
      const points = length ? Array.from({ length: PATH_SAMPLES + 1 }, (_, index) => {
        const point = path.getPointAtLength(length * index / PATH_SAMPLES)
        return { x: point.x, y: point.y }
      }) : []
      geometry.current = { width: node.clientWidth, height: node.clientHeight, mobile,
        length, arrowLength: track.getTotalLength?.() ?? 0, lead: paths.lead, flight: paths.flight, points, rest: '' }
      paint(clock.current.elapsed)
    }
    measure()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    observer?.observe(node)
    let pending = 0
    const settled = (event: TransitionEvent) => {
      if (event.propertyName !== 'transform' || !(event.target instanceof HTMLElement) ||
        !event.target.matches('[data-sheet],[data-phone]')) return
      cancelAnimationFrame(pending)
      pending = requestAnimationFrame(measure)
    }
    node.addEventListener('transitionend', settled)
    window.addEventListener('resize', measure)
    return () => { observer?.disconnect(); cancelAnimationFrame(pending); node.removeEventListener('transitionend', settled); window.removeEventListener('resize', measure) }
  }, [paint])

  useEffect(() => {
    if (!reduced) return
    clock.current.elapsed = 3500
    clock.current.rotated = false
    clock.current.phase = 'hold'
    setState({ active: clock.current.active, phase: 'hold' })
    paint(3500)
  }, [reduced, paint])

  useEffect(() => {
    if (!running) return
    let frame = 0, previous: number | null = null
    const tick = (now: number) => {
      const current = clock.current
      const previousActive = current.active
      if (previous !== null) current.elapsed += Math.min(now - previous, 100)
      previous = now
      if (current.elapsed >= 4600 && !current.rotated) { current.active = (current.active + 1) % 3; current.rotated = true }
      if (current.elapsed >= CYCLE) { current.elapsed %= CYCLE; current.rotated = false }
      const phase = phaseAt(current.elapsed)
      if (current.phase !== phase || previousActive !== current.active) {
        current.phase = phase
        setState({ active: current.active, phase })
      }
      paint(current.elapsed)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [running, paint])

  useEffect(() => {
    // CSS transitions between stack positions must pause along with the shared clock.
    // Newly started transitions already play; querying them each phase flushes styles.
    if (running && lastPlayback.current === true) return
    lastPlayback.current = running
    const animations = scene.current?.getAnimations?.({ subtree: true }) ?? []
    for (const animation of animations) {
      if (running) animation.play()
      else animation.pause()
    }
  }, [running, state.active, state.phase])

  return { ref, scene, desktopPath, mobilePath, desktopTrack, mobileTrack, desktopProgress, mobileProgress, traveler,
    ...state, running, reduced }
}
