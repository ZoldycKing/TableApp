// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { QueuedMutation } from './outbox-store'

const store = vi.hoisted(() => ({ listQueue: vi.fn(), forget: vi.fn(), remember: vi.fn(), deviceId: () => 'device' }))
vi.mock('./outbox-store', () => store)
import { OutboxSender, type SyncOutcome } from './outbox-sender'

const edit = (id: string, next: number, base: number): QueuedMutation => ({
  id, op: 'update', rowId: 'row', fieldId: 'field', tableId: 'table', queuedAt: next, next, base,
})
const row = (id: string) => ({ id, data: { name: id }, position: id, version: 1, deleted: false })
const page = (extra: Record<string, unknown> = {}) => new Response(JSON.stringify({
  applied: [], rejected: [], rows: [], cursor: 'end', reset: false, hasMore: false, ...extra,
}), { status: 200 })

describe('outbox sender pagination and acknowledgements', () => {
  let queue: QueuedMutation[]
  let fetchMock: ReturnType<typeof vi.fn>
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    queue = []
    store.listQueue.mockImplementation(async () => [...queue])
    store.forget.mockImplementation(async (ids: string[]) => { queue = queue.filter((item) => !ids.includes(item.id)) })
    store.remember.mockResolvedValue(undefined)
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals() })
  it('acknowledges every edit represented by the collapsed mutation', async () => {
    queue = [edit('m1', 1, 0), edit('m2', 2, 1), edit('m3', 3, 2)]
    fetchMock.mockResolvedValueOnce(page({ applied: ['m3'] }))
    const outcomes: SyncOutcome[] = []
    const sender = new OutboxSender('table', null, 'app')
    sender.onResult((outcome) => outcomes.push(outcome))
    await sender.flush()
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toMatchObject({ appSlug: 'app',
      mutations: [{ id: 'm3', base: 0, next: 3 }] })
    expect(store.forget).toHaveBeenCalledWith(['m1', 'm2', 'm3'])
    expect(outcomes.at(-1)!.pending).toBe(0)
  })
  it('purges stale rows before collecting a complete replacement snapshot', async () => {
    fetchMock.mockResolvedValueOnce(page({ reset: true, rows: [row('a')], cursor: 'page2', hasMore: true }))
      .mockResolvedValueOnce(page({ rows: [row('b')], cursor: 'complete' }))
    const outcomes: SyncOutcome[] = []
    const sender = new OutboxSender('table', 'old')
    sender.onResult((outcome) => outcomes.push(outcome))
    await sender.flush()
    expect(outcomes[0]).toMatchObject({ reset: true, rows: [] })
    expect(outcomes.at(-1)).toMatchObject({ reset: true, cursor: 'complete', rows: [row('a'), row('b')] })
    expect(JSON.parse(fetchMock.mock.calls[1]![1].body)).toMatchObject({ since: 'page2', mutations: [] })
  })
  it('retries the original cursor after a later page fails', async () => {
    queue = [edit('m1', 1, 0)]
    fetchMock.mockResolvedValueOnce(page({ applied: ['m1'], cursor: 'page2', hasMore: true }))
      .mockRejectedValueOnce(new Error('Network failed'))
      .mockResolvedValueOnce(page({ cursor: 'complete' }))
    const sender = new OutboxSender('table', 'old')
    await sender.flush()
    await sender.flush()
    expect(JSON.parse(fetchMock.mock.calls[2]![1].body)).toMatchObject({ since: 'old', mutations: [] })
    expect(queue).toHaveLength(0)
  })
  it('clears cached server data after access is revoked while retaining queued drafts', async () => {
    queue = [edit('m1', 1, 0)]
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 403 }))
    const sender = new OutboxSender('table', 'old')
    const outcomes: SyncOutcome[] = []
    sender.onResult((outcome) => outcomes.push(outcome))
    await sender.flush()
    expect(outcomes).toEqual([expect.objectContaining({ rows: [], reset: true, accessRevoked: true, pending: 1 })])
    expect(queue).toHaveLength(1)
    expect(store.forget).not.toHaveBeenCalled()
  })
  it('remembers one rejected edit and removes all its source ids', async () => {
    queue = [edit('m1', 1, 0), edit('m2', 2, 1)]
    fetchMock.mockResolvedValueOnce(page({ rejected: [{ id: 'm2', reason: 'Conflict', current: 5 }] }))
    await new OutboxSender('table').flush()
    expect(store.remember).toHaveBeenCalledWith([expect.objectContaining({ id: 'm2', next: 2, current: 5, reason: 'Conflict' })])
    expect(store.forget).toHaveBeenCalledWith(['m1', 'm2'])
    expect(queue).toHaveLength(0)
  })
  it('does not advance its cursor when pagination repeats a cursor', async () => {
    fetchMock.mockResolvedValueOnce(page({ cursor: 'old', hasMore: true }))
      .mockResolvedValueOnce(page())
    const sender = new OutboxSender('table', 'old')
    await sender.flush()
    await sender.flush()
    expect(JSON.parse(fetchMock.mock.calls[1]![1].body).since).toBe('old')
  })
})
