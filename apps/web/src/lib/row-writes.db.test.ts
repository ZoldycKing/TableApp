import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { and, asc, eq, inArray, isNull, sql as query } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultViewConfig, graceReserve, newId, planOf, viewSchema, type App, type Field } from '@tableapp/schema'

const envFile = resolve(import.meta.dirname, '../../../../.env')
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile)
const identity = vi.hoisted(() => ({ member: null as import('./session').Member | null, roleId: 'manager' }))
vi.mock('@/lib/session', async (original) => ({ ...await original<typeof import('./session')>(), currentMember: async () => identity.member }))
vi.mock('@/lib/app-session', async (original) => ({ ...await original<typeof import('./app-session')>(),
  currentAppAccess: async () => ({ visitor: { authenticated: true, roleId: identity.roleId, email: identity.member!.email, company: '', enrolled: false },
    viewer: { id: identity.member!.userId, email: identity.member!.email, company: '', enrolled: false } }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

function gate() {
  let release!: () => void
  const promise = new Promise<void>((resolve) => { release = resolve })
  return { promise, release }
}

describe.skipIf(!process.env.DATABASE_URL)('row writes against Postgres', () => {
  let database: typeof import('@tableapp/db')
  let core: typeof import('./row-mutations')
  let actions: typeof import('@/app/actions')
  let runtime: typeof import('@/app/runtime-actions')
  let sync: typeof import('./sync-write')
  let usage: typeof import('./usage')
  const ids = { user: newId('user'), workspace: newId('workspace'), table: newId('table'), peer: newId('table'),
    row: newId('row'), peerRow: newId('row'), a: newId('field'), b: newId('field'), peerField: newId('field'), app: newId('app') }
  const slug = `row-writes-${Date.now()}-${ids.app.slice(-6).toLowerCase()}`
  const actor = { id: ids.user, kind: 'member', deviceId: 'test-device' }
  const access = { guard: () => true, may: () => true, mayField: () => true,
    stamp: (data: Record<string, unknown>) => data, locked: () => false }
  let app: App
  const columns: Field[] = [
    { id: ids.a, tableId: ids.table, name: 'A', type: 'text', options: {}, description: null, position: 'a0' },
    { id: ids.b, tableId: ids.table, name: 'B', type: 'text', options: {}, description: null, position: 'a1' },
  ]

  beforeAll(async () => {
    database = await import('@tableapp/db')
    core = await import('./row-mutations')
    actions = await import('@/app/actions')
    runtime = await import('@/app/runtime-actions')
    sync = await import('./sync-write')
    usage = await import('./usage')
    const { db, users, workspaces, workspaceMembers } = database
    await db.insert(users).values({ id: ids.user, email: `${slug}@example.invalid` })
    await db.insert(workspaces).values({ id: ids.workspace, ownerId: ids.user, name: 'Row tests', slug })
    await db.insert(workspaceMembers).values({ workspaceId: ids.workspace, userId: ids.user, role: 'owner' })
    identity.member = { userId: ids.user, workspaceId: ids.workspace, workspaceName: 'Row tests', role: 'owner', name: 'Test', email: `${slug}@example.invalid` }
  })
  beforeEach(async () => {
    identity.roleId = 'manager'
    const { db, tables, fields, rows, views, apps, workspaceUsage } = database
    await db.delete(apps).where(eq(apps.workspaceId, ids.workspace))
    await db.delete(tables).where(eq(tables.workspaceId, ids.workspace))
    await db.delete(workspaceUsage).where(eq(workspaceUsage.workspaceId, ids.workspace))
    await db.insert(tables).values([
      { id: ids.table, workspaceId: ids.workspace, name: 'A', position: 'a0', primaryFieldId: ids.a },
      { id: ids.peer, workspaceId: ids.workspace, name: 'Peer', position: 'a1', primaryFieldId: ids.peerField },
    ])
    await db.insert(fields).values([...columns, { id: ids.peerField, tableId: ids.peer, name: 'Link', type: 'relation', options: { tableId: ids.table, allowMultiple: false }, position: 'a0' }])
    await db.insert(rows).values([
      { id: ids.row, tableId: ids.table, position: 'a1', data: { [ids.a]: 'old A', [ids.b]: 'old B' }, sample: true },
      { id: ids.peerRow, tableId: ids.peer, position: 'a1', data: { [ids.peerField]: [ids.row] } },
    ])
    const view = { id: newId('view'), tableId: ids.table, name: 'All', type: 'grid' as const, config: defaultViewConfig('grid', newId('filter')), position: 'a0' }
    await db.insert(views).values(view)
    const { generateApp } = await import('./app-builder')
    app = generateApp({ appId: ids.app, workspaceId: ids.workspace, name: 'Tests', slug,
      table: { id: ids.table, name: 'A', primaryFieldId: ids.a }, fields: columns, view: viewSchema.parse(view) })
    await db.insert(apps).values({ id: app.id, workspaceId: ids.workspace, name: app.name, slug, draft: app, published: app })
  })
  afterAll(async () => {
    if (!database) return
    await database.db.delete(database.workspaces).where(eq(database.workspaces.id, ids.workspace))
    await database.db.delete(database.users).where(eq(database.users.id, ids.user))
    await database.sql.end()
  })
  const read = async (id: string = ids.row) => (await database.db.select().from(database.rows).where(eq(database.rows.id, id)))[0]!
  const counter = async () => (await database.db.select().from(database.workspaceUsage).where(eq(database.workspaceUsage.workspaceId, ids.workspace)))[0]!
  const changes = async (id: string = ids.row) => database.db.select().from(database.rowChanges).where(eq(database.rowChanges.rowId, id)).orderBy(asc(database.rowChanges.createdAt))
  const update = (patch: Record<string, unknown>, options = {}) => core.writeRows(ids.workspace,
    (context) => core.updateRow(context, ids.table, ids.row, patch, actor, options))
  it('saves both edited fields in one history entry and retries without duplicate writes',async()=>{
    const {saveTableRowsAction}=await import('@/app/table-editor-actions')
    const write={id:ids.row,data:{[ids.a]:'New A',[ids.b]:'New B'},base:{[ids.a]:'old A',[ids.b]:'old B'}}
    expect(await saveTableRowsAction(ids.table,[write])).toEqual({ok:true})
    expect((await read()).data).toEqual(write.data)
    expect(await changes()).toHaveLength(1)
    expect(await saveTableRowsAction(ids.table,[write])).toEqual({ok:true})
    expect(await changes()).toHaveLength(1)
  })
  it('rolls back the whole pasted rectangle when a later row has changed',async()=>{
    const {saveTableRowsAction}=await import('@/app/table-editor-actions'),second=newId('row')
    await database.db.insert(database.rows).values({id:second,tableId:ids.table,position:'a2',data:{[ids.a]:'Colleague value'}})
    const result=await saveTableRowsAction(ids.table,[{id:ids.row,data:{[ids.a]:'My first row'},base:{[ids.a]:'old A'}},{id:second,data:{[ids.a]:'My second row'},base:{[ids.a]:'Original value'}}])
    expect(result.ok).toBe(false)
    if(!result.ok){expect(result.rowId).toBe(second);expect(result.fieldId).toBe(ids.a)}
    expect(((await read()).data as Record<string,unknown>)[ids.a]).toBe('old A');expect(((await read(second)).data as Record<string,unknown>)[ids.a]).toBe('Colleague value');expect(await changes()).toHaveLength(0)
  })
  it('creates a stable draft ID once and rejects a different repeat payload',async()=>{
    const {saveTableRowsAction}=await import('@/app/table-editor-actions'),id=newId('row'),write={id,create:true,data:{[ids.a]:'Draft'}}
    expect(await saveTableRowsAction(ids.table,[write])).toEqual({ok:true})
    expect(await saveTableRowsAction(ids.table,[write])).toEqual({ok:true})
    expect(await changes(id)).toHaveLength(1)
    expect((await saveTableRowsAction(ids.table,[{...write,data:{[ids.a]:'Other'}}])).ok).toBe(false)
    expect(((await read(id)).data as Record<string,unknown>)[ids.a]).toBe('Draft')
  })
  it('rejects computed columns and rolls back preceding changes',async()=>{
    const {saveTableRowsAction}=await import('@/app/table-editor-actions'),computed=newId('field')
    await database.db.insert(database.fields).values({id:computed,tableId:ids.table,name:'Расчёт',type:'formula',options:{expression:'1'},position:'a2'})
    expect((await saveTableRowsAction(ids.table,[{id:ids.row,data:{[ids.a]:'Do not save',[computed]:999},base:{[ids.a]:'old A',[computed]:null}}])).ok).toBe(false)
    expect(((await read()).data as Record<string,unknown>)[ids.a]).toBe('old A');expect(await changes()).toHaveLength(0)
  })
  it('rejects inaccessible related rows and viewer writes at the action boundary',async()=>{
    const {saveTableRowsAction}=await import('@/app/table-editor-actions')
    expect((await saveTableRowsAction(ids.peer,[{id:ids.peerRow,data:{[ids.peerField]:['missing-row']},base:{[ids.peerField]:[ids.row]}}])).ok).toBe(false)
    expect(((await read(ids.peerRow)).data as Record<string,unknown>)[ids.peerField]).toEqual([ids.row])
    const member=identity.member!;identity.member={...member,role:'viewer'}
    try{expect((await saveTableRowsAction(ids.table,[{id:ids.row,data:{[ids.a]:'Denied'},base:{[ids.a]:'old A'}}])).ok).toBe(false)}finally{identity.member=member}
    expect(((await read()).data as Record<string,unknown>)[ids.a]).toBe('old A')
  })
  async function production() {
    const { applyTemplateAction } = await import('@/app/template-actions')
    const applied = await applyTemplateAction('proizvodstvo')
    expect(applied.ok).toBe(true)
    if (!applied.ok) throw new Error(applied.error)
    const { db, apps, rows, fields } = database
    const [record] = await db.select().from(apps).where(eq(apps.id, applied.appId))
    const definition = record!.draft as App
    await db.update(apps).set({ published: definition }).where(eq(apps.id, applied.appId))
    const config = definition.production!
    identity.roleId = definition.roles.find((role) => role.name === 'Директор')?.id ?? definition.roles[definition.roles.length - 1]!.id
    const [material] = await db.select().from(rows).where(eq(rows.tableId, config.tables.materials))
    const [kind] = await db.select().from(fields).where(eq(fields.id, config.movement.kind))
    const choices = (kind!.options as { choices: { id: string }[] }).choices
    const [norm] = await db.select().from(rows).where(eq(rows.tableId, config.tables.norms))
    const product = (norm!.data as Record<string, string[]>)[config.norm.product]![0]!
    const module = await import('@/app/production-actions')
    return { module, config, slug: applied.appSlug, material: material!,
      kind: choices.find((choice) => choice.id !== config.movementKindId)!.id, product }
  }
  async function inventory() {
    // V1 stock actions still exercise the classic inventory app; native install is App V2.
    // Use opening-balance seed with an empty journal so these tests stay deterministic.
    const { buildTemplate } = await import('./templates/build')
    const { sklad } = await import('./templates/defs/sklad')
    const { generateApp } = await import('./app-builder')
    const { asInventory } = await import('./templates/inventory-app')
    const openings: Record<string, number> = { s1: 4, s2: 12, s3: 2, s4: 3, s5: 18, s6: 1, s7: 140, s8: 25 }
    const template = structuredClone(sklad)
    // V1 enableInventory fixtures stay under the free table ceiling: drop stage 3a count tables.
    template.tables = template.tables.filter(table => table.key !== 'inventory_counts' && table.key !== 'inventory_count_lines')
    for (const table of template.tables) {
      if (table.key === template.inventory!.tables.movements) table.rows = []
      if (table.key === template.inventory!.tables.items) {
        table.rows = table.rows.map(row => ({
          ...row,
          values: { ...row.values, opening: openings[row.key] ?? 0, receipts: { rowKeys: [] } },
        }))
      }
    }
    const built = buildTemplate({ template, workspaceId: ids.workspace })
    const table = built.tables.find(item => item.id === built.appTableId)!
    const generated = generateApp({
      appId: newId('app'), workspaceId: ids.workspace, name: built.appName, slug: `inventory-v1-${Date.now()}`,
      table, fields: built.fields.filter(field => field.tableId === table.id) as Field[],
      view: built.views.find(view => view.id === built.appViewId)! as import('@tableapp/schema').View,
    })
    const definition = asInventory(generated, built)
    definition.allowlist = [{ email: identity.member!.email, roleId: 'manager', company: '' }]
    await database.db.insert(database.tables).values(built.tables)
    await database.db.insert(database.fields).values(built.fields)
    await database.db.insert(database.views).values(built.views)
    if (built.rows.length) await database.db.insert(database.rows).values(built.rows.map(row => ({ ...row, createdBy: ids.user, updatedBy: ids.user })))
    await database.db.insert(database.apps).values({
      id: definition.id, workspaceId: ids.workspace, name: definition.name, slug: definition.slug,
      theme: definition.theme, accessMode: definition.accessMode, allowlist: definition.allowlist,
      rowAccessRules: definition.rowAccessRules, homeScreenId: definition.homeScreenId,
      draft: definition, published: definition,
    })
    await usage.recountWorkspace(ids.workspace)
    identity.roleId = 'staff'
    const config = definition.inventory!
    const [item] = await database.db.select().from(database.rows).where(eq(database.rows.tableId, config.tables.items)).orderBy(asc(database.rows.position))
    const module = await import('@/app/inventory-actions')
    const input = { id: newId('row'), itemId: item!.id, quantity: 4, note: 'Тестовая накладная' }
    const projectedStock = async () => {
      const { loadPublishedApp } = await import('./app-runtime')
      const { asRole } = await import('./app-roles')
      const loaded = await loadPublishedApp(definition.slug, asRole('staff', identity.member!.email))
      return loaded!.tables[config.tables.items]!.rows.find(row => row.id === item!.id)!.data[config.item.stock]
    }
    const journal = () => database.db.select().from(database.rows).where(and(eq(database.rows.tableId, config.tables.movements), isNull(database.rows.deletedAt)))
    return { ok: true as const, appId: definition.id, appSlug: definition.slug, tableId: table.id, definition, config, item: item!, input, module, projectedStock, journal }
  }
  async function waitForLock() {
    const deadline = Date.now() + 5000
    while (Date.now() < deadline) {
      const result = await database.db.execute(query`select count(*)::int as waiting from pg_stat_activity
        where datname = current_database() and wait_event_type = 'Lock' and query like '%workspace_usage%'`)
      if (Number(result[0]?.waiting) > 0) return
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
    throw new Error('Expected a concurrent query waiting on the usage lock')
  }
  async function legacyInventory() {
    const test = await inventory(), { db, tables, fields, views, apps } = database
    const related = await db.select().from(fields).where(eq(fields.tableId, test.config.tables.items))
    const removed = [test.config.item.stock, test.config.item.movements, ...related.filter(field => field.type === 'rollup').map(field => field.id)]
    for (const id of removed) await db.delete(fields).where(eq(fields.id, id))
    await db.delete(tables).where(eq(tables.id, test.config.tables.movements))
    await db.update(fields).set({ name: 'Остаток' }).where(eq(fields.id, test.config.item.opening))
    const [table] = await db.select().from(tables).where(eq(tables.id, test.config.tables.items))
    const columns = await db.select().from(fields).where(eq(fields.tableId, table!.id))
    const [view] = await db.select().from(views).where(eq(views.tableId, table!.id)).orderBy(asc(views.position))
    const { generateApp } = await import('./app-builder')
    const definition = generateApp({ appId: test.appId, workspaceId: ids.workspace, name: test.definition.name,
      slug: test.appSlug, table: table!, fields: columns as unknown as Field[], view: viewSchema.parse(view) })
    await db.update(apps).set({ draft: definition, published: definition }).where(eq(apps.id, test.appId))
    await usage.recountWorkspace(ids.workspace)
    const module = await import('@/app/inventory-setup-actions')
    return { ...test, module }
  }

  it('merges simultaneous edits of distinct cells and records both versions', async () => {
    const results = await Promise.all([
      actions.setCellAction(ids.table, ids.row, ids.a, 'new A', 'old A'),
      actions.setCellAction(ids.table, ids.row, ids.b, 'new B', 'old B'),
    ])
    expect(results.every((result) => result.ok), JSON.stringify(results)).toBe(true)
    const row = await read()
    expect(row.data).toEqual({ [ids.a]: 'new A', [ids.b]: 'new B' })
    expect(row.version).toBe(2)
    expect(row.sample).toBe(false)
    const history = await changes()
    expect(history).toHaveLength(2)
    expect(history[0]!.before).toEqual({ [ids.a]: 'old A', [ids.b]: 'old B' })
    expect(history[1]!.before).toEqual(history[0]!.after)
    expect(history[1]!.after).toEqual(row.data)
  })
  it('allows exactly one simultaneous edit using the same cell base', async () => {
    const results = await Promise.all(['one', 'two'].map((value) => actions.setCellAction(ids.table, ids.row, ids.a, value, 'old A')))
    expect(results.filter((result) => result.ok)).toHaveLength(1)
    expect((await read()).version).toBe(1)
    expect(await changes()).toHaveLength(1)
  })
  it('checks form versions and publishes app updates', async () => {
    const { subscribeTable } = await import('./live')
    const events: unknown[] = []
    const unsubscribe = subscribeTable(ids.table, (event) => events.push(event))
    try {
      expect((await runtime.appUpdateRowAction(slug, ids.table, ids.row, { [ids.a]: 'form' }, 0)).ok).toBe(true)
      expect((await runtime.appUpdateRowAction(slug, ids.table, ids.row, { [ids.b]: 'stale' }, 0)).ok).toBe(false)
      expect((await read()).data).toEqual({ [ids.a]: 'form', [ids.b]: 'old B' })
      expect(events).toHaveLength(1)
    } finally { unsubscribe() }
  })
  it('rechecks owner access after locking the row', async () => {
    await expect(update({ [ids.a]: 'denied' }, { guard: () => false })).rejects.toMatchObject({ code: 'denied' })
    expect(await changes()).toHaveLength(0)
  })
  it('rejects editing a deleted row', async () => {
    expect((await actions.deleteRowAction(ids.table, ids.row, 0)).ok).toBe(true)
    expect((await actions.setCellAction(ids.table, ids.row, ids.a, 'resurrect')).ok).toBe(false)
    expect((await runtime.appUpdateRowAction(slug, ids.table, ids.row, { [ids.b]: 'resurrect' })).ok).toBe(false)
    expect((await read()).version).toBe(1)
  })
  it('rejects writing a computed system field without incrementing its version', async () => {
    const id = newId('field')
    await database.db.insert(database.fields).values({ id, tableId: ids.table, name: 'Updated', type: 'updated_time', options: {}, position: 'a2' })
    expect((await actions.setCellAction(ids.table, ids.row, id, '2026-01-01')).ok).toBe(false)
    expect((await read()).version).toBe(0)
    expect(await changes()).toHaveLength(0)
  })
  it('rejects deleting a stale form snapshot', async () => {
    await update({ [ids.a]: 'new' })
    expect((await runtime.appDeleteRowAction(slug, ids.table, ids.row, 0)).ok).toBe(false)
    expect((await read()).deletedAt).toBeNull()
  })
  it('counts a double deletion exactly once and updates its timestamp', async () => {
    await usage.recountWorkspace(ids.workspace)
    const results = await Promise.all([actions.deleteRowAction(ids.table, ids.row), actions.deleteRowAction(ids.table, ids.row)])
    expect(results.filter((result) => result.ok)).toHaveLength(1)
    expect((await counter()).rows).toBe(1)
    const row = await read()
    expect(row.deletedAt).not.toBeNull()
    expect(row.updatedAt).toEqual(row.deletedAt)
    expect(row.version).toBe(1)
    expect(await changes()).toHaveLength(1)
  })
  it('does not reserve quota or emit another event for a repeated create ID', async () => {
    const id = newId('row')
    const { subscribeTable } = await import('./live')
    const events: unknown[] = []
    const unsubscribe = subscribeTable(ids.table, (event) => events.push(event))
    try {
      expect((await actions.addRowAction(ids.table, undefined, id)).ok).toBe(true)
      expect((await actions.addRowAction(ids.table, undefined, id)).ok).toBe(true)
      expect((await counter()).rows).toBe(3)
      expect(await changes(id)).toHaveLength(1)
      expect(events).toHaveLength(1)
    } finally { unsubscribe() }
  })
  it('rolls back quota, history and notifications when a write fails', async () => {
    await usage.recountWorkspace(ids.workspace)
    const id = newId('row')
    const { subscribeTable } = await import('./live')
    const events: unknown[] = []
    const unsubscribe = subscribeTable(ids.table, (event) => events.push(event))
    try {
      await expect(core.writeRows(ids.workspace, async (context) => {
        await core.createRow(context, ids.table, { [ids.a]: 'rollback' }, actor, { id })
        throw new Error('synthetic failure')
      })).rejects.toThrow('synthetic failure')
      expect((await counter()).rows).toBe(2)
      expect(await changes(id)).toHaveLength(0)
      expect(await database.db.select().from(database.rows).where(eq(database.rows.id, id))).toHaveLength(0)
      expect(events).toHaveLength(0)
    } finally { unsubscribe() }
  })
  it('does not consume a pending claim when row insertion fails', async () => {
    const { db, pendingSubmissions } = database
    const id = newId('event')
    await db.insert(pendingSubmissions).values({ id, appId: app.id, screenId: app.homeScreenId!,
      tableId: ids.table, values: {}, email: `${slug}@example.invalid`, expiresAt: new Date(Date.now() + 60000) })
    await usage.recountWorkspace(ids.workspace)
    await expect(core.writeRows(ids.workspace, async (context) => {
      await core.createRow(context, ids.table, {}, actor, { beforeInsert: async (tx) => {
        await tx.update(pendingSubmissions).set({ usedAt: new Date() }).where(eq(pendingSubmissions.id, id))
        throw new Error('synthetic failure after claim')
      } })
    })).rejects.toThrow('synthetic failure after claim')
    expect((await db.select().from(pendingSubmissions).where(eq(pendingSubmissions.id, id)))[0]!.usedAt).toBeNull()
    expect((await counter()).rows).toBe(2)
  })
  it('recounts after waiting for an in-flight row reservation', async () => {
    await usage.recountWorkspace(ids.workspace)
    const ready = gate(), finish = gate()
    const writer = core.writeRows(ids.workspace, async (context) => {
      await core.createRow(context, ids.table, {}, actor)
      ready.release()
      await finish.promise
    })
    await Promise.race([ready.promise, writer])
    const recount = usage.recountWorkspace(ids.workspace)
    try { await waitForLock() } finally { finish.release() }
    const [, result] = await Promise.all([writer, recount])
    expect(result.rows).toBe(3)
    expect((await counter()).rows).toBe(3)
  })
  it('admits only one concurrent create at the actual free-plan limit', async () => {
    const { db, rows } = database
    await db.insert(rows).values(Array.from({ length: 1997 }, (_, index) => ({ id: newId('row'), tableId: ids.table, position: `bulk${index}`, data: {} })))
    await usage.recountWorkspace(ids.workspace)
    const results = await Promise.all([actions.addRowAction(ids.table), actions.addRowAction(ids.table)])
    expect(results.filter((result) => result.ok)).toHaveLength(1)
    expect((await counter()).rows).toBe(2000)
    const counted = await db.select({ total: query<number>`count(*)::int` }).from(rows)
      .where(and(eq(rows.tableId, ids.table), isNull(rows.deletedAt)))
    expect(counted[0]!.total).toBe(1999)
  })
  it('merges concurrent offline edits into the current row', async () => {
    const results = await Promise.all([
      sync.applySyncMutation({ id: newId('change'), rowId: ids.row, op: 'update', fieldId: ids.a, base: 'old A', next: 'offline A' }, ids.table, actor, access),
      sync.applySyncMutation({ id: newId('change'), rowId: ids.row, op: 'update', fieldId: ids.b, base: 'old B', next: 'offline B' }, ids.table, actor, access),
    ])
    expect(results.map((result) => result.status)).toEqual(['applied', 'applied'])
    expect((await read()).data).toEqual({ [ids.a]: 'offline A', [ids.b]: 'offline B' })
    expect((await read()).version).toBe(2)
    expect(await changes()).toHaveLength(2)
  })
  it('applies simultaneous retries of one offline mutation exactly once', async () => {
    const mutation = { id: newId('change'), rowId: ids.row, op: 'update' as const, fieldId: ids.a, base: 'old A', next: 'offline' }
    const results = await Promise.all([sync.applySyncMutation(mutation, ids.table, actor, access), sync.applySyncMutation(mutation, ids.table, actor, access)])
    expect(results.every((result) => result.status === 'applied')).toBe(true)
    expect((await read()).version).toBe(1)
    expect(await changes()).toHaveLength(1)
  })
  it('does not accept another actor or device receipt as its own mutation', async () => {
    const mutation = { id: newId('change'), rowId: ids.row, op: 'update' as const, fieldId: ids.a, base: 'old A', next: 'offline' }
    await sync.applySyncMutation(mutation, ids.table, actor, access)
    const result = await sync.applySyncMutation(mutation, ids.table, { ...actor, deviceId: 'another-device' }, access)
    expect(result.status).toBe('dropped')
    expect((await read()).version).toBe(1)
  })
  it('does not overwrite a newer online value with an offline edit', async () => {
    await update({ [ids.a]: 'online' })
    const result = await sync.applySyncMutation({ id: newId('change'), rowId: ids.row, op: 'update', fieldId: ids.a, base: 'old A', next: 'offline' }, ids.table, actor, access)
    expect(result.status).toBe('conflict')
    expect(result.current).toBe('online')
    expect((await read()).version).toBe(1)
  })
  it('logs the actual row snapshot when deleting through sync', async () => {
    const result = await sync.applySyncMutation({ id: newId('change'), rowId: ids.row, op: 'delete', base: 'untrusted base', baseVersion: 0 }, ids.table, actor, access)
    expect(result.status).toBe('applied')
    expect((await changes())[0]!.before).toEqual({ [ids.a]: 'old A', [ids.b]: 'old B' })
    expect((await read()).version).toBe(1)
    expect((await read()).updatedAt).toEqual((await read()).deletedAt)
  })
  it('cascades sync deletion and publishes both affected tables', async () => {
    const { db, apps } = database
    // Cascade deliberately reads only the production table/run identifiers.
    await db.update(apps).set({ published: { production: { tables: { production: ids.table, movements: ids.peer }, movement: { run: ids.peerField } } } })
      .where(eq(apps.id, app.id))
    const { subscribeTable } = await import('./live')
    const events: string[] = []
    const unsubscribeA = subscribeTable(ids.table, () => events.push(ids.table))
    const unsubscribeB = subscribeTable(ids.peer, () => events.push(ids.peer))
    try {
      await sync.applySyncMutation({ id: newId('change'), rowId: ids.row, op: 'delete', baseVersion: 0 }, ids.table, actor, access)
      expect((await read(ids.peerRow)).deletedAt).not.toBeNull()
      expect((await read(ids.peerRow)).version).toBe(1)
      expect((await counter()).rows).toBe(0)
      expect(await changes(ids.peerRow)).toHaveLength(1)
      expect(events.sort()).toEqual([ids.table, ids.peer].sort())
    } finally { unsubscribeA(); unsubscribeB() }
  })
  it('retains edited sample rows and releases quota only for removed samples', async () => {
    const { deleteSampleRowsAction } = await import('@/app/template-actions')
    const id = newId('row')
    await database.db.insert(database.rows).values({ id, tableId: ids.table, data: {}, position: 'a1', sample: true })
    await actions.setCellAction(ids.table, ids.row, ids.a, 'user data', 'old A')
    await usage.recountWorkspace(ids.workspace)
    expect((await deleteSampleRowsAction(ids.table)).ok).toBe(true)
    expect((await read()).deletedAt).toBeNull()
    expect((await read(id)).deletedAt).not.toBeNull()
    expect((await counter()).rows).toBe(2)
    expect((await read(id)).version).toBe(1)
  })
  it('increments versions and history when changing field types', async () => {
    const { updateFieldAction } = await import('@/app/field-actions')
    expect((await updateFieldAction(ids.table, ids.a, { type: 'long_text' })).ok).toBe(true)
    expect((await read()).version).toBe(1)
    expect(await changes()).toHaveLength(1)
  })
  it('preserves both movement links and a parallel material edit', async () => {
    const test = await production()
    const first = newId('row'), second = newId('row')
    const input = { materialId: test.material.id, kindId: test.kind, amount: 1, date: null, reason: 'Test' }
    const before = (await counter()).rows
    const results = await Promise.all([
      test.module.saveMovementAction(test.slug, { ...input, movementId: first }),
      test.module.saveMovementAction(test.slug, { ...input, movementId: second }),
      actions.setCellAction(test.config.tables.materials, test.material.id, test.config.material.name, 'Edited material'),
    ])
    expect(results.every((result) => result.ok), JSON.stringify(results)).toBe(true)
    const current = await read(test.material.id)
    const data = current.data as Record<string, unknown>
    expect(data[test.config.material.movements]).toEqual(expect.arrayContaining([first, second]))
    expect(data[test.config.material.name]).toBe('Edited material')
    const movements = await database.db.select().from(database.rows)
      .where(and(eq(database.rows.tableId, test.config.tables.movements), isNull(database.rows.deletedAt)))
    const links = data[test.config.material.movements] as string[]
    const actualStock = Number(data[test.config.material.opening] ?? 0) + movements
      .filter((row) => links.includes(row.id))
      .reduce((total, row) => total + Number((row.data as Record<string, unknown>)[test.config.movement.qty] ?? 0), 0)
    const stocks = results.filter((result) => result.ok && 'stock' in result).map((result) => result.ok && 'stock' in result ? result.stock : 0)
    expect(Math.max(...stocks)).toBe(actualStock)
    expect(current.version).toBe(test.material.version + 3)
    expect((await counter()).rows).toBe(before + 2)
    expect(await changes(test.material.id)).toHaveLength(3)
  })
  it('does not reserve quota again for a repeated warehouse movement', async () => {
    const test = await production()
    const input = { movementId: newId('row'), materialId: test.material.id, kindId: test.kind, amount: 1, date: null, reason: 'Test' }
    const before = (await counter()).rows
    const results = await Promise.all([test.module.saveMovementAction(test.slug, input), test.module.saveMovementAction(test.slug, input)])
    expect(results.every((result) => result.ok), JSON.stringify(results)).toBe(true)
    expect(results.filter((result) => result.ok && result.repeated)).toHaveLength(1)
    expect((await counter()).rows).toBe(before + 1)
    expect(await changes(input.movementId)).toHaveLength(1)
    expect((await read(test.material.id)).version).toBe(test.material.version + 1)
  })
  it('makes a production retry idempotent across its run, movements and quota', async () => {
    const test = await production()
    const input = { runId: newId('row'), productId: test.product, quantity: 1, defects: 0, date: null, shiftId: null, note: '' }
    const before = (await counter()).rows
    const results = await Promise.all([test.module.saveProductionAction(test.slug, input), test.module.saveProductionAction(test.slug, input)])
    expect(results.every((result) => result.ok), JSON.stringify(results)).toBe(true)
    expect(results.filter((result) => result.ok && result.repeated)).toHaveLength(1)
    const successful = results.find((result) => result.ok)!
    if (!successful.ok) return
    expect((await counter()).rows).toBe(before + 1 + successful.wrote.length)
    expect(await changes(input.runId)).toHaveLength(1)
  })
  it('uses the configured product title in the receipt instead of the first JSON value', async () => {
    const test = await production(), product = await read(test.product)
    const [table] = await database.db.select().from(database.tables).where(eq(database.tables.id, product.tableId))
    const data = product.data as Record<string, unknown>
    const noteField = `fld_${newId('field').slice(4, 12)}`
    await database.db.insert(database.fields).values({ id: noteField, tableId: product.tableId, name: 'Internal note', type: 'text', options: {}, position: 'zz' })
    // JSONB orders this shorter key before the primary field regardless of insertion order.
    await database.db.update(database.rows).set({ data: { ...data, [noteField]: 'Internal warehouse note' } }).where(eq(database.rows.id, product.id))
    const result = await test.module.saveProductionAction(test.slug, { runId: newId('row'), productId: test.product, quantity: 1, defects: 0, date: null, shiftId: null, note: '' })
    expect(result).toMatchObject({ ok: true, product: String(data[table!.primaryFieldId!]) })
    if (result.ok) expect(result.product).not.toBe('Internal warehouse note')
  })
  it('rolls back an entire production run when its movements exceed quota', async () => {
    const test = await production()
    const input = { runId: newId('row'), productId: test.product, quantity: 1, defects: 0, date: null, shiftId: null, note: '' }
    const ceiling = planOf('free').limits.rows + graceReserve(planOf('free').limits.rows)
    const before = (await counter()).rows
    await database.db.insert(database.rows).values(Array.from({ length: ceiling - 1 - before }, (_, index) => ({
      id: newId('row'), tableId: ids.table, position: `bulk${index}x`, data: {},
    })))
    await usage.recountWorkspace(ids.workspace)
    const result = await test.module.saveProductionAction(test.slug, input)
    expect(result.ok).toBe(false)
    expect((await counter()).rows).toBe(ceiling - 1)
    expect(await changes(input.runId)).toHaveLength(0)
    expect(await database.db.select().from(database.rows).where(eq(database.rows.id, input.runId))).toHaveLength(0)
    expect((await read(test.material.id)).version).toBe(test.material.version)
  })
  it('adds simultaneous receipts to the journal and stock without losing either update', async () => {
    const test = await inventory(), opening = Number((test.item.data as Record<string, unknown>)[test.config.item.opening])
    const results = await Promise.all([3, 4].map(quantity => test.module.receiveStockAction(test.appSlug, { ...test.input, id: newId('row'), quantity })))
    expect(results.every(result => result.ok), JSON.stringify(results)).toBe(true)
    expect(await test.projectedStock()).toBe(opening + 7)
    expect(await test.journal()).toHaveLength(2)
    expect(((await read(test.item.id)).data as Record<string, unknown>)[test.config.item.movements]).toHaveLength(2)
    expect(await changes(test.item.id)).toHaveLength(2)
  })
  it('records a complete stock cycle with signed quantities and immutable confirmations', async () => {
    const test = await inventory(), opening = Number((test.item.data as Record<string, unknown>)[test.config.item.opening])
    const issue = { ...test.input, id: newId('row'), quantity: 2 }
    expect(await test.module.saveStockOperationAction(test.appSlug, 'issue', issue)).toMatchObject({ ok: true, before: opening, after: opening - 2 })
    for (const operation of ['writeOff', 'returnIn', 'returnOut'] as const) {
      expect((await test.module.saveStockOperationAction(test.appSlug, operation, { ...test.input, id: newId('row'), quantity: 1 })).ok).toBe(true)
    }
    expect(await test.projectedStock()).toBe(opening - 3)
    const entries = await test.journal(), ops = test.config.operations!
    expect(entries.map(row => (row.data as Record<string, unknown>)[test.config.movement.qty]).sort()).toEqual([-1, -1, -2, 1])
    expect(entries.every(row => typeof (row.data as Record<string, unknown>)[ops.fields.before] === 'number')).toBe(true)
    expect(await test.module.saveStockOperationAction(test.appSlug, 'issue', issue)).toMatchObject({ ok: true, before: opening, after: opening - 2, repeated: true })
    expect((await test.module.saveStockOperationAction(test.appSlug, 'returnOut', issue)).ok).toBe(false)
    expect(await test.journal()).toHaveLength(4)
  })
  it('serializes competing issues so stock cannot become negative', async () => {
    const test = await inventory()
    const results = await Promise.all([1, 2].map(() => test.module.saveStockOperationAction(test.appSlug, 'issue', { ...test.input, id: newId('row'), quantity: 3 })))
    expect(results.filter(result => result.ok)).toHaveLength(1)
    expect(results.find(result => !result.ok)).toMatchObject({ ok: false, error: expect.stringContaining('Недостаточно товара') })
    expect(await test.projectedStock()).toBe(1)
    expect(await test.journal()).toHaveLength(1)
    expect(await changes(test.item.id)).toHaveLength(1)
  })
  it('limits stocktake to the owner, detects stale counts, accepts zero and retries safely', async () => {
    const test = await inventory()
    const input = { ...test.input, id: newId('row'), quantity: 0, baseVersion: 0 }
    expect((await test.module.saveStockOperationAction(test.appSlug, 'stocktake', input)).ok).toBe(false)
    identity.roleId = 'manager'
    expect((await test.module.saveStockOperationAction(test.appSlug, 'stocktake', { ...input, note: ' ' })).ok).toBe(false)
    expect((await test.module.receiveStockAction(test.appSlug, { ...test.input, quantity: 1 })).ok).toBe(true)
    expect(await test.module.saveStockOperationAction(test.appSlug, 'stocktake', input)).toMatchObject({ ok: false, error: expect.stringContaining('товар изменился') })
    const fresh = { ...input, baseVersion: (await read(test.item.id)).version }
    expect(await test.module.saveStockOperationAction(test.appSlug, 'stocktake', fresh)).toMatchObject({ ok: true, before: 5, after: 0 })
    expect(await test.projectedStock()).toBe(0)
    expect((await test.module.receiveStockAction(test.appSlug, { ...test.input, id: newId('row'), quantity: 2 })).ok).toBe(true)
    expect(await test.module.saveStockOperationAction(test.appSlug, 'stocktake', fresh)).toMatchObject({ ok: true, before: 5, after: 0, repeated: true })
    expect(await test.projectedStock()).toBe(2)
    expect(await test.journal()).toHaveLength(3)
  })
  it('requires reasons and checks permissions on the specific operation form', async () => {
    const test = await inventory(), { db, apps } = database
    expect((await test.module.saveStockOperationAction(test.appSlug, 'writeOff', { ...test.input, note: '' })).ok).toBe(false)
    const restricted = { ...test.definition, screens: test.definition.screens.map(screen => screen.id === test.config.operations!.screens.issue && screen.type === 'form' ? {
      ...screen, components: screen.components.map(c => c.type === 'form_field' && c.fieldId === test.config.movement.qty ? { ...c, roles: ['manager'] } : c),
    } : screen) }
    await db.update(apps).set({ published: restricted }).where(eq(apps.id, test.appId))
    expect((await test.module.saveStockOperationAction(test.appSlug, 'issue', test.input)).ok).toBe(false)
    expect((await test.module.receiveStockAction(test.appSlug, test.input)).ok).toBe(true)
    expect(await test.journal()).toHaveLength(1)
  })
  it('denies generic journal mutations through app synchronization, even for the owner', async () => {
    const test = await inventory()
    identity.roleId = 'manager'
    const { POST } = await import('@/app/api/sync/route')
    const response = await POST(new Request('http://localhost/api/sync', { method: 'POST', body: JSON.stringify({
      tableId: test.config.tables.movements, appSlug: test.appSlug, deviceId: 'warehouse-test', mutations: [{
        id: newId('change'), op: 'create', rowId: newId('row'), next: { [test.config.movement.item]: [test.item.id], [test.config.movement.qty]: -100 },
      }],
    }) }))
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.applied).toHaveLength(0)
    expect(body.rejected).toHaveLength(1)
    expect(await test.journal()).toHaveLength(0)
    expect(await test.projectedStock()).toBe(4)
  })
  it('upgrades a receipt warehouse without rewriting data or activating unpublished operations', async () => {
    const test = await inventory(), { db, fields, views, apps } = database
    const { generateApp } = await import('./app-builder'), { asInventory } = await import('./templates/inventory-app')
    const { buildTemplate } = await import('./templates/build'), { sklad } = await import('./templates/defs/sklad')
    const built = buildTemplate({ template: sklad, workspaceId: ids.workspace })
    // Reconstruct a receipt-only preset on the installed IDs, as older releases saved it.
    const ownFields = await db.select().from(fields).where(eq(fields.tableId, test.config.tables.items))
    const [view] = await db.select().from(views).where(eq(views.tableId, test.config.tables.items)).orderBy(asc(views.position))
    const journalScreen = test.definition.screens.find(s => s.type === 'list' && s.metaFieldId === test.config.movement.qty) as Extract<App['screens'][number], { type: 'list' }>
    const receiptBuilt = { ...built, appTableId: test.config.tables.items, inventory: { ...built.inventory!, ...test.config, operations: null,
      views: { items: view!.id, movements: journalScreen.source.viewId } }, fields: ownFields as typeof built.fields }
    const generated = generateApp({ appId: test.appId, workspaceId: ids.workspace, name: test.definition.name, slug: test.appSlug,
      table: { id: test.config.tables.items, name: 'Позиции', primaryFieldId: test.config.item.name }, fields: ownFields as unknown as Field[], view: viewSchema.parse(view) })
    const legacy = asInventory(generated, receiptBuilt)
    await db.update(apps).set({ draft: legacy, published: legacy }).where(eq(apps.id, test.appId))
    await db.delete(fields).where(inArray(fields.id, Object.values(test.config.operations!.fields)))
    const rollup = ownFields.find(field => field.type === 'rollup')!
    for (const [id, name] of [[test.config.item.movements, 'Приёмки'], [rollup.id, 'Принято, шт'],
      [test.config.movement.name, 'Приёмка'], [test.config.movement.qty, 'Принято, шт'], [test.config.movement.author, 'Кто принял']] as const) {
      await db.update(fields).set({ name }).where(eq(fields.id, id))
    }
    await db.update(fields).set({ options: { expression: '{Начальный остаток} + {Принято, шт}', resultType: 'number' } }).where(eq(fields.id, test.config.item.stock))
    expect((await test.module.receiveStockAction(test.appSlug, test.input)).ok).toBe(true)
    const before = await read(test.item.id), journalBefore = await test.journal()
    const setup = await import('@/app/inventory-setup-actions')
    expect((await setup.enableStockOperationsAction(test.appId, { ...legacy, name: 'stale' })).ok).toBe(false)
    const results = await Promise.all([setup.enableStockOperationsAction(test.appId, legacy), setup.enableStockOperationsAction(test.appId, legacy)])
    expect(results.every(result => result.ok), JSON.stringify(results)).toBe(true)
    const [record] = await db.select().from(apps).where(eq(apps.id, test.appId))
    const upgraded = record!.draft as App
    expect(upgraded.inventory!.operations).toBeTruthy()
    expect(upgraded.roles).toEqual(legacy.roles)
    expect(upgraded.inventory!.receiptScreenId).toBe(legacy.inventory!.receiptScreenId)
    expect(record!.published).toEqual(legacy)
    expect(await read(test.item.id)).toEqual(before)
    expect(await test.journal()).toEqual(journalBefore)
    expect((await test.module.saveStockOperationAction(test.appSlug, 'issue', { ...test.input, id: newId('row') })).ok).toBe(false)
    const { publishAppAction } = await import('@/app/app-actions')
    expect((await publishAppAction(test.appId)).ok).toBe(true)
    expect((await test.module.saveStockOperationAction(test.appSlug, 'issue', { ...test.input, id: newId('row'), quantity: 1 })).ok).toBe(true)
    expect(await test.projectedStock()).toBe(7)
    expect(await test.module.receiveStockAction(test.appSlug, test.input)).toMatchObject({ ok: true, repeated: true, legacyRepeat: true, after: 7 })
  })
  it('recognizes a simultaneous retry without duplicating stock, history or quota', async () => {
    const test = await inventory(), count = (await counter()).rows
    const results = await Promise.all([test.module.receiveStockAction(test.appSlug, test.input), test.module.receiveStockAction(test.appSlug, test.input)])
    expect(results.every(result => result.ok), JSON.stringify(results)).toBe(true)
    expect(results.filter(result => result.ok && result.repeated)).toHaveLength(1)
    expect(await test.journal()).toHaveLength(1)
    expect((await counter()).rows).toBe(count + 1)
    expect(await changes(test.input.id)).toHaveLength(1)
    expect(await test.projectedStock()).toBe(Number((test.item.data as Record<string, unknown>)[test.config.item.opening]) + 4)
    expect((await test.module.receiveStockAction(test.appSlug, { ...test.input, quantity: 5 })).ok).toBe(false)
  })
  it('denies invalid quantities, foreign items, missing roles and generic journal writes', async () => {
    const test = await inventory()
    for (const quantity of [0, -1, 1.5, Infinity, 1_000_001]) expect((await test.module.receiveStockAction(test.appSlug, { ...test.input, quantity })).ok).toBe(false)
    expect((await test.module.receiveStockAction(test.appSlug, { ...test.input, itemId: ids.row })).ok).toBe(false)
    identity.roleId = 'nonexistent'
    expect((await test.module.receiveStockAction(test.appSlug, test.input)).ok).toBe(false)
    identity.roleId = 'manager'
    expect((await runtime.appCreateRowAction(test.appSlug, test.config.tables.movements, { [test.config.movement.qty]: 10 })).ok).toBe(false)
    expect(await test.journal()).toHaveLength(0)
    expect((await read(test.item.id)).version).toBe(0)
  })
  it('rolls back both journal and stock when receipt quota is exhausted', async () => {
    const test = await inventory()
    const ceiling = planOf('free').limits.rows + graceReserve(planOf('free').limits.rows)
    const before = (await counter()).rows
    await database.db.insert(database.rows).values(Array.from({ length: ceiling - before }, (_, index) => ({ id: newId('row'), tableId: ids.table, position: `bulk${index}x`, data: {} })))
    await usage.recountWorkspace(ids.workspace)
    expect((await test.module.receiveStockAction(test.appSlug, test.input)).ok).toBe(false)
    expect(await test.journal()).toHaveLength(0)
    expect((await read(test.item.id)).version).toBe(0)
    expect((await counter()).rows).toBe(ceiling)
  })
  it('applies row ownership and receipt field permissions before creating movements', async () => {
    const test = await inventory(), { db, apps } = database
    await db.update(apps).set({ published: { ...test.definition, rowAccessRules: [{ tableId: test.config.tables.items, fieldId: test.config.item.sku!, match: 'email', appliesTo: ['staff'] }] } }).where(eq(apps.id, test.appId))
    expect((await test.module.receiveStockAction(test.appSlug, test.input)).ok).toBe(false)
    const restricted = { ...test.definition, screens: test.definition.screens.map(screen => screen.id === test.config.receiptScreenId && screen.type === 'form' ? {
      ...screen, components: screen.components.map(component => component.type === 'form_field' && component.fieldId === test.config.movement.qty ? { ...component, roles: ['manager'] } : component),
    } : screen) }
    await db.update(apps).set({ published: restricted }).where(eq(apps.id, test.appId))
    expect((await test.module.receiveStockAction(test.appSlug, test.input)).ok).toBe(false)
    expect(await test.journal()).toHaveLength(0)
  })
  it('upgrades a legacy warehouse once while preserving data and the published definition', async () => {
    const test = await legacyInventory(), { db, apps, tables, fields } = database
    const before = (await read(test.item.id)).data
    const tableCount = (await db.select().from(tables).where(eq(tables.workspaceId, ids.workspace))).length
    const results = await Promise.all([test.module.enableInventoryAction(test.appId, test.config.tables.items), test.module.enableInventoryAction(test.appId, test.config.tables.items)])
    expect(results.every(result => result.ok), JSON.stringify(results)).toBe(true)
    const [record] = await db.select().from(apps).where(eq(apps.id, test.appId))
    const draft = record!.draft as App
    expect(draft.inventory!.item.opening).toBe(test.config.item.opening)
    expect((record!.published as App).inventory).toBeNull()
    expect((await read(test.item.id)).data).toEqual(before)
    expect((await read(test.item.id)).version).toBe(0)
    expect((await db.select().from(tables).where(eq(tables.workspaceId, ids.workspace))).length).toBe(tableCount + 2)
    expect((await db.select().from(fields).where(eq(fields.id, test.config.item.opening)))[0]!.name).toBe('Начальный остаток')
    const { publishAppAction } = await import('@/app/app-actions')
    expect((await publishAppAction(test.appId)).ok).toBe(true)
    const receipt = await import('@/app/inventory-actions')
    expect((await receipt.receiveStockAction(test.appSlug, test.input)).ok).toBe(true)
  })
  it('leaves legacy schema and balances intact if adding a journal exceeds table quota', async () => {
    const test = await legacyInventory(), { db, tables, fields, apps } = database
    await db.insert(tables).values(Array.from({ length: 8 }, (_, index) => ({ id: newId('table'), workspaceId: ids.workspace, name: `Existing ${index}`, position: `b${index}x` })))
    await usage.recountWorkspace(ids.workspace)
    const result = await test.module.enableInventoryAction(test.appId, test.config.tables.items)
    expect(result.ok).toBe(false)
    expect((await db.select().from(fields).where(eq(fields.id, test.config.item.opening)))[0]!.name).toBe('Остаток')
    expect(((await db.select().from(apps).where(eq(apps.id, test.appId)))[0]!.draft as App).inventory).toBeNull()
    expect((await read(test.item.id)).version).toBe(0)
  })
  it('enforces table quota when installing a template without partial inserts', async () => {
    await database.db.insert(database.tables).values(Array.from({ length: 8 }, (_, index) => ({
      id: newId('table'), workspaceId: ids.workspace, name: `Existing ${index}`, position: `b${index}x`,
    })))
    const { applyTemplateAction } = await import('@/app/template-actions')
    const result = await applyTemplateAction('proizvodstvo')
    expect(result.ok).toBe(false)
    expect(await database.db.select().from(database.tables).where(eq(database.tables.workspaceId, ids.workspace))).toHaveLength(10)
    expect(await database.db.select().from(database.apps).where(eq(database.apps.workspaceId, ids.workspace))).toHaveLength(1)
  })
})
