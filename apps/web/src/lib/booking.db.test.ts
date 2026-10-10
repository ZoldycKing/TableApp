import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { eq, inArray } from 'drizzle-orm'
import { instantToWallClock, newId } from '@tableapp/schema'
import { templateExample } from './templates/presentation'

const state = vi.hoisted(() => ({ jar: new Map<string, string>(), code: '' }))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: (name: string) => state.jar.has(name) ? { value: state.jar.get(name) } : undefined,
  set: (name: string, value: string) => state.jar.set(name, value), delete: (name: string) => state.jar.delete(name) }), headers: async () => new Headers({ 'user-agent': 'Booking test' }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/mailer', () => ({ sendMagicLink: async (letter: { code: string }) => { state.code = letter.code; return { delivered: true } }, mailHintFor: () => null }))
const envFile = resolve(import.meta.dirname, '../../../../.env')
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile)

describe.skipIf(!process.env.DATABASE_URL)('salon scenarios with atomic PostgreSQL writes', () => {
  const example = templateExample('salon'), config = example.app.booking!, userId = newId('user'), workspaceId = newId('workspace')
  const email = `${newId('appUser')}@example.invalid`, admin = `${newId('appUser')}@example.invalid`
  let database: typeof import('@tableapp/db'), mutation: typeof import('./row-mutations'), runtime: typeof import('./app-runtime')
  let actions: typeof import('@/app/booking-actions'), rowActions: typeof import('@/app/runtime-actions'), intake: typeof import('@/app/intake-actions'), session: typeof import('./app-session'), auth: typeof import('@/app/auth-actions')
  let chosen: { start: string; masterId: string }, ownId: string, loginCookie: string, later: { start: string; masterId: string }
  const day = instantToWallClock(new Date(Date.now() + 4 * 86400_000))!.date
  beforeAll(async () => {
    database = await import('@tableapp/db'); mutation = await import('./row-mutations'); runtime = await import('./app-runtime')
    actions = await import('@/app/booking-actions'); rowActions = await import('@/app/runtime-actions'); intake = await import('@/app/intake-actions'); session = await import('./app-session'); auth = await import('@/app/auth-actions')
    example.app.workspaceId = workspaceId; example.app.slug = `booking-test-${example.app.id.toLowerCase()}`
    example.app.allowlist = [{ email: admin, roleId: 'manager', company: '' }, { email: 'olga@example.com', roleId: 'staff', company: '' }]
    await database.db.insert(database.users).values({ id: userId, email: `${userId}@example.invalid` })
    await database.db.insert(database.workspaces).values({ id: workspaceId, ownerId: userId, name: 'Synthetic salon', slug: example.app.slug })
    await database.db.insert(database.tables).values(example.built.tables.map(table => ({ ...table, workspaceId })))
    await database.db.insert(database.fields).values(example.built.fields); await database.db.insert(database.views).values(example.built.views); await database.db.insert(database.rows).values(example.built.rows)
    await database.db.insert(database.apps).values({ id: example.app.id, workspaceId, name: 'Synthetic salon', slug: example.app.slug, draft: example.app, published: example.app })
  })
  afterAll(async () => {
    if (!database) return
    await database.db.delete(database.workspaces).where(eq(database.workspaces.id, workspaceId))
    await database.db.delete(database.users).where(eq(database.users.id, userId))
    await database.db.delete(database.staffSessions).where(inArray(database.staffSessions.email, [email, admin]))
    await database.db.delete(database.authTokens).where(eq(database.authTokens.email, email)); await database.db.delete(database.authEvents).where(eq(database.authEvents.email, email))
    state.jar.clear(); await database.sql.end()
  })
  const serviceId = example.rows.find(row => row.tableId === config.tables.services)!.id
  const masterId = example.rows.find(row => row.tableId === config.tables.masters)!.id
  const rowData = (value: unknown) => value as Record<string, unknown>
  async function stored(id: string) { const row = (await database.db.select().from(database.rows).where(eq(database.rows.id, id)))[0]!; return { ...row, data: rowData(row.data) } }
  const input = (slot: { start: string; masterId: string }, title = 'Synthetic client') => ({ [config.visit.client]: title, [config.visit.phone]: '+7 900 000 00 00',
    [config.visit.service]: [serviceId], [config.visit.master]: [slot.masterId], [config.visit.start]: slot.start })
  it('verifies email before choosing time and entering personal details, without creating a visit at login', async () => {
    expect((await intake.requestIntakeAction(example.app.slug, config.formScreenId, email, {})).ok).toBe(false)
    expect((await auth.requestAppLoginAction(example.app.slug, email)).ok).toBe(true)
    expect(await auth.consumeAppCodeAction(example.app.slug, state.code)).toEqual({ ok: true })
    const before = await runtime.loadPublishedApp(example.app.slug, (await session.currentAppAccess(example.app)).visitor)
    expect(before!.tables[config.tables.visits]!.rows).toHaveLength(0)
    const available = await actions.bookingAvailabilityAction(example.app.slug, serviceId, day, masterId)
    if (!available.ok) throw new Error(available.error)
    chosen = available.slots.find(slot => slot.time === '10:00')!; later = available.slots.find(slot => slot.time === '15:00')!
    expect(chosen).toBeDefined(); expect(JSON.stringify(available)).not.toContain('Ирина')
    const result = await rowActions.appCreateRowAction(example.app.slug, config.tables.visits,
      { ...input(chosen), [config.visit.email]: 'forged@example.invalid', [config.visit.price]: 1, [config.visit.minutes]: 1, [config.visit.status]: config.statuses.cancelled })
    expect(result.ok).toBe(true)
    loginCookie = state.jar.get('tableapp_staff')!
    const access = await session.currentAppAccess(example.app), loaded = await runtime.loadPublishedApp(example.app.slug, access.visitor)
    expect(loaded!.tables[config.tables.visits]!.rows).toHaveLength(1)
    const row = loaded!.tables[config.tables.visits]!.rows[0]!
    ownId = row.id
    expect(row.data).toMatchObject({ [config.visit.price]: 2500, [config.visit.minutes]: 60, [config.visit.status]: config.statuses.booked })
    expect((await stored(ownId)).data).toMatchObject({ [config.visit.email]: email, [config.visit.masterEmail]: 'olga@example.com' })
    expect((await actions.bookingAvailabilityAction(example.app.slug, serviceId, day, masterId)).ok).toBe(true)
    const nowBusy = await actions.bookingAvailabilityAction(example.app.slug, serviceId, day, masterId)
    expect(nowBusy.ok && nowBusy.slots.some(slot => slot.start === chosen.start)).toBe(false)
  })
  it('serializes simultaneous appointments and rejects conflicting workspace edits without losing the old time', async () => {
    const base = { ...input(later), [config.visit.email]: 'other@example.invalid' }
    const race = await Promise.allSettled([1, 2].map(index => mutation.writeRows(workspaceId,
      context => mutation.createRow(context, config.tables.visits, { ...base, [config.visit.client]: `Concurrent ${index}` }, { id: null, kind: 'test' }))))
    expect(race.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(race.find(result => result.status === 'rejected')).toMatchObject({ status: 'rejected', reason: { message: expect.stringContaining('занято') } })
    const before = await stored(ownId)
    const changed = await rowActions.appUpdateRowAction(example.app.slug, config.tables.visits, ownId, { [config.visit.start]: later.start }, before.version)
    expect(changed).toMatchObject({ ok: false, error: expect.stringContaining('занято') })
    expect((await stored(ownId)).data).toEqual(before.data)
    await expect(mutation.writeRows(workspaceId, context => mutation.updateRow(context, config.tables.visits, ownId,
      { [config.visit.start]: later.start }, { id: userId, kind: 'member' }))).rejects.toThrow('занято')
    expect((await stored(ownId)).data).toEqual(before.data)
  })
  it('reschedules atomically using the saved duration and price even after the service changes', async () => {
    await mutation.writeRows(workspaceId, context => mutation.updateRow(context, config.tables.services, serviceId,
      { [config.service.price]: 4000, [config.service.minutes]: 120 }, { id: userId, kind: 'member' }))
    const row = await stored(ownId), target = `${day}T11:00:00.000Z` // 14:00 Moscow; ends at 15:00, next customer starts then.
    const available = await actions.bookingAvailabilityAction(example.app.slug, serviceId, day, masterId, ownId)
    expect(available.ok && available.slots.some(slot => slot.start === target)).toBe(true)
    expect(await rowActions.appUpdateRowAction(example.app.slug, config.tables.visits, ownId, { [config.visit.start]: target }, row.version)).toEqual({ ok: true })
    expect((await stored(ownId)).data).toMatchObject({ [config.visit.start]: target, [config.visit.price]: 2500, [config.visit.minutes]: 60 })
    const newSlots = await actions.bookingAvailabilityAction(example.app.slug, serviceId, day, masterId)
    expect(newSlots.ok && newSlots.slots.some(slot => slot.start === chosen.start)).toBe(true)
    expect((await rowActions.appUpdateRowAction(example.app.slug, config.tables.visits, ownId, { [config.visit.start]: chosen.start }, row.version)).ok).toBe(false)
  })
  it('rejects cancellation and rescheduling of foreign visits, preserves history and releases a cancelled interval', async () => {
    const foreign = (await database.db.select().from(database.rows).where(eq(database.rows.tableId, config.tables.visits))).find(row => row.id !== ownId && rowData(row.data)[config.visit.start] === later.start)!
    expect((await actions.cancelBookingAction(example.app.slug, foreign.id, foreign.version)).ok).toBe(false)
    expect((await actions.bookingAvailabilityAction(example.app.slug, serviceId, day, masterId, foreign.id)).ok).toBe(false)
    const row = await stored(ownId)
    expect(await actions.cancelBookingAction(example.app.slug, ownId, row.version)).toEqual({ ok: true })
    expect((await stored(ownId)).data[config.visit.status]).toBe(config.statuses.cancelled)
    expect((await actions.cancelBookingAction(example.app.slug, ownId, (await stored(ownId)).version)).ok).toBe(false)
    expect((await rowActions.appUpdateRowAction(example.app.slug, config.tables.visits, ownId, { [config.visit.start]: chosen.start }, (await stored(ownId)).version)).ok).toBe(false)
    expect(await database.db.select().from(database.rowChanges).where(eq(database.rowChanges.rowId, ownId))).toHaveLength(3)
    await mutation.writeRows(workspaceId, context => mutation.updateRow(context, config.tables.services, serviceId,
      { [config.service.minutes]: 60 }, { id: userId, kind: 'member' }))
    const free = await actions.bookingAvailabilityAction(example.app.slug, serviceId, day, masterId)
    expect(free.ok && free.slots.some(slot => slot.start === row.data[config.visit.start])).toBe(true)
  })
  it('lets only the assigned employee or administrator confirm an actual visit, preserves history and rejects future completion', async () => {
    const before = await stored(ownId), pastId = newId('row'), futureId = newId('row'), foreignId = newId('row')
    const otherMaster = example.rows.find(row => row.tableId === config.tables.masters && row.id !== masterId)!
    const pastData = { ...before.data, [config.visit.status]: config.statuses.arrived,
      [config.visit.start]: new Date(Date.now() - 2 * 60 * 60_000).toISOString() }
    await database.db.insert(database.rows).values([
      { id: pastId, tableId: config.tables.visits, position: 'zz-completion-1', data: pastData },
      { id: futureId, tableId: config.tables.visits, position: 'zz-completion-2', data: { ...pastData, [config.visit.status]: config.statuses.booked, [config.visit.start]: chosen.start } },
      { id: foreignId, tableId: config.tables.visits, position: 'zz-completion-3', data: { ...pastData,
        [config.visit.master]: [otherMaster.id], [config.visit.masterEmail]: otherMaster.data[config.master.email] } },
    ])
    const past = await stored(pastId), complete = { [config.visit.status]: config.statuses.completed }
    expect((await rowActions.appUpdateRowAction(example.app.slug, config.tables.visits, pastId, complete, past.version)).ok).toBe(false)
    expect((await stored(pastId)).data[config.visit.status]).toBe(config.statuses.arrived)
    const staffSessionId = newId('session'), adminSessionId = newId('session')
    await database.db.insert(database.staffSessions).values([
      { id: staffSessionId, email: 'olga@example.com', expiresAt: new Date(Date.now() + 60_000) },
      { id: adminSessionId, email: admin, expiresAt: new Date(Date.now() + 60_000) },
    ])
    state.jar.set('tableapp_staff', staffSessionId)
    try {
      const future = await stored(futureId), foreign = await stored(foreignId)
      expect(await rowActions.appUpdateRowAction(example.app.slug, config.tables.visits, futureId, complete, future.version))
        .toMatchObject({ ok: false, error: expect.stringContaining('начавшееся') })
      expect((await stored(futureId)).data[config.visit.status]).toBe(config.statuses.booked)
      expect((await rowActions.appUpdateRowAction(example.app.slug, config.tables.visits, foreignId, complete, foreign.version)).ok).toBe(false)
      expect(await rowActions.appUpdateRowAction(example.app.slug, config.tables.visits, pastId, complete, past.version)).toEqual({ ok: true })
      expect((await stored(pastId)).data).toMatchObject({ [config.visit.status]: config.statuses.completed, [config.visit.price]: 2500, [config.visit.minutes]: 60 })
      expect((await rowActions.appUpdateRowAction(example.app.slug, config.tables.visits, pastId, complete, past.version)).ok).toBe(false)
      expect(await database.db.select().from(database.rowChanges).where(eq(database.rowChanges.rowId, pastId))).toHaveLength(1)
      await expect(mutation.writeRows(workspaceId, context => mutation.updateRow(context, config.tables.visits, pastId,
        { [config.visit.start]: chosen.start }, { id: userId, kind: 'member' }))).rejects.toThrow('начавшееся')
      state.jar.set('tableapp_staff', adminSessionId)
      expect(await rowActions.appUpdateRowAction(example.app.slug, config.tables.visits, foreignId, complete, foreign.version)).toEqual({ ok: true })
      state.jar.set('tableapp_staff', loginCookie)
      const access = await session.currentAppAccess(example.app), loaded = await runtime.loadPublishedApp(example.app.slug, access.visitor)
      expect(loaded!.tables[config.tables.visits]!.rows.find(row => row.id === pastId)?.data[config.visit.status]).toBe(config.statuses.completed)
      expect((await actions.cancelBookingAction(example.app.slug, pastId, (await stored(pastId)).version)).ok).toBe(false)
    } finally {
      state.jar.set('tableapp_staff', loginCookie)
      await database.db.delete(database.staffSessions).where(inArray(database.staffSessions.id, [staffSessionId, adminSessionId]))
    }
  })
  it('configures a master with working days, break and local employee access in one transaction', async () => {
    const sessionId = newId('session')
    await database.db.insert(database.staffSessions).values({ id: sessionId, email: admin, expiresAt: new Date(Date.now() + 60_000) })
    state.jar.set('tableapp_staff', sessionId)
    const input = { name: 'New master', email: `${newId('appUser')}@example.invalid`, serviceIds: [serviceId], weekdays: [1, 2], start: '09:00', end: '18:00', breakStart: '13:00', breakEnd: '14:00', timeZone: 'Europe/Moscow' }
    expect(await actions.setupBookingMasterAction(example.app.slug, input)).toEqual({ ok: true })
    const masters = await database.db.select().from(database.rows).where(eq(database.rows.tableId, config.tables.masters))
    const added = masters.find(row => rowData(row.data)[config.master.email] === input.email)!
    const windows = await database.db.select().from(database.rows).where(eq(database.rows.tableId, config.tables.schedule))
    expect(windows.filter(row => (rowData(row.data)[config.schedule.master] as string[])?.includes(added.id))).toHaveLength(4)
    const app = (await database.db.select().from(database.apps).where(eq(database.apps.id, example.app.id)))[0]!
    expect((app.published as typeof example.app).allowlist).toContainEqual({ email: input.email, roleId: 'staff', company: '' })
    expect((await actions.setupBookingMasterAction(example.app.slug, input)).ok).toBe(false)
    expect(await actions.setBookingDayOffAction(example.app.slug, masterId, day)).toEqual({ ok: true })
    expect(await actions.setBookingDayOffAction(example.app.slug, masterId, day)).toEqual({ ok: true })
    const closed = await actions.bookingAvailabilityAction(example.app.slug, serviceId, day, masterId)
    expect(closed.ok && closed.slots).toEqual([])
    state.jar.set('tableapp_staff', loginCookie)
    expect((await actions.setupBookingMasterAction(example.app.slug, { ...input, email: 'someone@example.invalid' })).ok).toBe(false)
  })
})
