// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MotionLab, MotionStory } from './motion-lab'
import { usePreviewPlayback } from './use-preview-playback'
import { PRODUCTS } from '../catalog-data'

let reduced = false
let hidden = false
let notify: (visible: boolean) => void
let disconnect: ReturnType<typeof vi.fn>
let mediaListeners: Set<() => void>
const originalTransition = document.startViewTransition
const DURATIONS = [3800, 4200, 4200] as const

beforeEach(() => {
  reduced = false
  hidden = false
  mediaListeners = new Set()
  vi.useFakeTimers()
  vi.stubGlobal('matchMedia', () => ({
    get matches() { return reduced },
    addEventListener: (_event: string, listener: () => void) => mediaListeners.add(listener),
    removeEventListener: (_event: string, listener: () => void) => mediaListeners.delete(listener),
  }))
  vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden)
  vi.stubGlobal('IntersectionObserver', class {
    disconnect = disconnect = vi.fn()
    observe = vi.fn()
    constructor(callback: IntersectionObserverCallback) {
      notify = (visible) => callback([{ isIntersecting: visible } as IntersectionObserverEntry], this as unknown as IntersectionObserver)
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

function Clock() {
  const { root, step, select, toggle, replay } = usePreviewPlayback(DURATIONS)
  return <div ref={root}><output>{step}</output>
    <button onClick={toggle}>Pause</button><button onClick={replay}>Replay</button>
    <button onClick={() => select(0)}>First</button><button onClick={() => select(2)}>Last</button>
  </div>
}

describe('preview clock', () => {
  it('starts on intersection, holds each scene, and loops without an empty state', () => {
    const page = render(<Clock />)
    act(() => vi.advanceTimersByTime(30000))
    expect(page.getByRole('status').textContent).toBe('0')
    act(() => notify(true))
    act(() => vi.advanceTimersByTime(3799))
    expect(page.getByRole('status').textContent).toBe('0')
    act(() => vi.advanceTimersByTime(1))
    expect(page.getByRole('status').textContent).toBe('1')
    act(() => vi.advanceTimersByTime(4200))
    expect(page.getByRole('status').textContent).toBe('2')
    act(() => vi.advanceTimersByTime(4200))
    expect(page.getByRole('status').textContent).toBe('0')
  })

  it('preserves remaining time during a pause and when the tab is hidden', () => {
    const page = render(<Clock />)
    act(() => notify(true))
    act(() => vi.advanceTimersByTime(1000))
    fireEvent.click(page.getByRole('button', { name: 'Pause' }))
    act(() => vi.advanceTimersByTime(60000))
    fireEvent.click(page.getByRole('button', { name: 'Pause' }))
    hidden = true
    fireEvent(document, new Event('visibilitychange'))
    act(() => vi.advanceTimersByTime(60000))
    hidden = false
    fireEvent(document, new Event('visibilitychange'))
    act(() => vi.advanceTimersByTime(2799))
    expect(page.getByRole('status').textContent).toBe('0')
    act(() => vi.advanceTimersByTime(1))
    expect(page.getByRole('status').textContent).toBe('1')
  })

  it('keeps a manually selected scene until playback is resumed or restarted', () => {
    const page = render(<Clock />)
    act(() => notify(true))
    fireEvent.click(page.getByRole('button', { name: 'Last' }))
    act(() => vi.advanceTimersByTime(60000))
    expect(page.getByRole('status').textContent).toBe('2')
    fireEvent.click(page.getByRole('button', { name: 'Replay' }))
    expect(page.getByRole('status').textContent).toBe('0')
    act(() => vi.advanceTimersByTime(3800))
    expect(page.getByRole('status').textContent).toBe('1')
  })

  it('honors manual selection over a pending automatic snapshot', () => {
    const page = render(<Clock />)
    let commit!: () => void
    document.startViewTransition = vi.fn((update) => {
      commit = update as () => void
      return { ready: Promise.resolve(), updateCallbackDone: Promise.resolve(), finished: new Promise(() => {}), skipTransition: vi.fn() } as unknown as ViewTransition
    })
    act(() => notify(true))
    act(() => vi.advanceTimersByTime(3800))
    const firstCommit = commit
    fireEvent.click(page.getByRole('button', { name: 'First' }))
    act(() => { firstCommit(); commit() })
    expect(page.getByRole('status').textContent).toBe('0')
    act(() => vi.advanceTimersByTime(60000))
    expect(page.getByRole('status').textContent).toBe('0')
  })

  it('restarts the full first-scene duration even when replaying that same scene', () => {
    const page = render(<Clock />)
    act(() => notify(true))
    act(() => vi.advanceTimersByTime(3000))
    fireEvent.click(page.getByRole('button', { name: 'Replay' }))
    act(() => vi.advanceTimersByTime(3799))
    expect(page.getByRole('status').textContent).toBe('0')
    act(() => vi.advanceTimersByTime(1))
    expect(page.getByRole('status').textContent).toBe('1')
  })

  it('gives a manually selected scene its full duration after resuming', () => {
    const page = render(<Clock />)
    act(() => notify(true))
    act(() => vi.advanceTimersByTime(3000))
    fireEvent.click(page.getByRole('button', { name: 'Last' }))
    fireEvent.click(page.getByRole('button', { name: 'Pause' }))
    act(() => vi.advanceTimersByTime(4199))
    expect(page.getByRole('status').textContent).toBe('2')
    act(() => vi.advanceTimersByTime(1))
    expect(page.getByRole('status').textContent).toBe('0')
    page.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('stops autoplay under reduced motion and cleans up on unmount', () => {
    reduced = true
    const page = render(<Clock />)
    act(() => notify(true))
    act(() => vi.advanceTimersByTime(60000))
    expect(page.getByRole('status').textContent).toBe('0')
    fireEvent.click(page.getByRole('button', { name: 'Last' }))
    expect(page.getByRole('status').textContent).toBe('2')
    page.unmount()
    expect(disconnect).toHaveBeenCalled()
    expect(mediaListeners.size).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('five product stories', () => {
  it('keeps the same four records and unique transition names in every product view', () => {
    const page = render(<MotionLab />)
    for (const name of ['Таблица', 'Каталог', 'Приложение на телефоне']) {
      fireEvent.click(page.getByRole('button', { name }))
      expect(Array.from(page.container.querySelectorAll('[data-product-code]')).map(node => node.getAttribute('data-product-code'))).toEqual(PRODUCTS.map(product => product.code))
      const names = Array.from(page.container.querySelectorAll('[style]')).map(node => (node as HTMLElement).style.viewTransitionName).filter(Boolean)
      expect(new Set(names).size).toBe(names.length)
      for (const product of PRODUCTS) expect(page.getByText(product.price)).toBeTruthy()
    }
  })

  it('changes the shared price and derives the inventory value from those products', () => {
    const page = render(<MotionLab />)
    fireEvent.click(page.getByRole('button', { name: /2Одна правка/ }))
    expect(page.getByText('175 140 ₽')).toBeTruthy()
    fireEvent.click(page.getByRole('button', { name: 'Пересчитанные остатки' }))
    expect(page.getAllByText('8 490')).toHaveLength(2)
    expect(page.getByText('176 640 ₽')).toBeTruthy()
    expect(page.queryByText('7 990')).toBeNull()
  })

  it('moves the same request through the board without duplication', () => {
    const page = render(<MotionLab />)
    fireEvent.click(page.getByRole('button', { name: /3Заявка в работе/ }))
    for (const name of ['Канбан', 'Мастер взял в работу', 'Работа завершена']) {
      fireEvent.click(page.getByRole('button', { name }))
      expect(page.container.querySelectorAll('[data-order-id]')).toHaveLength(3)
      expect(page.container.querySelectorAll('[data-order-id="З-104"]')).toHaveLength(1)
    }
    expect(page.getByText('З-104: работа завершена')).toBeTruthy()
  })

  it('shows procurement only in the owner example', () => {
    const page = render(<MotionLab />)
    fireEvent.click(page.getByRole('button', { name: /4Разные роли/ }))
    expect(page.getByText('Закупка, ₽')).toBeTruthy()
    fireEvent.click(page.getByRole('button', { name: 'Клиент' }))
    expect(page.queryByText('Закупка, ₽')).toBeNull()
    expect(page.getAllByText('В наличии')).toHaveLength(3)
    expect(page.getByText('Под заказ')).toBeTruthy()
  })

  it('adds one intake row and increases stock by the received quantity', () => {
    const page = render(<MotionLab />)
    fireEvent.click(page.getByRole('button', { name: /5С телефона в таблицу/ }))
    fireEvent.click(page.getByRole('button', { name: 'Остаток обновлён' }))
    expect(page.getByText('3 на складе + 4 из приёмки = 7')).toBeTruthy()
    expect(page.getByText('3 записи')).toBeTruthy()
    fireEvent.click(page.getByRole('button', { name: 'Повторить' }))
    expect(page.getByText('2 записи')).toBeTruthy()
    expect(page.getByText('До приёмки: 3 шт')).toBeTruthy()
  })
})


describe('embedded product stories', () => {
  it('plays the shared-price story once and leaves the updated result visible', () => {
    const page = render(<MotionStory variantId="sync" />)
    act(() => notify(true))
    for (let index = 0; index < 4; index += 1) act(() => vi.advanceTimersToNextTimer())
    expect(page.getByText('Показ завершён')).toBeTruthy()
    expect(page.getByText('176 640 ₽')).toBeTruthy()
    expect(page.queryByRole('button', { name: 'Пауза' })).toBeNull()
    act(() => vi.advanceTimersByTime(60000))
    expect(page.getByText('176 640 ₽')).toBeTruthy()
    expect(vi.getTimerCount()).toBe(0)
    fireEvent.click(page.getByRole('button', { name: 'Повторить' }))
    expect(page.getByText('175 140 ₽')).toBeTruthy()
    act(() => vi.advanceTimersByTime(3200))
    expect(page.getByText('Меняем 7 990 → 8 490')).toBeTruthy()
  })

  it('keeps a manually chosen board scene without restarting on intersection', () => {
    const page = render(<MotionStory variantId="workflow" />)
    act(() => notify(true))
    fireEvent.click(page.getByRole('button', { name: 'Мастер взял в работу' }))
    act(() => { notify(false); notify(true); vi.advanceTimersByTime(60000) })
    expect(page.getByText('1043: мастер выполняет работу')).toBeTruthy()
    expect(page.container.querySelectorAll('[data-order-id]')).toHaveLength(5)
    expect(vi.getTimerCount()).toBe(0)
  })
})
