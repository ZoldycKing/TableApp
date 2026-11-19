import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dateMenuCursor } from '@/components/builder/v2/booking-calendar'

describe('dateMenuCursor', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-19T12:00:00'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('uses the current month when value is empty', () => {
    expect(dateMenuCursor('')).toEqual({ year: 2026, month: 11 })
  })

  it('uses the selected date month', () => {
    expect(dateMenuCursor('2026-03-15')).toEqual({ year: 2026, month: 3 })
  })

  it('ignores malformed values and falls back to now', () => {
    expect(dateMenuCursor('not-a-date')).toEqual({ year: 2026, month: 11 })
    expect(dateMenuCursor('2026-13-01')).toEqual({ year: 2026, month: 11 })
  })
})
