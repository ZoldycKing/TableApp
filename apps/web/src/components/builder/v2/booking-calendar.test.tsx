// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { instantToWallClock } from '@tableapp/schema'
import { bookingCalendarDays, type BookingCalendarSnapshot, type BookingCalendarVisit } from '@/lib/builder-v2-booking-calendar'
import { appV2Fixture } from './fixture.test-utils'
import { BookingCalendarDemoContext, BookingCalendarScreen } from './booking-calendar'
import { BookingWeekOverview } from './booking-calendar-views'
import { useState } from 'react'
import { BookingJourneyProvider } from './booking-journey'

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
function fixture() {
  const day = instantToWallClock(new Date(), 'Europe/Moscow')!.date, days = bookingCalendarDays(day, true)
  const masters = [{ id: 'master_olya', name: 'Оля' }, { id: 'master_zhenya', name: 'Женя' }, { id: 'master_natasha', name: 'Наташа' }]
  const visit = (id: string, resourceId: string, start: number, date = day, status = 'booked'): BookingCalendarVisit => ({ id, resourceId, start, end: start + 60, day: date, status, title: `Услуга ${id}`, subtitle: `Клиент ${id}`, amount: 1500 })
  const data: BookingCalendarSnapshot = {
    timeZone: 'Europe/Moscow', days, resources: masters, omitted: 0,
    shifts: masters.flatMap(master => days.map(date => ({ resourceId: master.id, day: date, windows: [{ id: `${master.id}_morning`, start: 540, end: 780 }, { id: `${master.id}_evening`, start: 840, end: 1140 }], closed: false, exception: false }))),
    events: [visit('early', masters[1]!.id, 540), visit('middle', masters[0]!.id, 600), visit('late', masters[2]!.id, 720), visit('another_day', masters[2]!.id, 540, days.find(date => date !== day)!), visit('cancelled', masters[0]!.id, 540, day, 'cancelled')],
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
function show(data: BookingCalendarSnapshot, width: number, onOpenVisit = vi.fn(), onOpenPeriod = vi.fn(), onCreate = vi.fn()) {
  resize(width)
  const app = appV2Fixture()
  render(<BookingCalendarDemoContext value={() => ({ ok: true, data })}><BookingCalendarScreen app={app} screenId={app.homeScreenId!} timeZone="Europe/Moscow" working onOpenVisit={onOpenVisit} onOpenPeriod={onOpenPeriod} onCreate={onCreate} /></BookingCalendarDemoContext>)
  return { onOpenVisit, onOpenPeriod, onCreate }
}
describe('one calendar for the whole team', () => {
  it('keeps bookings and working hours as separate actions of one calendar and restores the selected period',async()=>{
    const {data,day}=fixture(),create=vi.fn();resize(1200)
    function Harness(){const[settings,setSettings]=useState(false);return <BookingJourneyProvider><BookingCalendarDemoContext value={()=>({ok:true,data})}>{settings?<button onClick={()=>setSettings(false)}>Вернуться к календарю</button>:<BookingCalendarScreen app={appV2Fixture()} screenId="home" timeZone="Europe/Moscow" onOpenVisit={vi.fn()} onAdd={vi.fn()} onCreate={create} onConfigure={()=>setSettings(true)}/>}</BookingCalendarDemoContext></BookingJourneyProvider>}
    render(<Harness/>);await screen.findByLabelText('Календарь рабочих часов и записей')
    fireEvent.click(screen.getByRole('button',{name:'Неделя'}));await screen.findByRole('table')
    fireEvent.change(screen.getByRole('combobox',{name:'Мастер календаря'}),{target:{value:'master_zhenya'}})
    fireEvent.click(screen.getByRole('button',{name:'Настроить часы'}))
    expect(create).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button',{name:'Вернуться к календарю'}));await screen.findByRole('table')
    expect(screen.getByRole('button',{name:'Неделя'}).getAttribute('aria-pressed')).toBe('true')
    expect((screen.getByRole('combobox',{name:'Мастер календаря'})as HTMLSelectElement).value).toBe('master_zhenya')
    expect((screen.getByLabelText('Дата календаря')as HTMLInputElement).value).toBe(day)
    expect(screen.getByText(day.split('-').reverse().join('.'))).toBeTruthy()
    fireEvent.click(screen.getByRole('button',{name:'Записать'}))
    expect(create).toHaveBeenCalledWith({day,resourceId:'master_zhenya',resourceName:'Женя'})
  })
  it('keeps period editing out of the visit hit areas and out of a staff calendar',async()=>{
    const{data}=fixture(),edit=vi.fn();resize(1200)
    const view=render(<BookingCalendarDemoContext value={()=>({ok:true,data})}><BookingCalendarScreen app={appV2Fixture()} screenId="home" timeZone="Europe/Moscow" onOpenVisit={vi.fn()} onOpenPeriod={edit}/></BookingCalendarDemoContext>)
    await screen.findByLabelText('Календарь рабочих часов и записей')
    const summary=screen.getAllByText('09:00–19:00')[0]!,details=summary.closest('details')!
    details.setAttribute('open','');fireEvent.click(within(details).getAllByRole('button')[0]!)
    expect(edit).toHaveBeenCalledWith('master_olya_morning')
    expect(details.closest('[aria-label="Календарь рабочих часов и записей"]')).toBeTruthy()
    view.rerender(<BookingCalendarDemoContext value={()=>({ok:true,data})}><BookingCalendarScreen app={appV2Fixture()} screenId="home" timeZone="Europe/Moscow" onOpenVisit={vi.fn()}/></BookingCalendarDemoContext>)
    expect(screen.queryByRole('button',{name:'Настроить часы'})).toBeNull()
    expect(screen.queryByRole('button',{name:/Изменить часы/})).toBeNull()
    expect(screen.queryAllByText('09:00–19:00').some(item => item.closest('details'))).toBe(false)
  })
  it('defaults to all masters and opens the detailed day from the week header', async () => {
    const { data } = fixture()
    show(data, 1200)
    expect(await screen.findByLabelText('Календарь рабочих часов и записей')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'День' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Неделя' }))
    const table = await screen.findByRole('table', { name: 'Неделя всех мастеров' })
    expect(within(table).getAllByRole('rowheader')).toHaveLength(3)
    for (const master of data.resources) expect(within(table).getByRole('rowheader', { name: master.name })).toBeTruthy()
    expect(within(table).getAllByRole('cell')).toHaveLength(21)
    expect(within(table).getAllByRole('button', { name: /^Открыть запись:/ })).toHaveLength(4)
    expect((screen.getByRole('combobox', { name: 'Мастер календаря' }) as HTMLSelectElement).value).toBe('')
    fireEvent.click(within(table).getAllByRole('button', { name: /^Открыть день:/ })[0]!)
    const day = await screen.findByLabelText('Календарь рабочих часов и записей')
    expect(within(day).getAllByRole('region')).toHaveLength(3)
  })
  it('keeps filtering optional and opens the actual appointment', async () => {
    const { data } = fixture(), callbacks = show(data, 1200)
    fireEvent.click(screen.getByRole('button', { name: 'Неделя' }))
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
    data.events = Array.from({ length: 18 }, (_, index) => visit(`busy_${index}`, 'master_olya', 540 + index * 15))
    render(<BookingWeekOverview data={data} resourceId="" working editing={false} onOpenVisit={vi.fn()} onOpenDay={vi.fn()} />)
    expect(screen.getAllByRole('button', { name: /^Открыть запись:/ })).toHaveLength(18)
  })
  it('creates from a free working slot with the master/date/time, never from a break or occupied time', async () => {
    const { data, day } = fixture(), app = appV2Fixture(), onCreate = vi.fn()
    resize(1200)
    vi.spyOn(Date, 'now').mockReturnValue(new Date(`${day}T00:00:00Z`).getTime())
    render(<BookingCalendarDemoContext value={() => ({ ok: true, data })}><BookingCalendarScreen app={app} screenId={app.homeScreenId!} timeZone="Europe/Moscow" onOpenVisit={vi.fn()} onCreate={onCreate} /></BookingCalendarDemoContext>)
    const free = await screen.findByRole('button', { name: `Добавить запись: Оля, ${day}, 09:00` })
    fireEvent.click(free)
    expect(onCreate).toHaveBeenCalledWith({ resourceId: 'master_olya', resourceName: 'Оля', day, time: '09:00' })
    expect(screen.queryByRole('button', { name: `Добавить запись: Оля, ${day}, 13:00` })).toBeNull()
    expect(screen.queryByRole('button', { name: `Добавить запись: Оля, ${day}, 10:00` })).toBeNull()
  })
  it('returns a dragged appointment to its column when the new time is taken', async () => {
    const { data, day } = fixture(), onMove = vi.fn()
    resize(1200)
    const rect = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      if (this instanceof HTMLElement && this.dataset.calendarColumn !== undefined) {
        const index = this.dataset.resourceId === 'master_olya' ? 0 : this.dataset.resourceId === 'master_zhenya' ? 1 : 2
        return new DOMRect(index * 220, 80, 220, 672)
      }
      if (this instanceof HTMLButtonElement && this.getAttribute('aria-label')?.includes('Услуга middle')) return new DOMRect(10, 192, 200, 56)
      return new DOMRect(0, 0, 0, 0)
    })
    render(<BookingCalendarDemoContext value={() => ({ ok: true, data })}><BookingCalendarScreen app={appV2Fixture()} screenId="home" timeZone="Europe/Moscow" onOpenVisit={vi.fn()} onMove={onMove} /></BookingCalendarDemoContext>)
    const visit = await screen.findByRole('button', { name: /Услуга middle/ })
    fireEvent.pointerDown(visit, { button: 0, pointerId: 1, clientX: 100, clientY: 192 })
    fireEvent.pointerMove(visit, { pointerId: 1, clientX: 330, clientY: 136 })
    fireEvent.pointerUp(visit, { pointerId: 1, clientX: 330, clientY: 136 })
    expect((await screen.findByRole('alert')).textContent).toContain('Это время уже занято. Запись осталась на прежнем месте.')
    expect(onMove).not.toHaveBeenCalled()
    expect(visit.closest('[data-resource-id]')?.getAttribute('data-resource-id')).toBe('master_olya')
    expect(document.querySelector('[data-ghost]')).toBeNull()
    rect.mockRestore()
  })
  it('shows the server conflict and leaves the appointment in place', async () => {
    const { data, day } = fixture(), onMove = vi.fn(async () => ({ ok: false as const, error: 'Это время уже занято. Запись осталась на прежнем месте.' }))
    resize(1200)
    const rect = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      if (this instanceof HTMLElement && this.dataset.calendarColumn !== undefined) {
        const index = this.dataset.resourceId === 'master_olya' ? 0 : 1
        return new DOMRect(index * 220, 80, 220, 672)
      }
      if (this instanceof HTMLButtonElement && this.getAttribute('aria-label')?.includes('Услуга middle')) return new DOMRect(10, 192, 200, 56)
      return new DOMRect(0, 0, 0, 0)
    })
    render(<BookingCalendarDemoContext value={() => ({ ok: true, data })}><BookingCalendarScreen app={appV2Fixture()} screenId="home" timeZone="Europe/Moscow" onOpenVisit={vi.fn()} onMove={onMove} /></BookingCalendarDemoContext>)
    const visit = await screen.findByRole('button', { name: /Услуга middle/ })
    fireEvent.pointerDown(visit, { button: 0, pointerId: 1, clientX: 100, clientY: 192 })
    fireEvent.pointerMove(visit, { pointerId: 1, clientX: 100, clientY: 136 })
    fireEvent.pointerUp(visit, { pointerId: 1, clientX: 100, clientY: 136 })
    expect((await screen.findByRole('alert')).textContent).toContain('Запись осталась на прежнем месте.')
    expect(onMove).toHaveBeenCalledWith('middle', { resourceId: 'master_olya', day, time: '09:00' })
    expect(visit.closest('[data-resource-id]')?.getAttribute('data-resource-id')).toBe('master_olya')
    rect.mockRestore()
  })
  it('shows one employee on a phone and the whole day as a list', async () => {
    const { data } = fixture(), callbacks = show(data, 300)
    await screen.findByLabelText('Календарь рабочих часов и записей')
    await waitFor(() => expect(within(screen.getByLabelText('Календарь рабочих часов и записей')).getAllByRole('region')).toHaveLength(1))
    fireEvent.click(screen.getByRole('tab', { name: /Женя/ }))
    expect(within(screen.getByLabelText('Календарь рабочих часов и записей')).getByRole('region', { name: /Женя/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Список' }))
    await waitFor(() => expect(document.querySelector('[data-calendar-agenda]')).not.toBeNull())
    const agenda = document.querySelector('[data-calendar-agenda]') as HTMLElement
    const visits = within(agenda).getAllByRole('button', { name: /^Открыть запись:/ })
    expect(visits.map(button => button.textContent)).toEqual(expect.arrayContaining([expect.stringContaining('Женя'), expect.stringContaining('Оля'), expect.stringContaining('Наташа')]))
    expect(visits[0]!.textContent).toContain('09:00–10:00')
    expect(visits).toHaveLength(3)
    expect(within(agenda).queryByText('Услуга another_day')).toBeNull()
    const summary = within(agenda).getAllByText('09:00–19:00')[0]!
    fireEvent.click(summary)
    const details = summary.closest('details')!
    details.setAttribute('open', '')
    fireEvent.click(within(details).getAllByRole('button', { name: /^Изменить рабочий период:/ })[0]!)
    expect(callbacks.onOpenPeriod).toHaveBeenCalledWith('master_olya_morning')
  })
  it('sums the chosen day and master, leaving out another day and a no-show', async () => {
    const { data, day, visit } = fixture()
    const other = data.days.find(date => date !== day)!
    data.events = [
      { ...visit('today', 'master_olya', 600, day), amount: 2500 },
      { ...visit('missed', 'master_zhenya', 660, day, 'noShow'), amount: 9000 },
      { ...visit('later', 'master_olya', 600, other), amount: 7000 },
    ]
    resize(1200)
    render(<BookingCalendarDemoContext value={() => ({ ok: true, data })}><BookingCalendarScreen app={appV2Fixture()} screenId="home" timeZone="Europe/Moscow" onOpenVisit={vi.fn()} /></BookingCalendarDemoContext>)
    const amount = (value: string) => (_: string, node: Element | null) => node?.tagName === 'P' && (node.textContent ?? '').replace(/[\s\u00a0\u202f]/g, '') === value
    expect(await screen.findByText(amount('2500₽'))).toBeTruthy()
    fireEvent.change(screen.getByRole('combobox', { name: 'Мастер календаря' }), { target: { value: 'master_zhenya' } })
    expect(screen.getByText(amount('0₽'))).toBeTruthy()
    expect(screen.queryByText(amount('2500₽'))).toBeNull()
  })
})
