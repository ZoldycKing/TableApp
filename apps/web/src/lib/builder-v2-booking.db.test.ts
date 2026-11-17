import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { eq, inArray } from 'drizzle-orm'
import { newId, calendarDay, instantToWallClock, planOf, graceReserve } from '@tableapp/schema'
import { buildTemplate } from './templates/build'
import { findTemplate } from './templates/catalog'
import { buildBookingV2App } from './templates/booking-v2'
import { builderV2Revision } from './builder-v2-revision'
import type { AppV2Json } from '@tableapp/schema/app-v2'
const rowData = (row: { data: unknown }) => row.data as Record<string, AppV2Json>

const identity = vi.hoisted(() => ({ email: 'irina@example.com' }))
vi.mock('@/lib/app-session', () => ({ currentStaffEmail: async () => identity.email }))
vi.mock('@/lib/session', () => ({ currentAccount: async () => null }))
vi.mock('@/lib/live', () => ({ publishTable: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

describe.skipIf(!process.env.DATABASE_URL)('native v2 booking transactions', () => {
  const userId = newId('user'), workspaceId = newId('workspace')
  const built = buildTemplate({ template: findTemplate('salon')!, workspaceId })
  const app = buildBookingV2App(built, { id: newId('app'), workspaceId, name: 'Тихая студия', slug: `booking-${workspaceId.replaceAll('_', '-')}`, email: 'owner@example.com' })
  const config = app.booking!
  app.authentication.members.push({ email: 'olga@example.com', roleIds: ['staff'], company: '' })
  const service = built.rows.find(row => row.tableId === config.tables.services)!
  let db: typeof import('@tableapp/db'), write: typeof import('./builder-v2-published-write'), availability: typeof import('@/app/builder-v2-booking-actions')
  const day = instantToWallClock(new Date(Date.now() + 2 * 86400000), 'Europe/Moscow')!.date
  const liveRevision = () => builderV2Revision(app)
  const scope = { screenId: config.formScreenId, formId: config.createFormId, recordId: service.id }
  async function draft(email: string, slot?: { start: string; masterId: string }) {
    identity.email = email
    const available = await availability.readPublishedV2BookingAction(app.slug, { screenId: scope.screenId, recordId: service.id, day, revision: liveRevision() })
    if (!available.ok || !available.slots.length) throw new Error(JSON.stringify(available))
    const chosen = slot ?? available.slots[0]!
    const initial = await write.inspectPublishedV2FormRequest(app.slug, { ...scope, revision: liveRevision(), mode: 'initial' })
    if (!initial.ok || !('state' in initial) || !initial.state) throw new Error(JSON.stringify(initial))
    return { ...scope, revision: liveRevision(), fingerprint: initial.state.fingerprint, requestId: newId('action'), values: { [config.visit.client]: email.split('@')[0]!, [config.visit.phone]: '+7 916 555-11-22', [config.visit.master]: [chosen.masterId], [config.visit.start]: chosen.start } }
  }
  beforeAll(async () => {
    db = await import('@tableapp/db'); write = await import('./builder-v2-published-write'); availability = await import('@/app/builder-v2-booking-actions')
    await db.db.insert(db.users).values({ id: userId, email: `${userId}@example.com` })
    await db.db.insert(db.workspaces).values({ id: workspaceId, name: 'Booking isolated test', slug: workspaceId, ownerId: userId, plan: 'business' })
    await db.db.insert(db.tables).values(built.tables)
    await db.db.insert(db.fields).values(built.fields)
    await db.db.insert(db.views).values(built.views)
    await db.db.insert(db.rows).values(built.rows.map(row => ({ ...row, createdBy: userId, updatedBy: userId })))
    await db.db.insert(db.apps).values({ id: app.id, workspaceId, name: app.name, slug: app.slug, draft: app, published: app, theme: app.theme, accessMode: 'allowlist', homeScreenId: app.homeScreenId })
  })
  afterAll(async () => { if (db) { await db.db.delete(db.workspaces).where(eq(db.workspaces.id, workspaceId)); await db.db.delete(db.users).where(eq(db.users.id, userId)) } })

  it('serves a bounded team calendar with the same row policy and without contact details', async () => {
    const request = { screenId: config.listScreenId!, day, week: true, revision: liveRevision() }
    identity.email = 'owner@example.com'
    const owner = await availability.readPublishedV2BookingCalendarAction(app.slug, request)
    expect(owner.ok, JSON.stringify(owner)).toBe(true)
    if (owner.ok) {
      expect(owner.data.days).toHaveLength(7)
      expect(owner.data.resources).toHaveLength(3)
      expect(owner.data.shifts).toHaveLength(21)
      expect(JSON.stringify(owner)).not.toContain('@example.com')
      expect(JSON.stringify(owner)).not.toContain('+7')
    }
    identity.email = 'olga@example.com'
    const staff = await availability.readPublishedV2BookingCalendarAction(app.slug, request)
    expect(staff.ok && staff.data.resources).toHaveLength(1)
    expect(staff.ok && staff.data.shifts.every(shift => shift.windows === null)).toBe(true)
    expect(await availability.readPublishedV2BookingCalendarAction(app.slug, { ...request, screenId: config.setupScreenId })).toMatchObject({ ok: false })
    identity.email = 'irina@example.com'
    expect(await availability.readPublishedV2BookingCalendarAction(app.slug, request)).toMatchObject({ ok: false })
    identity.email = 'owner@example.com'
    expect(await availability.readPublishedV2BookingCalendarAction(app.slug, { ...request, revision: 'outdated' })).toMatchObject({ ok: false })
  })

  it('restricts the people endpoint to the published owner and current revision', async () => {
    const people = await import('@/app/builder-v2-booking-people-actions')
    identity.email = 'owner@example.com'
    const result = await people.readPublishedV2BookingPeopleAction(app.slug, config.mastersScreenId, liveRevision())
    expect(result.ok, JSON.stringify(result)).toBe(true)
    if (result.ok) expect(result.data.masters).toHaveLength(3)
    expect((await people.readPublishedV2BookingPeopleAction(app.slug, config.mastersScreenId, 'outdated')).ok).toBe(false)
    for (const email of ['olga@example.com','irina@example.com','unknown@example.com']) {
      identity.email = email
      expect((await people.readPublishedV2BookingPeopleAction(app.slug, config.mastersScreenId, liveRevision())).ok).toBe(false)
    }
  })

  it('creates and edits a standalone client while keeping visit history on its stable ID', async () => {
    identity.email = 'owner@example.com'
    const c = config.clients!, people = await import('@/app/builder-v2-booking-people-actions')
    const createScope = { screenId: config.customersScreenId!, formId: config.customerCreateFormId!, revision: liveRevision() }
    const initial = await write.inspectPublishedV2FormRequest(app.slug, { ...createScope, mode: 'initial' })
    if (!initial.ok || !('state' in initial) || !initial.state) throw new Error(JSON.stringify(initial))
    expect((await write.submitPublishedV2(app.slug, 'form', { ...createScope, fingerprint: initial.state.fingerprint, requestId: newId('action'), values: { [c.name]: 'Новый клиент', [c.phone]: '+7 900 123-45-67', [c.email]: 'new-client@example.com', [c.note]: 'Предпочитает утро' } })).ok).toBe(true)
    const directory = await people.readPublishedV2BookingPeopleAction(app.slug, config.customersScreenId!, liveRevision())
    expect(directory.ok && directory.data.clients.some(client => client.name === 'Новый клиент' && client.persistent)).toBe(true)
    const client = built.rows.find(row => row.tableId === c.tableId && row.data[c.email] === 'irina@example.com')!
    const editScope = { screenId: config.customerScreenId!, formId: config.customerEditFormId!, recordId: client.id, revision: liveRevision() }
    const edit = await write.inspectPublishedV2FormRequest(app.slug, { ...editScope, mode: 'initial' })
    if (!edit.ok || !('state' in edit) || !edit.state) throw new Error(JSON.stringify(edit))
    expect((await write.submitPublishedV2(app.slug, 'form', { ...editScope, fingerprint: edit.state.fingerprint, requestId: newId('action'), values: { [c.name]: 'Ирина Новое Имя', [c.phone]: '+7 900 777-66-55', [c.email]: 'irina@example.com', [c.note]: 'Новые заметки' } })).ok).toBe(true)
    const updated = await people.readPublishedV2BookingPeopleAction(app.slug, config.customersScreenId!, liveRevision())
    expect(updated.ok && updated.data.clients.find(item => item.id === client.id)).toMatchObject({ name: 'Ирина Новое Имя', phone: '+7 900 777-66-55', note: 'Новые заметки' })
    expect(updated.ok && updated.data.visits.filter(visit => visit.clientId === client.id)).toHaveLength(2)
  })

  it('reads configurable profile bindings and related history through the same protected published data path', async () => {
    const { readPublishedV2Data, readPublishedV2Record } = await import('./builder-v2-published-data')
    const { builderV2ScreenFields } = await import('./builder-v2-record')
    const c = config.clients!, client = built.rows.find(row => row.tableId === c.tableId && row.data[c.email] === 'irina@example.com')!
    const history = app.nodes.find(node => node.type === 'collection' && node.layout === 'history')!
    const scope = { screenId: config.customerScreenId!, recordId: client.id, revision: liveRevision() }
    expect([...builderV2ScreenFields(app,scope.screenId)]).toEqual(expect.arrayContaining([c.name,c.phone,c.email]))
    identity.email = 'owner@example.com'
    const profile = await readPublishedV2Record(app.slug,scope)
    expect(profile.record.values).toMatchObject({ [c.name]: 'Ирина Новое Имя', [c.phone]: '+7 900 777-66-55' })
    const page = await readPublishedV2Data(app.slug,{ ...scope, nodeId: history.id })
    expect(page.total).toBe(2)
    expect(page.rows.map(row => row.id).sort()).toEqual(built.rows.filter(row => row.tableId === config.tables.visits && (row.data[c.linkFieldId] as string[])?.includes(client.id)).map(row=>row.id).sort())
    expect(page.rows.some(row=>row.values[config.visit.note])).toBe(true)
    const metric = app.nodes.find(node => node.type === 'metric' && node.format === 'currency')!
    expect((await readPublishedV2Data(app.slug,{ ...scope,nodeId:metric.id })).value).toBe(2500)
    for (const email of ['olga@example.com','irina@example.com','other@example.com']) {
      identity.email=email
      await expect(readPublishedV2Data(app.slug,{ ...scope,nodeId:history.id })).rejects.toThrow()
      await expect(readPublishedV2Record(app.slug,scope)).rejects.toThrow()
    }
  })

  it('uses current stored contacts for a selected client and rejects a customer forging that link', async () => {
    identity.email = 'owner@example.com'
    const c = config.clients!, client = built.rows.find(row => row.tableId === c.tableId && row.data[c.email] === 'irina@example.com')!
    const free = await availability.readPublishedV2BookingAction(app.slug, { screenId: config.formScreenId, recordId: service.id, day, revision: liveRevision() })
    if (!free.ok || !free.slots.length) throw new Error(JSON.stringify(free))
    const ownerScope = { screenId: config.formScreenId, formId: config.ownerCreateFormId!, recordId: service.id, revision: liveRevision() }
    const initial = await write.inspectPublishedV2FormRequest(app.slug, { ...ownerScope, mode: 'initial' })
    if (!initial.ok || !('state' in initial) || !initial.state) throw new Error(JSON.stringify(initial))
    const chosen = free.slots[0]!
    const result = await write.submitPublishedV2(app.slug, 'form', { ...ownerScope, fingerprint: initial.state.fingerprint, requestId: newId('action'), values: { [c.linkFieldId]: [client.id], [config.visit.client]: 'Подменённое имя', [config.visit.phone]: '+7 900 000-00-00', [config.visit.email]: 'fake@example.com', [config.visit.master]: [chosen.masterId], [config.visit.start]: chosen.start } })
    expect(result.ok, JSON.stringify(result)).toBe(true)
    const [saved] = (await db.db.select().from(db.rows).where(eq(db.rows.tableId, config.tables.visits))).filter(row => rowData(row)[config.visit.start] === chosen.start)
    expect(rowData(saved!)).toMatchObject({ [c.linkFieldId]: [client.id], [config.visit.client]: 'Ирина Новое Имя', [config.visit.phone]: '+7 900 777-66-55', [config.visit.email]: 'irina@example.com' })
    const forged = await draft('forged-client@example.com')
    await expect(write.submitPublishedV2(app.slug,'form',{ ...forged, values: { ...forged.values, [c.linkFieldId]: [client.id] } })).rejects.toThrow('недоступное поле')
  })

  it('loads only free times, books through the common form engine, and does not duplicate a retry', async () => {
    const request = await draft('irina@example.com')
    const result = await write.submitPublishedV2(app.slug, 'form', request)
    expect(result.ok, JSON.stringify(result)).toBe(true)
    expect(await write.submitPublishedV2(app.slug, 'form', request)).toMatchObject({ ok: true, repeated: true })
    const stored = await db.db.select().from(db.rows).where(eq(db.rows.tableId, config.tables.visits))
    const found = stored.filter(row => rowData(row)[config.visit.start] === request.values[config.visit.start] && JSON.stringify(rowData(row)[config.visit.master]) === JSON.stringify(request.values[config.visit.master]) && rowData(row)[config.visit.email] === 'irina@example.com')
    expect(found).toHaveLength(1)
    expect(found[0]!.data).toMatchObject({ [config.visit.price]: service.data[config.service.price], [config.visit.minutes]: service.data[config.service.minutes], [config.visit.status]: config.statuses.booked })
    const available = await availability.readPublishedV2BookingAction(app.slug, { screenId: scope.screenId, recordId: service.id, day, revision: liveRevision(), masterId: request.values[config.visit.master]![0]! })
    expect(available.ok && available.slots.some(slot => slot.start === request.values[config.visit.start])).toBe(false)
    if (available.ok) expect(JSON.stringify(available)).not.toContain('irina@example.com')
  })
  it('assigns a free master on submit when the client picked only a time', async () => {
    identity.email = 'any-master@example.com'
    const available = await availability.readPublishedV2BookingAction(app.slug, { screenId: scope.screenId, recordId: service.id, day, revision: liveRevision() })
    expect(available.ok, JSON.stringify(available)).toBe(true)
    if (!available.ok) return
    const shared = available.slots.find(slot => available.slots.some(other => other.start === slot.start && other.masterId !== slot.masterId))
    expect(shared, available.slots.map(slot => `${slot.time} ${slot.masterName}`).join(', ')).toBeTruthy()
    const initial = await write.inspectPublishedV2FormRequest(app.slug, { ...scope, revision: liveRevision(), mode: 'initial' })
    if (!initial.ok || !('state' in initial) || !initial.state) throw new Error(JSON.stringify(initial))
    const request = { ...scope, revision: liveRevision(), fingerprint: initial.state.fingerprint, requestId: newId('action'), values: { [config.visit.client]: 'Любой', [config.visit.phone]: '+7 916 555-11-22', [config.visit.master]: [], [config.visit.start]: shared!.start } }
    const result = await write.submitPublishedV2(app.slug, 'form', request)
    expect(result.ok, JSON.stringify(result)).toBe(true)
    const stored = (await db.db.select().from(db.rows).where(eq(db.rows.tableId, config.tables.visits))).filter(row => rowData(row)[config.visit.start] === shared!.start && rowData(row)[config.visit.email] === 'any-master@example.com')
    expect(stored).toHaveLength(1)
    const masterId = (rowData(stored[0]!)[config.visit.master] as string[])[0]!
    expect(available.slots.some(slot => slot.start === shared!.start && slot.masterId === masterId)).toBe(true)
    const again = await availability.readPublishedV2BookingAction(app.slug, { screenId: scope.screenId, recordId: service.id, day, revision: liveRevision(), masterId })
    expect(again.ok && again.slots.some(slot => slot.start === shared!.start)).toBe(false)
  })
  it('provides the same service and visit fields to author preview and published screens', async () => {
    const { readBuilderV2NodeData } = await import('./builder-v2-data')
    const { readPublishedV2Data } = await import('./builder-v2-published-data')
    const member = { userId, email: 'owner@example.com', name: 'Администратор', workspaceId, workspaceName: 'Booking isolated test', role: 'owner' as const }
    const serviceNode = app.nodes.find(node => node.type === 'collection' && app.screens.find(screen => screen.id === config.catalogScreenId)!.rootIds.includes(node.id))!
    const preview = await readBuilderV2NodeData(app, member, { screenId: config.catalogScreenId, nodeId: serviceNode.id })
    expect(preview.rows).toHaveLength(5)
    expect(preview.rows[0]!.values).toHaveProperty(config.service.active, true)
    expect(preview.rows[0]!.values).toHaveProperty(config.service.minutes)
    identity.email = member.email
    const published = await readPublishedV2Data(app.slug, { screenId: config.catalogScreenId, nodeId: serviceNode.id, revision: liveRevision() })
    expect(published.rows.map(row => row.id)).toEqual(preview.rows.map(row => row.id))
    const calendar = app.nodes.find(node => node.type === 'team_calendar')!
    if (calendar.type !== 'team_calendar') throw Error('Calendar is missing')
    const query = { screenId: config.listScreenId!, nodeId: calendar.id, day, week: false }
    const { readTeamCalendar } = await import('./team-calendar-read')
    const { builderV2MemberActor } = await import('./builder-v2-actor')
    const agenda = await db.db.transaction(tx => readTeamCalendar(tx, app, builderV2MemberActor(app,member), calendar, query, false))
    expect(agenda.events.length).toBeGreaterThan(0)
    expect(agenda.events[0]!.resourceId).toBeTruthy()
    expect(agenda.events[0]!.status).toBeTruthy()
    expect(agenda.events[0]!.amount).not.toBeNull()
    expect(agenda.events[0]!.title).toBeTruthy()
    const result = await (await import('@/app/team-calendar-actions')).readPublishedTeamCalendarAction(app.slug,{...query,revision:liveRevision()})
    expect(result).toEqual({ok:true,data:agenda})
  })
  it('rejects a forged readonly status and protects a foreign visit when moving it', async () => {
    const request = await draft('other@example.com')
    await expect(write.submitPublishedV2(app.slug, 'form', { ...request, values: { ...request.values, [config.visit.status]: config.statuses.completed! } })).rejects.toThrow('недоступное поле')
    const row = built.rows.find(row => row.tableId === config.tables.visits && row.data[config.visit.email] === 'irina@example.com')!
    expect(await availability.readPublishedV2BookingAction(app.slug, { screenId: config.rescheduleScreenId, recordId: row.id, day, revision: liveRevision() })).toMatchObject({ ok: false })
  })
  it('serializes two submissions for the same slot so only one visit is saved', async () => {
    const first = await draft('race@example.com')
    const second = await draft('race@example.com', { masterId: first.values[config.visit.master]![0]!, start: String(first.values[config.visit.start]) })
    const results = await Promise.all([write.submitPublishedV2(app.slug, 'form', first), write.submitPublishedV2(app.slug, 'form', second)])
    expect(results.filter(result => result.ok)).toHaveLength(1)
    const clients = (await db.db.select().from(db.rows).where(eq(db.rows.tableId, config.clients!.tableId))).filter(row => rowData(row)[config.clients!.email] === 'race@example.com')
    expect(clients).toHaveLength(1)
  })
  it('moves atomically without repricing a visit and lets the client cancel it', async () => {
    identity.email = 'irina@example.com'
    const [stored] = (await db.db.select().from(db.rows).where(eq(db.rows.tableId, config.tables.visits))).filter(row => rowData(row)[config.visit.email] === identity.email && String(rowData(row)[config.visit.start]).startsWith(day))
    expect(stored).toBeTruthy()
    await db.db.update(db.rows).set({ data: { ...service.data, [config.service.price]: 9990, [config.service.minutes]: 180 } }).where(eq(db.rows.id, service.id))
    const moveScope = { screenId: config.rescheduleScreenId, formId: config.rescheduleFormId, recordId: stored!.id }
    const available = await availability.readPublishedV2BookingAction(app.slug, { ...moveScope, day, revision: liveRevision() })
    if (!available.ok) throw new Error(JSON.stringify(available))
    const chosen = available.slots.find(slot => slot.start !== rowData(stored!)[config.visit.start])!
    expect(available.service.price).toBe(rowData(stored!)[config.visit.price])
    const initial = await write.inspectPublishedV2FormRequest(app.slug, { ...moveScope, mode: 'initial', revision: liveRevision() })
    if (!initial.ok || !('state' in initial) || !initial.state) throw new Error(JSON.stringify(initial))
    expect(await write.submitPublishedV2(app.slug, 'form', { ...moveScope, revision: liveRevision(), fingerprint: initial.state.fingerprint, requestId: newId('action'), values: { [config.visit.master]: [chosen.masterId], [config.visit.start]: chosen.start } })).toMatchObject({ ok: true })
    const [moved] = await db.db.select().from(db.rows).where(eq(db.rows.id, stored!.id))
    expect(moved!.data).toMatchObject({ [config.visit.price]: rowData(stored!)[config.visit.price], [config.visit.minutes]: rowData(stored!)[config.visit.minutes], [config.visit.start]: chosen.start })
    const buttonScope = { screenId: config.visitScreenId, nodeId: config.cancelButtonId, recordId: stored!.id, revision: liveRevision() }
    const inspection = await write.inspectPublishedV2Button(app.slug, buttonScope)
    expect(await write.submitPublishedV2(app.slug, 'button', { ...buttonScope, fingerprint: inspection.state.fingerprint, requestId: newId('action') })).toMatchObject({ ok: true })
    const [cancelled] = await db.db.select().from(db.rows).where(eq(db.rows.id, stored!.id))
    expect(rowData(cancelled!)[config.visit.status]).toBe(config.statuses.cancelled)
  })
  it('lets the administrator book for a customer without assigning the administrator email', async () => {
    identity.email = 'owner@example.com'
    const ownerScope = { ...scope, formId: config.ownerCreateFormId! }
    const available = await availability.readPublishedV2BookingAction(app.slug, { screenId: scope.screenId, recordId: service.id, day, revision: liveRevision() })
    if (!available.ok || !available.slots.length) throw new Error(JSON.stringify(available))
    const chosen = available.slots[0]!
    const initial = await write.inspectPublishedV2FormRequest(app.slug, { ...ownerScope, mode: 'initial', revision: liveRevision() })
    if (!initial.ok || !('state' in initial) || !initial.state) throw new Error(JSON.stringify(initial))
    const result = await write.submitPublishedV2(app.slug, 'form', { ...ownerScope, revision: liveRevision(), fingerprint: initial.state.fingerprint, requestId: newId('action'), values: { [config.visit.client]: 'Запись по телефону', [config.visit.phone]: '+7 916 555-11-22', [config.visit.email]: 'customer@example.com', [config.visit.master]: [chosen.masterId], [config.visit.start]: chosen.start } })
    expect(result.ok, JSON.stringify(result)).toBe(true)
    const stored = (await db.db.select().from(db.rows).where(eq(db.rows.tableId, config.tables.visits))).find(row => rowData(row)[config.visit.email] === 'customer@example.com')
    expect(stored).toBeTruthy()
    identity.email = 'customer@example.com'
    const own = await write.inspectPublishedV2FormRequest(app.slug, { screenId: config.rescheduleScreenId, formId: config.rescheduleFormId, recordId: stored!.id, mode: 'initial', revision: liveRevision() })
    expect(own.ok).toBe(true)
  })
  const scheduleScope = () => ({ screenId: config.setupScreenId, formId: app.nodes.find(node => node.type === 'form' && app.screens.find(screen => screen.id === config.setupScreenId)!.rootIds.includes(node.id))!.id, revision: liveRevision() })
  async function scheduleRequest() {
    identity.email = 'owner@example.com'
    const scope = scheduleScope()
    const checked = await availability.readPublishedV2BookingScheduleAction(app.slug, scope)
    if (!checked.ok) throw new Error(JSON.stringify(checked))
    return { ...scope, requestId: newId('action'), fingerprint: checked.state.fingerprint, input: { masterId: checked.state.masters[0]!.id, mode: 'weekly' as const, weekdays: [1, 2, 3, 4, 5], start: '09:00', end: '18:00', date: '', closed: false, breakStart: '', breakEnd: '' } }
  }
  it('saves five working days atomically using ordinary workflow grants and one retry receipt', async () => {
    const request = await scheduleRequest()
    const before = await db.db.select().from(db.rows).where(eq(db.rows.tableId, config.tables.schedule))
    const result = await availability.savePublishedV2BookingScheduleAction(app.slug, request)
    expect(result, JSON.stringify(result)).toEqual({ ok: true, repeated: false })
    expect(await availability.savePublishedV2BookingScheduleAction(app.slug, request)).toEqual({ ok: true, repeated: true })
    const after = await db.db.select().from(db.rows).where(eq(db.rows.tableId, config.tables.schedule))
    const ids = new Set(before.map(row => row.id)), created = after.filter(row => !ids.has(row.id))
    expect(created).toHaveLength(5)
    expect(created.map(row => rowData(row)[config.schedule.weekday]).sort()).toEqual(config.weekdays.slice(1, 6).sort())
    expect(created.every(row => rowData(row)[config.schedule.start] === '09:00' && rowData(row)[config.schedule.end] === '18:00')).toBe(true)
    expect(await availability.savePublishedV2BookingScheduleAction(app.slug, { ...request, input: { ...request.input, end: '17:00' } })).toMatchObject({ ok: false })
    identity.email = 'irina@example.com'
    expect(await availability.readPublishedV2BookingScheduleAction(app.slug, scheduleScope())).toMatchObject({ ok: false })
    expect(await availability.savePublishedV2BookingScheduleAction(app.slug, { ...request, requestId: newId('action') })).toMatchObject({ ok: false })
    expect(await db.db.select().from(db.rows).where(eq(db.rows.tableId, config.tables.schedule))).toHaveLength(after.length)
  })
  it('rolls back the whole weekday batch when capacity runs out after the first period', async () => {
    const request = await scheduleRequest()
    const [usage] = await db.db.select().from(db.workspaceUsage).where(eq(db.workspaceUsage.workspaceId, workspaceId))
    const before = await db.db.select().from(db.rows).where(eq(db.rows.tableId, config.tables.schedule))
    const existing = await db.db.select({ id: db.rows.id }).from(db.rows).where(inArray(db.rows.tableId, built.tables.map(table => table.id)))
    const limit = planOf('free').limits.rows, ceiling = limit + graceReserve(limit)
    const filler = Array.from({ length: ceiling - 1 - existing.length }, (_, index) => ({ id: newId('row'), tableId: config.tables.services, position: `f${index.toString(36).padStart(4, '0')}`, data: { [config.service.name]: 'Capacity fixture' } }))
    await db.db.insert(db.rows).values(filler)
    await db.db.update(db.workspaces).set({ plan: 'free' }).where(eq(db.workspaces.id, workspaceId))
    await db.db.update(db.workspaceUsage).set({ rows: ceiling - 1 }).where(eq(db.workspaceUsage.workspaceId, workspaceId))
    try {
      expect(await availability.savePublishedV2BookingScheduleAction(app.slug, request)).toMatchObject({ ok: false })
      expect(await db.db.select().from(db.rows).where(eq(db.rows.tableId, config.tables.schedule))).toHaveLength(before.length)
      const [same] = await db.db.select().from(db.workspaceUsage).where(eq(db.workspaceUsage.workspaceId, workspaceId))
      expect(same!.rows).toBe(ceiling - 1)
    } finally {
      await db.db.update(db.workspaces).set({ plan: 'business' }).where(eq(db.workspaces.id, workspaceId))
      await db.db.delete(db.rows).where(inArray(db.rows.id, filler.map(row => row.id)))
      await db.db.update(db.workspaceUsage).set({ rows: usage!.rows }).where(eq(db.workspaceUsage.workspaceId, workspaceId))
    }
  })
  it('creates a dated day off and edits that same period without adding another row', async () => {
    const base = await scheduleRequest()
    const before = await db.db.select().from(db.rows).where(eq(db.rows.tableId, config.tables.schedule))
    const request = { ...base, input: { ...base.input, mode: 'date' as const, weekdays: [], date: '2026-11-16', closed: true } }
    expect(await availability.savePublishedV2BookingScheduleAction(app.slug, request)).toEqual({ ok: true, repeated: false })
    const after = await db.db.select().from(db.rows).where(eq(db.rows.tableId, config.tables.schedule))
    const ids = new Set(before.map(row => row.id)), created = after.filter(row => !ids.has(row.id))
    expect(created).toHaveLength(1)
    expect(calendarDay(rowData(created[0]!)[config.schedule.date])).toBe('2026-11-16')
    expect(rowData(created[0]!)[config.schedule.closed]).toBe(true)
    const scope = { screenId: config.periodScreenId!, formId: app.nodes.find(node => node.type === 'form' && app.screens.find(screen => screen.id === config.periodScreenId)!.rootIds.includes(node.id))!.id, recordId: created[0]!.id, revision: liveRevision() }
    const checked = await availability.readPublishedV2BookingScheduleAction(app.slug, scope)
    if (!checked.ok) throw new Error(JSON.stringify(checked))
    const result = await availability.savePublishedV2BookingScheduleAction(app.slug, { ...scope, requestId: newId('action'), fingerprint: checked.state.fingerprint, input: { ...request.input, closed: false, start: '10:00', end: '12:00' } })
    expect(result, JSON.stringify(result)).toEqual({ ok: true, repeated: false })
    const final = await db.db.select().from(db.rows).where(eq(db.rows.tableId, config.tables.schedule))
    expect(final).toHaveLength(after.length)
    const values = rowData(final.find(row => row.id === created[0]!.id)!)
    expect(calendarDay(values[config.schedule.date])).toBe('2026-11-16')
    expect(values).toMatchObject({ [config.schedule.closed]: false, [config.schedule.start]: '10:00', [config.schedule.end]: '12:00' })
  })
  it('refuses a visit inside the buffer and a client cancellation inside the deadline', async () => {
    const saved = app.booking!
    app.booking = { ...saved, bufferMinutes: 30, cancelDeadlineHours: 240, slotStepMinutes: 15, stepMinutes: 15, minLeadMinutes: 60, leadMinutes: 60 }
    await db.db.update(db.apps).set({ draft: app, published: app }).where(eq(db.apps.id, app.id))
    try {
      const soon = instantToWallClock(new Date(Date.now() + 4 * 86400000), 'Europe/Moscow')!.date
      const haircut = built.rows.find(row => row.tableId === config.tables.services && row.data[config.service.minutes] === 60)!
      const shortScope = { ...scope, recordId: haircut.id }
      identity.email = 'buffer@example.com'
      const open = await availability.readPublishedV2BookingAction(app.slug, { screenId: shortScope.screenId, recordId: haircut.id, day: soon, revision: liveRevision() })
      if (!open.ok) throw new Error(JSON.stringify(open))
      const first = open.slots.find(slot => open.slots.some(other => other.masterId === slot.masterId && other.time === slot.time.replace(/^(\d{2}):(\d{2})$/, (_, hour: string, minute: string) => {
        const total = Number(hour) * 60 + Number(minute) + 60
        return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
      })))
      if (!first) throw new Error(`Нет пары слотов: ${open.slots.map(slot => slot.time).join(', ')}`)
      const blockedTime = first.time.replace(/^(\d{2}):(\d{2})$/, (_, hour: string, minute: string) => {
        const total = Number(hour) * 60 + Number(minute) + 60
        return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
      })
      const blocked = open.slots.find(slot => slot.masterId === first.masterId && slot.time === blockedTime)!
      const book = async (email: string, slot: { start: string; masterId: string }) => {
        identity.email = email
        const initial = await write.inspectPublishedV2FormRequest(app.slug, { ...shortScope, revision: liveRevision(), mode: 'initial' })
        if (!initial.ok || !('state' in initial) || !initial.state) throw new Error(JSON.stringify(initial))
        return write.submitPublishedV2(app.slug, 'form', { ...shortScope, revision: liveRevision(), fingerprint: initial.state.fingerprint, requestId: newId('action'), values: { [config.visit.client]: email.split('@')[0]!, [config.visit.phone]: '+7 916 555-11-22', [config.visit.master]: [slot.masterId], [config.visit.start]: slot.start } })
      }
      const created = await book('buffer@example.com', first)
      expect(created.ok, JSON.stringify(created)).toBe(true)
      const stored = (await db.db.select().from(db.rows).where(eq(db.rows.tableId, config.tables.visits))).find(row => rowData(row)[config.visit.email] === 'buffer@example.com')!
      let message = ''
      try {
        const result = await book('clash@example.com', blocked)
        if (!result.ok) message = result.error
      } catch (error) { message = error instanceof Error ? error.message : String(error) }
      expect(message).toContain('занято')
      identity.email = 'buffer@example.com'
      const button = { screenId: config.visitScreenId, nodeId: config.cancelButtonId, recordId: stored.id, revision: liveRevision() }
      const inspection = await write.inspectPublishedV2Button(app.slug, button)
      let cancelled = ''
      try {
        const result = await write.submitPublishedV2(app.slug, 'button', { ...button, fingerprint: inspection.state.fingerprint, requestId: newId('action') })
        if (!result.ok) cancelled = result.error
      } catch (error) { cancelled = error instanceof Error ? error.message : String(error) }
      expect(cancelled).toContain('не позднее чем за 240 ч')
      expect(rowData((await db.db.select().from(db.rows).where(eq(db.rows.id, stored.id)))[0]!)[config.visit.status]).toBe(config.statuses.booked)
      const later = await availability.readPublishedV2BookingAction(app.slug, { screenId: shortScope.screenId, recordId: haircut.id, day: soon, revision: liveRevision() })
      identity.email = 'owner@example.com'
      if (!later.ok) throw new Error(JSON.stringify(later))
      const target = later.slots.find(slot => slot.masterId === first.masterId)!
      const moved = await (await import('@/app/team-calendar-actions')).movePublishedTeamCalendarAction(app.slug, {
        screenId: config.listScreenId!, nodeId: app.nodes.find(node => node.type === 'team_calendar')!.id,
        eventId: stored.id, resourceId: first.masterId, day: soon, time: target.time, revision: liveRevision(),
      })
      expect(moved.ok, JSON.stringify(moved)).toBe(true)
    } finally {
      app.booking = saved
      await db.db.update(db.apps).set({ draft: app, published: app }).where(eq(db.apps.id, app.id))
    }
  })
})
