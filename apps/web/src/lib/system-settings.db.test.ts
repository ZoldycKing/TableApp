import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultViewConfig, newId, normalizeFieldOptions, viewSchema, type Field } from '@tableapp/schema'
const envFile = resolve(import.meta.dirname, '../../../../.env')
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile)
const identity = vi.hoisted(() => ({ member: null as import('./session').Member | null }))
vi.mock('@/lib/session', async (original) => ({ ...await original<typeof import('./session')>(), currentMember: async () => identity.member }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

describe.skipIf(!process.env.DATABASE_URL)('system metadata and legacy settings against Postgres', () => {
  let database: typeof import('@tableapp/db')
  let core: typeof import('./row-mutations')
  let queries: typeof import('./queries')
  let sync: typeof import('@/app/api/sync/route')
  let migration: typeof import('./settings-migration')
  const ids = { user: newId('user'), workspace: newId('workspace'), table: newId('table'), view: newId('view'),
    title: newId('field'), rowId: newId('field'), created: newId('field'), updated: newId('field'),
    creator: newId('field'), editor: newId('field'), formula: newId('field'), number: newId('field') }
  const columns: Field[] = [
    ['title', 'Name', 'text'], ['rowId', 'Record ID', 'row_id'], ['created', 'Created', 'created_time'],
    ['updated', 'Updated', 'updated_time'], ['creator', 'Creator', 'created_by'], ['editor', 'Editor', 'updated_by'],
    ['formula', 'ID formula', 'formula'], ['number', 'Number', 'number'],
  ].map(([key, name, type], index) => ({ id: ids[key as keyof typeof ids], tableId: ids.table, name: name!, type: type!,
    options: type === 'formula' ? { expression: 'CONCAT({Record ID}, "!")', resultType: 'text' } : normalizeFieldOptions(type as Field['type']),
    description: null, position: `a${index + 1}` })) as Field[]
  const actor = { id: ids.user, kind: 'member' }
  beforeAll(async () => {
    database = await import('@tableapp/db'); core = await import('./row-mutations'); queries = await import('./queries')
    sync = await import('@/app/api/sync/route'); migration = await import('./settings-migration')
    await database.db.insert(database.users).values({ id: ids.user, email: `${ids.user}@example.invalid` })
    await database.db.insert(database.workspaces).values({ id: ids.workspace, ownerId: ids.user, name: 'System tests', slug: ids.workspace })
    await database.db.insert(database.workspaceMembers).values({ workspaceId: ids.workspace, userId: ids.user, role: 'owner' })
  })
  beforeEach(async () => {
    identity.member = { userId: ids.user, email: `${ids.user}@example.invalid`, name: 'Test', workspaceId: ids.workspace, workspaceName: 'Test', role: 'owner' }
    await database.db.delete(database.tables).where(eq(database.tables.workspaceId, ids.workspace))
    await database.db.delete(database.workspaceUsage).where(eq(database.workspaceUsage.workspaceId, ids.workspace))
    await database.db.insert(database.tables).values({ id: ids.table, workspaceId: ids.workspace, name: 'Records', position: 'a1', primaryFieldId: ids.title })
    await database.db.insert(database.fields).values(columns)
    await database.db.insert(database.views).values({ id: ids.view, tableId: ids.table, name: 'All', type: 'grid', position: 'a1', config: defaultViewConfig('grid', newId('filter')) })
  })
  afterAll(async () => {
    if (!database) return
    await database.db.delete(database.workspaces).where(eq(database.workspaces.id, ids.workspace))
    await database.db.delete(database.users).where(eq(database.users.id, ids.user))
    await database.sql.end()
  })
  const create = () => core.writeRows(ids.workspace, (tx) => core.createRow(tx, ids.table, {
    [ids.title]: 'Record', [ids.rowId]: 'FORGED_ID', [ids.creator]: 'FORGED_CREATOR', [ids.created]: '2099-01-01',
  }, actor))
  const snapshot = async (rowId: string) => (await queries.loadTable(ids.table, ids.workspace))!.rows.find((row) => row.id === rowId)!
  const stored = async (rowId: string) => (await database.db.select().from(database.rows).where(eq(database.rows.id, rowId)))[0]!
  const request = (extra: Record<string, unknown> = {}) => sync.POST(new Request('http://localhost/api/sync', {
    method: 'POST', body: JSON.stringify({ tableId: ids.table, deviceId: 'system-device', ...extra }),
  }))
  it('projects all five system fields and computes formulas after projection', async () => {
    const { id } = await create(), record = await stored(id), loaded = await snapshot(id)
    expect(loaded.data).toMatchObject({ [ids.rowId]: id, [ids.created]: record.createdAt.toISOString(),
      [ids.updated]: record.updatedAt.toISOString(), [ids.creator]: ids.user, [ids.editor]: ids.user, [ids.formula]: `${id}!` })
    expect(record.data).not.toHaveProperty(ids.rowId)
    expect(record.data).not.toHaveProperty(ids.creator)
    expect(record.data).not.toHaveProperty(ids.formula)
  })
  it('updates the editor while keeping the creator and creation time intact', async () => {
    const { id } = await create(), before = await stored(id)
    await core.writeRows(ids.workspace, (tx) => core.updateRow(tx, ids.table, id, { [ids.title]: 'Changed' }, { id: 'app-user-test', kind: 'app_user' }))
    const after = await stored(id), loaded = await snapshot(id)
    expect(after.createdAt).toEqual(before.createdAt); expect(after.createdBy).toBe(ids.user)
    expect(loaded.data[ids.editor]).toBe('app-user-test')
    expect(loaded.data[ids.updated]).toBe(after.updatedAt.toISOString())
  })
  it('does not invent historical authors for old rows or trust stored system JSON', async () => {
    const id = newId('row')
    await database.db.insert(database.rows).values({ id, tableId: ids.table, position: 'a1', data: { [ids.rowId]: 'FORGED', [ids.creator]: 'FORGED' } })
    expect((await snapshot(id)).data).toMatchObject({ [ids.rowId]: id, [ids.creator]: null, [ids.editor]: null })
  })
  it('rejects direct cell and sync writes to system fields without a version change', async () => {
    const { id } = await create()
    const { setCellAction } = await import('@/app/actions')
    expect((await setCellAction(ids.table, id, ids.rowId, 'FORGED')).ok).toBe(false)
    const response = await (await request({ mutations: [{ id: 'system-edit', op: 'update', rowId: id, fieldId: ids.created, next: '2099-01-01' }] })).json()
    expect(response.rejected[0].status).toBe('dropped'); expect((await stored(id)).version).toBe(0)
  })
  it('includes system metadata and formulas in member sync snapshots', async () => {
    const { id } = await create()
    const response = await (await request()).json()
    expect(response.rows[0].data).toMatchObject({ [ids.rowId]: id, [ids.creator]: ids.user, [ids.formula]: `${id}!` })
    await core.writeRows(ids.workspace, (tx) => core.updateRow(tx, ids.table, id, { [ids.title]: 'Changed' }, actor))
    const delta = await (await request({ since: response.cursor })).json()
    expect(delta.rows[0].data[ids.updated]).toBe((await stored(id)).updatedAt.toISOString())
  })
  it('uses authoritative system fields in application filters and projections', async () => {
    const { id } = await create(), { generateApp } = await import('./app-builder')
    const app = generateApp({ appId: newId('app'), workspaceId: ids.workspace, slug: 'system-test', name: 'System',
      table: { id: ids.table, name: 'Records', primaryFieldId: ids.title }, fields: columns,
      view: viewSchema.parse({ id: ids.view, tableId: ids.table, name: 'All', type: 'grid', position: 'a1', config: defaultViewConfig('grid', newId('filter')) }) })
    const filter = { id: newId('filter'), conjunction: 'and', conditions: [{ id: newId('filter'), fieldId: ids.rowId, op: 'is', value: id }] }
    await database.db.update(database.views).set({ config: { ...defaultViewConfig('grid', newId('filter')), filter } }).where(eq(database.views.id, ids.view))
    const { appReadPolicy } = await import('./app-read-policy'), { asRole } = await import('./app-roles')
    const policy = await appReadPolicy(app, ids.table, asRole('manager'), null)
    const record = await stored(id), data = record.data as Record<string, unknown>
    expect(policy.canRead(data, record)).toBe(true)
    expect(policy.canRead(data, { ...record, id: 'wrong' })).toBe(false)
    expect(policy.project(data, record)[ids.rowId]).toBe(id)
    const { loadRuntimeForApp } = await import('./app-runtime')
    expect((await loadRuntimeForApp(app, asRole('manager')))!.tables[ids.table]!.rows[0]!.data[ids.rowId]).toBe(id)
  })
  it('fills legacy views on read without writing their stored configuration', async () => {
    await create()
    await database.db.update(database.views).set({ config: { columnWidths: { [ids.title]: 170 }, filter: null } }).where(eq(database.views.id, ids.view))
    const table = (await queries.loadTable(ids.table, ids.workspace))!
    expect(table.views[0]!.config).toMatchObject({ filter: { conditions: [] }, sorts: [], fieldWidths: { [ids.title]: 170 } })
    const [record] = await database.db.select().from(database.views).where(eq(database.views.id, ids.view))
    expect(record!.config).not.toHaveProperty('fieldWidths')
  })
  it('previews and migrates metadata idempotently without rewriting user rows', async () => {
    const { id } = await create(), before = await stored(id)
    await database.db.update(database.fields).set({ options: { precision: 3, extension: 'keep' } }).where(eq(database.fields.id, ids.number))
    await database.db.update(database.views).set({ config: {} }).where(eq(database.views.id, ids.view))
    expect(await migration.migrateSettings({ workspaceId: ids.workspace })).toMatchObject({ fields: 1, views: 1 })
    expect((await database.db.select().from(database.views).where(eq(database.views.id, ids.view)))[0]!.config).toEqual({})
    expect(await migration.migrateSettings({ run: true, workspaceId: ids.workspace })).toMatchObject({ fields: 1, views: 1 })
    expect(await stored(id)).toEqual(before)
    expect(await migration.migrateSettings({ run: true, workspaceId: ids.workspace })).toMatchObject({ fields: 0, views: 0 })
    expect((await queries.loadTable(ids.table, ids.workspace))!.fields.find((field) => field.id === ids.number)!.options)
      .toMatchObject({ precision: 3, showThousandsSeparator: true })
  })
  it('leaves malformed filters and references unchanged during migration', async () => {
    const malformed = { filter: { conditions: 'bad' } }
    await database.db.update(database.views).set({ config: malformed }).where(eq(database.views.id, ids.view))
    await database.db.update(database.fields).set({ type: 'relation', options: {} }).where(eq(database.fields.id, ids.number))
    const result = await migration.migrateSettings({ run: true, workspaceId: ids.workspace })
    expect(result.invalidFields).toEqual([ids.number]); expect(result.invalidViews).toEqual([ids.view])
    expect((await database.db.select().from(database.views).where(eq(database.views.id, ids.view)))[0]!.config).toEqual(malformed)
  })
  it('projects system fields of a related table for lookup', async () => {
    const target = newId('table'), relation = newId('field'), lookup = newId('field'), system = newId('field')
    await database.db.insert(database.tables).values({ id: target, workspaceId: ids.workspace, name: 'Related', position: 'a2', primaryFieldId: system })
    await database.db.insert(database.fields).values([
      { id: system, tableId: target, name: 'Target ID', type: 'row_id', position: 'a1' },
      { id: relation, tableId: ids.table, name: 'Related', type: 'relation', options: { tableId: target }, position: 'a9' },
      { id: lookup, tableId: ids.table, name: 'Target ID lookup', type: 'lookup', options: { relationFieldId: relation, targetFieldId: system }, position: 'b1' },
    ])
    const row = await core.writeRows(ids.workspace, (tx) => core.createRow(tx, target, {}, actor))
    const source = await core.writeRows(ids.workspace, (tx) => core.createRow(tx, ids.table, { [relation]: [row.id] }, actor))
    const table = (await queries.loadTable(ids.table, ids.workspace))!
    expect(table.rows.find((row) => row.id === source.id)!.data[lookup]).toEqual([row.id])
    expect(table.relatedTitles[target]![0]!.title).toBe(row.id)
  })
})
