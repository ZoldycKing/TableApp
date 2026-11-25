import { describe, expect, it } from 'vitest'
import { wallClockToInstant } from '@tableapp/schema'
import {
  clientNotPickedUpCount, extendHoldUntil, formatNotPickedUpCount, holdUntilFromStart,
  isHoldEligibleStatus, isHoldExpired, isHoldWindowOpen, isOpenBooking,
  PROKAT_BLOCKING_STATUSES, PROKAT_DEFAULT_HOLD_AFTER_START_MINUTES, resolveBookingHoldUntil,
  resolveHoldAfterStartMinutes, staffTransitions,
} from './prokat-logic'

const moscow = (year: number, month: number, day: number, hour = 12, minute = 0) =>
  wallClockToInstant({ year, month, day, hour, minute }, 'Europe/Moscow').toISOString()

describe('prokat hold window', () => {
  it('defaults to 2 hours and accepts null as never', () => {
    expect(resolveHoldAfterStartMinutes(undefined)).toBe(PROKAT_DEFAULT_HOLD_AFTER_START_MINUTES)
    expect(resolveHoldAfterStartMinutes(999)).toBe(PROKAT_DEFAULT_HOLD_AFTER_START_MINUTES)
    expect(resolveHoldAfterStartMinutes(null)).toBeNull()
    expect(resolveHoldAfterStartMinutes(30)).toBe(30)
  })

  it('computes holdUntil from start + window', () => {
    const from = moscow(2026, 11, 24, 12)
    expect(holdUntilFromStart(from, 120)).toBe(moscow(2026, 11, 24, 14))
    expect(holdUntilFromStart(from, null)).toBeNull()
  })

  it('prefers explicit holdUntil over the business window', () => {
    const from = moscow(2026, 11, 24, 12)
    const stamped = moscow(2026, 11, 24, 16)
    expect(resolveBookingHoldUntil({ from, holdUntil: stamped, holdAfterStartMinutes: 30 })).toBe(stamped)
    expect(resolveBookingHoldUntil({ from, holdUntil: null, holdAfterStartMinutes: 30 })).toBe(moscow(2026, 11, 24, 12, 30))
  })

  it('detects open and expired windows', () => {
    const until = moscow(2026, 11, 24, 14)
    const before = Date.parse(moscow(2026, 11, 24, 13, 59))
    const after = Date.parse(moscow(2026, 11, 24, 14, 1))
    expect(isHoldWindowOpen(until, before)).toBe(true)
    expect(isHoldExpired(until, after)).toBe(true)
    expect(isHoldExpired(null, after)).toBe(false)
  })

  it('extends from the later of holdUntil and now by one hour', () => {
    const now = Date.parse(moscow(2026, 11, 24, 15))
    expect(extendHoldUntil(moscow(2026, 11, 24, 14), now)).toBe(moscow(2026, 11, 24, 16))
    expect(extendHoldUntil(moscow(2026, 11, 24, 17), now)).toBe(moscow(2026, 11, 24, 18))
  })

  it('never blocks timeline slots for «Не забрали»', () => {
    expect((PROKAT_BLOCKING_STATUSES as readonly string[]).includes('Не забрали')).toBe(false)
    expect(isOpenBooking('Не забрали')).toBe(false)
    expect(isHoldEligibleStatus('Подтверждена')).toBe(true)
    expect(isHoldEligibleStatus('Выдано')).toBe(false)
    expect(staffTransitions('Подтверждена')).toContain('Не забрали')
  })

  it('formats staff-only no-show counter', () => {
    expect(clientNotPickedUpCount([{ status: 'Не забрали' }, { status: 'Не забрали' }, { status: 'Возвращено' }])).toBe(2)
    expect(formatNotPickedUpCount(1)).toBe('Не забрал: 1 раз')
    expect(formatNotPickedUpCount(2)).toBe('Не забрал: 2 раза')
    expect(formatNotPickedUpCount(5)).toBe('Не забрал: 5 раз')
    expect(formatNotPickedUpCount(0)).toBe('')
  })
})
