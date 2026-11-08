// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { BuilderLearningProgress } from '@/lib/builder-learning-types'
import { useBuilderLearning } from './use-learning'

const mocks = vi.hoisted(() => ({ change: vi.fn(), read: vi.fn(), confirm:vi.fn() }))
vi.mock('@/app/builder-learning-actions', () => ({ builderLearningAction: mocks.change, readBuilderLearningAction: mocks.read,confirmBuilderLearningAccessAction:mocks.confirm }))
const initial: BuilderLearningProgress = { version: 1, revision: '2026-11-03T00:00:00.000Z', list: 'pending', record: 'pending', save:'pending', access: 'pending', publish: 'pending', paused: false, target: { nodeId: 'list', screenId: 'home', tableId: 'projects', name: 'Проекты', cardScreenId: 'card' } }
beforeEach(() => { vi.useFakeTimers(); vi.resetAllMocks(); mocks.change.mockResolvedValue({ ok: true, progress: initial }); mocks.read.mockResolvedValue({ ok: true, progress: initial }) })
afterEach(() => { cleanup(); vi.useRealTimers() })
it('retries the exact saved access revision after an uncertain progress response',async()=>{
  const hook=renderHook(()=>useBuilderLearning('app_one',initial,false,true))
  mocks.confirm.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ok:true,progress:{...initial,access:'done',revision:'2026-11-04T00:00:00Z'}})
  await act(async()=>{await hook.result.current.confirmAccess('a'.repeat(64))});expect(hook.result.current.progress?.access).toBe('pending')
  await act(async()=>{await hook.result.current.retry()});expect(mocks.confirm.mock.calls).toEqual([['app_one','a'.repeat(64)],['app_one','a'.repeat(64)]]);expect(hook.result.current.progress?.access).toBe('done')
})
it('starts automatically once under StrictMode and never resets previously saved pause', async () => {
  const hook = renderHook(() => useBuilderLearning('app_one', null, true, true), { wrapper: StrictMode })
  await act(async () => { await vi.advanceTimersByTimeAsync(1) })
  expect(mocks.change).toHaveBeenCalledExactlyOnceWith('app_one', 'start')
  expect(hook.result.current.progress?.list).toBe('pending')
  hook.unmount(); mocks.change.mockClear()
  const resumed = renderHook(() => useBuilderLearning('app_one', { ...initial, paused: true }, true, true))
  await act(async () => { await vi.advanceTimersByTimeAsync(1) })
  expect(mocks.change).not.toHaveBeenCalled(); expect(resumed.result.current.progress?.paused).toBe(true)
})
it('ignores a late older save response after a newer pause acknowledgement', () => {
  const hook = renderHook(() => useBuilderLearning('app_one', initial, false, true))
  act(() => hook.result.current.apply({ ...initial, paused: true, revision: '2026-11-03T00:00:02.000Z' }))
  act(() => hook.result.current.apply({ ...initial, list: 'done', revision: '2026-11-03T00:00:01.000Z' }))
  expect(hook.result.current.progress).toMatchObject({ paused: true, list: 'pending' })
})
it('preserves progress after a failed preference request and retries the same intent', async () => {
  const hook = renderHook(() => useBuilderLearning('app_one', initial, false, true))
  mocks.change.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ ok: true, progress: { ...initial, paused: true, revision: '2026-11-03T00:00:01.000Z' } })
  await act(async () => { await hook.result.current.perform('pause') })
  expect(hook.result.current.progress?.paused).toBe(false); expect(hook.result.current.error).toContain('Не удалось сохранить')
  await act(async () => { await hook.result.current.retry() })
  expect(hook.result.current.progress?.paused).toBe(true)
  expect(mocks.change.mock.calls.map(call => call[1])).toEqual(['pause', 'pause'])
})
