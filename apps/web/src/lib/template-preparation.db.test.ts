import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { appSchema, newId, positionBetween } from '@tableapp/schema'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { visibleScreensFor, visitorFor } from './app-roles'

const envFile = resolve(import.meta.dirname, '../../../../.env')
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile)
const identity = vi.hoisted(() => ({ member: null as import('./session').Member | null }))
vi.mock('@/lib/session', async original => ({ ...await original<typeof import('./session')>(), currentMember: async () => identity.member }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/live', () => ({ publishTable: vi.fn() }))

describe.skipIf(!process.env.DATABASE_URL)('first launch of every starter in Postgres', () => {
  let database: typeof import('@tableapp/db')
  let actions: typeof import('@/app/template-actions')
  let prepare: typeof import('./template-preparation')
  const userId = newId('user'), workspaceId = newId('workspace'), foreignId = newId('workspace')
  const email = `template-start-${userId}@example.invalid`
  beforeAll(async () => {
    database = await import('@tableapp/db')
    actions = await import('@/app/template-actions')
    prepare = await import('./template-preparation')
    await database.db.insert(database.users).values({ id: userId, email })
    await database.db.insert(database.workspaces).values([workspaceId, foreignId].map(id => ({ id, ownerId: userId, name: 'Template preparation tests', slug: `template-start-${id}` })))
    await database.db.insert(database.workspaceMembers).values([workspaceId, foreignId].map(workspaceId => ({ workspaceId, userId, role: 'owner' })))
  })
  beforeEach(async () => {
    const { db, apps, tables, workspaceUsage } = database
    identity.member = { userId, workspaceId, workspaceName: 'Template preparation tests', email, name: 'Owner', role: 'owner' }
    await db.delete(apps).where(inArray(apps.workspaceId, [workspaceId, foreignId]))
    await db.delete(tables).where(inArray(tables.workspaceId, [workspaceId, foreignId]))
    await db.delete(workspaceUsage).where(inArray(workspaceUsage.workspaceId, [workspaceId, foreignId]))
  })
  afterAll(async () => {
    if (!database) return
    const { deleteFile } = await import('./storage')
    const files = await database.db.select({ key: database.attachments.key }).from(database.attachments)
      .where(inArray(database.attachments.workspaceId, [workspaceId, foreignId]))
    await Promise.all(files.map(file => deleteFile(file.key)))
    await database.db.delete(database.workspaces).where(inArray(database.workspaces.id, [workspaceId, foreignId]))
    await database.db.delete(database.users).where(eq(database.users.id, userId))
  })
  const install = async (id: string) => {
    const result = await actions.applyTemplateAction(id)
    if (!result.ok) throw new Error(result.error)
    const [record] = await database.db.select().from(database.apps).where(eq(database.apps.id, result.appId))
    return { ...result, app: appSchema.parse(record!.draft) }
  }
  it.each(['salon', 'service', 'zayavki', 'nedvizhimost', 'dostavka', 'crm', 'sklad', 'proizvodstvo'])('%s starts empty without losing its roles, screens or configuration', async id => {
    const installed = await install(id)
    expect(installed.app.allowlist).toContainEqual({ email, roleId: id === 'proizvodstvo' ? 'director' : 'manager', company: '' })
    const creatorRole = installed.app.allowlist.find(entry => entry.email === email)!.roleId
    expect(installed.app.roles.some(role => role.id === creatorRole)).toBe(true)
    expect(visibleScreensFor(installed.app, visitorFor(installed.app, email)).some(screen => screen.tab)).toBe(true)
    const before = await database.db.select().from(database.rows).where(inArray(database.rows.tableId, installed.tableIds))
    const state = await prepare.templatePreparation(workspaceId, installed.appId)
    expect(state!.samples).toBe(before.length)
    expect(await actions.clearTemplateSamplesAction(installed.appId)).toEqual({ ok: true })
    expect(await database.db.select().from(database.rows).where(and(inArray(database.rows.tableId, installed.tableIds), isNull(database.rows.deletedAt)))).toHaveLength(0)
    expect((await prepare.templatePreparation(workspaceId, installed.appId))!.samples).toBe(0)
    const [after] = await database.db.select().from(database.apps).where(eq(database.apps.id, installed.appId))
    expect(appSchema.parse(after!.draft)).toEqual(installed.app)
    expect(after!.published).toBeNull()
    expect(await actions.clearTemplateSamplesAction(installed.appId)).toEqual({ ok: true })
  })
  it('retains a client, its deals and an incoming real reference while removing unrelated examples', async () => {
    const installed = await install('crm'), { db, rows } = database
    const clientsId = installed.app.customer!.crm!.clientsTableId
    const [client] = await db.select().from(rows).where(eq(rows.tableId, clientsId)).limit(1)
    await db.update(rows).set({ sample: false }).where(eq(rows.id, client!.id))
    const state = await prepare.templatePreparation(workspaceId, installed.appId)
    expect(state!.samples).toBeGreaterThan(0)
    expect(state!.removable.some(row => row.id === client!.id)).toBe(false)
    expect(await actions.clearTemplateSamplesAction(installed.appId)).toEqual({ ok: true })
    const remaining = await db.select().from(rows).where(and(inArray(rows.tableId, installed.tableIds), isNull(rows.deletedAt)))
    expect(remaining.some(row => row.id === client!.id)).toBe(true)
    expect(remaining.some(row => row.tableId === installed.app.customer!.tableId)).toBe(true)
  })
  it('protects source data referenced by a real row outside the app and never touches another installation', async () => {
    const installed = await install('salon'), { db, tables, fields, rows } = database
    const [service] = await db.select().from(rows).where(eq(rows.tableId, installed.app.booking!.tables.services)).limit(1)
    const extraTableId = newId('table'), extraFieldId = newId('field'), realRowId = newId('row')
    await db.insert(tables).values({ id: extraTableId, workspaceId, name: 'Own notes', position: 'z' })
    await db.insert(fields).values({ id: extraFieldId, tableId: extraTableId, name: 'Service', type: 'relation', position: 'a', options: { tableId: service!.tableId } })
    await db.insert(rows).values({ id: realRowId, tableId: extraTableId, position: positionBetween(null, null), sample: false, data: { [extraFieldId]: [service!.id] } })
    identity.member = { ...identity.member!, workspaceId: foreignId }
    const other = await install('salon')
    identity.member = { ...identity.member!, workspaceId }
    expect(await prepare.templatePreparation(workspaceId, other.appId)).toBeNull()
    expect((await actions.clearTemplateSamplesAction(other.appId)).ok).toBe(false)
    expect(await actions.clearTemplateSamplesAction(installed.appId)).toEqual({ ok: true })
    expect(await db.select().from(rows).where(and(eq(rows.id, service!.id), isNull(rows.deletedAt)))).toHaveLength(1)
    expect(await db.select().from(rows).where(and(eq(rows.id, realRowId), isNull(rows.deletedAt)))).toHaveLength(1)
    expect((await prepare.templatePreparation(foreignId, other.appId))!.samples).toBeGreaterThan(0)
  })
  it('rejects a viewer before changing any example', async () => {
    const installed = await install('proizvodstvo')
    const count = (await prepare.templatePreparation(workspaceId, installed.appId))!.samples
    identity.member = { ...identity.member!, role: 'viewer' }
    expect((await actions.clearTemplateSamplesAction(installed.appId)).ok).toBe(false)
    expect((await prepare.templatePreparation(workspaceId, installed.appId))!.samples).toBe(count)
  })
  it('installs the same starter concurrently in two spaces without colliding on its address', async () => {
    const first = actions.applyTemplateAction('salon')
    identity.member = { ...identity.member!, workspaceId: foreignId }
    const second = actions.applyTemplateAction('salon')
    const results = await Promise.all([first, second])
    expect(results.every(result => result.ok)).toBe(true)
    if (!results[0]!.ok || !results[1]!.ok) throw new Error('Concurrent installation failed')
    expect(results[0]!.appSlug).not.toBe(results[1]!.appSlug)
    const records = await database.db.select().from(database.apps).where(inArray(database.apps.id, results.map(result => result.ok ? result.appId : '')))
    expect(new Set(records.map(record => record.workspaceId))).toEqual(new Set([workspaceId, foreignId]))
    expect(records.every(record => appSchema.parse(record.draft).slug === record.slug)).toBe(true)
  })
})
