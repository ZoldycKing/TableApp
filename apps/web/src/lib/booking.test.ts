import { describe, expect, it } from 'vitest'
import { asRole, ANONYMOUS, visibleScreensFor } from './app-roles'
import { checkAppReferences } from './app-references'
import { templateExample } from './templates/presentation'
import { assignFreeMaster, dedupeBookingSlots, freeBookingSlots, groupBookingSlots, workingWindows, slotError, type BookingData, type BookingSlot } from './booking'
import { projectRuntime } from './runtime-project'

describe('complete salon preset and availability', () => {
  const now = new Date('2026-10-09T05:00:00Z'), example = templateExample('salon', now), config = example.app.booking!
  const data: BookingData = { services: example.rows.filter(row => row.tableId === config.tables.services),
    masters: example.rows.filter(row => row.tableId === config.tables.masters), schedule: example.rows.filter(row => row.tableId === config.tables.schedule),
    visits: example.rows.filter(row => row.tableId === config.tables.visits), timeZone: 'Europe/Moscow' }
  const serviceId = data.services[0]!.id, masterId = data.masters[0]!.id, day = '2026-10-12'
  it('has valid tenant references and exposes prices and durations without employee emails or private notes', () => {
    expect(checkAppReferences(example.app, { tableIds: new Set(example.built.tables.map(row => row.id)),
      fields: new Map(example.fields.map(field => [field.id, field])), views: new Map(example.views.map(view => [view.id, view])) })).toBeNull()
    const visitor = asRole('client', 'irina@example.com', '', true)
    const project = (person: typeof visitor) => projectRuntime({ ...example.app, screens: visibleScreensFor(example.app, person) }, person,
      Object.fromEntries(example.views.map(view => [view.id, view])), example.built.tables, example.byTable,
      example.built.rows.map(row => ({ ...row, version: 0, createdAt: now, updatedAt: now, createdBy: null, updatedBy: null })), new Map(example.built.tables.map(table => [table.id, table.primaryFieldId])))
    const runtime = project(visitor)
    expect(runtime.tables[config.tables.visits]!.rows).toHaveLength(2)
    expect(runtime.tables[config.tables.services]!.rows).toHaveLength(5)
    expect(JSON.stringify(runtime)).not.toContain('просила чуть теплее')
    expect(JSON.stringify(runtime)).not.toContain('olga@example.com')
    expect(project(ANONYMOUS).tables[config.tables.visits]?.rows ?? []).toEqual([])
    expect(project(ANONYMOUS).app.screens.filter(screen => screen.tab)).toHaveLength(1)
    expect(project(ANONYMOUS).app.screens.some(screen => screen.type === 'form')).toBe(false)
    const foreign = structuredClone(example.app); foreign.booking!.tables.masters = 'foreign-table'
    expect(checkAppReferences(foreign, { tableIds: new Set(example.built.tables.map(row => row.id)), fields: new Map(example.fields.map(field => [field.id, field])), views: new Map(example.views.map(view => [view.id, view])) })).not.toBeNull()
  })
  it('fits the whole duration inside windows, excludes lunch and checks overlap instead of only start times', () => {
    const slots = freeBookingSlots(config, data, { serviceId, day, masterId, now })
    expect(slots.some(slot => slot.time === '12:00')).toBe(true)
    expect(slots.some(slot => slot.time === '12:15')).toBe(false)
    expect(slots.some(slot => slot.time === '13:00')).toBe(false)
    expect(slots.some(slot => slot.time === '18:15')).toBe(false)
    const occupied = structuredClone(data)
    occupied.visits.push({ id: 'occupied', data: { [config.visit.master]: [masterId], [config.visit.start]: `${day}T07:00:00Z`, [config.visit.minutes]: 60, [config.visit.status]: config.statuses.booked } })
    expect(freeBookingSlots(config, occupied, { serviceId, day, masterId, now }).some(slot => slot.time === '09:15')).toBe(false)
    occupied.visits.at(-1)!.data[config.visit.status] = config.statuses.cancelled
    expect(freeBookingSlots(config, occupied, { serviceId, day, masterId, now }).some(slot => slot.time === '09:15')).toBe(true)
  })
  it('replaces weekly windows with dated exceptions, blocks days off and applies timezone, lead time and horizon', () => {
    const changed = structuredClone(data)
    changed.timeZone = 'Asia/Novosibirsk'
    changed.schedule.push({ id: 'exception', data: { [config.schedule.master]: [masterId], [config.schedule.date]: day, [config.schedule.start]: '10:00', [config.schedule.end]: '12:00' } })
    expect(workingWindows(config, changed, masterId, day)).toEqual([{ start: 600, end: 720 }])
    const slots = freeBookingSlots(config, changed, { serviceId, day, masterId, now })
    expect(slots[0]).toMatchObject({ start: `${day}T03:00:00.000Z`, time: '10:00' })
    changed.schedule.at(-1)!.data[config.schedule.closed] = true
    expect(freeBookingSlots(config, changed, { serviceId, day, masterId, now })).toEqual([])
    expect(slotError(config, data, { serviceId, masterId, start: '2026-10-09T05:30:00Z', now })).toContain('периоде')
    expect(freeBookingSlots(config, data, { serviceId, day: '2027-10-10', masterId, now })).toEqual([])
    expect(freeBookingSlots(config, data, { serviceId, day: '2026-02-30', masterId, now })).toEqual([])
  })
  it('shows each start once and hides empty parts of the day', () => {
    const start = `${day}T08:00:00.000Z`
    const slots: BookingSlot[] = [
      { start, time: '11:00', masterId: 'm_nat', masterName: 'Наташа' },
      { start, time: '11:00', masterId: 'm_olya', masterName: 'Оля' },
      { start: `${day}T06:00:00.000Z`, time: '09:00', masterId: 'm_olya', masterName: 'Оля' },
      { start: `${day}T15:00:00.000Z`, time: '18:00', masterId: 'm_nat', masterName: 'Наташа' },
    ]
    expect(dedupeBookingSlots(slots).map(slot => slot.time)).toEqual(['11:00', '09:00', '18:00'])
    expect(groupBookingSlots(slots).map(group => [group.title, group.slots.map(slot => slot.time)])).toEqual([['Утро', ['11:00', '09:00']], ['Вечер', ['18:00']]])
    expect(groupBookingSlots(slots, 'm_olya').map(group => group.slots.map(slot => `${slot.time} ${slot.masterName}`))).toEqual([['11:00 Оля', '09:00 Оля']])
    expect(groupBookingSlots([{ start: `${day}T09:00:00.000Z`, time: '12:00', masterId: 'm', masterName: 'Оля' }, { start: `${day}T14:00:00.000Z`, time: '17:00', masterId: 'm', masterName: 'Оля' }]).map(group => group.title)).toEqual(['День', 'Вечер'])
  })
  it('assigns the least busy free master, then name order, and still rejects a taken time', () => {
    const haircut = data.services.find(row => row.data[config.service.name] === 'Женская стрижка')!
    const olya = data.masters.find(row => row.data[config.master.name] === 'Оля')!
    const natasha = data.masters.find(row => row.data[config.master.name] === 'Наташа')!
    const start = `${day}T08:00:00.000Z`
    expect(assignFreeMaster(config, data, { serviceId: haircut.id, start, now })).toEqual({ ok: true, masterId: natasha.id })
    const busy = structuredClone(data)
    busy.visits.push(
      { id: 'natasha-1', data: { [config.visit.master]: [natasha.id], [config.visit.start]: `${day}T06:00:00.000Z`, [config.visit.minutes]: 60, [config.visit.status]: config.statuses.booked } },
      { id: 'natasha-2', data: { [config.visit.master]: [natasha.id], [config.visit.start]: `${day}T12:00:00.000Z`, [config.visit.minutes]: 60, [config.visit.status]: config.statuses.booked } },
    )
    expect(assignFreeMaster(config, busy, { serviceId: haircut.id, start, now })).toEqual({ ok: true, masterId: olya.id })
    busy.visits.push({ id: 'olya-slot', data: { [config.visit.master]: [olya.id], [config.visit.start]: start, [config.visit.minutes]: 60, [config.visit.status]: config.statuses.booked } })
    expect(assignFreeMaster(config, busy, { serviceId: haircut.id, start, now })).toEqual({ ok: true, masterId: natasha.id })
    busy.visits.push({ id: 'natasha-slot', data: { [config.visit.master]: [natasha.id], [config.visit.start]: start, [config.visit.minutes]: 60, [config.visit.status]: config.statuses.booked } })
    expect(assignFreeMaster(config, busy, { serviceId: haircut.id, start, now }).ok).toBe(false)
  })
})
