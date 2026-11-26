// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { instantToWallClock } from '@tableapp/schema'
import type { AppV2 } from '@tableapp/schema/app-v2'
import { BookingTemplateDemo, bookingTemplateDemoModel } from '@/components/marketing/booking-template-demo'
import { templateExample } from '@/lib/templates/presentation'
import { calendarDays } from '@/lib/team-calendar-core'
import { BuilderV2TeamCalendar, TeamCalendarDemoContext, TeamCalendarDemoMoveContext } from './team-calendar'
import { PublishedV2Context, type PublishedV2Transport } from './published-context'

vi.mock('@/app/team-calendar-actions', () => ({
  movePublishedTeamCalendarAction: vi.fn(async () => ({ ok: false, error: 'Приложение недоступно.' })),
  moveBuilderTeamCalendarAction: vi.fn(async () => ({ ok: true })),
  readPublishedTeamCalendarAction: vi.fn(async () => ({ ok: false, error: 'Приложение недоступно.' })),
  readBuilderTeamCalendarAction: vi.fn(async () => ({ ok: false, error: 'Календарь недоступен.' })),
}))

import { moveBuilderTeamCalendarAction, movePublishedTeamCalendarAction } from '@/app/team-calendar-actions'

const example = templateExample('salon')
const preview = bookingTemplateDemoModel(example)
const booking = preview.app.booking!
const node = preview.app.nodes.find(item => item.type === 'team_calendar')
if (node?.type !== 'team_calendar') throw new Error('Нет календаря')
const calendar = node
const actor = { authenticated: true, id: 'owner', roleIds: ['owner'], email: 'owner@example.com', name: 'Автор', company: '' }

beforeEach(() => {
  vi.mocked(movePublishedTeamCalendarAction).mockClear()
  vi.mocked(moveBuilderTeamCalendarAction).mockClear()
  vi.stubGlobal('ResizeObserver', class { constructor(private callback: ResizeObserverCallback) {} observe() { this.callback([{ contentRect: { width: 1200 } }] as ResizeObserverEntry[], this as unknown as ResizeObserver) } disconnect() {} })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

function columnRects() {
  return vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    if (this instanceof HTMLElement && this.dataset.calendarColumn !== undefined) {
      const index = Math.max(0, [...document.querySelectorAll('[data-calendar-column]')].indexOf(this))
      return new DOMRect(index * 220, 80, 220, 672)
    }
    if (this instanceof HTMLButtonElement && this.getAttribute('aria-label')?.startsWith('Открыть запись:')) return new DOMRect(10, 400, 200, 56)
    return new DOMRect(0, 0, 0, 0)
  })
}

it('moves a gallery preview visit without a published application', async () => {
  const anna = preview.rows.find(row => row.values[booking.visit.client] === 'Анна В.')!
  const day = instantToWallClock(String(anna.values[booking.visit.start]), 'Europe/Moscow')!.date
  render(<BookingTemplateDemo example={example} view="team" />)
  fireEvent.change(await screen.findByLabelText('Дата календаря'), { target: { value: day.split('-').reverse().join('.') } })
  const visit = await screen.findByRole('button', { name: /Анна В\./ })
  const rects = columnRects()
  fireEvent.pointerDown(visit, { button: 0, pointerId: 1, clientX: 100, clientY: 400 })
  fireEvent.pointerMove(visit, { pointerId: 1, clientX: 100, clientY: 192 })
  fireEvent.pointerUp(visit, { pointerId: 1, clientX: 100, clientY: 192 })
  expect(await screen.findByText('Запись перенесена.')).toBeTruthy()
  expect((await screen.findByRole('button', { name: /Анна В\./ })).getAttribute('aria-label')).toContain('10:00')
  expect(movePublishedTeamCalendarAction).not.toHaveBeenCalled()
  expect(moveBuilderTeamCalendarAction).not.toHaveBeenCalled()
  expect(screen.queryByText('Приложение недоступно.')).toBeNull()
  rects.mockRestore()
})

it('opens a new visit from a preview slot without asking the server', async () => {
  const tomorrow = instantToWallClock(new Date(Date.now() + 86400000), 'Europe/Moscow')!.date
  render(<BookingTemplateDemo example={example} view="team" />)
  fireEvent.change(await screen.findByLabelText('Дата календаря'), { target: { value: tomorrow.split('-').reverse().join('.') } })
  fireEvent.click(await screen.findByRole('button', { name: new RegExp(`Оля, ${tomorrow}, 09:00`) }))
  expect(await screen.findByRole('dialog', { name: 'Новая запись' })).toBeTruthy()
  expect(await screen.findByPlaceholderText('Найти услугу')).toBeTruthy()
  expect(screen.queryByText('Приложение недоступно.')).toBeNull()
  expect(movePublishedTeamCalendarAction).not.toHaveBeenCalled()
})

it('writes a builder move through the draft action', async () => {
  const day = instantToWallClock(new Date(), 'Europe/Moscow')!.date
  const data = {
    timeZone: 'Europe/Moscow', days: [day], omitted: 0,
    resources: [{ id: 'person', name: 'Анна' }],
    shifts: [{ resourceId: 'person', day, windows: [{ id: 'shift', start: 540, end: 1140 }], exception: false, closed: false }],
    events: [{ id: 'event', resourceId: 'person', day, start: 600, end: 660, title: 'Консультация', subtitle: 'Иван', status: 'booked', amount: null }],
  }
  const app = { ...preview.app } as AppV2
  render(<TeamCalendarDemoContext value={(_node, query) => ({ ok: true, data: { ...data, days: calendarDays(query.day, query.week) } })}><BuilderV2TeamCalendar app={app} node={calendar} screenId={booking.listScreenId!} actor={actor} tables={[]} /></TeamCalendarDemoContext>)
  const visit = await screen.findByRole('button', { name: /Консультация/ })
  const rects = columnRects()
  fireEvent.pointerDown(visit, { button: 0, pointerId: 1, clientX: 100, clientY: 400 })
  fireEvent.pointerMove(visit, { pointerId: 1, clientX: 100, clientY: 136 })
  fireEvent.pointerUp(visit, { pointerId: 1, clientX: 100, clientY: 136 })
  expect(await screen.findByText('Запись перенесена.')).toBeTruthy()
  expect(moveBuilderTeamCalendarAction).toHaveBeenCalledWith(app.id, app, expect.objectContaining({ eventId: 'event', resourceId: 'person', time: '09:00' }))
  expect(movePublishedTeamCalendarAction).not.toHaveBeenCalled()
  const published = { slug: 'online-booking-example', revision: 'live' } as PublishedV2Transport
  cleanup()
  render(<PublishedV2Context value={published}><TeamCalendarDemoContext value={() => ({ ok: true, data })}><BuilderV2TeamCalendar app={app} node={calendar} screenId={booking.listScreenId!} actor={actor} tables={[]} /></TeamCalendarDemoContext></PublishedV2Context>)
  const again = await screen.findByRole('button', { name: /Консультация/ })
  fireEvent.pointerDown(again, { button: 0, pointerId: 1, clientX: 100, clientY: 400 })
  fireEvent.pointerMove(again, { pointerId: 1, clientX: 100, clientY: 136 })
  fireEvent.pointerUp(again, { pointerId: 1, clientX: 100, clientY: 136 })
  expect(await screen.findByText('Приложение недоступно.')).toBeTruthy()
  expect(movePublishedTeamCalendarAction).toHaveBeenCalledWith('online-booking-example', expect.objectContaining({ eventId: 'event', revision: 'live' }))
  rects.mockRestore()
})

it('keeps a preview move local even when the demo transport looks published', async () => {
  const day = instantToWallClock(new Date(), 'Europe/Moscow')!.date
  const data = {
    timeZone: 'Europe/Moscow', days: [day], omitted: 0,
    resources: [{ id: 'person', name: 'Анна', photo: '/template-media/salon/salon-olya.jpg' }],
    shifts: [{ resourceId: 'person', day, windows: [{ id: 'shift', start: 540, end: 1140 }], exception: false, closed: false }],
    events: [{ id: 'event', resourceId: 'person', day, start: 600, end: 660, title: 'Консультация', subtitle: 'Иван', status: 'booked', amount: null }],
  }
  const moved = vi.fn(async () => ({ ok: true as const }))
  const published = { slug: 'online-booking-example', revision: 'demo' } as PublishedV2Transport
  render(<PublishedV2Context value={published}><TeamCalendarDemoContext value={() => ({ ok: true, data })}><TeamCalendarDemoMoveContext value={moved}><BuilderV2TeamCalendar app={preview.app} node={calendar} screenId={booking.listScreenId!} actor={actor} tables={[]} /></TeamCalendarDemoMoveContext></TeamCalendarDemoContext></PublishedV2Context>)
  const visit = await screen.findByRole('button', { name: /Консультация/ })
  expect(document.querySelector('img[src="/template-media/salon/salon-olya.jpg"]')).toBeTruthy()
  const rects = columnRects()
  fireEvent.pointerDown(visit, { button: 0, pointerId: 1, clientX: 100, clientY: 400 })
  fireEvent.pointerMove(visit, { pointerId: 1, clientX: 100, clientY: 136 })
  fireEvent.pointerUp(visit, { pointerId: 1, clientX: 100, clientY: 136 })
  expect(await screen.findByText('Запись перенесена.')).toBeTruthy()
  expect(moved).toHaveBeenCalledWith('event', { resourceId: 'person', day, time: '09:00' })
  expect(movePublishedTeamCalendarAction).not.toHaveBeenCalled()
  rects.mockRestore()
})
