import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { and, eq, isNull } from 'drizzle-orm'
import { readAppDefinition } from '@tableapp/schema/app-definition'
import { builderV2Revision } from './builder-v2-revision'

/**
 * IDOR + conflict matrix for Прокат: client A must not read/update/cancel
 * client B bookings, forge create ownership, or open B's conversation thread.
 * Staff double-booking the same item is rejected with a conflict message.
 */

const envFile = resolve(import.meta.dirname, '../../../../.env')
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile)

const userId = 'usr_prokat_idor'
const workspaceId = 'wsp_prokat_idor'
const ownerEmail = 'owner-prokat-idor@example.invalid'
const staffEmail = 'anna@prokat-demo.ru'
const clientA = 'a.ivanov@mail.ru'
const clientB = 'm.petrova@yandex.ru'
const ownerSessionId = 'ses_prokat_idor_owner'
const staffSessionId = 'ses_prokat_idor_staff'
const clientASessionId = 'ses_prokat_idor_a'
const clientBSessionId = 'ses_prokat_idor_b'
const memberSessionId = 'ses_prokat_idor_member'

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
  headers: async () => new Headers({ 'user-agent': 'prokat IDOR test' }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/live', () => ({ publishTable: vi.fn() }))

describe.skipIf(!process.env.DATABASE_URL)('prokat IDOR and booking conflicts', () => {
  let database: typeof import('@tableapp/db')
  let templates: typeof import('@/app/template-actions')
  let prokatActions: typeof import('@/app/prokat-actions')
  let published: typeof import('@/app/builder-v2-published-actions')
  let conversations: typeof import('./conversations')
  let conversationActions: typeof import('@/app/conversation-actions')

  let slug = ''
  let appId = ''
  let revision = ''
  let bookingsTableId = ''
  let clientsTableId = ''
  let itemsTableId = ''
  let bookingScreenId = ''
  let clientBookingScreenId = ''
  let clientListScreenId = ''
  let bookingsScreenId = ''
  let catalogScreenId = ''
  let bookingFields: {
    number: string
    title: string
    clientEmail: string
    items: string
    from: string
    to: string
    status: string
  }
  let statuses: { request: string; confirmed: string; cancelled: string }
  let bookingA = ''
  let bookingB = ''
  let clientBRowId = ''
  let freeItemId = ''
  let busyItemIds: string[] = []
  let busyFrom = ''
  let busyTo = ''

  beforeAll(async () => {
    database = await import('@tableapp/db')
    templates = await import('@/app/template-actions')
    prokatActions = await import('@/app/prokat-actions')
    published = await import('@/app/builder-v2-published-actions')
    conversations = await import('./conversations')
    conversationActions = await import('@/app/conversation-actions')
    const { SESSION_TTL_MS } = await import('./auth')

    await database.db.delete(database.apps).where(eq(database.apps.workspaceId, workspaceId))
    await database.db.delete(database.tables).where(eq(database.tables.workspaceId, workspaceId))
    await database.db.delete(database.workspaceMembers).where(eq(database.workspaceMembers.workspaceId, workspaceId))
    await database.db.delete(database.workspaces).where(eq(database.workspaces.id, workspaceId))
    for (const email of [ownerEmail, staffEmail, clientA, clientB]) {
      await database.db.delete(database.staffSessions).where(eq(database.staffSessions.email, email))
    }
    await database.db.delete(database.sessions).where(eq(database.sessions.userId, userId))
    await database.db.delete(database.users).where(eq(database.users.id, userId))

    await database.db.insert(database.users).values({ id: userId, email: ownerEmail })
    await database.db.insert(database.workspaces).values({
      id: workspaceId, ownerId: userId, name: 'Prokat IDOR', slug: 'prokat-idor', plan: 'business',
    })
    await database.db.insert(database.workspaceMembers).values({ userId, workspaceId, role: 'owner' })
    await database.db.insert(database.sessions).values({
      id: memberSessionId, userId, expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    })
    await database.db.insert(database.staffSessions).values([
      { id: ownerSessionId, email: ownerEmail, expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
      { id: staffSessionId, email: staffEmail, expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
      { id: clientASessionId, email: clientA, expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
      { id: clientBSessionId, email: clientB, expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
    ])

    state.member = {
      userId, workspaceId, workspaceName: 'Prokat IDOR', email: ownerEmail, name: 'Владелец', role: 'owner',
    }
    state.jar.set('tableapp_staff', ownerSessionId)

    const installed = await templates.applyTemplateAction('prokat')
    expect(installed.ok).toBe(true)
    if (!installed.ok) return
    appId = installed.appId
    slug = installed.appSlug

    const [row] = await database.db.select().from(database.apps).where(eq(database.apps.id, appId))
    const read = readAppDefinition(row!.draft)
    if (!read.ok || read.formatVersion !== 2 || !read.app.prokat) throw new Error('bad prokat install')
    const kit = read.app.prokat
    bookingsTableId = kit.bookingsTableId
    clientsTableId = kit.clientsTableId
    itemsTableId = kit.itemsTableId
    bookingScreenId = kit.bookingScreenId
    clientBookingScreenId = kit.clientBookingScreenId
    clientListScreenId = kit.clientListScreenId
    bookingsScreenId = kit.bookingsScreenId
    catalogScreenId = kit.catalogScreenId
    bookingFields = kit.booking
    statuses = kit.statuses

    const publishedApp = {
      ...read.app,
      communications: { enabled: true },
      authentication: {
        ...read.app.authentication,
        members: [
          { email: ownerEmail, roleIds: ['owner'] as string[], company: '' },
          { email: staffEmail, roleIds: ['staff'] as string[], company: '' },
          { email: clientA, roleIds: ['client'] as string[], company: '' },
          { email: clientB, roleIds: ['client'] as string[], company: '' },
        ],
      },
    }
    await database.db.update(database.apps).set({
      published: publishedApp, draft: publishedApp, publishedAt: new Date(),
    }).where(eq(database.apps.id, appId))
    revision = builderV2Revision(publishedApp)

    const bookings = await database.db.select().from(database.rows).where(and(
      eq(database.rows.tableId, bookingsTableId), isNull(database.rows.deletedAt),
    ))
    const byEmail = (email: string) => bookings.filter(item =>
      String((item.data as Record<string, unknown>)[bookingFields.clientEmail] ?? '').toLowerCase() === email)
    const ownA = byEmail(clientA)
    const ownB = byEmail(clientB)
    expect(ownA.length).toBeGreaterThan(0)
    expect(ownB.length).toBeGreaterThan(0)
    bookingA = ownA.find(item => (item.data as Record<string, unknown>)[bookingFields.number] === 'ПР-1008')?.id
      ?? ownA[0]!.id
    bookingB = ownB.find(item => (item.data as Record<string, unknown>)[bookingFields.number] === 'ПР-1005')?.id
      ?? ownB[0]!.id

    const clients = await database.db.select().from(database.rows).where(and(
      eq(database.rows.tableId, clientsTableId), isNull(database.rows.deletedAt),
    ))
    clientBRowId = clients.find(item =>
      String((item.data as Record<string, unknown>)[kit.client.email] ?? '').toLowerCase() === clientB)!.id

    const busy = bookings.find(item => (item.data as Record<string, unknown>)[bookingFields.number] === 'ПР-1005')!
    busyItemIds = ((busy.data as Record<string, unknown>)[bookingFields.items] as string[]) ?? []
    busyFrom = String((busy.data as Record<string, unknown>)[bookingFields.from])
    busyTo = String((busy.data as Record<string, unknown>)[bookingFields.to])

    const items = await database.db.select().from(database.rows).where(and(
      eq(database.rows.tableId, itemsTableId), isNull(database.rows.deletedAt),
    ))
    freeItemId = items.find(item =>
      String((item.data as Record<string, unknown>)[kit.item.serial] ?? '') === 'ВЕЛ-1003')!.id
  })

  afterAll(async () => {
    if (!database) return
    await database.db.delete(database.apps).where(eq(database.apps.workspaceId, workspaceId))
    await database.db.delete(database.tables).where(eq(database.tables.workspaceId, workspaceId))
    await database.db.delete(database.workspaceMembers).where(eq(database.workspaceMembers.workspaceId, workspaceId))
    await database.db.delete(database.workspaces).where(eq(database.workspaces.id, workspaceId))
    for (const email of [ownerEmail, staffEmail, clientA, clientB]) {
      await database.db.delete(database.staffSessions).where(eq(database.staffSessions.email, email))
    }
    await database.db.delete(database.sessions).where(eq(database.sessions.userId, userId))
    await database.db.delete(database.users).where(eq(database.users.id, userId))
    state.jar.clear()
    state.member = null
    await database.sql.end()
  })

  function asStaff(sessionId: string) {
    state.jar.set('tableapp_staff', sessionId)
    state.member = null
  }

  it('a) client A cannot read client B booking (projection empty / action denied)', async () => {
    asStaff(clientASessionId)
    const foreign = await published.readPublishedV2RecordAction(slug, {
      revision, screenId: clientBookingScreenId, recordId: bookingB,
    })
    expect(foreign.ok).toBe(false)

    const own = await published.readPublishedV2RecordAction(slug, {
      revision, screenId: clientBookingScreenId, recordId: bookingA,
    })
    expect(own.ok, JSON.stringify(own)).toBe(true)
  })

  it('b) client A cannot update or cancel client B booking', async () => {
    asStaff(clientASessionId)
    const cancelled = await prokatActions.savePublishedProkatAction(slug, {
      kind: 'cancel', revision, screenId: clientBookingScreenId, recordId: bookingB,
    })
    expect(cancelled.ok).toBe(false)
    expect(cancelled).toMatchObject({ error: expect.stringMatching(/недоступн|сотрудник|клиент/i) })

    const [still] = await database.db.select().from(database.rows).where(eq(database.rows.id, bookingB))
    expect((still!.data as Record<string, unknown>)[bookingFields.status]).not.toBe(statuses.cancelled)
  })

  it('c) client A cannot create a booking stamped as client B via create+foreign clientId', async () => {
    asStaff(clientASessionId)
    const forged = await prokatActions.savePublishedProkatAction(slug, {
      kind: 'create',
      revision,
      screenId: catalogScreenId,
      clientId: clientBRowId,
      itemIds: [freeItemId],
      title: 'Чужая бронь',
      from: '2027-01-10T07:00:00.000Z',
      to: '2027-01-11T15:00:00.000Z',
      price: 1800,
      deposit: 7000,
    })
    expect(forged.ok).toBe(false)
    expect(forged).toMatchObject({ error: expect.stringMatching(/сотрудник|недоступн/i) })

    const request = await prokatActions.savePublishedProkatAction(slug, {
      kind: 'clientRequest',
      revision,
      screenId: catalogScreenId,
      itemIds: [freeItemId],
      title: 'Заявка клиента A',
      from: '2027-01-20T07:00:00.000Z',
      to: '2027-01-21T15:00:00.000Z',
      price: 1800,
      deposit: 7000,
      clientName: 'Алексей Иванов',
    })
    expect(request.ok, JSON.stringify(request)).toBe(true)
    const created = await database.db.select().from(database.rows).where(and(
      eq(database.rows.tableId, bookingsTableId), isNull(database.rows.deletedAt),
    ))
    const stamped = created.find(item =>
      (item.data as Record<string, unknown>)[bookingFields.title] === 'Заявка клиента A')
    expect(stamped).toBeTruthy()
    expect((stamped!.data as Record<string, unknown>)[bookingFields.clientEmail]).toBe(clientA)
    expect((stamped!.data as Record<string, unknown>)[bookingFields.clientEmail]).not.toBe(clientB)
  })

  it('d) client A cannot open conversation thread of client B booking', async () => {
    asStaff(clientBSessionId)
    const seeded = await conversationActions.sendConversationAction(slug, bookingsTableId, bookingB, {
      body: 'Подскажите, когда можно продлить прокат Electra?',
      requestId: randomUUID(),
    })
    expect(seeded.ok, JSON.stringify(seeded)).toBe(true)

    asStaff(clientASessionId)
    await expect(conversations.conversationAccess(slug, bookingsTableId, bookingB)).rejects.toBeTruthy()
    const read = await conversationActions.readConversationAction(slug, bookingsTableId, bookingB)
    expect(read.ok).toBe(false)
    const send = await conversationActions.sendConversationAction(slug, bookingsTableId, bookingB, {
      body: 'Попытка чужого чата',
      requestId: randomUUID(),
    })
    expect(send.ok).toBe(false)
  })

  it('e) staff double-booking the same item is rejected with conflict message', async () => {
    asStaff(staffSessionId)
    const conflict = await prokatActions.savePublishedProkatAction(slug, {
      kind: 'create',
      revision,
      screenId: bookingsScreenId,
      clientId: clientBRowId,
      itemIds: busyItemIds,
      title: 'Двойная бронь',
      from: busyFrom,
      to: busyTo,
      price: 900,
      deposit: 3000,
    })
    expect(conflict.ok).toBe(false)
    expect(conflict).toMatchObject({ error: expect.stringMatching(/уже занят|брони/i) })
  })
})
