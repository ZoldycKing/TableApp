'use client'

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { useMotionPlayback } from '@/components/motion/use-motion-playback'
import { useViewTransition } from '@/components/motion/use-view-transition'
import { PRODUCTS } from './catalog-data'

type Phase = 'table' | 'builder' | 'mobile' | 'receipt' | 'detail' | 'result'
const SEQUENCE = [
  { delay: 3800, phase: 'builder' },
  { delay: 4600, phase: 'mobile' },
  { delay: 3200, phase: 'receipt' },
  { delay: 3400, phase: 'result' },
  { delay: 3600, phase: 'mobile' },
] as const

/** Local sample: build an employee screen, receive stock, see the source update. */
export function useHeroDemo(root: RefObject<HTMLElement | null>) {
  const [phase, setPhase] = useState<Phase>('table')
  const [pick, setPick] = useState(0)
  const [step, setStep] = useState(0)
  const [automatic, setAutomatic] = useState(true)
  const [paused, setPaused] = useState(false)
  const [clockRevision, setClockRevision] = useState(0)
  const clockVersion = useRef(0)
  const remaining = useRef<number>(SEQUENCE[0].delay)
  const [products, setProducts] = useState(PRODUCTS)
  const source = useRef(PRODUCTS)
  const receiptPending = useRef(false)
  const [quantity, setQuantity] = useState('4')
  const [error, setError] = useState('')
  const [receipt, setReceipt] = useState<{ index: number; before: number; quantity: number; after: number } | null>(null)
  const { playing, reduced } = useMotionPlayback(root)
  const { change, skip, settle } = useViewTransition()
  const running = automatic && playing && !paused && !reduced

  const recordReceipt = useCallback((position: number, amount: number) => {
    receiptPending.current = false
    const before = source.current[position]!.stock
    const after = before + amount
    source.current = source.current.map((product, index) => index === position ? { ...product, stock: after } : product)
    setProducts(source.current)
    setReceipt({ index: position, before, quantity: amount, after })
    setPhase('result')
  }, [])

  useEffect(() => {
    if (!reduced) return
    settle()
    setAutomatic(false)
    setPhase('mobile')
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
        if (next.phase === 'receipt') {
          setPick(1)
          setQuantity('4')
          receiptPending.current = true
        }
        if (next.phase === 'result' && receiptPending.current) recordReceipt(1, 4)
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
  }, [running, step, change, clockRevision, recordReceipt])

  const editQuantity = (value: string) => {
    settle()
    setAutomatic(false)
    setPaused(false)
    setQuantity(value)
    setError('')
  }

  const save = () => {
    const amount = Number(quantity)
    if (!Number.isInteger(amount) || amount < 1 || amount > 999) {
      setError('Введите целое количество от 1 до 999.')
      return
    }
    setAutomatic(false)
    setPaused(false)
    // Claim this receipt before the native snapshot: a double click cannot add twice.
    if (!receiptPending.current) return
    receiptPending.current = false
    change(() => recordReceipt(pick, amount))
  }

  const open = (position: number) => {
    setAutomatic(false)
    setPaused(false)
    change(() => {
      setPick(position); setPhase('detail'); setQuantity('4'); setError('')
      receiptPending.current = true
    })
  }

  const back = () => {
    setAutomatic(false)
    setPaused(false)
    change(() => { receiptPending.current = false; setPhase('mobile') })
  }

  const replay = () => {
    settle()
    receiptPending.current = false
    source.current = PRODUCTS
    setProducts(PRODUCTS)
    setReceipt(null)
    setError('')
    setQuantity('4')
    if (reduced) { setPhase('mobile'); return }
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

  return { phase, pick, products, receipt, quantity, error, editQuantity, save, automatic, paused, running, reduced, open, back, replay, togglePause }
}
