import { describe, expect, it } from 'vitest'
import { calendarBlockFrame, calendarEventLanes, calendarGridBounds, type TeamCalendarEvent } from './team-calendar-core'

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
