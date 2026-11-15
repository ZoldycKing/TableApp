import { describe, expect, it } from 'vitest'
import { clientVisitSummary, masterMonthSummary, type SalonSummaryVisit } from './salon-people-summary'

const visit = (patch: Partial<SalonSummaryVisit> & Pick<SalonSummaryVisit, 'start' | 'status'>): SalonSummaryVisit => ({
  masterId: 'olya', price: 2500, service: 'Стрижка', ...patch,
})

describe('salon client and master summaries', () => {
  const now = Date.parse('2026-11-15T12:00:00Z')

  it('counts visits and lifetime takings without cancelled rows or loyalty', () => {
    const summary = clientVisitSummary([
      visit({ id: 'done', start: '2026-11-12T12:00:00Z', status: 'completed', price: 5500 }),
      visit({ id: 'here', start: '2026-11-15T08:00:00Z', status: 'arrived', price: 2500 }),
      visit({ id: 'next', start: '2026-11-16T08:00:00Z', status: 'booked', price: 1800 }),
      visit({ id: 'missed', start: '2026-11-14T15:00:00Z', status: 'noShow', price: 1500 }),
      visit({ id: 'void', start: '2026-11-10T12:00:00Z', status: 'cancelled', price: 9000 }),
    ], now)
    expect(summary.visits).toBe(4)
    expect(summary.revenue).toBe(8000)
    expect(summary.lastVisit).toBe('2026-11-15T08:00:00Z')
    expect(summary.next?.id).toBe('next')
    expect(summary).not.toHaveProperty('points')
  })

  it('leaves the last visit empty when every counted appointment is still ahead', () => {
    const summary = clientVisitSummary([
      visit({ id: 'soon', start: '2026-11-20T08:00:00Z', status: 'booked', price: 2500 }),
    ], now)
    expect(summary.visits).toBe(1)
    expect(summary.revenue).toBe(0)
    expect(summary.lastVisit).toBeNull()
    expect(summary.next?.id).toBe('soon')
  })

  it('sums one master for the current month and skips cancellations and other people', () => {
    const zone = 'Europe/Moscow'
    const nowDate = new Date('2026-11-15T12:00:00Z')
    const stats = masterMonthSummary([
      visit({ masterId: 'olya', start: '2026-11-02T09:00:00Z', status: 'completed', price: 2500 }),
      visit({ masterId: 'olya', start: '2026-11-15T11:00:00Z', status: 'arrived', price: 1800 }),
      visit({ masterId: 'olya', start: '2026-11-16T11:00:00Z', status: 'booked', price: 5500 }),
      visit({ masterId: 'olya', start: '2026-11-14T11:00:00Z', status: 'noShow', price: 1500 }),
      visit({ masterId: 'olya', start: '2026-11-13T11:00:00Z', status: 'cancelled', price: 9000 }),
      visit({ masterId: 'olya', start: '2026-10-20T11:00:00Z', status: 'completed', price: 4000 }),
      visit({ masterId: 'zhenya', start: '2026-11-15T11:00:00Z', status: 'completed', price: 1500 }),
    ], 'olya', zone, nowDate)
    expect(stats.appointments).toBe(4)
    expect(stats.revenue).toBe(11300)
  })
})
