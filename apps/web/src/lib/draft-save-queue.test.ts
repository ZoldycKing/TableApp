import { describe, expect, it, vi } from 'vitest'
import { createDraftSaveQueue } from './draft-save-queue'

describe('editor save before publication', () => {
  it('flushes an edit immediately without waiting for debounce', async () => {
    const persist = vi.fn().mockResolvedValue({ ok: true })
    const queue = createDraftSaveQueue<string>('old', persist)
    queue.set('latest')
    expect(await queue.flush()).toEqual({ ok: true })
    expect(persist).toHaveBeenCalledWith('latest')
    expect(queue.dirty()).toBe(false)
  })
  it('serializes saves and flushes a newer edit before publication may continue', async () => {
    let finish!: (result: { ok: true }) => void
    const persist = vi.fn().mockImplementationOnce(() => new Promise(resolve => { finish = resolve })).mockResolvedValue({ ok: true })
    const queue = createDraftSaveQueue<string>('initial', persist)
    queue.set('first')
    const saving = queue.flush()
    queue.set('newest')
    const publishing = queue.flush()
    expect(persist).toHaveBeenCalledTimes(1)
    finish({ ok: true })
    expect(await publishing).toEqual({ ok: true })
    await saving
    expect(persist.mock.calls.map(call => call[0])).toEqual(['first', 'newest'])
    expect(queue.current()).toBe('newest')
    expect(queue.dirty()).toBe(false)
  })
  it('retains an unsaved draft after a transport error and supports retry', async () => {
    const persist = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ ok: true })
    const queue = createDraftSaveQueue<string>('initial', persist)
    queue.set('unsaved')
    expect((await queue.flush()).ok).toBe(false)
    expect(queue.current()).toBe('unsaved')
    expect(queue.dirty()).toBe(true)
    expect(await queue.flush()).toEqual({ ok: true })
    expect(queue.dirty()).toBe(false)
  })
})
