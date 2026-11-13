// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { instantToWallClock } from '@tableapp/schema'
import { bookingCalendarDays, type BookingCalendarSnapshot, type BookingCalendarVisit } from '@/lib/builder-v2-booking-calendar'
import { appV2Fixture } from './fixture.test-utils'
import { BookingCalendarDemoContext, BookingCalendarScreen } from './booking-calendar'
import { BookingWeekOverview } from './booking-calendar-views'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })
function fixture() {
  const day = instantToWallClock(new Date(), 'Europe/Moscow')!.date, days = bookingCalendarDays(day, true)
  const masters = [{ id: 'master_olya', name: 'Оля' }, { id: 'master_zhenya', name: 'Женя' }, { id: 'master_natasha', name: 'Наташа' }]
  const visit = (id: string, masterId: string, start: number, date = day, status = 'booked'): BookingCalendarVisit => ({ id, masterId, start, end: start + 60, day: date, status, service: `Услуга ${id}`, client: `Клиент ${id}`, price: 1500 })
  const data: BookingCalendarSnapshot = {
    timeZone: 'Europe/Moscow', days, masters,
    shifts: masters.flatMap(master => days.map(date => ({ masterId: master.id, day: date, windows: [{ id: `${master.id}_morning`, start: 540, end: 780 }, { id: `${master.id}_evening`, start: 840, end: 1140 }], closed: false, exception: false }))),
    visits: [visit('early', masters[1]!.id, 540), visit('middle', masters[0]!.id, 600), visit('late', masters[2]!.id, 720), visit('another_day', masters[2]!.id, 540, days.find(date => date !== day)!), visit('cancelled', masters[0]!.id, 540, day, 'cancelled')],
  }
  return { data, day, visit }
}
function resize(width: number) {
  vi.stubGlobal('ResizeObserver', class {
    constructor(private callback: ResizeObserverCallback) {}
    observe() { this.callback([{ contentRect: { width } }] as ResizeObserverEntry[], this as unknown as ResizeObserver) }
    disconnect() {}
  })
}
function show(data: BookingCalendarSnapshot, width: number, onOpenVisit = vi.fn(), onOpenPeriod = vi.fn()) {
  resize(width)
  const app = appV2Fixture()
  render(<BookingCalendarDemoContext value={() => ({ ok: true, data })}><BookingCalendarScreen app={app} screenId={app.homeScreenId!} timeZone="Europe/Moscow" working onOpenVisit={onOpenVisit} onOpenPeriod={onOpenPeriod} /></BookingCalendarDemoContext>)
  return { onOpenVisit, onOpenPeriod }
}
describe('one calendar for the whole team', () => {
  it('defaults to all masters and opens the detailed day from the week header', async () => {
    const { data } = fixture()
    show(data, 1200)
    const table = await screen.findByRole('table', { name: 'Неделя всех мастеров' })
    expect(within(table).getAllByRole('rowheader')).toHaveLength(3)
    for (const master of data.masters) expect(within(table).getByRole('rowheader', { name: master.name })).toBeTruthy()
    expect(within(table).getAllByRole('cell')).toHaveLength(21)
    expect(within(table).getAllByRole('button', { name: /^Открыть запись:/ })).toHaveLength(4)
    expect((screen.getByRole('combobox', { name: 'Мастер календаря' }) as HTMLSelectElement).value).toBe('')
    fireEvent.click(within(table).getAllByRole('button', { name: /^Открыть день:/ })[0]!)
    const day = await screen.findByLabelText('Календарь рабочих часов и записей')
    expect(within(day).getAllByRole('region')).toHaveLength(3)
  })
  it('keeps filtering optional and opens the actual appointment', async () => {
    const { data } = fixture(), callbacks = show(data, 1200)
    await screen.findByRole('table')
    fireEvent.change(screen.getByRole('combobox', { name: 'Мастер календаря' }), { target: { value: 'master_zhenya' } })
    const table = screen.getByRole('table')
    expect(within(table).getAllByRole('rowheader')).toHaveLength(1)
    const button = within(table).getByRole('button', { name: /^Открыть запись:/ })
    fireEvent.click(button)
    expect(callbacks.onOpenVisit).toHaveBeenCalledWith('early')
  })
  it('shows every appointment on a busy day without a hidden remainder', () => {
    const { data, visit } = fixture()
    data.visits = Array.from({ length: 18 }, (_, index) => visit(`busy_${index}`, 'master_olya', 540 + index * 15))
    render(<BookingWeekOverview data={data} masterId="" working editing={false} onOpenVisit={vi.fn()} onOpenDay={vi.fn()} />)
    expect(screen.getAllByRole('button', { name: /^Открыть запись:/ })).toHaveLength(18)
  })
  it('shows the whole team’s chosen day in chronological order on a phone', async () => {
    const { data } = fixture(), callbacks = show(data, 300)
    await waitFor(() => expect(document.querySelector('[data-calendar-agenda]')).not.toBeNull())
    const agenda = document.querySelector('[data-calendar-agenda]') as HTMLElement
    const visits = within(agenda).getAllByRole('button', { name: /^Открыть запись:/ })
    expect(visits.map(button => button.textContent)).toEqual(expect.arrayContaining([expect.stringContaining('Женя'), expect.stringContaining('Оля'), expect.stringContaining('Наташа')]))
    expect(visits[0]!.textContent).toContain('09:00–10:00')
    expect(visits).toHaveLength(3)
    expect(within(agenda).queryByText('Услуга another_day')).toBeNull()
    const summary = within(agenda).getAllByText('Изменить часы', { exact: false, selector: 'summary' })[0]!
    fireEvent.click(summary)
    const details = summary.parentElement!
    details.setAttribute('open', '')
    fireEvent.click(within(details).getAllByRole('button', { name: /^Изменить рабочий период:/ })[0]!)
    expect(callbacks.onOpenPeriod).toHaveBeenCalledWith('master_olya_morning')
  })
})
