import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { dateInstant, instantToWallClock } from '@tableapp/schema'
import type { AppV2Actor, AppV2Record } from '@tableapp/schema/app-v2'
import { expect, it } from 'vitest'
import type { BuilderV2DataRecord } from './builder-v2-data-types'
import { applyDemoCalendarMove } from './team-calendar-demo-move'
import { bookingTemplateDemoModel } from '@/components/marketing/booking-template-demo'
import { templateExample } from './templates/presentation'

const model = bookingTemplateDemoModel(templateExample('salon'))
const booking = model.app.booking!
const node = model.app.nodes.find(item => item.type === 'team_calendar')
if (node?.type !== 'team_calendar' || !node.data) throw new Error('Нет календаря')
const calendar = node
const actor: AppV2Actor = { authenticated: true, id: 'demo_owner', roleIds: ['owner'], email: 'owner@example.com', name: 'Анна', company: '' }
const format = (row: AppV2Record): BuilderV2DataRecord => ({
  ...row,
  display: Object.fromEntries(Object.entries(row.values).map(([id, value]) => [id, Array.isArray(value) ? value.join(', ') : String(value ?? '')])),
})
const visit = (name: string) => model.rows.find(row => row.tableId === booking.tables.visits && row.values[booking.visit.client] === name)!
const master = (name: string) => model.rows.find(row => row.tableId === booking.tables.masters && row.values[booking.master.name] === name)!
const move = (rows: readonly AppV2Record[], eventId: string, resourceId: string, day: string, time: string, role: AppV2Actor = actor) => applyDemoCalendarMove({
  app: model.app, actor: role, node: calendar, rows, format, eventId, resourceId, day, time, timeZone: 'Europe/Moscow', screenId: booking.listScreenId!,
})

it('moves a teaching visit locally and keeps the same conflict and hours checks', () => {
  const anna = visit('Анна В.')
  const olya = master('Оля')
  const zhenya = master('Женя')
  const wall = instantToWallClock(String(anna.values[booking.visit.start]), 'Europe/Moscow')!
  const original = anna.values[booking.visit.start]
  const moved = move(model.rows, anna.id, olya.id, wall.date, '10:00')
  expect(moved.ok).toBe(true)
  if (!moved.ok) return
  expect(moved.unchanged).toBeUndefined()
  expect(instantToWallClock(String(moved.rows.find(row => row.id === anna.id)!.values[booking.visit.start]), 'Europe/Moscow')!.time).toBe('10:00')
  expect(anna.values[booking.visit.start]).toBe(original)
  expect(moved.rows.find(row => row.id === anna.id)!.values[booking.visit.masterEmail]).toBe('olga@example.com')

  const same = move(model.rows, anna.id, olya.id, wall.date, wall.time)
  expect(same.ok && same.unchanged).toBe(true)

  const blockedStart = new Date(dateInstant(`${wall.date}T10:00`, 'Europe/Moscow')!).toISOString()
  const blocked = move([...model.rows, { id: 'blocker', tableId: booking.tables.visits, values: { ...anna.values, [booking.visit.start]: blockedStart, [booking.visit.client]: 'Блок' } }], anna.id, olya.id, wall.date, '10:00')
  expect(blocked).toEqual({ ok: false, error: 'Это время уже занято. Запись осталась на прежнем месте.' })

  const lunch = move(model.rows, anna.id, olya.id, wall.date, '13:00')
  expect(lunch).toEqual({ ok: false, error: 'Это время вне рабочих часов. Запись осталась на прежнем месте.' })

  const otherCraft = move(model.rows, anna.id, zhenya.id, wall.date, '10:00')
  expect(otherCraft).toEqual({ ok: false, error: 'Выбранный мастер не оказывает эту услугу.' })

  const guest = move(model.rows, anna.id, olya.id, wall.date, '10:00', { ...actor, roleIds: ['client'] })
  expect(guest).toEqual({ ok: false, error: 'Переносить записи может только выбранная роль.' })
})

it('attaches the studio portraits to masters and clients in the gallery preview', () => {
  const olya = model.rows.find(row => row.values[booking.master.name] === 'Оля')!
  const clientPhoto = booking.clients?.photo
  if (!clientPhoto) throw new Error('Нет поля фото клиента')
  const irina = model.rows.find(row => row.tableId === booking.clients!.tableId && row.values[booking.clients!.name] === 'Ирина П.')!
  const service = model.rows.find(row => row.tableId === booking.tables.services && row.values[booking.service.name] === 'Женская стрижка')!
  expect(olya.values[booking.masterPhotoFieldId!]).toBe('/template-media/salon/salon-olya.jpg')
  expect(master('Женя').values[booking.masterPhotoFieldId!]).toBe('/template-media/salon/salon-zhenya.jpg')
  expect(master('Наташа').values[booking.masterPhotoFieldId!]).toBe('/template-media/salon/salon-natasha.jpg')
  expect(irina.values[clientPhoto]).toBe('/template-media/salon/salon-irina.jpg')
  expect(service.values[booking.servicePhotoFieldId]).toBe('/template-media/booking/haircut.webp')
  const file = join(process.cwd(), 'apps/web/public/template-media/salon/salon-olya.jpg')
  expect(existsSync(file)).toBe(true)
})
