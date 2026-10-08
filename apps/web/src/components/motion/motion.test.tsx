// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, renderHook } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Reveal } from '@/components/marketing/reveal'
import { SceneFill } from '@/components/marketing/scene-fill'
import { HeroFlight } from '@/components/marketing/hero-flight'
import { PRODUCTS } from '@/components/marketing/catalog-data'
import { useStoryProgress } from '@/components/marketing/use-story-progress'
import { useEnterMotion } from './enter-motion'
import { useMotionPlayback } from './use-motion-playback'
import { useViewTransition } from './use-view-transition'

let reduced = false
let hidden = false
let motionListeners: Set<() => void>
let observers: Array<{ notify: (visible: boolean) => void; disconnect: ReturnType<typeof vi.fn> }>
const originalTransition = document.startViewTransition

beforeEach(() => {
  reduced = false
  hidden = false
  motionListeners = new Set()
  observers = []
  vi.stubGlobal('matchMedia', () => ({
    get matches() { return reduced },
    addEventListener: (_event: string, listener: () => void) => motionListeners.add(listener),
    removeEventListener: (_event: string, listener: () => void) => motionListeners.delete(listener),
  }))
  vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden)
  vi.stubGlobal('IntersectionObserver', class {
    disconnect = vi.fn()
    observe = vi.fn()
    unobserve = vi.fn()
    constructor(callback: IntersectionObserverCallback) {
      observers.push({
        notify: (visible) => callback([{ isIntersecting: visible } as IntersectionObserverEntry], this as unknown as IntersectionObserver),
        disconnect: this.disconnect,
      })
    }
  })
  Object.defineProperty(document, 'startViewTransition', { configurable: true, writable: true, value: undefined })
})

afterEach(() => {
  cleanup()
  Object.defineProperty(document, 'startViewTransition', { configurable: true, writable: true, value: originalTransition })
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

function nativeTransition() {
  let commit!: () => void
  const transition = {
    ready: Promise.resolve(), updateCallbackDone: Promise.resolve(),
    finished: new Promise<void>(() => {}), skipTransition: vi.fn(),
  }
  document.startViewTransition = vi.fn((update: ViewTransitionUpdateCallback | StartViewTransitionOptions | undefined) => {
    commit = update as () => void
    return transition as unknown as ViewTransition
  })
  return { transition, commit: () => commit() }
}

describe('shared element transitions', () => {
  it('updates immediately when the API is unavailable or motion is reduced', () => {
    const update = vi.fn()
    const { result } = renderHook(useViewTransition)
    act(() => result.current.change(update))
    expect(update).toHaveBeenCalledTimes(1)
    const native = nativeTransition()
    reduced = true
    act(() => result.current.change(update))
    expect(update).toHaveBeenCalledTimes(2)
    expect(document.startViewTransition).not.toHaveBeenCalled()
    expect(native.transition.skipTransition).not.toHaveBeenCalled()
  })

  it('applies an update exactly once if starting a transition throws', () => {
    document.startViewTransition = vi.fn((update) => {
      ;(update as () => void)()
      throw new Error('Snapshot unavailable')
    })
    const update = vi.fn()
    const { result } = renderHook(useViewTransition)
    act(() => result.current.change(update))
    expect(update).toHaveBeenCalledTimes(1)
  })

  it('preserves the order of rapid requests even before the first snapshot is ready', () => {
    const first = nativeTransition()
    const applied: string[] = []
    const { result } = renderHook(useViewTransition)
    act(() => result.current.change(() => applied.push('first')))
    const second = nativeTransition()
    act(() => result.current.change(() => applied.push('second')))
    expect(first.transition.skipTransition).toHaveBeenCalledTimes(1)
    act(() => { first.commit(); second.commit() })
    expect(applied).toEqual(['first', 'second'])
  })

  it('skips the animation without dropping its DOM update', () => {
    const native = nativeTransition()
    const update = vi.fn()
    const { result } = renderHook(useViewTransition)
    act(() => { result.current.change(update); result.current.skip() })
    act(native.commit)
    expect(update).toHaveBeenCalledTimes(1)
    expect(native.transition.skipTransition).toHaveBeenCalledTimes(1)
  })

  it('does not apply a delayed update after unmount', () => {
    const native = nativeTransition()
    const update = vi.fn()
    const { result, unmount } = renderHook(useViewTransition)
    act(() => result.current.change(update))
    unmount()
    act(native.commit)
    expect(native.transition.skipTransition).toHaveBeenCalledTimes(1)
    expect(update).not.toHaveBeenCalled()
  })
})

describe('automatic demonstrations', () => {
  function Playback() {
    const root = useRef<HTMLDivElement>(null)
    const { playing, reduced } = useMotionPlayback(root)
    return <div ref={root}>{playing ? 'playing' : 'stopped'}:{String(reduced)}</div>
  }

  it('stops outside the viewport, in a hidden tab, and when reduced motion changes', () => {
    const page = render(<Playback />)
    expect(page.container.textContent).toBe('stopped:false')
    act(() => observers[0]!.notify(true))
    expect(page.container.textContent).toBe('playing:false')
    hidden = true
    fireEvent(document, new Event('visibilitychange'))
    expect(page.container.textContent).toBe('stopped:false')
    hidden = false
    fireEvent(document, new Event('visibilitychange'))
    expect(page.container.textContent).toBe('playing:false')
    act(() => { reduced = true; motionListeners.forEach((listener) => listener()) })
    expect(page.container.textContent).toBe('stopped:true')
    act(() => { reduced = false; motionListeners.forEach((listener) => listener()); observers[0]!.notify(false) })
    expect(page.container.textContent).toBe('stopped:false')
    page.unmount()
    expect(observers[0]!.disconnect).toHaveBeenCalled()
    expect(motionListeners.size).toBe(0)
  })

  it('starts the illustrated form when visible and cancels its timer on reduced motion', () => {
    vi.useFakeTimers()
    const page = render(<SceneFill />)
    act(() => vi.advanceTimersByTime(20000))
    expect(page.queryByText('Перфоратор 800 Вт')).toBeNull()
    act(() => observers[0]!.notify(true))
    act(() => vi.advanceTimersByTime(850))
    expect(page.queryByText('Перфоратор 800 Вт')).not.toBeNull()
    act(() => { reduced = true; motionListeners.forEach((listener) => listener()) })
    expect(page.container.textContent).toContain('1 249')
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('scroll reveals', () => {
  it('waits for intersection even if the visitor spends a long time at the top', () => {
    vi.useFakeTimers()
    const page = render(<Reveal delay={100}>Content</Reveal>)
    const node = page.container.firstElementChild as HTMLElement
    expect(node.dataset.reveal).toBe('pending')
    act(() => vi.advanceTimersByTime(10000))
    expect(node.dataset.reveal).toBe('pending')
    act(() => { observers[0]!.notify(true); vi.advanceTimersByTime(100) })
    expect(node.dataset.reveal).toBe('shown')
  })

  it('cancels the delayed reveal and shows content immediately when motion is reduced', () => {
    vi.useFakeTimers()
    const page = render(<Reveal delay={500}>Content</Reveal>)
    act(() => observers[0]!.notify(true))
    act(() => { reduced = true; motionListeners.forEach((listener) => listener()) })
    expect((page.container.firstElementChild as HTMLElement).dataset.reveal).toBe('shown')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('keeps content visible when intersection observation is unavailable', () => {
    vi.stubGlobal('IntersectionObserver', undefined)
    const page = render(<Reveal>Content</Reveal>)
    expect((page.container.firstElementChild as HTMLElement).dataset.reveal).toBe('shown')
  })
})

describe('one-time hero demonstration', () => {
  function start() {
    vi.useFakeTimers()
    const page = render(<HeroFlight />)
    act(() => observers[0]!.notify(true))
    return page
  }

  function finish() {
    for (let step = 0; step < 3; step += 1) {
      act(() => vi.advanceTimersToNextTimer())
    }
  }

  it('shows the completed catalog after one pass and never resets it automatically', () => {
    const page = start()
    finish()
    expect(page.getAllByRole('button', { name: /^Открыть / })).toHaveLength(PRODUCTS.length)
    expect(page.queryByRole('button', { name: 'Вернуться в витрину' })).toBeNull()
    expect(page.queryByRole('button', { name: 'Приостановить показ' })).toBeNull()
    act(() => vi.advanceTimersByTime(60000))
    expect(page.getAllByRole('button', { name: /^Открыть / })).toHaveLength(PRODUCTS.length)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('opens the chosen product, returns focus to that card, and replays only on request', () => {
    const page = start()
    finish()
    fireEvent.click(page.getByRole('button', { name: `Открыть ${PRODUCTS[2]!.short}` }))
    expect(page.getByText(PRODUCTS[2]!.name)).toBeTruthy()
    expect(document.activeElement).toBe(page.getByRole('button', { name: 'Вернуться в витрину' }))
    fireEvent.click(page.getByRole('button', { name: 'Вернуться в витрину' }))
    expect(document.activeElement).toBe(page.getByRole('button', { name: `Открыть ${PRODUCTS[2]!.short}` }))
    expect(page.getAllByRole('button', { name: /^Открыть / })).toHaveLength(PRODUCTS.length)
    fireEvent.click(page.getByRole('button', { name: 'Повторить показ' }))
    expect(page.container.querySelector('[data-hero-phase]')?.getAttribute('data-hero-phase')).toBe('table')
    finish()
    expect(page.getAllByRole('button', { name: /^Открыть / })).toHaveLength(PRODUCTS.length)
  })

  it('resumes remaining scene time after a pause or leaving the viewport', () => {
    const page = start()
    const phase = () => page.container.querySelector('[data-hero-phase]')?.getAttribute('data-hero-phase')
    act(() => vi.advanceTimersByTime(1000))
    fireEvent.click(page.getByRole('button', { name: 'Приостановить показ' }))
    act(() => vi.advanceTimersByTime(20000))
    expect(phase()).toBe('table')
    fireEvent.click(page.getByRole('button', { name: 'Продолжить показ' }))
    act(() => vi.advanceTimersByTime(2799))
    expect(phase()).toBe('table')
    act(() => vi.advanceTimersByTime(1))
    expect(phase()).toBe('catalog')
    act(() => observers[0]!.notify(false))
    act(() => vi.advanceTimersByTime(20000))
    expect(phase()).toBe('catalog')
    act(() => observers[0]!.notify(true))
    act(() => vi.advanceTimersByTime(3399))
    expect(phase()).toBe('catalog')
    act(() => vi.advanceTimersByTime(1))
    expect(phase()).toBe('mobile')
  })

  it('shows table, catalog, and phone once, with the same four products', () => {
    const page = start()
    const phase = () => page.container.querySelector('[data-hero-phase]')?.getAttribute('data-hero-phase')
    expect(phase()).toBe('table')
    for (const expected of ['catalog', 'mobile', 'catalog']) {
      act(() => vi.advanceTimersToNextTimer())
      expect(phase()).toBe(expected)
      expect(Array.from(page.container.querySelectorAll('[data-product-code]')).map(node => node.getAttribute('data-product-code'))).toEqual(PRODUCTS.map(product => product.code))
    }
    expect(vi.getTimerCount()).toBe(0)
  })

  it('restarts the full first-scene duration when replaying during that same scene', () => {
    const page = start()
    act(() => vi.advanceTimersByTime(3000))
    fireEvent.click(page.getByRole('button', { name: 'Повторить показ' }))
    act(() => vi.advanceTimersByTime(3799))
    expect(page.container.querySelector('[data-hero-phase]')?.getAttribute('data-hero-phase')).toBe('table')
    act(() => vi.advanceTimersByTime(1))
    expect(page.container.querySelector('[data-hero-phase]')?.getAttribute('data-hero-phase')).toBe('catalog')
  })

  it('stops the automatic sequence as soon as someone opens a product', () => {
    const page = start()
    act(() => vi.advanceTimersToNextTimer())
    act(() => vi.advanceTimersToNextTimer())
    fireEvent.click(page.getByRole('button', { name: `Открыть ${PRODUCTS[0]!.short}` }))
    act(() => vi.advanceTimersByTime(60000))
    expect(page.getByText(PRODUCTS[0]!.name)).toBeTruthy()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('settles an earlier card transition and preserves a pause immediately after replay', () => {
    const page = start()
    act(() => vi.advanceTimersToNextTimer())
    act(() => vi.advanceTimersToNextTimer())
    const native = nativeTransition()
    fireEvent.click(page.getByRole('button', { name: `Открыть ${PRODUCTS[0]!.short}` }))
    fireEvent.click(page.getByRole('button', { name: 'Повторить показ' }))
    fireEvent.click(page.getByRole('button', { name: 'Приостановить показ' }))
    act(() => native.commit())
    expect(page.getByRole('button', { name: 'Продолжить показ' })).toBeTruthy()
    act(() => vi.advanceTimersByTime(60000))
    expect(page.container.querySelector('[data-hero-phase]')?.getAttribute('data-hero-phase')).toBe('table')
    expect(native.transition.skipTransition).toHaveBeenCalled()
  })

  it('keeps the catalog interactive with reduced motion and clears timers on unmount', () => {
    reduced = true
    const page = start()
    expect(page.getAllByRole('button', { name: /^Открыть / })).toHaveLength(PRODUCTS.length)
    fireEvent.click(page.getByRole('button', { name: `Открыть ${PRODUCTS[1]!.short}` }))
    expect(page.getByText(PRODUCTS[1]!.name)).toBeTruthy()
    fireEvent.click(page.getByRole('button', { name: 'Вернуться в витрину' }))
    fireEvent.click(page.getByRole('button', { name: 'Повторить показ' }))
    expect(page.getAllByRole('button', { name: /^Открыть / })).toHaveLength(PRODUCTS.length)
    act(() => vi.advanceTimersByTime(60000))
    expect(page.getAllByRole('button', { name: /^Открыть / })).toHaveLength(PRODUCTS.length)
    expect(vi.getTimerCount()).toBe(0)
    page.unmount()
    reduced = false
    const running = start()
    act(() => vi.advanceTimersToNextTimer())
    running.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('manual story chapters', () => {
  function Story() {
    const { index, root, show, hover } = useStoryProgress(3)
    return <div ref={root} {...hover}><output>{index}</output><button onClick={() => show(1)}>Select chapter</button></div>
  }
  it('does not override a selected chapter after hover ends or the visitor returns', () => {
    vi.useFakeTimers()
    const page = render(<Story />)
    act(() => observers[0]!.notify(true))
    fireEvent.click(page.getByRole('button', { name: 'Select chapter' }))
    fireEvent.mouseEnter(page.container.firstElementChild!)
    fireEvent.mouseLeave(page.container.firstElementChild!)
    act(() => { observers[0]!.notify(false); observers[0]!.notify(true) })
    act(() => vi.advanceTimersByTime(30000))
    expect(page.getByRole('status').textContent).toBe('1')
  })
})

describe('screen entrances', () => {
  function Form({ screen }: { screen: string }) {
    const ref = useEnterMotion(screen)
    return <div ref={ref}><input aria-label="Draft" defaultValue="" /></div>
  }

  it('animates navigation without remounting inputs or replaying on background renders', () => {
    const cancel = vi.fn()
    const animate = vi.fn(() => ({ cancel }))
    Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: animate })
    try {
      const page = render(<Form screen="first" />)
      fireEvent.change(page.getByLabelText('Draft'), { target: { value: 'Unsaved draft' } })
      page.rerender(<Form screen="first" />)
      expect(animate).toHaveBeenCalledTimes(1)
      expect(animate).toHaveBeenCalledWith([
        { opacity: 0, transform: 'translate3d(0, 5px, 0)' },
        { opacity: 1, transform: 'none' },
      ], { duration: 220, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' })
      page.rerender(<Form screen="second" />)
      expect(animate).toHaveBeenCalledTimes(2)
      expect((page.getByLabelText('Draft') as HTMLInputElement).value).toBe('Unsaved draft')
      act(() => { reduced = true; motionListeners.forEach((listener) => listener()) })
      expect(cancel).toHaveBeenCalled()
      page.rerender(<Form screen="third" />)
      expect(animate).toHaveBeenCalledTimes(2)
    } finally {
      delete (HTMLElement.prototype as Partial<HTMLElement>).animate
    }
  })
})
