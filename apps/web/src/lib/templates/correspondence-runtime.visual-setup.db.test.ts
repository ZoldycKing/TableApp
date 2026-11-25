import { existsSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { and, eq, isNull } from 'drizzle-orm'
import { newId } from '@tableapp/schema'
import { readAppDefinition } from '@tableapp/schema/app-definition'
import { beforeAll, describe, expect, it, vi } from 'vitest'

const envFile = resolve(import.meta.dirname, '../../../../.env')
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile)

const userId = 'usr_corr_runtime'
const workspaceId = 'wsp_corr_runtime'
const ownerEmail = 'owner-corr@example.invalid'
const staffEmail = 'andrey@service-demo.ru'
const clientEmail = 'm.sidorova@yandex.ru'
const ownerSessionId = 'ses_corr_owner'
const staffSessionId = 'ses_corr_staff'
const clientSessionId = 'ses_corr_client'
const memberSessionId = 'ses_corr_member'
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

describe.skipIf(!process.env.DATABASE_URL)('correspondence runtime visual setup', () => {
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
    await database.db.insert(database.workspaces).values({ id: workspaceId, ownerId: userId, name: 'Correspondence Runtime', slug: 'corr-runtime', plan: 'business' })
    await database.db.insert(database.workspaceMembers).values({ userId, workspaceId, role: 'owner' })
    await database.db.insert(database.sessions).values({ id: memberSessionId, userId, expiresAt: new Date(Date.now() + SESSION_TTL_MS) })
    await database.db.insert(database.staffSessions).values([
      { id: ownerSessionId, email: ownerEmail, expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
      { id: staffSessionId, email: staffEmail, expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
      { id: clientSessionId, email: clientEmail, expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
    ])
  })

  it('installs service + salon and seeds a Переписка thread', async () => {
    identity.member = { userId, workspaceId, workspaceName: 'Correspondence Runtime', email: ownerEmail, name: 'Иван Орлов', role: 'owner' }
    const serviceInstalled = await actions.applyTemplateAction('service')
    expect(serviceInstalled.ok).toBe(true)
    if (!serviceInstalled.ok) return
    // v1 customer app keeps ModuleManager («Включить переписку») in the builder
    const deliveryInstalled = await actions.applyTemplateAction('dostavka')
    expect(deliveryInstalled.ok).toBe(true)
    if (!deliveryInstalled.ok) return

    const [serviceRow] = await database.db.select().from(database.apps).where(eq(database.apps.id, serviceInstalled.appId))
    const serviceRead = readAppDefinition(serviceRow!.draft)
    if (!serviceRead.ok || serviceRead.formatVersion !== 2 || !serviceRead.app.service) throw new Error('bad service')
    const service = serviceRead.app.service
    expect(serviceRead.app.communications?.enabled).toBe(true)

    const publishedService = {
      ...serviceRead.app,
      communications: { enabled: true },
      authentication: {
        ...serviceRead.app.authentication,
        members: [
          { email: ownerEmail, roleIds: ['owner'] as string[], company: '' },
          { email: staffEmail, roleIds: ['staff'] as string[], company: '' },
          { email: clientEmail, roleIds: ['client'] as string[], company: '' },
        ],
      },
    }
    await database.db.update(database.apps).set({ published: publishedService, draft: publishedService, publishedAt: new Date() }).where(eq(database.apps.id, serviceInstalled.appId))

    const repairs = await database.db.select().from(database.rows).where(and(eq(database.rows.tableId, service.repairsTableId), isNull(database.rows.deletedAt)))
    const owned = repairs.filter(row => String((row.data as Record<string, unknown>)[service.repair.clientEmail] ?? '').toLowerCase() === clientEmail)
    expect(owned.length).toBeGreaterThanOrEqual(2)
    const primary = owned[0]!, secondary = owned[1]!
    const primaryData = primary.data as Record<string, unknown>
    const secondaryData = secondary.data as Record<string, unknown>
    const email = clientEmail

    await database.db.insert(database.businessCustomers).values({ id: newId('businessCustomer'), workspaceId, email, name: 'Мария Сидорова' }).onConflictDoNothing()
    const [customer] = await database.db.select().from(database.businessCustomers).where(and(eq(database.businessCustomers.workspaceId, workspaceId), eq(database.businessCustomers.email, email)))
    const staffActor = `person_${createHash('sha256').update(`${workspaceId}:${staffEmail}`).digest('hex')}`
    const clientActor = `person_${createHash('sha256').update(`${workspaceId}:${email}`).digest('hex')}`
    const seedThread = async (repair: typeof primary, bodies: [string, string], note: string, stamp: string) => {
      const conversationId = `con_${newId('row').slice(4)}`
      await database.db.insert(database.conversations).values({
        id: conversationId, workspaceId, appId: serviceInstalled.appId, kind: 'record',
        moduleId: `mod_service_${service.repairsTableId}`, tableId: service.repairsTableId, rowId: repair.id, customerId: customer!.id,
      })
      await database.db.insert(database.conversationMessages).values([
        {
          id: `msg_${newId('row').slice(4)}`, workspaceId, conversationId, authorId: clientActor, authorKind: 'client', authorName: 'Мария Сидорова',
          requestId: newId('row'), body: bodies[0], createdAt: new Date(`${stamp}T09:12:00.000Z`),
        },
        {
          id: `msg_${newId('row').slice(4)}`, workspaceId, conversationId, authorId: staffActor, authorKind: 'staff', authorName: 'Андрей Морозов',
          requestId: newId('row'), body: bodies[1], createdAt: new Date(`${stamp}T10:05:00.000Z`),
        },
      ])
      await database.db.insert(database.conversationNotes).values({
        id: `msg_${newId('row').slice(4)}`, workspaceId, conversationId, authorId: staffActor, authorName: 'Андрей Морозов',
        requestId: newId('row'), body: note, createdAt: new Date(`${stamp}T10:06:00.000Z`),
      })
      return conversationId
    }
    await seedThread(primary,
      ['Добрый день. Подскажите, когда будет готова стиральная машина?', 'Здравствуйте. Диагностика завершена, ждём деталь. Ориентир — 26.11.2026.'],
      'Клиент просил перезвонить после 18:00. Деталь на складе поставщика.',
      '2026-11-24')
    await seedThread(secondary,
      ['Можно уточнить стоимость замены экрана?', 'Да, смета готова — посмотрите в карточке ремонта.'],
      'Согласовать с клиентом замену стекла до заказа детали.',
      '2026-11-23')

    const [deliveryRow] = await database.db.select().from(database.apps).where(eq(database.apps.id, deliveryInstalled.appId))
    const deliveryDraft = deliveryRow!.draft as Record<string, unknown>
    expect((deliveryDraft as { communications?: { enabled?: boolean } }).communications?.enabled).toBe(true)
    await database.db.update(database.apps).set({ published: deliveryDraft, publishedAt: new Date() }).where(eq(database.apps.id, deliveryInstalled.appId))

    const base = 'http://127.0.0.1:3210'
    const messagesUrl = `${base}/a/${serviceInstalled.appSlug}?screen=__tableapp_messages`
    writeFileSync('/tmp/correspondence-runtime.json', JSON.stringify({
      workspaceId,
      service: {
        appId: serviceInstalled.appId, slug: serviceInstalled.appSlug, repairId: primary.id, repairIds: [primary.id, secondary.id],
        repairsTableId: service.repairsTableId, repairScreenId: service.repairScreenId, clientRepairScreenId: service.clientRepairScreenId,
        device: String(primaryData[service.repair.device] ?? ''),
        secondaryDevice: String(secondaryData[service.repair.device] ?? ''),
        operatorUrl: `${base}/a/${serviceInstalled.appSlug}?screen=${service.repairScreenId}&row=${primary.id}`,
        clientUrl: `${base}/a/${serviceInstalled.appSlug}?screen=${service.clientRepairScreenId}&row=${primary.id}`,
        messagesUrl,
        operatorMessagesUrl: messagesUrl,
        clientMessagesUrl: messagesUrl,
      },
      builder: {
        appId: deliveryInstalled.appId, slug: deliveryInstalled.appSlug,
        url: `${base}/apps/${encodeURIComponent(deliveryInstalled.appId)}?advanced=1`,
      },
      cookies: {
        ownerStaff: `tableapp_staff=${ownerSessionId}`,
        staff: `tableapp_staff=${staffSessionId}`,
        client: `tableapp_staff=${clientSessionId}`,
        member: `tableapp_session=${memberSessionId}; tableapp_workspace=${workspaceId}`,
      },
    }, null, 2))
  })
})
