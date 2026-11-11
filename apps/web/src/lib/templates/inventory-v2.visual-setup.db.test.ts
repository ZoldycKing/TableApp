import { existsSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { and, eq, isNull } from 'drizzle-orm'
import { readAppDefinition } from '@tableapp/schema/app-definition'
import { beforeAll, describe, expect, it, vi } from 'vitest'

const envFile = resolve(import.meta.dirname, '../../../../.env')
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile)

const userId = 'usr_invvisual'
const workspaceId = 'wsp_invvisual'
const ownerEmail = 'owner-inv@example.invalid'
const staffEmail = 'kladovshik@example.invalid'
const ownerSessionId = 'ses_invvisual_owner'
const staffSessionId = 'ses_invvisual_staff'
const identity = vi.hoisted(() => ({ member: null as import('../session').Member | null }))
vi.mock('@/lib/session', async original => ({ ...await original<typeof import('../session')>(), currentMember: async () => identity.member }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/live', () => ({ publishTable: vi.fn() }))

describe.skipIf(!process.env.DATABASE_URL)('inventory visual setup', () => {
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
    await database.db.delete(database.staffSessions).where(eq(database.staffSessions.email, ownerEmail))
    await database.db.delete(database.staffSessions).where(eq(database.staffSessions.email, staffEmail))
    await database.db.delete(database.sessions).where(eq(database.sessions.userId, userId))
    await database.db.delete(database.users).where(eq(database.users.id, userId))
    await database.db.insert(database.users).values({ id: userId, email: ownerEmail })
    await database.db.insert(database.workspaces).values({ id: workspaceId, ownerId: userId, name: 'Inventory Visual', slug: 'inv-visual', plan: 'business' })
    await database.db.insert(database.workspaceMembers).values({ userId, workspaceId, role: 'owner' })
    await database.db.insert(database.sessions).values({ id: 'ses_invvisual_ws', userId, expiresAt: new Date(Date.now() + SESSION_TTL_MS) })
    await database.db.insert(database.staffSessions).values([
      { id: ownerSessionId, email: ownerEmail, expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
      { id: staffSessionId, email: staffEmail, expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
    ])
  })

  it('installs published inventory with demo seed', async () => {
    identity.member = { userId, workspaceId, workspaceName: 'Inventory Visual', email: ownerEmail, name: 'Owner', role: 'owner' }
    const installed = await actions.applyTemplateAction('sklad')
    expect(installed.ok).toBe(true)
    if (!installed.ok) return
    const [record] = await database.db.select().from(database.apps).where(eq(database.apps.id, installed.appId))
    const read = readAppDefinition(record!.draft)
    if (!read.ok || read.formatVersion !== 2 || !read.app.inventory) throw new Error('bad inventory')
    const inv = read.app.inventory
    const published = {
      ...read.app,
      authentication: {
        ...read.app.authentication,
        members: [
          { email: ownerEmail, roleIds: ['owner'] as string[], company: '' },
          { email: staffEmail, roleIds: ['staff'] as string[], company: '' },
        ],
      },
    }
    await database.db.update(database.apps).set({ published, draft: published, publishedAt: new Date() }).where(eq(database.apps.id, installed.appId))
    const items = await database.db.select().from(database.rows).where(and(eq(database.rows.tableId, inv.itemsTableId), isNull(database.rows.deletedAt)))
    const low = items.find(row => (row.data as Record<string, unknown>)[inv.itemNameFieldId] === 'Фильтр воздушный FA-120') ?? items[0]
    const longName = 'Комплект уплотнителей для холодильной витрины серии FrostLine Pro XL с усиленным крепежом и запасными втулками'
    const long = items.find(row => (row.data as Record<string, unknown>)[inv.itemNameFieldId] === longName) ?? items[0]
    const photoField = inv.itemPhotoFieldId
    const withPhotos = items.filter(row => {
      const value = photoField ? (row.data as Record<string, unknown>)[photoField] : null
      return Array.isArray(value) && value.length > 0
    }).length
    expect(withPhotos).toBe(items.length)
    writeFileSync('/tmp/inventory-visual.json', JSON.stringify({
      appId: installed.appId, slug: installed.appSlug,
      ownerCookie: `tableapp_staff=${ownerSessionId}`,
      staffCookie: `tableapp_staff=${staffSessionId}`,
      listUrl: `http://127.0.0.1:3210/a/${installed.appSlug}`,
      itemUrl: `http://127.0.0.1:3210/a/${installed.appSlug}?screen=${inv.itemScreenId}&row=${low?.id}`,
      longItemUrl: `http://127.0.0.1:3210/a/${installed.appSlug}?screen=${inv.itemScreenId}&row=${long?.id}`,
      createUrl: inv.createItemScreenId
        ? `http://127.0.0.1:3210/a/${installed.appSlug}?screen=${inv.createItemScreenId}`
        : `http://127.0.0.1:3210/a/${installed.appSlug}`,
      movementsUrl: `http://127.0.0.1:3210/a/${installed.appSlug}?screen=${inv.movementsScreenId}`,
      receiptFormId: inv.receiptFormId,
      writeOffFormId: inv.writeOffFormId,
      itemName: low ? (low.data as Record<string, unknown>)[inv.itemNameFieldId] : null,
      longItemName: long ? (long.data as Record<string, unknown>)[inv.itemNameFieldId] : null,
      photoCount: withPhotos,
    }, null, 2))
  })
})
