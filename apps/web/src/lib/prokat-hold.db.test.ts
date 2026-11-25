import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { and, eq, isNull } from 'drizzle-orm'
import { readAppDefinition } from '@tableapp/schema/app-definition'
import type { AppV2 } from '@tableapp/schema/app-v2'
import { builderV2Revision } from './builder-v2-revision'
import { PROKAT_NOT_PICKED_UP_REASON_AUTO } from './prokat-logic'

const envFile = resolve(import.meta.dirname, '../../../../.env')
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile)

const userId = 'usr_prokat_hold'
const workspaceId = 'wsp_prokat_hold'
const ownerEmail = 'owner-prokat-hold@example.invalid'
const staffEmail = 'anna@prokat-demo.ru'
const clientEmail = 'a.ivanov@mail.ru'
const ownerSessionId = 'ses_prokat_hold_owner'
const staffSessionId = 'ses_prokat_hold_staff'
const memberSessionId = 'ses_prokat_hold_member'

const state = vi.hoisted(() => ({
  jar: new Map<string, string>(),
  member: null as import('./session').Member | null,
}))
vi.mock('@/lib/session', async original => ({
  ...await original<typeof import('./session')>(),
  currentMember: async () => state.member,
}))
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => state.jar.has(name) ? { value: state.jar.get(name) } : undefined,
    set: (name: string, value: string) => state.jar.set(name, value),
    delete: (name: string) => state.jar.delete(name),
  }),
  headers: async () => new Headers({ 'user-agent': 'prokat hold test' }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/live', () => ({ publishTable: vi.fn() }))

describe.skipIf(!process.env.DATABASE_URL)('prokat hold auto-cancel', () => {
  let database: typeof import('@tableapp/db')
  let templates: typeof import('@/app/template-actions')
  let prokatActions: typeof import('@/app/prokat-actions')
  let worker: typeof import('./prokat-hold-worker')

  let slug = ''
  let appId = ''
  let revision = ''
  let app!: AppV2
  let kit!: NonNullable<AppV2['prokat']>
  let bookingScreenId = ''
  let freeItemId = ''
  let clientId = ''

  beforeAll(async () => {
    database = await import('@tableapp/db')
    templates = await import('@/app/template-actions')
    prokatActions = await import('@/app/prokat-actions')
    worker = await import('./prokat-hold-worker')
    const { SESSION_TTL_MS } = await import('./auth')

    await database.db.delete(database.apps).where(eq(database.apps.workspaceId, workspaceId))
    await database.db.delete(database.tables).where(eq(database.tables.workspaceId, workspaceId))
    await database.db.delete(database.workspaceMembers).where(eq(database.workspaceMembers.workspaceId, workspaceId))
    await database.db.delete(database.workspaces).where(eq(database.workspaces.id, workspaceId))
    for (const email of [ownerEmail, staffEmail, clientEmail]) {
      await database.db.delete(database.staffSessions).where(eq(database.staffSessions.email, email))
    }
    await database.db.delete(database.sessions).where(eq(database.sessions.userId, userId))
    await database.db.delete(database.users).where(eq(database.users.id, userId))

    await database.db.insert(database.users).values({ id: userId, email: ownerEmail })
    await database.db.insert(database.workspaces).values({
      id: workspaceId, ownerId: userId, name: 'Prokat Hold', slug: 'prokat-hold', plan: 'business',
    })
    await database.db.insert(database.workspaceMembers).values({ userId, workspaceId, role: 'owner' })
    await database.db.insert(database.sessions).values({
      id: memberSessionId, userId, expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    })
    await database.db.insert(database.staffSessions).values([
      { id: ownerSessionId, email: ownerEmail, expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
      { id: staffSessionId, email: staffEmail, expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
    ])

    state.member = {
      userId, workspaceId, workspaceName: 'Prokat Hold', email: ownerEmail, name: 'Владелец', role: 'owner',
    }
    state.jar.set('tableapp_staff', ownerSessionId)

    const installed = await templates.applyTemplateAction('prokat')
    expect(installed.ok).toBe(true)
    if (!installed.ok) return
    appId = installed.appId
    slug = installed.appSlug

    const [row] = await database.db.select().from(database.apps).where(eq(database.apps.id, appId))
    const read = readAppDefinition(row!.draft)
    if (!read.ok || read.formatVersion !== 2 || !read.app.prokat) throw new Error('bad prokat')
    kit = read.app.prokat
    bookingScreenId = kit.bookingScreenId
    app = {
      ...read.app,
      communications: { enabled: true },
      authentication: {
        ...read.app.authentication,
        members: [
          { email: ownerEmail, roleIds: ['owner'], company: '' },
          { email: staffEmail, roleIds: ['staff'], company: '' },
          { email: clientEmail, roleIds: ['client'], company: '' },
        ],
      },
    }
    await database.db.update(database.apps).set({ published: app, draft: app, publishedAt: new Date() })
      .where(eq(database.apps.id, appId))
    revision = builderV2Revision(app)

    const clients = await database.db.select().from(database.rows).where(and(
      eq(database.rows.tableId, kit.clientsTableId), isNull(database.rows.deletedAt),
    ))
    clientId = clients.find(row =>
      String((row.data as Record<string, unknown>)[kit.client.email] ?? '').toLowerCase() === clientEmail)?.id
      ?? clients[0]!.id

    const items = await database.db.select().from(database.rows).where(and(
      eq(database.rows.tableId, kit.itemsTableId), isNull(database.rows.deletedAt),
    ))
    freeItemId = items.find(row =>
      String((row.data as Record<string, unknown>)[kit.item.serial] ?? '') === 'ВЕЛ-1003')?.id
      ?? items.find(row => (row.data as Record<string, unknown>)[kit.item.status] === kit.itemStatuses.free)?.id
      ?? items[0]!.id
  }, 120_000)

  afterAll(async () => {
    if (!database) return
    await database.db.delete(database.apps).where(eq(database.apps.id, appId))
    await database.db.delete(database.tables).where(eq(database.tables.workspaceId, workspaceId))
    await database.db.delete(database.workspaceMembers).where(eq(database.workspaceMembers.workspaceId, workspaceId))
    await database.db.delete(database.workspaces).where(eq(database.workspaces.id, workspaceId))
    await database.db.delete(database.sessions).where(eq(database.sessions.userId, userId))
    await database.db.delete(database.users).where(eq(database.users.id, userId))
  })

  async function reloadApp() {
    const [row] = await database.db.select().from(database.apps).where(eq(database.apps.id, appId))
    const read = readAppDefinition(row!.published)
    if (!read.ok || read.formatVersion !== 2 || !read.app.prokat) throw new Error('bad published')
    app = read.app
    kit = read.app.prokat
    revision = builderV2Revision(app)
  }

  async function pickFreeItem(from: string, to: string) {
    const { findItemBookingConflict } = await import('./prokat-logic')
    const { bookingSpansFromRows, prokatStatusName } = await import('./prokat-persist')
    const bookings = await database.db.select().from(database.rows).where(and(
      eq(database.rows.tableId, kit.bookingsTableId), isNull(database.rows.deletedAt),
    ))
    const records = bookings.map(row => ({
      id: row.id, tableId: row.tableId, values: row.data as Record<string, import('@tableapp/schema/app-v2').AppV2Json>,
    }))
    const spans = bookingSpansFromRows(kit, records)
    const items = await database.db.select().from(database.rows).where(and(
      eq(database.rows.tableId, kit.itemsTableId), isNull(database.rows.deletedAt),
    ))
    for (const item of items) {
      const data = item.data as Record<string, unknown>
      if (data[kit.item.status] !== kit.itemStatuses.free && data[kit.item.status] !== kit.itemStatuses.rented) continue
      if (findItemBookingConflict(spans, [item.id], from, to)) continue
      // Prefer catalogue free gear; fall back to any non-conflicting item.
      if (data[kit.item.status] === kit.itemStatuses.free) return item.id
      freeItemId = item.id
    }
    if (freeItemId && !findItemBookingConflict(spans, [freeItemId], from, to)) return freeItemId
    throw new Error(`no free item for ${from}–${to}; last status names: ${spans.map(s => prokatStatusName(kit, s.status) || s.status).join(',')}`)
  }

  async function createHoldBooking(input: { from: string; to: string; holdUntil?: string; title?: string; itemId?: string }) {
    state.jar.set('tableapp_staff', staffSessionId)
    await reloadApp()
    const itemId = input.itemId ?? await pickFreeItem(input.from, input.to)
    const title = input.title ?? `Hold ${Date.now()}-${Math.random().toString(16).slice(2, 6)}`
    const created = await prokatActions.savePublishedProkatAction(slug, {
      kind: 'create',
      revision,
      screenId: bookingScreenId,
      clientId,
      itemIds: [itemId],
      title,
      from: input.from,
      to: input.to,
      price: 1500,
      deposit: 3000,
    })
    if (!created.ok) throw new Error(`createHoldBooking failed: ${created.error}; item=${itemId}; revision=${revision}`)
    expect(created).toMatchObject({ ok: true })
    const bookings = await database.db.select().from(database.rows).where(and(
      eq(database.rows.tableId, kit.bookingsTableId), isNull(database.rows.deletedAt),
    ))
    const row = bookings.find(item =>
      String((item.data as Record<string, unknown>)[kit.booking.title] ?? '') === title
      && String((item.data as Record<string, unknown>)[kit.booking.from] ?? '') === input.from)
    expect(row).toBeTruthy()
    if (input.holdUntil && kit.booking.holdUntil) {
      await database.db.update(database.rows).set({
        data: { ...(row!.data as Record<string, unknown>), [kit.booking.holdUntil]: input.holdUntil },
      }).where(eq(database.rows.id, row!.id))
    }
    return row!.id
  }

  async function bookingStatus(id: string) {
    const [row] = await database.db.select().from(database.rows).where(eq(database.rows.id, id))
    const data = row!.data as Record<string, unknown>
    return {
      statusId: String(data[kit.booking.status] ?? ''),
      reason: kit.booking.statusReason ? String(data[kit.booking.statusReason] ?? '') : '',
      holdUntil: kit.booking.holdUntil ? String(data[kit.booking.holdUntil] ?? '') : '',
      data,
    }
  }

  it('cancels expired holds, stays idempotent, skips issued, respects never, extends, and grows the counter', async () => {
    await reloadApp()
    const pastFrom = new Date(Date.now() - 3 * 3_600_000).toISOString()
    const pastTo = new Date(Date.now() + 24 * 3_600_000).toISOString()
    const expiredHold = new Date(Date.now() - 60_000).toISOString()

    const expiredId = await createHoldBooking({ from: pastFrom, to: pastTo, holdUntil: expiredHold })
    const first = await worker.tickProkatHoldForApp(app, workspaceId)
    expect(first.cancelled).toBeGreaterThanOrEqual(1)
    const after = await bookingStatus(expiredId)
    expect(after.statusId).toBe(kit.statuses.notPickedUp)
    expect(after.reason).toBe(PROKAT_NOT_PICKED_UP_REASON_AUTO)

    const second = await worker.tickProkatHoldForApp(app, workspaceId)
    expect(second.cancelled).toBe(0)

    const changes = await database.db.select().from(database.rowChanges)
      .where(and(eq(database.rowChanges.rowId, expiredId), eq(database.rowChanges.tableId, kit.bookingsTableId)))
    expect(changes.some(change => {
      const afterData = change.after as Record<string, unknown> | null
      return afterData && afterData[kit.booking.status] === kit.statuses.notPickedUp
    })).toBe(true)

    const issuedFrom = new Date(Date.now() - 4 * 3_600_000).toISOString()
    const issuedId = await createHoldBooking({
      from: issuedFrom,
      to: pastTo,
      holdUntil: new Date(Date.now() - 30_000).toISOString(),
    })
    state.jar.set('tableapp_staff', staffSessionId)
    const issued = await prokatActions.savePublishedProkatAction(slug, {
      kind: 'issue',
      revision: builderV2Revision((await database.db.select().from(database.apps).where(eq(database.apps.id, appId)))[0]!.published as AppV2),
      screenId: bookingScreenId,
      recordId: issuedId,
      condition: 'Целый',
      damages: '',
    })
    expect(issued).toMatchObject({ ok: true })
    await reloadApp()
    const skipIssued = await worker.cancelExpiredProkatHold(workspaceId, app, issuedId)
    expect(skipIssued).toBe('skipped')
    expect((await bookingStatus(issuedId)).statusId).toBe(kit.statuses.issued)

    state.jar.set('tableapp_staff', ownerSessionId)
    await reloadApp()
    const never = await prokatActions.savePublishedProkatAction(slug, {
      kind: 'holdSetting',
      revision,
      screenId: bookingScreenId,
      holdAfterStartMinutes: null,
    })
    expect(never).toMatchObject({ ok: true })
    await reloadApp()
    expect(kit.holdAfterStartMinutes).toBeNull()
    const neverId = await createHoldBooking({
      from: new Date(Date.now() - 5 * 3_600_000).toISOString(),
      to: pastTo,
      holdUntil: new Date(Date.now() - 60_000).toISOString(),
    })
    const neverTick = await worker.tickProkatHoldForApp(app, workspaceId)
    expect(neverTick.cancelled).toBe(0)
    expect((await bookingStatus(neverId)).statusId).toBe(kit.statuses.confirmed)

    state.jar.set('tableapp_staff', ownerSessionId)
    state.member = {
      userId, workspaceId, workspaceName: 'Prokat Hold', email: ownerEmail, name: 'Владелец', role: 'owner',
    }
    await reloadApp()
    const restore = await prokatActions.savePublishedProkatAction(slug, {
      kind: 'holdSetting',
      revision,
      screenId: bookingScreenId,
      holdAfterStartMinutes: 120,
    })
    expect(restore).toMatchObject({ ok: true })
    await reloadApp()
    expect(kit.holdAfterStartMinutes).toBe(120)

    const extendId = await createHoldBooking({
      from: new Date(Date.now() - 30 * 60_000).toISOString(),
      to: pastTo,
      holdUntil: new Date(Date.now() + 10 * 60_000).toISOString(),
    })
    state.jar.set('tableapp_staff', staffSessionId)
    const beforeExtend = await bookingStatus(extendId)
    await reloadApp()
    const extended = await prokatActions.savePublishedProkatAction(slug, {
      kind: 'extendHold',
      revision,
      screenId: bookingScreenId,
      recordId: extendId,
    })
    if (!extended.ok) throw new Error(`extendHold failed: ${extended.error}; hold=${JSON.stringify(beforeExtend)}; kit.holdUntil=${kit.booking.holdUntil}; minutes=${kit.holdAfterStartMinutes}`)
    expect(extended).toMatchObject({ ok: true })
    const afterExtend = await bookingStatus(extendId)
    expect(Date.parse(afterExtend.holdUntil)).toBeGreaterThan(Date.parse(beforeExtend.holdUntil))

    state.jar.set('tableapp_staff', staffSessionId)
    const manualId = await createHoldBooking({
      from: new Date(Date.now() + 60_000).toISOString(),
      to: pastTo,
    })
    const manual = await prokatActions.savePublishedProkatAction(slug, {
      kind: 'markNotPickedUp',
      revision: builderV2Revision((await database.db.select().from(database.apps).where(eq(database.apps.id, appId)))[0]!.published as AppV2),
      screenId: bookingScreenId,
      recordId: manualId,
    })
    expect(manual).toMatchObject({ ok: true })
    expect((await bookingStatus(manualId)).statusId).toBe(kit.statuses.notPickedUp)

    const bookings = await database.db.select().from(database.rows).where(and(
      eq(database.rows.tableId, kit.bookingsTableId), isNull(database.rows.deletedAt),
    ))
    const count = bookings.filter(row => {
      const data = row.data as Record<string, unknown>
      return String(data[kit.booking.clientEmail] ?? '').toLowerCase() === clientEmail
        && data[kit.booking.status] === kit.statuses.notPickedUp
    }).length
    expect(count).toBeGreaterThanOrEqual(2)
  }, 180_000)

  it('worker uses business default when item has no override, and item override otherwise', async () => {
    await reloadApp()
    expect(kit.item.holdAfterStartMinutes).toBeTruthy()
    const holdField = kit.item.holdAfterStartMinutes!
    const pastTo = new Date(Date.now() + 24 * 3_600_000).toISOString()
    const expiredHold = new Date(Date.now() - 60_000).toISOString()

    state.jar.set('tableapp_staff', ownerSessionId)
    state.member = {
      userId, workspaceId, workspaceName: 'Prokat Hold', email: ownerEmail, name: 'Владелец', role: 'owner',
    }
    const business = await prokatActions.savePublishedProkatAction(slug, {
      kind: 'holdSetting',
      revision,
      screenId: kit.settingsScreenId ?? bookingScreenId,
      holdAfterStartMinutes: 120,
    })
    expect(business).toMatchObject({ ok: true })
    await reloadApp()

    // Clear item override → inherit 2h; booking already past holdUntil must cancel.
    const [itemRow] = await database.db.select().from(database.rows).where(eq(database.rows.id, freeItemId))
    const itemData = { ...(itemRow!.data as Record<string, unknown>) }
    delete itemData[holdField]
    await database.db.update(database.rows).set({ data: itemData }).where(eq(database.rows.id, freeItemId))

    const inheritId = await createHoldBooking({
      from: new Date(Date.now() - 3 * 3_600_000).toISOString(),
      to: pastTo,
      holdUntil: expiredHold,
      itemId: freeItemId,
    })
    const inheritTick = await worker.tickProkatHoldForApp(app, workspaceId)
    expect(inheritTick.cancelled).toBeGreaterThanOrEqual(1)
    expect((await bookingStatus(inheritId)).statusId).toBe(kit.statuses.notPickedUp)

    // Item override «never» → even with expired stamp, worker skips.
    await database.db.update(database.rows).set({
      data: { ...itemData, [holdField]: -1 },
    }).where(eq(database.rows.id, freeItemId))
    await reloadApp()
    const neverOverrideId = await createHoldBooking({
      from: new Date(Date.now() - 5 * 3_600_000).toISOString(),
      to: pastTo,
      holdUntil: expiredHold,
      itemId: freeItemId,
    })
    await worker.tickProkatHoldForApp(app, workspaceId)
    expect((await bookingStatus(neverOverrideId)).statusId).toBe(kit.statuses.confirmed)

    // Shorter item override (30) with stamp already past → cancels.
    await database.db.update(database.rows).set({
      data: { ...itemData, [holdField]: 30 },
    }).where(eq(database.rows.id, freeItemId))
    await reloadApp()
    const shortId = await createHoldBooking({
      from: new Date(Date.now() - 2 * 3_600_000).toISOString(),
      to: pastTo,
      holdUntil: expiredHold,
      itemId: freeItemId,
    })
    const shortTick = await worker.tickProkatHoldForApp(app, workspaceId)
    expect(shortTick.cancelled).toBeGreaterThanOrEqual(1)
    expect((await bookingStatus(shortId)).statusId).toBe(kit.statuses.notPickedUp)

    // Restore clean item field for later tests.
    await database.db.update(database.rows).set({ data: itemData }).where(eq(database.rows.id, freeItemId))
  }, 180_000)

  it('rejects client IDOR on extendHold and markNotPickedUp', async () => {
    await reloadApp()
    const bookingId = await createHoldBooking({
      from: new Date(Date.now() - 10 * 60_000).toISOString(),
      to: new Date(Date.now() + 24 * 3_600_000).toISOString(),
      holdUntil: new Date(Date.now() + 50 * 60_000).toISOString(),
    })
    state.jar.clear()
    state.jar.set('tableapp_staff', 'ses_missing')
    state.member = null
    const deniedExtend = await prokatActions.savePublishedProkatAction(slug, {
      kind: 'extendHold',
      revision,
      screenId: bookingScreenId,
      recordId: bookingId,
    })
    expect(deniedExtend.ok).toBe(false)
    const deniedMark = await prokatActions.savePublishedProkatAction(slug, {
      kind: 'markNotPickedUp',
      revision,
      screenId: bookingScreenId,
      recordId: bookingId,
    })
    expect(deniedMark.ok).toBe(false)
  })
})
