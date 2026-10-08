// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearUnsaved, markUnsaved } from './unsaved'
import { useLiveApp } from './use-live-app'

const router = vi.hoisted(() => ({ refresh: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => router }))
class Source {
  static current: Source
  onmessage: (() => void) | null = null
  onopen: (() => void) | null = null
  close = vi.fn()
  constructor(readonly url: string) { Source.current = this }
}
beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal('EventSource', Source) })
afterEach(() => { cleanup(); clearUnsaved('live-test'); vi.useRealTimers(); vi.unstubAllGlobals(); vi.clearAllMocks() })
describe('published app live updates', () => {
  it('coalesces events and closes its connection on unmount', async () => {
    const hook = renderHook(() => useLiveApp('warehouse'))
    const source = Source.current
    expect(source.url).toBe('/api/app-live/warehouse')
    act(() => { source.onmessage!(); source.onmessage!() })
    await act(() => vi.advanceTimersByTimeAsync(700))
    expect(router.refresh).toHaveBeenCalledTimes(1)
    hook.unmount()
    expect(source.close).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })
  it('waits for unsaved inputs even after blur and applies the pending update after saving', async () => {
    renderHook(() => useLiveApp('warehouse'))
    markUnsaved('live-test')
    act(() => Source.current.onmessage!())
    await act(() => vi.advanceTimersByTimeAsync(2000))
    expect(router.refresh).not.toHaveBeenCalled()
    clearUnsaved('live-test')
    await act(() => vi.advanceTimersByTimeAsync(1000))
    expect(router.refresh).toHaveBeenCalledTimes(1)
  })
  it('refreshes after reconnecting but does not subscribe previews', async () => {
    const hook = renderHook(({ enabled }) => useLiveApp('warehouse', enabled), { initialProps: { enabled: true } })
    act(() => Source.current.onopen!())
    await act(() => vi.advanceTimersByTimeAsync(700))
    expect(router.refresh).not.toHaveBeenCalled()
    act(() => Source.current.onopen!())
    await act(() => vi.advanceTimersByTimeAsync(700))
    expect(router.refresh).toHaveBeenCalledTimes(1)
    const source = Source.current
    hook.rerender({ enabled: false })
    expect(source.close).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })
})
