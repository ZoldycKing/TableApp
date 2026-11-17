import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { eq, inArray } from 'drizzle-orm'
import { newId, normalizeView, type App, type Field } from '@tableapp/schema'
import { generateApp } from './app-builder'
import { buildTemplate } from './templates/build'
import { zayavki } from './templates/defs/zayavki'
import { dispatchFields } from './templates/dispatch-app'
import { templatePreset } from './templates/presets'

const envFile = resolve(import.meta.dirname, '../../../../.env')
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile)
const identity = vi.hoisted(() => ({ member: null as import('./session').Member | null, email: 'sergey@example.invalid' as string | null }))
vi.mock('@/lib/session', async original => ({ ...await original<typeof import('./session')>(), currentMember: async () => identity.member }))
vi.mock('@/lib/app-session', async original => {
  const actual = await original<typeof import('./app-session')>()
  return { ...actual, currentAppAccess: (app: App) => actual.appAccessFor(app, identity.email) }
})
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

describe.skipIf(!process.env.DATABASE_URL)('dispatch permissions and setup against Postgres', () => {
  let database: typeof import('@tableapp/db'), actions: typeof import('@/app/runtime-actions'), setup: typeof import('@/app/dispatch-setup-actions')
  let runtime: typeof import('./app-runtime'), appSession: typeof import('./app-session')
  const owner = newId('user'), workspace = newId('workspace')
  const slug = `dispatch-${Date.now()}-${newId('app').slice(-6).toLowerCase()}`
  const built = buildTemplate({ template: zayavki, workspaceId: workspace })
  const oldBuilt = buildTemplate({ template: zayavki, workspaceId: workspace, afterPosition: built.tables.at(-1)!.position })
  const main = built.tables.find(table => table.id === built.appTableId)!
  const oldMain = oldBuilt.tables.find(table => table.id === oldBuilt.appTableId)!
  const oldFields = oldBuilt.fields.filter(field => field.tableId !== oldMain.id || !['Почта мастера', 'Клиент для выезда'].includes(field.name))
  const ownFields = built.fields.filter(field => field.tableId === main.id) as Field[]
  const f = dispatchFields(ownFields)
  let app: App, legacy: App, member: NonNullable<typeof identity.member>

  beforeAll(async () => {
    database = await import('@tableapp/db'); actions = await import('@/app/runtime-actions')
    setup = await import('@/app/dispatch-setup-actions'); runtime = await import('./app-runtime'); appSession = await import('./app-session')
    const { db, users, workspaces, workspaceMembers, tables, fields, views, rows, apps } = database
    await db.insert(users).values({ id: owner, email: `${slug}@example.invalid` })
    await db.insert(workspaces).values({ id: workspace, ownerId: owner, name: 'Dispatch test', slug })
    await db.insert(workspaceMembers).values({ workspaceId: workspace, userId: owner, role: 'owner' })
    member = { userId: owner, workspaceId: workspace, workspaceName: 'Dispatch test', email: `${slug}@example.invalid`, name: 'Test', role: 'owner' }
    identity.member = member
    await db.insert(tables).values([...built.tables, ...oldBuilt.tables])
    await db.insert(fields).values([...built.fields, ...oldFields])
    await db.insert(views).values([...built.views, ...oldBuilt.views])
    const removed = new Set(oldBuilt.fields.filter(field => !oldFields.includes(field)).map(field => field.id))
    await db.insert(rows).values([...built.rows, ...oldBuilt.rows.map(row => ({ ...row,
      data: Object.fromEntries(Object.entries(row.data).filter(([id]) => !removed.has(id))) }))])
    const generated = generateApp({ appId: newId('app'), workspaceId: workspace, name: 'Dispatch', slug, table: main,
      fields: ownFields, view: normalizeView(built.views.find(view => view.id === built.appViewId)!) })
    app = templatePreset(generated, built)
    app.allowlist = [{ email: 'sergey@example.invalid', roleId: 'staff', company: '' },
      { email: 'andrey@example.invalid', roleId: 'staff', company: '' }, { email: 'dispatcher@example.invalid', roleId: 'manager', company: '' }]
    legacy = generateApp({ appId: newId('app'), workspaceId: workspace, name: 'Legacy dispatch', slug: `${slug}-old`, table: oldMain,
      fields: oldFields.filter(field => field.tableId === oldMain.id) as Field[], view: normalizeView(oldBuilt.views.find(view => view.id === oldBuilt.appViewId)!) })
    legacy.allowlist = [{ email: 'legacy@example.invalid', roleId: 'client', company: '' }]
    await db.insert(apps).values([app, legacy].map(definition => ({ id: definition.id, workspaceId: workspace,
      name: definition.name, slug: definition.slug, draft: definition, published: definition })))
  })
  afterAll(async () => {
    if (!database) return
    await database.db.delete(database.workspaces).where(eq(database.workspaces.id, workspace))
    await database.db.delete(database.users).where(eq(database.users.id, owner))
    await database.sql.end()
  })

  it('loads only assigned rows and no hidden fields through the actual runtime loader', async () => {
    const { visitor } = await appSession.currentAppAccess(app)
    const loaded = (await runtime.loadPublishedApp(slug, visitor))!
    expect(loaded.tables[main.id]!.rows).toHaveLength(5)
    expect(loaded.tables[main.id]!.rows.every(row => ![f.price, f.paid, f.email, f.client].some(id => id in row.data))).toBe(true)
    expect(loaded.tables[main.id]!.rows[0]!.data[f.clientName]).toEqual(['ИП Соколов'])
    expect(JSON.stringify(loaded)).not.toContain('Ремонт витринного холодильника')
    expect(Object.keys(loaded.blocks)).toHaveLength(0)
  })
  it('writes the own status and comment, ignoring forged assignment/finance/customer/date fields', async () => {
    const { db, rows, rowChanges } = database
    const row = built.rows.find(row => row.tableId === main.id)!
    const done = ownFields.find(field => field.id === f.status)!
    if (done.type !== 'single_select') throw new Error('missing status')
    const doneId = done.options.choices.find(choice => choice.name === 'Выполнено')!.id
    const result = await actions.appUpdateRowAction(slug, main.id, row.id, {
      [f.status]: doneId, [f.comment]: 'Synthetic master report', [f.email]: 'andrey@example.invalid',
      [f.price]: 1, [f.paid]: true, [f.client]: [], [f.date]: '2026-12-31',
    }, 0)
    expect(result.ok).toBe(true)
    const [saved] = await db.select().from(rows).where(eq(rows.id, row.id))
    expect(saved!.data).toMatchObject({ ...row.data, [f.status]: doneId, [f.comment]: 'Synthetic master report' })
    expect(saved!.version).toBe(1)
    const changes = await db.select().from(rowChanges).where(eq(rowChanges.rowId, row.id))
    expect(changes).toHaveLength(1)
    expect(changes[0]!.actorKind).toBe('app_user')
  })
  it('blocks foreign-row update, creation and deletion, without changing rows or history', async () => {
    const { db, rows, rowChanges } = database
    const foreign = built.rows.find(row => row.tableId === main.id && row.data[f.email] === 'andrey@example.invalid')!
    const [before] = await db.select().from(rows).where(eq(rows.id, foreign.id))
    expect((await actions.appUpdateRowAction(slug, main.id, foreign.id, { [f.comment]: 'must not write' }, 0)).ok).toBe(false)
    expect((await actions.appCreateRowAction(slug, main.id, { [f.what]: 'must not create' })).ok).toBe(false)
    expect((await actions.appDeleteRowAction(slug, main.id, foreign.id, 0)).ok).toBe(false)
    expect((await db.select().from(rows).where(eq(rows.id, foreign.id)))[0]).toEqual(before)
    expect(await db.select().from(rowChanges).where(eq(rowChanges.rowId, foreign.id))).toHaveLength(0)
  })
  it('allows dispatcher reassignment and revokes the old master on the next read and write', async () => {
    identity.email = 'dispatcher@example.invalid'
    const { visitor: dispatcher } = await appSession.currentAppAccess(app)
    const loaded = (await runtime.loadPublishedApp(slug, dispatcher))!
    const clients = built.tables.find(table => table.id !== main.id)!
    expect(loaded.relatedTitles[clients.id]).toHaveLength(7)
    expect(loaded.tables[clients.id]!.rows).toHaveLength(7)
    const row = built.rows.find(row => row.tableId === main.id)!
    expect((await actions.appUpdateRowAction(slug, main.id, row.id, { [f.email]: 'andrey@example.invalid', [f.price]: 19000 }, 1)).ok).toBe(true)
    identity.email = 'sergey@example.invalid'
    const { visitor } = await appSession.currentAppAccess(app)
    expect((await runtime.loadPublishedApp(slug, visitor))!.tables[main.id]!.rows.some(item => item.id === row.id)).toBe(false)
    expect((await actions.appUpdateRowAction(slug, main.id, row.id, { [f.comment]: 'stale master' }, 2)).ok).toBe(false)
    identity.email = 'andrey@example.invalid'
    expect((await actions.appUpdateRowAction(slug, main.id, row.id, { [f.comment]: 'new assignee' }, 2)).ok).toBe(true)
  })
  it('rejects unauthorized setup and stale drafts before touching structure', async () => {
    identity.member = null
    expect((await setup.enableDispatchAction(legacy.id, oldMain.id, legacy)).ok).toBe(false)
    identity.member = { ...member, role: 'viewer' }
    expect((await setup.enableDispatchAction(legacy.id, oldMain.id, legacy)).ok).toBe(false)
    identity.member = member
    expect((await setup.enableDispatchAction(legacy.id, oldMain.id, { ...legacy, name: 'unsaved change' })).ok).toBe(false)
    expect((await database.db.select().from(database.fields).where(eq(database.fields.tableId, oldMain.id))).some(field => field.name === 'Почта мастера')).toBe(false)
  })
  it('upgrades only the draft and metadata; preserves records/history/published app and is idempotent', async () => {
    const { db, rows, rowChanges, apps, fields } = database
    const before = await db.select().from(rows).where(inArray(rows.tableId, oldBuilt.tables.map(table => table.id)))
    const result = await setup.enableDispatchAction(legacy.id, oldMain.id, legacy)
    if (!result.ok) throw new Error(result.error)
    const [record] = await db.select().from(apps).where(eq(apps.id, legacy.id))
    expect(record!.published).toEqual(legacy)
    expect(record!.draft).toEqual(result.app)
    expect(result.app.allowlist).toEqual(legacy.allowlist)
    expect(await db.select().from(rows).where(inArray(rows.tableId, oldBuilt.tables.map(table => table.id)))).toEqual(before)
    expect(await db.select().from(rowChanges).where(inArray(rowChanges.tableId, oldBuilt.tables.map(table => table.id)))).toHaveLength(0)
    const count = (await db.select().from(fields).where(eq(fields.tableId, oldMain.id))).length
    expect(count).toBe(oldFields.filter(field => field.tableId === oldMain.id).length + 2)
    expect((await setup.enableDispatchAction(legacy.id, oldMain.id, result.app)).ok).toBe(true)
    expect((await db.select().from(fields).where(eq(fields.tableId, oldMain.id))).length).toBe(count)
    const oldEmail = dispatchFields((await db.select().from(fields).where(eq(fields.tableId, oldMain.id))) as unknown as Field[]).email
    expect(before.filter(row => row.tableId === oldMain.id).every(row => !(oldEmail in (row.data as Record<string, unknown>)))).toBe(true)
  })
})
