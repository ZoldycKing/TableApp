import { existsSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { and, eq, isNull } from 'drizzle-orm'
import { newId } from '@tableapp/schema'
import { readAppDefinition } from '@tableapp/schema/app-definition'
import { beforeAll, describe, expect, it, vi } from 'vitest'

const envFile = resolve(import.meta.dirname, '../../../../.env')
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile)

const userId = 'usr_prokat_runtime'
const workspaceId = 'wsp_prokat_runtime'
const ownerEmail = 'owner-prokat@example.invalid'
const staffEmail = 'anna@prokat-demo.ru'
const clientEmail = 'm.petrova@yandex.ru'
const ownerSessionId = 'ses_prokat_owner'
const staffSessionId = 'ses_prokat_staff'
const clientSessionId = 'ses_prokat_client'
const memberSessionId = 'ses_prokat_member'
const identity = vi.hoisted(() => ({ member: null as import('../session').Member | null }))
const storage = vi.hoisted(() => ({
  putFile: vi.fn(async (_workspace: string, file: { name: string; type: string; bytes: Uint8Array }, key: string) => ({
    ok: true as const,
    stored: { key, name: file.name, mime: file.type, size: file.bytes.length },
  })),
  deleteFile: vi.fn(async () => {}),
  getFile: vi.fn(async () => ({ mime: 'image/jpeg', body: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]) })),
  fileKey: (workspace: string, name: string) => `${workspace}/${name}`,
}))
vi.mock('@/lib/session', async original => ({ ...await original<typeof import('../session')>(), currentMember: async () => identity.member }))
vi.mock('@/lib/storage', () => storage)
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/live', () => ({ publishTable: vi.fn() }))

describe.skipIf(!process.env.DATABASE_URL)('prokat runtime visual setup', () => {
  let database: typeof import('@tableapp/db')
  let actions: typeof import('@/app/template-actions')

  beforeAll(async () => {
    database = await import('@tableapp/db')
    actions = await import('@/app/template-actions')
    const { SESSION_TTL_MS } = await import('../auth')
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
      id: workspaceId, ownerId: userId, name: 'Prokat Runtime', slug: 'prokat-runtime', plan: 'business',
    })
    await database.db.insert(database.workspaceMembers).values({ userId, workspaceId, role: 'owner' })
    await database.db.insert(database.sessions).values({
      id: memberSessionId, userId, expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    })
    await database.db.insert(database.staffSessions).values([
      { id: ownerSessionId, email: ownerEmail, expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
      { id: staffSessionId, email: staffEmail, expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
      { id: clientSessionId, email: clientEmail, expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
    ])
  })

  it('installs prokat, publishes members, seeds booking chats, writes fixture JSON', async () => {
    identity.member = {
      userId, workspaceId, workspaceName: 'Prokat Runtime', email: ownerEmail, name: 'Иван Орлов', role: 'owner',
    }
    const installed = await actions.applyTemplateAction('prokat')
    expect(installed.ok).toBe(true)
    if (!installed.ok) return

    const [appRow] = await database.db.select().from(database.apps).where(eq(database.apps.id, installed.appId))
    const read = readAppDefinition(appRow!.draft)
    if (!read.ok || read.formatVersion !== 2 || !read.app.prokat) throw new Error('bad prokat')
    const prokat = read.app.prokat
    expect(read.app.communications?.enabled).toBe(true)

    const published = {
      ...read.app,
      communications: { enabled: true },
      authentication: {
        ...read.app.authentication,
        members: [
          { email: ownerEmail, roleIds: ['owner'] as string[], company: '' },
          { email: staffEmail, roleIds: ['staff'] as string[], company: '' },
          { email: clientEmail, roleIds: ['client'] as string[], company: '' },
        ],
      },
    }
    await database.db.update(database.apps).set({
      published, draft: published, publishedAt: new Date(),
    }).where(eq(database.apps.id, installed.appId))

    const bookings = await database.db.select().from(database.rows).where(and(
      eq(database.rows.tableId, prokat.bookingsTableId), isNull(database.rows.deletedAt),
    ))
    const byNumber = (number: string) => bookings.find(row =>
      String((row.data as Record<string, unknown>)[prokat.booking.number] ?? '') === number)
    const issued = byNumber('ПР-1005')
    const overdue = byNumber('ПР-1003')
    const clientOwned = byNumber('ПР-1006') ?? byNumber('ПР-1005')
    const petrovaReturned = byNumber('ПР-1009')
    expect(issued).toBeTruthy()
    expect(overdue).toBeTruthy()
    expect(clientOwned).toBeTruthy()
    expect(petrovaReturned).toBeTruthy()
    if (!issued || !overdue || !clientOwned) return

    const issueCondition = String((issued.data as Record<string, unknown>)[prokat.booking.issueCondition] ?? '')
    expect(issueCondition.length).toBeGreaterThan(10)
    const overdueLate = Number((overdue.data as Record<string, unknown>)[prokat.booking.lateFee] ?? 0)
    expect(overdueLate).toBeGreaterThan(0)
    expect(String((petrovaReturned!.data as Record<string, unknown>)[prokat.booking.clientEmail] ?? '')).toBe(clientEmail)
    expect(String((petrovaReturned!.data as Record<string, unknown>)[prokat.booking.status] ?? '')).toBe(prokat.statuses.returned)

    await database.db.insert(database.businessCustomers).values({
      id: newId('businessCustomer'), workspaceId, email: clientEmail, name: 'Мария Петрова',
    }).onConflictDoNothing()
    const [customer] = await database.db.select().from(database.businessCustomers).where(and(
      eq(database.businessCustomers.workspaceId, workspaceId),
      eq(database.businessCustomers.email, clientEmail),
    ))
    const staffActor = `person_${createHash('sha256').update(`${workspaceId}:${staffEmail}`).digest('hex')}`
    const clientActor = `person_${createHash('sha256').update(`${workspaceId}:${clientEmail}`).digest('hex')}`

    const seedThread = async (
      booking: typeof issued,
      bodies: [string, string],
      note: string,
      stamp: string,
      customerId: string,
    ) => {
      const conversationId = `con_${newId('row').slice(4)}`
      await database.db.insert(database.conversations).values({
        id: conversationId, workspaceId, appId: installed.appId, kind: 'record',
        moduleId: `mod_prokat_${prokat.bookingsTableId}`,
        tableId: prokat.bookingsTableId, rowId: booking.id, customerId,
      })
      await database.db.insert(database.conversationMessages).values([
        {
          id: `msg_${newId('row').slice(4)}`, workspaceId, conversationId,
          authorId: clientActor, authorKind: 'client', authorName: 'Мария Петрова',
          requestId: newId('row'), body: bodies[0], createdAt: new Date(`${stamp}T09:12:00.000Z`),
        },
        {
          id: `msg_${newId('row').slice(4)}`, workspaceId, conversationId,
          authorId: staffActor, authorKind: 'staff', authorName: 'Анна Смирнова',
          requestId: newId('row'), body: bodies[1], createdAt: new Date(`${stamp}T10:05:00.000Z`),
        },
      ])
      await database.db.insert(database.conversationNotes).values({
        id: `msg_${newId('row').slice(4)}`, workspaceId, conversationId,
        authorId: staffActor, authorName: 'Анна Смирнова',
        requestId: newId('row'), body: note, createdAt: new Date(`${stamp}T10:06:00.000Z`),
      })
      return conversationId
    }

    // Overdue SUP is owned by another client — seed under that customer's email.
    const overdueEmail = String((overdue.data as Record<string, unknown>)[prokat.booking.clientEmail] ?? '').toLowerCase()
    await database.db.insert(database.businessCustomers).values({
      id: newId('businessCustomer'), workspaceId, email: overdueEmail, name: 'Дмитрий Соколов',
    }).onConflictDoNothing()
    const [overdueCustomer] = await database.db.select().from(database.businessCustomers).where(and(
      eq(database.businessCustomers.workspaceId, workspaceId),
      eq(database.businessCustomers.email, overdueEmail),
    ))
    const overdueClientActor = `person_${createHash('sha256').update(`${workspaceId}:${overdueEmail}`).digest('hex')}`

    const overdueThreadId = `con_${newId('row').slice(4)}`
    await database.db.insert(database.conversations).values({
      id: overdueThreadId, workspaceId, appId: installed.appId, kind: 'record',
      moduleId: `mod_prokat_${prokat.bookingsTableId}`,
      tableId: prokat.bookingsTableId, rowId: overdue.id, customerId: overdueCustomer!.id,
    })
    await database.db.insert(database.conversationMessages).values([
      {
        id: `msg_${newId('row').slice(4)}`, workspaceId, conversationId: overdueThreadId,
        authorId: overdueClientActor, authorKind: 'client', authorName: 'Дмитрий Соколов',
        requestId: newId('row'),
        body: 'SUP Red Paddle ещё на съёмке — вернём завтра утром. Можно продлить?',
        createdAt: new Date('2026-11-23T09:12:00.000Z'),
      },
      {
        id: `msg_${newId('row').slice(4)}`, workspaceId, conversationId: overdueThreadId,
        authorId: staffActor, authorKind: 'staff', authorName: 'Анна Смирнова',
        requestId: newId('row'),
        body: 'Да, продлеваем до завтра 12:00. Штраф за просрочку уже в карточке — 3500 ₽.',
        createdAt: new Date('2026-11-23T10:05:00.000Z'),
      },
    ])

    const issuedThread = await seedThread(
      issued,
      [
        'Городской велосипед Electra можно вернуть после 20:00?',
        'Да, пункт работает до 21:00. Акт выдачи уже в карточке — сверьте состояние рамы.',
      ],
      'Клиент просил SMS за час до возврата.',
      '2026-11-24',
      customer!.id,
    )
    const weekend = byNumber('ПР-1006')
    if (weekend) {
      await seedThread(
        weekend,
        [
          'Берём Trek Marlin 7 и детский велосипед на выходные — шлемы есть в комплекте?',
          'Шлемы выдадим при получении. Залог 6500 ₽, выдача в субботу с 10:00.',
        ],
        'Подготовить два шлема к субботе.',
        '2026-11-24',
        customer!.id,
      )
    }

    const bound = await database.db.select().from(database.conversations).where(eq(database.conversations.workspaceId, workspaceId))
    expect(bound.find(item => item.id === issuedThread)?.rowId).toBe(issued.id)
    expect(bound.find(item => item.id === overdueThreadId)?.rowId).toBe(overdue.id)

    const base = process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:3210'
    writeFileSync('/tmp/prokat-runtime.json', JSON.stringify({
      workspaceId,
      slug: installed.appSlug,
      appId: installed.appId,
      screens: {
        bookingsScreenId: prokat.bookingsScreenId,
        bookingScreenId: prokat.bookingScreenId,
        timelineScreenId: prokat.timelineScreenId,
        dashboardScreenId: prokat.dashboardScreenId,
        catalogScreenId: prokat.catalogScreenId,
        clientListScreenId: prokat.clientListScreenId,
        clientBookingScreenId: prokat.clientBookingScreenId,
      },
      rows: {
        staffBookingWithActId: issued.id,
        overdueBookingId: overdue.id,
        clientOwnedBookingId: clientOwned.id,
      },
      cookies: {
        ownerStaff: `tableapp_staff=${ownerSessionId}`,
        staff: `tableapp_staff=${staffSessionId}`,
        client: `tableapp_staff=${clientSessionId}`,
        member: `tableapp_session=${memberSessionId}; tableapp_workspace=${workspaceId}`,
      },
      urls: {
        staffBookings: `${base}/a/${installed.appSlug}?screen=${prokat.bookingsScreenId}`,
        staffBooking: `${base}/a/${installed.appSlug}?screen=${prokat.bookingScreenId}&row=${issued.id}`,
        staffOverdueBooking: `${base}/a/${installed.appSlug}?screen=${prokat.bookingScreenId}&row=${overdue.id}`,
        staffTimeline: `${base}/a/${installed.appSlug}?screen=${prokat.timelineScreenId}`,
        staffDashboard: `${base}/a/${installed.appSlug}?screen=${prokat.dashboardScreenId}`,
        clientCatalog: `${base}/a/${installed.appSlug}?screen=${prokat.catalogScreenId}`,
        clientList: `${base}/a/${installed.appSlug}?screen=${prokat.clientListScreenId}`,
        clientBooking: `${base}/a/${installed.appSlug}?screen=${prokat.clientBookingScreenId}&row=${clientOwned.id}`,
        templatePicker: `${base}/templates?take=prokat`,
      },
    }, null, 2))
  })
})
