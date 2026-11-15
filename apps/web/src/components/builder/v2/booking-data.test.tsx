// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { appV2Fixture } from './fixture.test-utils'
import { bookingDays, useBookingCollection } from './booking-data'

const reader = vi.hoisted(() => vi.fn())
vi.mock('@/app/builder-v2-data-actions', () => ({ readBuilderV2DataAction: reader }))
afterEach(() => { cleanup(); reader.mockReset() })
describe('booking day pagination', () => {
  it('keeps all seven days across month and year boundaries', () => {
    expect(bookingDays('2026-11-30', true)).toEqual(['2026-11-30', '2026-12-01', '2026-12-02', '2026-12-03', '2026-12-04', '2026-12-05', '2026-12-06'])
    expect(bookingDays('2027-01-01', true)).toEqual(['2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03'])
  })
  it('does not attach another day’s cursor when one day fails; retry loads the whole range', async () => {
    const app = appV2Fixture()
    const days = bookingDays('2026-11-30', true)
    let failing = true
    reader.mockImplementation(async (_id, _app, request) => request.calendarDay === '2026-12-01' && failing
      ? { ok: false, error: 'День недоступен' }
      : { ok: true, page: { kind: 'collection', rows: [], total: 1, next: `cursor-${request.calendarDay}`, value: null } })
    const { result } = renderHook(() => useBookingCollection(app, 'scr_test', 'cmp_test', { enabled: true, days }))
    await waitFor(() => expect(result.current.error).toBe('День недоступен'))
    expect(result.current.more).toBe(false)
    await act(() => result.current.loadMore())
    expect(reader).toHaveBeenCalledTimes(7)
    failing = false
    act(() => result.current.retry())
    await waitFor(() => expect(result.current.total).toBe(7))
    expect(reader).toHaveBeenCalledTimes(14)
  })
})
