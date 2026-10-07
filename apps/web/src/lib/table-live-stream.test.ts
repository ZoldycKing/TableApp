import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listenerCount, publishTable } from './live'
import { tableLiveStream } from './table-live-stream'

describe('table live stream lifecycle', () => {
  const controllers: AbortController[] = []
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    controllers.splice(0).forEach((controller) => controller.abort())
    vi.useRealTimers()
  })
  function connect(authorize = vi.fn(async () => true)) {
    const controller = new AbortController(); controllers.push(controller)
    const table = crypto.randomUUID()
    const reader = tableLiveStream(table, controller.signal, authorize, 100).getReader()
    return { controller, table, reader, authorize }
  }
  it('delivers events and releases subscriptions and timers when the reader cancels', async () => {
    const { reader, table, controller } = connect()
    expect(new TextDecoder().decode((await reader.read()).value)).toContain('подключено')
    publishTable(table, 'structure')
    expect(new TextDecoder().decode((await reader.read()).value)).toContain('"kind":"structure"')
    expect(listenerCount(table)).toBe(1)
    await reader.cancel()
    expect(listenerCount(table)).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
    controller.abort()
    expect((await reader.read()).done).toBe(true)
  })
  it('releases the connection on request abort', async () => {
    const { reader, table, controller } = connect()
    await reader.read(); controller.abort()
    expect(listenerCount(table)).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
    expect((await reader.read()).done).toBe(true)
  })
  it('does not subscribe an already aborted request', async () => {
    const controller = new AbortController(); controller.abort()
    const reader = tableLiveStream('already-aborted', controller.signal, async () => true, 100).getReader()
    expect((await reader.read()).done).toBe(true)
    expect(listenerCount('already-aborted')).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
  })
  it.each(['revoked', 'error'])('closes and cleans up when authorization is %s', async (reason) => {
    const { reader, table } = connect(vi.fn(async () => {
      if (reason === 'error') throw new Error('database unavailable')
      return false
    }))
    await reader.read()
    await vi.advanceTimersByTimeAsync(100)
    expect((await reader.read()).done).toBe(true)
    expect(listenerCount(table)).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
  })
  it('does not overlap slow authorization checks or write after cancellation', async () => {
    let finish!: (allowed: boolean) => void
    const authorize = vi.fn(() => new Promise<boolean>((resolve) => { finish = resolve }))
    const { reader, table } = connect(authorize)
    await reader.read()
    await vi.advanceTimersByTimeAsync(350)
    expect(authorize).toHaveBeenCalledTimes(1)
    await reader.cancel(); finish(true)
    await vi.advanceTimersByTimeAsync(100)
    expect(listenerCount(table)).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
    expect((await reader.read()).done).toBe(true)
  })
})
