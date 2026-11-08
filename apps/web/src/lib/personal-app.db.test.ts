import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { and, eq } from 'drizzle-orm'
import { appSchema, defaultViewConfig, newId, normalizeView, type Field } from '@tableapp/schema'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { putSection, sectionSources } from './app-sections'

const envFile = resolve(import.meta.dirname, '../../../../.env')
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile)
const identity = vi.hoisted(() => ({ member: null as import('./session').Member | null, account: null as import('./session').Account | null }))
vi.mock('@/lib/session', async original => ({ ...await original<typeof import('./session')>(), currentMember: async () => identity.member, currentAccount: async () => identity.account }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }))
vi.mock('@/lib/live', () => ({ publishTable: vi.fn() }))

describe.skipIf(!process.env.DATABASE_URL)('personal applications on Postgres', () => {
  let database: typeof import('@tableapp/db')
  let actions: typeof import('@/app/app-actions')
  let sessions: typeof import('./app-session')
  const userId = newId('user'), workspaceId = newId('workspace'), otherSpace = newId('workspace')
  const tableIds = [newId('table'), newId('table')], foreign = newId('table')
  const email = `personal-${userId}@example.invalid`
  const request = () => ({ tableIds, name: 'Мои дела', requestId: newId('app') })
  const load = async (id: string) => {
    const [record] = await database.db.select().from(database.apps).where(eq(database.apps.id, id))
    return appSchema.parse(record!.draft)
  }
  beforeAll(async () => {
    database = await import('@tableapp/db'); actions = await import('@/app/app-actions'); sessions = await import('./app-session')
    const { db, users, workspaces, workspaceMembers, tables, fields, views, rows } = database
    await db.insert(users).values({ id: userId, email })
    await db.insert(workspaces).values([{ id: workspaceId, ownerId: userId, name: 'Personal tests', slug: `personal-${workspaceId}` }, { id: otherSpace, ownerId: userId, name: 'Other space', slug: `personal-${otherSpace}` }])
    await db.insert(workspaceMembers).values({ userId, workspaceId, role: 'owner' })
    for (const [index, id] of [...tableIds, foreign].entries()) {
      const nameField = newId('field')
      await db.insert(tables).values({ id, workspaceId: id === foreign ? otherSpace : workspaceId, name: index ? 'Проекты' : 'Расходы', primaryFieldId: nameField, position: `a${index}` })
      await db.insert(fields).values({ id: nameField, tableId: id, name: 'Название', type: 'text', options: {}, position: 'a0' })
      await db.insert(views).values({ id: newId('view'), tableId: id, name: 'Все записи', type: 'grid', position: 'a0', config: defaultViewConfig('grid', newId('filter')) })
      await db.insert(rows).values({ id: newId('row'), tableId: id, position: 'a0', data: { [nameField]: index ? 'Ремонт кухни' : 'Покупки' } })
    }
  })
  beforeEach(async () => {
    identity.member = { userId, workspaceId, workspaceName: 'Personal tests', email, name: 'Owner', role: 'owner' }
    identity.account = { userId, email, name: 'Owner' }
    await database.db.delete(database.apps).where(eq(database.apps.workspaceId, workspaceId))
    await database.db.delete(database.workspaceUsage).where(eq(database.workspaceUsage.workspaceId, workspaceId))
  })
  afterAll(async () => {
    if (!database) return
    await database.db.delete(database.workspaces).where(eq(database.workspaces.id, workspaceId))
    await database.db.delete(database.workspaces).where(eq(database.workspaces.id, otherSpace))
    await database.db.delete(database.users).where(eq(database.users.id, userId))
  })
  it('creates one private app from both tables and safely retries an identical request', async () => {
    const input = request()
    expect(await actions.createPersonalAppAction(input)).toEqual({ ok: true, appId: input.requestId })
    expect(await actions.createPersonalAppAction(input)).toEqual({ ok: true, appId: input.requestId })
    expect(await database.db.select().from(database.apps).where(eq(database.apps.workspaceId, workspaceId))).toHaveLength(1)
    const app = await load(input.requestId)
    expect(app.purpose).toBe('personal')
    expect(app.allowlist).toEqual([{ email, roleId: 'manager', company: '' }])
    expect(app.screens.filter(screen => screen.tab).map(screen => screen.name)).toEqual(['Расходы', 'Проекты'])
    expect(await database.db.select().from(database.rows).where(eq(database.rows.tableId, tableIds[0]!))).toHaveLength(1)
  })
  it('creates a closed team app, supports its verified owner session, and does not reuse a personal request', async () => {
    const input = { ...request(), purpose: 'business' as const }
    const before = await database.db.select().from(database.rows).where(eq(database.rows.tableId, tableIds[0]!))
    expect(await actions.createTablesAppAction(input)).toEqual({ ok: true, appId: input.requestId })
    expect(await actions.createTablesAppAction(input)).toEqual({ ok: true, appId: input.requestId })
    expect((await actions.createPersonalAppAction(input)).ok).toBe(false)
    const app = await load(input.requestId)
    expect(app.purpose).toBe('business')
    expect(app.roles.find(role => role.isDefault)?.id).toBe('staff')
    expect(app.allowlist).toEqual([{ email, roleId: 'manager', company: '' }])
    expect((await sessions.currentAppAccess(app)).viewer?.workspaceSession).toBe(true)
    identity.account = { ...identity.account!, email: 'unlisted@example.invalid' }
    expect((await sessions.currentAppAccess(app)).visitor.authenticated).toBe(false)
    identity.account = null
    expect((await sessions.currentAppAccess(app)).visitor.authenticated).toBe(false)
    expect(await database.db.select().from(database.rows).where(eq(database.rows.tableId, tableIds[0]!))).toEqual(before)
  })
  it('rejects foreign data, a viewer, and invalid selections without creating a partial app', async () => {
    expect((await actions.createPersonalAppAction({ ...request(), tableIds: [tableIds[0]!, foreign] })).ok).toBe(false)
    identity.member = { ...identity.member!, role: 'viewer' }
    expect((await actions.createPersonalAppAction(request())).ok).toBe(false)
    identity.member = { ...identity.member!, role: 'owner' }
    expect((await actions.createPersonalAppAction({ ...request(), tableIds: [] })).ok).toBe(false)
    expect(await database.db.select().from(database.apps).where(eq(database.apps.workspaceId, workspaceId))).toHaveLength(0)
  })
  it('previews an unsaved team draft read-only and rejects a mismatched workspace', async () => {
    const input = { ...request(), purpose: 'business' as const }
    await actions.createTablesAppAction(input)
    const app = await load(input.requestId)
    const { editorPreviewAction } = await import('@/app/editor-preview-actions')
    const preview = await editorPreviewAction(app.id, { ...app, name: 'Предпросмотр без сохранения' }, 'staff', '', '')
    expect(preview.ok).toBe(true)
    if (preview.ok) {
      expect(preview.preview.runtime.app.name).toBe('Предпросмотр без сохранения')
      expect(Object.values(preview.preview.runtime.tables).some(table => table.rows.length > 0)).toBe(true)
    }
    expect((await load(app.id)).name).toBe(input.name)
    expect((await editorPreviewAction(app.id, { ...app, workspaceId: otherSpace }, 'staff', '', '')).ok).toBe(false)
    expect((await editorPreviewAction(app.id, app, 'nonexistent', '', '')).ok).toBe(false)
    identity.member = { ...identity.member!, role: 'editor', tableAccess: {} }
    expect((await editorPreviewAction(app.id, app, 'staff', '', '')).ok).toBe(false)
  })
  it('allows the verified owner account into its app, denies an unrelated account and anonymous access', async () => {
    const input = request(); await actions.createPersonalAppAction(input)
    const app = await load(input.requestId)
    const access = await sessions.currentAppAccess(app)
    expect(access.visitor.authenticated).toBe(true)
    expect(access.viewer?.workspaceSession).toBe(true)
    identity.account = { ...identity.account!, email: 'unrelated@example.invalid' }
    expect((await sessions.currentAppAccess(app)).visitor.authenticated).toBe(false)
    identity.account = null
    expect((await sessions.currentAppAccess(app)).viewer).toBeNull()
  })
  it('saves a custom section and publishes without any company profile or employee setup', async () => {
    const input = request(); await actions.createPersonalAppAction(input)
    const app = await load(input.requestId), { db, tables, fields, views } = database
    const table = (await db.select().from(tables).where(eq(tables.id, tableIds[0]!)))[0]!
    const columns = await db.select().from(fields).where(eq(fields.tableId, table.id))
    const source = sectionSources([{ ...table, fields: columns as unknown as Field[] }], (await db.select().from(views).where(eq(views.tableId, table.id))).map(normalizeView))[0]!
    const next = putSection(app, { source, type: 'dashboard', name: 'Обзор', icon: 'chart' }).app
    expect(await actions.updateAppDraftAction(app.id, next)).toEqual({ ok: true })
    expect(await actions.publishAppAction(app.id, next)).toEqual(expect.objectContaining({ ok: true }))
    const [stored] = await db.select().from(database.apps).where(and(eq(database.apps.id, app.id), eq(database.apps.workspaceId, workspaceId)))
    expect(appSchema.parse(stored!.published).screens.some(screen => screen.name === 'Обзор')).toBe(true)
  })
})
