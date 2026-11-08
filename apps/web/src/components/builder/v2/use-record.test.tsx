// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readBuilderV2RecordAction } from '@/app/builder-v2-data-actions'
import type { BuilderV2RecordResult } from '@/lib/builder-v2-data-types'
import { appV2Fixture } from './fixture.test-utils'
import { useBuilderV2Record } from './use-record'

vi.mock('@/app/builder-v2-data-actions', () => ({ readBuilderV2RecordAction: vi.fn() }))
beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks() })
afterEach(() => { cleanup(); vi.useRealTimers() })
const result = (id: string): BuilderV2RecordResult => ({ ok: true, title: id, record: { id, tableId: 'requests', values: { r_title: id }, display: { r_title: id } } })
const tick = () => act(async () => { await vi.advanceTimersByTimeAsync(150) })

describe('selected record loader', () => {
  it('discards an old folder response and immediately hides data on selection changes', async () => {
    let finish!: (value: BuilderV2RecordResult) => void
    vi.mocked(readBuilderV2RecordAction).mockImplementationOnce(() => new Promise(resolve => { finish = resolve })).mockResolvedValue(result('B'))
    const app = appV2Fixture(), hook = renderHook(({ id }) => useBuilderV2Record(app, 'detail', id), { initialProps: { id: 'A' } })
    await tick(); hook.rerender({ id: 'B' })
    expect(hook.result.current.record).toBeUndefined()
    await tick(); expect(hook.result.current.record?.id).toBe('B')
    await act(async () => finish(result('A')))
    expect(hook.result.current.record?.id).toBe('B')
    hook.rerender({ id: '' }); expect(hook.result.current.record).toBeUndefined()
    await tick(); expect(readBuilderV2RecordAction).toHaveBeenCalledTimes(2)
  })
  it('keeps missing records closed and retries explicitly without inventing a record', async () => {
    vi.mocked(readBuilderV2RecordAction).mockResolvedValueOnce({ ok: false, error: 'Запись удалена' }).mockResolvedValueOnce(result('A'))
    const app = appV2Fixture(), hook = renderHook(() => useBuilderV2Record(app, 'detail', 'A'))
    await tick(); expect(hook.result.current.error).toBe('Запись удалена'); expect(hook.result.current.record).toBeUndefined()
    act(() => hook.result.current.retry()); await tick()
    expect(hook.result.current.record?.id).toBe('A')
  })
})
