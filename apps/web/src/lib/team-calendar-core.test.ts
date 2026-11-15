import { describe, expect, it } from 'vitest'
import { calendarBlockFrame, calendarEventLanes, calendarGridBounds, calendarMoveIssue, calendarPeriodAmount, type TeamCalendarEvent } from './team-calendar-core'

const event = (id: string, start: number, end: number): TeamCalendarEvent => ({
  id, resourceId: 'person', day: '2026-11-15', start, end, title: id, subtitle: '', status: 'booked', amount: null,
})

describe('day grid geometry', () => {
  it('places a block by its start and sizes it by duration', () => {
    const bounds = calendarGridBounds([{ start: 9 * 60, end: 19 * 60 }], [])
    expect(bounds).toEqual({ start: 8 * 60, end: 20 * 60, span: 12 * 60 })
    const morning = calendarBlockFrame(bounds, 9 * 60, 12 * 60)
    const hour = calendarBlockFrame(bounds, 9 * 60, 10 * 60)
    expect(morning.top).toBeCloseTo(1 / 12)
    expect(morning.height).toBeCloseTo(3 / 12)
    expect(morning.height).toBeCloseTo(hour.height * 3)
    expect(hour.top).toBeCloseTo(morning.top)
  })

  it('keeps an early or late appointment inside the window with an hour of context', () => {
    const bounds = calendarGridBounds([], [{ start: 7 * 60, end: 8 * 60 }, { start: 21 * 60, end: 22 * 60 }])
    expect(bounds.start).toBe(6 * 60)
    expect(bounds.end).toBe(23 * 60)
  })

  it('gives overlapping appointments separate lanes and a later one the first free lane', () => {
    const bounds = calendarGridBounds([], [{ start: 9 * 60, end: 12 * 60 }])
    const long = calendarBlockFrame(bounds, 9 * 60, 12 * 60)
    const nested = calendarBlockFrame(bounds, 10 * 60, 11 * 60)
    expect(nested.top).toBeGreaterThan(long.top)
    expect(nested.top + nested.height).toBeLessThan(long.top + long.height)
    const lanes = calendarEventLanes([
      event('long', 9 * 60, 12 * 60),
      event('nested', 10 * 60, 11 * 60),
      event('after', 12 * 60, 13 * 60),
    ])
    expect(lanes.find(item => item.event.id === 'long')).toMatchObject({ lane: 0, lanes: 2 })
    expect(lanes.find(item => item.event.id === 'nested')).toMatchObject({ lane: 1, lanes: 2 })
    expect(lanes.find(item => item.event.id === 'after')).toMatchObject({ lane: 0, lanes: 1 })
  })
})

describe('moving an appointment', () => {
  const windows = [{ start: 9 * 60, end: 13 * 60 }, { start: 14 * 60, end: 19 * 60 }]
  const visit = { id: 'visit', start: 10 * 60, end: 11 * 60, status: 'booked' }
  const other = { id: 'other', resourceId: 'olya', day: '2026-11-15', start: 9 * 60, end: 10 * 60, status: 'booked' }
  it('rejects a drop that overlaps another appointment and keeps the wording for the return', () => {
    expect(calendarMoveIssue({
      event: visit, resourceId: 'olya', day: '2026-11-15', start: 9 * 60, step: 15, windows, others: [other],
    })).toBe('Это время уже занято. Запись осталась на прежнем месте.')
  })
  it('rejects a drop outside working hours, including across a break', () => {
    expect(calendarMoveIssue({
      event: visit, resourceId: 'olya', day: '2026-11-15', start: 12 * 60 + 30, step: 15, windows, others: [],
    })).toBe('Это время вне рабочих часов. Запись осталась на прежнем месте.')
  })
  it('sums the chosen day only and can total the same on two different days', () => {
    const events = [
      { id: 'maria-am', day: '2026-11-15', status: 'booked', amount: 2500 },
      { id: 'anna', day: '2026-11-15', status: 'booked', amount: 1800 },
      { id: 'maria-pm', day: '2026-11-15', status: 'booked', amount: 2500 },
      { id: 'boris', day: '2026-11-15', status: 'noShow', amount: 1500 },
      { id: 'alexey', day: '2026-11-15', status: 'booked', amount: 1500 },
      { id: 'sveta', day: '2026-11-16', status: 'booked', amount: 2800 },
      { id: 'irina', day: '2026-11-16', status: 'booked', amount: 5500 },
    ]
    expect(calendarPeriodAmount(events, ['2026-11-15'])).toBe(8300)
    expect(calendarPeriodAmount(events, ['2026-11-16'])).toBe(8300)
    expect(calendarPeriodAmount(events.filter(event => event.id === 'anna'), ['2026-11-15'])).toBe(1800)
  })

  it('allows a free slot on the grid step and ignores a cancelled neighbour', () => {
    expect(calendarMoveIssue({
      event: visit, resourceId: 'zhenya', day: '2026-11-15', start: 9 * 60, step: 15, windows,
      others: [{ ...other, resourceId: 'zhenya', status: 'cancelled' }],
    })).toBeNull()
  })
})
