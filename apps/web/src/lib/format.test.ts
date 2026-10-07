import { describe, expect, it } from 'vitest'
import { normalizeFieldOptions, type Field } from '@tableapp/schema'
import { formatCell } from './format'
const field = (type: Field['type'], zone = 'Europe/Moscow') => ({ id: 'date', tableId: 'table', name: 'Date', type,
  options: normalizeFieldOptions(type, { timeZone: zone }), description: null, position: 'a1' }) as Field
describe('field date formatting', () => {
  it('shows imported Moscow midnight on the same day as the calendar and exports', () => {
    expect(formatCell(field('date'), '2026-03-13T21:00:00Z')).toBe('14.03.2026')
  })
  it('shows the datetime field zone instead of a fixed product zone', () => {
    expect(formatCell(field('datetime', 'America/New_York'), '2026-03-14T02:30:00Z')).toBe('13.03.2026, 22:30')
    expect(formatCell(field('datetime'), '2026-03-14T02:30:00Z')).toBe('14.03.2026, 05:30')
  })
  it('honours stored date formats and shows time for system timestamps', () => {
    const iso = field('date'); iso.options = { dateFormat: 'iso' }
    expect(formatCell(iso, '2026-03-13T21:00:00Z')).toBe('2026-03-14')
    const us = field('date'); us.options = { dateFormat: 'us' }
    expect(formatCell(us, '2026-03-14')).toBe('03/14/2026')
    expect(formatCell(field('created_time'), '2026-03-13T21:00:00Z')).toBe('14.03.2026, 00:00')
  })
})
