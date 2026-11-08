// @vitest-environment jsdom
import { act, cleanup, render, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TableAppTransfer } from './table-app-transfer'

const playback = vi.hoisted(() => ({ playing: true, reduced: false }))
vi.mock('../../motion/use-motion-playback', () => ({ useMotionPlayback: () => playback }))
let now = 0, sequence = 0
const frames = new Map<number, FrameRequestCallback>()
const draw = (delta: number) => {
  now += delta
  const next = [...frames.values()]
  frames.clear()
  act(() => next.forEach(callback => callback(now)))
}
const advance = (duration: number) => { for (let passed = 0; passed < duration; passed += 100) draw(Math.min(100, duration - passed)) }
const start = () => { const ui = render(<TableAppTransfer />); draw(0); return ui }
beforeEach(() => {
  now = 0; sequence = 0; frames.clear(); playback.playing = true; playback.reduced = false
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++sequence, callback); return sequence })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
const rootOf = (ui: ReturnType<typeof render>) => ui.container.querySelector('[data-table-transfer]')!

describe('table transfer choreography', () => {
  it('moves the token without reading SVG geometry on every animation frame, and refreshes the path on resize', () => {
    const bounds = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ x: 0, y: 0, left: 0, top: 0, right: 1200, bottom: 560, width: 1200, height: 560, toJSON: () => ({}) })
    const width = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1200)
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(560)
    const lengthDescriptor = Object.getOwnPropertyDescriptor(SVGElement.prototype, 'getTotalLength')
    const pointDescriptor = Object.getOwnPropertyDescriptor(SVGElement.prototype, 'getPointAtLength')
    const point = vi.fn((distance: number) => ({ x: distance, y: distance / 2 }))
    Object.assign(SVGElement.prototype, { getTotalLength: () => 100, getPointAtLength: point })
    try {
      const ui = start(), token = ui.container.querySelector<HTMLElement>('[data-transfer-token]')!
      const reads = point.mock.calls.length
      const writes = vi.spyOn(token.style, 'setProperty')
      expect(reads).toBeGreaterThan(0)
      advance(800)
      expect(writes).not.toHaveBeenCalled()
      advance(1250)
      expect(point).toHaveBeenCalledTimes(reads)
      expect(Number.parseFloat(token.style.getPropertyValue('--travel-x'))).toBeCloseTo(50)
      expect(Number.parseFloat(token.style.getPropertyValue('--travel-y'))).toBeCloseTo(25)
      advance(730)
      const movingWrites = writes.mock.calls.length
      advance(800)
      expect(writes).toHaveBeenCalledTimes(movingWrites)
      act(() => window.dispatchEvent(new Event('resize')))
      expect(point).toHaveBeenCalledTimes(reads)
      bounds.mockReturnValue({ x: 0, y: 0, left: 0, top: 0, right: 600, bottom: 560, width: 600, height: 560, toJSON: () => ({}) })
      width.mockReturnValue(600)
      act(() => window.dispatchEvent(new Event('resize')))
      expect(point.mock.calls.length).toBeGreaterThan(reads)
    } finally {
      if (lengthDescriptor) Object.defineProperty(SVGElement.prototype, 'getTotalLength', lengthDescriptor)
      else Reflect.deleteProperty(SVGElement.prototype, 'getTotalLength')
      if (pointDescriptor) Object.defineProperty(SVGElement.prototype, 'getPointAtLength', pointDescriptor)
      else Reflect.deleteProperty(SVGElement.prototype, 'getPointAtLength')
    }
  })

  it('reveals the exact data in the phone without returning the consumed table to the front', () => {
    const ui = start(), root = rootOf(ui)
    const source = within(ui.getByRole('table', { name: 'Таблица «Заказы»' }))
    const phone = within(ui.getByRole('group', { name: 'Экран «Заказы»' }))
    const layer = root.querySelector('[data-sheet="orders"]')!
    expect(ui.queryByRole('button')).toBeNull()
    expect(phone.queryByRole('list')).toBeNull()
    advance(800)
    expect(root.getAttribute('data-phase')).toBe('compress')
    expect(phone.queryByRole('list')).toBeNull()
    advance(600)
    expect(root.getAttribute('data-phase')).toBe('transfer')
    expect(ui.queryByRole('table', { name: 'Таблица «Заказы»' })).toBeNull()
    advance(1299)
    expect(root.getAttribute('data-phase')).toBe('transfer')
    expect(phone.queryByRole('list')).toBeNull()
    advance(1)
    expect(phone.getByRole('list', { name: 'Заказы' })).toBeTruthy()
    for (const text of ['Стеллаж для офиса', '28 700 ₽', 'В работе', 'Тумба под раковину', '18 500 ₽', 'Полка в прихожую', '6 900 ₽']) {
      expect(source.getByText(text)).toBeTruthy()
      expect(phone.getByText(text)).toBeTruthy()
    }
    expect(layer.getAttribute('data-consumed')).toBe('true')
    advance(800)
    expect(root.getAttribute('data-phase')).toBe('hold')
    expect(layer.getAttribute('data-consumed')).toBe('true')
    advance(600)
    expect(root.getAttribute('data-phase')).toBe('exit')
    expect(layer.getAttribute('data-consumed')).toBe('true')
    advance(500)
    expect(layer.getAttribute('data-rank')).toBe('2')
    expect(layer.getAttribute('data-consumed')).toBe('false')
  })

  it('moves both finished panels to the back and rotates all three pairs in order', () => {
    const ui = start(), root = rootOf(ui)
    for (const [index, name] of ['clients', 'stock', 'orders'].entries()) {
      advance(5300)
      expect(root.getAttribute('data-active')).toBe(name)
      const sheets = [...root.querySelectorAll('[data-sheet]')].map(element => [element.getAttribute('data-sheet'), element.getAttribute('data-rank')])
      const phones = [...root.querySelectorAll('[data-phone]')].map(element => [element.getAttribute('data-phone'), element.getAttribute('data-rank')])
      expect(sheets).toEqual(phones)
      expect(root.querySelector(`[data-sheet="${['orders', 'clients', 'stock'][index]}"]`)?.getAttribute('data-rank')).toBe('2')
      expect(root.querySelectorAll('[data-sheet][aria-hidden="false"]').length).toBe(1)
      expect(root.querySelectorAll('[data-phone][aria-hidden="false"]').length).toBe(1)
    }
  })

  it('keeps the scene at its current time while it is outside the viewport', () => {
    const ui = start(), root = rootOf(ui)
    advance(1600)
    playback.playing = false; ui.rerender(<TableAppTransfer />)
    advance(30000)
    expect(root.getAttribute('data-phase')).toBe('transfer')
    playback.playing = true; ui.rerender(<TableAppTransfer />)
    draw(0); advance(1200)
    expect(root.getAttribute('data-phase')).toBe('reveal')
    expect(root.getAttribute('data-active')).toBe('orders')
  })

  it('pauses the native stack transitions as well as the clock', () => {
    const ui = start(), pause = vi.fn(), play = vi.fn()
    Object.assign(ui.container.querySelector('[class*="scene"]')!, { getAnimations: () => [{ pause, play }] })
    playback.playing = false; ui.rerender(<TableAppTransfer />)
    expect(pause).toHaveBeenCalledOnce()
    playback.playing = true; ui.rerender(<TableAppTransfer />)
    expect(play).toHaveBeenCalledOnce()
  })

  it('keeps the source and completed result visible without autoplay under reduced motion', () => {
    playback.reduced = true; playback.playing = false
    const ui = start()
    expect(ui.queryByRole('button')).toBeNull()
    const phone = within(ui.getByRole('group', { name: 'Экран «Заказы»' }))
    expect(phone.getByText('Стеллаж для офиса')).toBeTruthy()
    expect(phone.getByText('28 700 ₽')).toBeTruthy()
    expect(ui.getByRole('table', { name: 'Таблица «Заказы»' }).textContent).toContain('28 700 ₽')
    advance(30000)
    expect(rootOf(ui).getAttribute('data-active')).toBe('orders')
    expect(rootOf(ui).querySelector('[data-sheet="orders"]')?.getAttribute('data-consumed')).toBe('false')
  })
})
