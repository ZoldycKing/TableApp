import { describe, expect, it } from 'vitest'
import { calendarDay, dateInstant, fieldTimeZone, wallClockToInstant } from './time'
import { evalFilter, indexFields } from './filter-eval'
import { normalizeFieldOptions, type Field } from './fields'
import type { FilterGroup } from './filters'
import { parseCellValue } from './values'
const field = (type: Field['type'], zone = 'Europe/Moscow') => ({ id: 'date', tableId: 'table', name: 'Date', type,
  position: 'a1', description: null, options: normalizeFieldOptions(type, { timeZone: zone }) }) as Field
const matches = (column: Field, value: unknown, op: string, operand: unknown) => evalFilter({ id: 'filter', conjunction: 'and',
  conditions: [{ id: 'condition', fieldId: column.id, op, value: operand }] } as FilterGroup, { date: value }, indexFields([column]))
describe('calendar days in field timezones', () => {
  it('normalises writes in the field zone and rejects invalid or nonexistent local times', () => {
    expect(parseCellValue(field('date'), '2026-03-14')).toBe('2026-03-13T21:00:00.000Z')
    expect(parseCellValue(field('datetime', 'America/New_York'), '2026-03-13T22:30')).toBe('2026-03-14T02:30:00.000Z')
    expect(() => parseCellValue(field('datetime', 'America/New_York'), '2026-03-08T02:30')).toThrow()
    expect(() => parseCellValue(field('date'), '2026-02-30')).toThrow()
    expect(() => parseCellValue(field('date'), '2026-02-30T00:00:00Z')).toThrow()
  })
  it('keeps imported Moscow midnight on the displayed calendar day', () => {
    expect(calendarDay('2026-03-13T21:00:00.000Z')).toBe('2026-03-14')
    expect(calendarDay('2026-03-19T21:00:00.000Z')).toBe('2026-03-20')
  })
  it('keeps civil dates unchanged and rejects nonexistent dates', () => {
    expect(calendarDay('2026-03-14', 'America/New_York')).toBe('2026-03-14')
    expect(calendarDay('2026-02-30')).toBeNull()
    expect(calendarDay('nonsense')).toBeNull()
    expect(dateInstant('2026-02-30')).toBeNull()
  })
  it('uses the datetime field zone and safely falls back for legacy invalid zones', () => {
    expect(calendarDay('2026-03-14T02:00:00Z', fieldTimeZone(field('datetime', 'America/New_York')))).toBe('2026-03-13')
    expect(fieldTimeZone({ type: 'datetime', options: { timeZone: 'invalid' } } as Field)).toBe('Europe/Moscow')
  })
  it('compares dates using the same local day as the calendar', () => {
    expect(matches(field('date'), '2026-03-13T21:00:00Z', 'is', '2026-03-14')).toBe(true)
    expect(matches(field('date'), '2026-03-13T21:00:00Z', 'is', '2026-03-13')).toBe(false)
    expect(matches(field('datetime', 'America/New_York'), '2026-03-14T02:00:00Z', 'is', '2026-03-13')).toBe(true)
  })
  it('handles date ranges with civil inclusive endpoints and optional bounds', () => {
    const value = '2026-03-14T18:00:00Z'
    expect(matches(field('datetime'), value, 'is_within', { from: '2026-03-14', to: '2026-03-14' })).toBe(true)
    expect(matches(field('datetime'), value, 'is_within', { to: '2026-03-13' })).toBe(false)
    expect(matches(field('datetime'), value, 'is_within', { from: 'bad' })).toBe(false)
    expect(matches(field('datetime'), value, 'is_within', { from: '2026-03-14T19:00:00Z' })).toBe(false)
  })
  it('round trips explicit field timezones across DST dates', () => {
    for (const day of [8, 9, 31]) {
      const instant = wallClockToInstant({ year: 2026, month: 3, day, hour: 12, minute: 30 }, 'America/New_York')
      expect(calendarDay(instant, 'America/New_York')).toBe(`2026-03-${String(day).padStart(2, '0')}`)
    }
  })
})
