import { describe, expect, it } from 'vitest'
import {
  DEMO_BOOKING_CLIENT,
  DEMO_BOOKING_FROM,
  DEMO_BOOKING_TO,
  DEMO_BOOKING_TODAY,
  prokatDemoBookingItems,
  prokatDemoBookingSelectedIds,
} from './prokat-booking-demo'

describe('prokat booking demo', () => {
  it('returns four inventory rows with two free, one stock, one busy', () => {
    const items = prokatDemoBookingItems()
    expect(items).toHaveLength(4)
    expect(items.map(item => item.status)).toEqual(['free', 'free', 'stock', 'busy'])
    expect(new Set(items.map(item => item.id)).size).toBe(4)
  })

  it('preselects the two free boards and keeps deposit at 8 000', () => {
    const selected = new Set(prokatDemoBookingSelectedIds())
    const items = prokatDemoBookingItems().filter(item => selected.has(item.id))
    expect(items).toHaveLength(2)
    expect(items.reduce((sum, item) => sum + item.deposit, 0)).toBe(8000)
    expect(items.reduce((sum, item) => sum + item.rate, 0)).toBe(2700)
  })

  it('pins the demo clock and client history', () => {
    expect(DEMO_BOOKING_TODAY).toBe('2026-11-27')
    expect(DEMO_BOOKING_FROM).toBe('2026-11-28')
    expect(DEMO_BOOKING_TO).toBe('2026-11-30')
    expect(DEMO_BOOKING_CLIENT.name).toBe('Мария Петрова')
    expect(DEMO_BOOKING_CLIENT.visits).toBe(3)
  })
})
