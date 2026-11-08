'use client'

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import styles from './landing.module.css'

export function Appear({ children, className = '', delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const node = ref.current
    if (!node) return
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (media.matches) return
    node.dataset.enter = 'waiting'
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        node.dataset.enter = 'shown'
        observer.disconnect()
      }
    }, { threshold: .12 })
    observer.observe(node)
    const change = () => { if (media.matches) { node.dataset.enter = 'shown'; observer.disconnect() } }
    media.addEventListener('change', change)
    return () => { observer.disconnect(); media.removeEventListener('change', change) }
  }, [])
  return <div ref={ref} className={`${styles.appear} ${className}`} style={{ '--enter-delay': `${delay}ms` } as CSSProperties}>{children}</div>
}

/** One clock per visual. Time stops outside the viewport and in hidden tabs. */
export function useStoryClock(beats: number, beatSeconds = 4.4) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [entered, setEntered] = useState(false)
  const [reduced, setReduced] = useState(true)
  const [playing, setPlaying] = useState(true)
  const [step, setStep] = useState(0)
  const elapsed = useRef(0)

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const change = () => setReduced(query.matches)
    change()
    query.addEventListener('change', change)
    const node = ref.current
    const observer = new IntersectionObserver(entries => {
      const active = entries.some(entry => entry.isIntersecting && entry.intersectionRatio >= .3)
      setVisible(active)
      if (active) setEntered(true)
    }, { threshold: [0, .3] })
    if (node) observer.observe(node)
    return () => { observer.disconnect(); query.removeEventListener('change', change) }
  }, [])
  useEffect(() => {
    if (!visible || reduced || !playing) return
    let frame = 0, previous = 0
    const tick = (now: number) => {
      if (previous && !document.hidden) elapsed.current += Math.min((now - previous) / 1000, .1)
      previous = now
      const next = Math.floor(Math.max(0, elapsed.current - 2.4) / beatSeconds) % beats
      setStep(current => current === next ? current : next)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [visible, reduced, playing, beats, beatSeconds])
  const select = (next: number) => { setPlaying(false); setStep(next); elapsed.current = 2.4 + next * beatSeconds }
  return { ref, step, entered, reduced, playing: playing && !reduced, toggle: () => setPlaying(value => !value), select }
}

const WORDS = ['Ваши', 'данные.', 'Ваш', 'порядок.']
export function Tagline() {
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    const node = ref.current
    if (!node) return
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const words = [...node.querySelectorAll<HTMLElement>('[data-word]')]
    if (query.matches) return
    words.forEach(word => { word.dataset.word = 'muted' })
    // Each word gets a later trigger line in reading order, even on the same line.
    const observers = words.map((word, index) => {
      const observer = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting)) { word.dataset.word = 'active'; observer.disconnect() }
      }, { rootMargin: `0px 0px -${12 + index * 5}% 0px`, threshold: 1 })
      observer.observe(word)
      return observer
    })
    const change = () => { if (query.matches) words.forEach(word => { word.dataset.word = 'active' }) }
    query.addEventListener('change', change)
    return () => { observers.forEach(observer => observer.disconnect()); query.removeEventListener('change', change) }
  }, [])
  return <section ref={ref} className={styles.tagline} aria-label="Ваши данные. Ваш порядок.">
    <h2 aria-hidden>{WORDS.map((word, index) => <span key={`${word}-${index}`} data-word="active">{word}{index === 1 ? <br /> : ' '}</span>)}</h2>
    <p>Выберите нужные разделы и поля.<br />Работайте так, как удобно вам.</p>
  </section>
}
