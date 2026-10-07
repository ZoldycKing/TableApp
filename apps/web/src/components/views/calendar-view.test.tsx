// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultViewConfig, normalizeFieldOptions, type Field, type ViewOf } from '@tableapp/schema'
import { CalendarView } from './calendar-view'
const title: Field = { id: 'title', tableId: 'table', name: 'Title', type: 'text', options: {}, description: null, position: 'a1' }
const date = (type: 'date' | 'datetime', zone = 'Europe/Moscow') => ({ id: 'date', tableId: 'table', name: 'Date', type,
  options: normalizeFieldOptions(type, { timeZone: zone }), description: null, position: 'a2' }) as Field
const view = { id: 'calendar', tableId: 'table', name: 'Calendar', position: 'a1', type: 'calendar',
  config: { ...defaultViewConfig('calendar', 'filter'), dateFieldId: 'date' } } as ViewOf<'calendar'>
const row = (id: string, value: unknown) => ({ id, position: id, data: { title: id, date: value } })
describe('calendar matches displayed field dates', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-03-14T12:00:00Z')) })
  afterEach(() => { cleanup(); vi.useRealTimers() })
  it('places imported Moscow midnight on March 14 and March 20', () => {
    const { container } = render(<CalendarView view={view} fields={[title, date('date')]} titleField={title}
      rows={[row('Perforator', '2026-03-13T21:00:00Z'), row('Bits', '2026-03-19T21:00:00Z')]} onConfigChange={() => {}} />)
    expect(container.querySelector('[data-date="2026-03-14"]')!.textContent).toContain('Perforator')
    expect(container.querySelector('[data-date="2026-03-20"]')!.textContent).toContain('Bits')
    expect(container.querySelector('[data-date="2026-03-13"]')!.textContent).not.toContain('Perforator')
  })
  it('uses the configured datetime zone for grouping and current day', () => {
    vi.setSystemTime(new Date('2026-03-14T02:00:00Z'))
    const { container } = render(<CalendarView view={view} fields={[title, date('datetime', 'America/New_York')]} titleField={title}
      rows={[row('Night', '2026-03-14T02:00:00Z')]} onConfigChange={() => {}} />)
    expect(container.querySelector('[data-date="2026-03-13"]')!.textContent).toContain('Night')
    expect(container.querySelector('[data-date="2026-03-13"] span')!.className).toContain('bg-ink')
  })
  it('counts invalid dates with the undated rows instead of silently losing them', () => {
    const { getByText } = render(<CalendarView view={view} fields={[title, date('date')]} titleField={title}
      rows={[row('Bad', 'not-a-date'), row('None', null)]} onConfigChange={() => {}} />)
    expect(getByText('без даты: 2')).toBeTruthy()
  })
})
