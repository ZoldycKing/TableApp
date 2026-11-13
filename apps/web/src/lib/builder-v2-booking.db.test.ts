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
      expect(owner.data.masters).toHaveLength(3)
      expect(owner.data.shifts).toHaveLength(21)
      expect(JSON.stringify(owner)).not.toContain('@example.com')
      expect(JSON.stringify(owner)).not.toContain('+7')
    }
    identity.email = 'olga@example.com'
    const staff = await availability.readPublishedV2BookingCalendarAction(app.slug, request)
    expect(staff.ok && staff.data.masters).toHaveLength(1)
    expect(staff.ok && staff.data.shifts.every(shift => shift.windows === null)).toBe(true)
    expect(await availability.readPublishedV2BookingCalendarAction(app.slug, { ...request, screenId: config.setupScreenId })).toMatchObject({ ok: false })
    identity.email = 'irina@example.com'
    expect(await availability.readPublishedV2BookingCalendarAction(app.slug, request)).toMatchObject({ ok: false })
    identity.email = 'owner@example.com'
    expect(await availability.readPublishedV2BookingCalendarAction(app.slug, { ...request, revision: 'outdated' })).toMatchObject({ ok: false })
  })

  it('loads only free times, books through the common form engine, and does not duplicate a retry', async () => {
    const request = await draft('irina@example.com')
    const result = await write.submitPublishedV2(app.slug, 'form', request)
    expect(result.ok, JSON.stringify(result)).toBe(true)
    expect(await write.submitPublishedV2(app.slug, 'form', request)).toMatchObject({ ok: true, repeated: true })
    const stored = await db.db.select().from(db.rows).where(eq(db.rows.tableId, config.tables.visits))
    const found = stored.filter(row => rowData(row)[config.visit.start] === request.values[config.visit.start] && rowData(row)[config.visit.email] === 'irina@example.com')
    expect(found).toHaveLength(1)
    expect(found[0]!.data).toMatchObject({ [config.visit.price]: service.data[config.service.price], [config.visit.minutes]: service.data[config.service.minutes], [config.visit.status]: config.statuses.booked })
    const available = await availability.readPublishedV2BookingAction(app.slug, { screenId: scope.screenId, recordId: service.id, day, revision: liveRevision(), masterId: request.values[config.visit.master]![0]! })
    expect(available.ok && available.slots.some(slot => slot.start === request.values[config.visit.start])).toBe(false)
    if (available.ok) expect(JSON.stringify(available)).not.toContain('irina@example.com')
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
    const visits = app.nodes.find(node => node.type === 'collection' && app.screens.find(screen => screen.id === config.listScreenId)!.rootIds.includes(node.id))!
    const agenda = await readBuilderV2NodeData(app, member, { screenId: config.listScreenId, nodeId: visits.id, calendarMonth: day.slice(0, 7), calendarDay: day })
    expect(agenda.rows.length).toBeGreaterThan(0)
    expect(agenda.rows[0]!.values).toHaveProperty(config.visit.master)
    expect(agenda.rows[0]!.values).toHaveProperty(config.visit.status)
    expect(agenda.rows[0]!.values).toHaveProperty(config.visit.price)
    expect(agenda.rows[0]!.display[config.visit.service]).toBeTruthy()
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
})
