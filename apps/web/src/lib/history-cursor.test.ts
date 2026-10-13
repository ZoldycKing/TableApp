import { afterEach, describe, expect, it, vi } from 'vitest'
vi.mock('./row-mutations', () => ({ RowWriteError: class extends Error { constructor(readonly code: string, message: string) { super(message) } } }))
import { historyCursor, readHistoryCursor } from './history-cursor'
afterEach(() => vi.useRealTimers())
describe('opaque CRM pagination', () => {
  it('binds encrypted state to its actor, business, source and filter', () => {
    const value = { id: 'hidden-record-id', revision: 321, upper: 456 }, token = historyCursor(value, 'business:actor:source:filter')
    expect(token).not.toContain('hidden-record-id')
    expect(readHistoryCursor(token, 'business:actor:source:filter')).toEqual(value)
    expect(() => readHistoryCursor(token, 'another-business:actor:source:filter')).toThrow('устарела')
    expect(() => readHistoryCursor(`${token}x`, 'business:actor:source:filter')).toThrow('устарела')
  })
  it('rejects expired or malformed navigation state', () => {
    vi.useFakeTimers(); const token = historyCursor({}, 'context')
    vi.advanceTimersByTime(1_800_001)
    expect(() => readHistoryCursor(token, 'context')).toThrow('устарела')
    for (const value of ['', '%', 'a'.repeat(2001)]) expect(() => readHistoryCursor(value, 'context')).toThrow('устарела')
  })
})
