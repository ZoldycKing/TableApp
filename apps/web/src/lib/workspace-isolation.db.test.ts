import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { eq, inArray } from 'drizzle-orm'
import { appSchema, defaultViewConfig, newId, viewSchema, type App, type Field } from '@tableapp/schema'

const envFile = resolve(import.meta.dirname, '../../../../.env')
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile)
const identity = vi.hoisted(() => ({ member: null as import('./session').Member | null }))
vi.mock('@/lib/session', async (original) => ({ ...await original<typeof import('./session')>(), currentMember: async () => identity.member }))
vi.mock('@/lib/app-session', async (original) => ({
  ...await original<typeof import('./app-session')>(),
  currentAppAccess: async () => ({
    visitor: { authenticated: true, roleId: 'manager', email: identity.member!.email, company: '', enrolled: false },
    viewer: { id: identity.member!.userId, email: identity.member!.email, company: '', enrolled: false },
  }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

describe.skipIf(!process.env.DATABASE_URL)('workspace isolation against Postgres', () => {
  let database: typeof import('@tableapp/db')
  let actions: typeof import('@/app/actions')
  let fieldActions: typeof import('@/app/field-actions')
  let appActions: typeof import('@/app/app-actions')
  let queries: typeof import('./queries')
  let runtime: typeof import('./app-runtime')
  const ids = {
    user: newId('user'), foreignUser: newId('user'), workspace: newId('workspace'), foreignWorkspace: newId('workspace'),
    table: newId('table'), peer: newId('table'), foreignTable: newId('table'),
    row: newId('row'), peerRow: newId('row'), foreignRow: newId('row'),
    field: newId('field'), peerField: newId('field'), foreignField: newId('field'), fileField: newId('field'),
    view: newId('view'), foreignView: newId('view'), app: newId('app'),
  }
  const slug = `isolation-${Date.now()}-${newId('app').slice(-6).toLowerCase()}`
  const foreignKey = `${ids.foreignWorkspace}/synthetic.txt`
  const ownKey = `${ids.workspace}/synthetic.txt`
  let definition: App

  beforeAll(async () => {
    database = await import('@tableapp/db')
    actions = await import('@/app/actions')
    fieldActions = await import('@/app/field-actions')
    appActions = await import('@/app/app-actions')
    queries = await import('./queries')
    runtime = await import('./app-runtime')
    const { db, users, workspaces, workspaceMembers, tables, fields, rows, views, apps, attachments } = database
    await db.insert(users).values([{ id: ids.user, email: `${slug}@example.invalid` }, { id: ids.foreignUser, email: `${slug}-foreign@example.invalid` }])
    await db.insert(workspaces).values([
      { id: ids.workspace, ownerId: ids.user, name: 'Isolation A', slug: `${slug}-a` },
      { id: ids.foreignWorkspace, ownerId: ids.foreignUser, name: 'Isolation B', slug: `${slug}-b` },
    ])
    await db.insert(workspaceMembers).values({ workspaceId: ids.workspace, userId: ids.user, role: 'editor' })
    identity.member = { userId: ids.user, email: `${slug}@example.invalid`, workspaceId: ids.workspace, workspaceName: 'Isolation A', role: 'editor', name: 'Test' }
    await db.insert(tables).values([
      { id: ids.table, workspaceId: ids.workspace, name: 'A', position: 'a0', primaryFieldId: ids.field },
      { id: ids.peer, workspaceId: ids.workspace, name: 'Peer', position: 'a1', primaryFieldId: ids.peerField },
      { id: ids.foreignTable, workspaceId: ids.foreignWorkspace, name: 'B', position: 'a0', primaryFieldId: ids.foreignField },
    ])
    const ownField: Field = { id: ids.field, tableId: ids.table, name: 'Name', type: 'text', options: {}, position: 'a0', description: null }
    await db.insert(fields).values([
      ownField,
      { id: ids.peerField, tableId: ids.peer, name: 'Peer name', type: 'text', options: {}, position: 'a0' },
      { id: ids.foreignField, tableId: ids.foreignTable, name: 'Foreign name', type: 'text', options: {}, position: 'a0' },
      { id: ids.fileField, tableId: ids.table, name: 'File', type: 'attachment', options: {}, position: 'a1' },
    ])
    await db.insert(rows).values([
      { id: ids.row, tableId: ids.table, position: 'a0', data: { [ids.field]: 'own' } },
      { id: ids.peerRow, tableId: ids.peer, position: 'a0', data: { [ids.peerField]: 'own peer' } },
      { id: ids.foreignRow, tableId: ids.foreignTable, position: 'a0', data: { [ids.foreignField]: 'SYNTHETIC_FOREIGN_SECRET' } },
    ])
    const view = { id: ids.view, tableId: ids.table, name: 'All', type: 'grid' as const, config: defaultViewConfig('grid', newId('filter')), position: 'a0' }
    await db.insert(views).values([view, { ...view, id: ids.foreignView, tableId: ids.foreignTable }])
    const { generateApp } = await import('./app-builder')
    definition = generateApp({ appId: ids.app, workspaceId: ids.workspace, name: 'Isolation', slug, table: { id: ids.table, name: 'A', primaryFieldId: ids.field }, fields: [ownField], view: viewSchema.parse(view) })
    await db.insert(apps).values({ id: ids.app, workspaceId: ids.workspace, name: definition.name, slug, draft: definition, published: definition })
    await db.insert(attachments).values([
      { id: newId('attachment'), workspaceId: ids.foreignWorkspace, key: foreignKey, name: 'synthetic.txt', mime: 'text/plain', size: 1, referenced: true, tableId: ids.foreignTable, rowId: ids.foreignRow, fieldId: ids.foreignField },
      { id: newId('attachment'), workspaceId: ids.workspace, key: ownKey, name: 'synthetic.txt', mime: 'text/plain', size: 1, uploadedBy: ids.user, referenced: false },
    ])
  })

  afterAll(async () => {
    if (!database) return
    const { db, workspaces, users, sql } = database
    await db.delete(workspaces).where(inArray(workspaces.id, [ids.workspace, ids.foreignWorkspace]))
    await db.delete(users).where(inArray(users.id, [ids.user, ids.foreignUser]))
    await sql.end()
  })

  it('rejects deletion of a foreign row without copying its data into history', async () => {
    const { db, rows, rowChanges } = database
    expect((await actions.deleteRowAction(ids.table, ids.foreignRow)).ok).toBe(false)
    const [row] = await db.select().from(rows).where(eq(rows.id, ids.foreignRow))
    expect(row!.deletedAt).toBeNull()
    expect((row!.data as Record<string, unknown>)[ids.foreignField]).toBe('SYNTHETIC_FOREIGN_SECRET')
    expect(await db.select().from(rowChanges).where(eq(rowChanges.rowId, ids.foreignRow))).toHaveLength(0)
  })
  it('rejects a row from another table in the same workspace', async () => {
    expect((await actions.deleteRowAction(ids.table, ids.peerRow)).ok).toBe(false)
  })
  it('deletes an own row, and rejects repeated deletion', async () => {
    const { db, rows } = database
    const id = newId('row')
    await db.insert(rows).values({ id, tableId: ids.table, position: 'a9', data: {} })
    expect((await actions.deleteRowAction(ids.table, id)).ok).toBe(true)
    expect((await actions.deleteRowAction(ids.table, id)).ok).toBe(false)
  })
  it('rejects foreign relations on create and update; allows an own relation and lookup', async () => {
    expect((await fieldActions.createFieldAction(ids.table, { name: 'Foreign relation', type: 'relation', options: { tableId: ids.foreignTable } })).ok).toBe(false)
    const relation = await fieldActions.createFieldAction(ids.table, { name: 'Peer relation', type: 'relation', options: { tableId: ids.peer } })
    if (!relation.ok) throw new Error(relation.error)
    expect((await fieldActions.updateFieldAction(ids.table, relation.fieldId, { options: { tableId: ids.foreignTable } })).ok).toBe(false)
    const lookup = await fieldActions.createFieldAction(ids.table, { name: 'Peer lookup', type: 'lookup', options: { relationFieldId: relation.fieldId, targetFieldId: ids.peerField } })
    if (!lookup.ok) throw new Error(lookup.error)
    expect((await actions.setCellAction(ids.table, ids.row, relation.fieldId, [ids.peerRow])).ok).toBe(true)
    const loaded = await queries.loadTable(ids.table, ids.workspace)
    expect(loaded!.relatedTitles[ids.peer]!.some((row) => row.id === ids.peerRow)).toBe(true)
    expect(JSON.stringify(loaded!.rows.find((row) => row.id === ids.row)!.data[lookup.fieldId])).toContain('own peer')
  })
  it('does not expose foreign data through a legacy invalid relation and lookup', async () => {
    const { db, fields, rows } = database
    const relation = newId('field'), lookup = newId('field')
    await db.insert(fields).values([
      { id: relation, tableId: ids.table, name: 'Legacy relation', type: 'relation', options: { tableId: ids.foreignTable }, position: 'b0' },
      { id: lookup, tableId: ids.table, name: 'Legacy lookup', type: 'lookup', options: { relationFieldId: relation, targetFieldId: ids.foreignField }, position: 'b1' },
    ])
    await db.update(rows).set({ data: { [ids.field]: 'own', [relation]: [ids.foreignRow] } }).where(eq(rows.id, ids.row))
    try {
      const loaded = await queries.loadTable(ids.table, ids.workspace)
      expect(loaded!.relatedTitles[ids.foreignTable] ?? []).toHaveLength(0)
      expect(JSON.stringify(loaded)).not.toContain('SYNTHETIC_FOREIGN_SECRET')
      expect((await fieldActions.createFieldAction(ids.table, { name: 'New lookup through legacy', type: 'lookup', options: { relationFieldId: relation, targetFieldId: ids.foreignField } })).ok).toBe(false)
      const result = await runtime.loadRuntimeForApp(definition, { authenticated: true, roleId: 'manager', email: '', company: '', enrolled: false })
      expect(JSON.stringify(result)).not.toContain('SYNTHETIC_FOREIGN_SECRET')
      expect(JSON.stringify(result)).not.toContain(ids.foreignRow)
    } finally {
      await db.delete(fields).where(inArray(fields.id, [relation, lookup]))
      await db.update(rows).set({ data: { [ids.field]: 'own' } }).where(eq(rows.id, ids.row))
    }
  })
  it('rejects foreign table/view drafts and retains the last valid draft', async () => {
    for (const screen of [
      { id: 'foreign-detail', appId: ids.app, name: 'Foreign', position: 'z0', type: 'detail', tableId: ids.foreignTable },
      { id: 'foreign-list', appId: ids.app, name: 'Foreign', position: 'z0', type: 'list', source: { viewId: ids.foreignView } },
    ]) {
      const unsafe = appSchema.parse({ ...definition, screens: [...definition.screens, screen] })
      expect((await appActions.updateAppDraftAction(ids.app, unsafe)).ok).toBe(false)
    }
    const [saved] = await database.db.select().from(database.apps).where(eq(database.apps.id, ids.app))
    expect(saved!.draft).toEqual(definition)
    expect((await appActions.updateAppDraftAction(ids.app, definition)).ok).toBe(true)
  })
  it('rejects invalid persisted drafts on publish and invalid published definitions on load', async () => {
    const { db, apps } = database
    const unsafe = appSchema.parse({ ...definition, screens: [...definition.screens, { id: 'foreign', appId: ids.app, name: 'Foreign', position: 'z0', type: 'detail', tableId: ids.foreignTable }] })
    await db.update(apps).set({ draft: unsafe, published: unsafe }).where(eq(apps.id, ids.app))
    try {
      expect((await appActions.publishAppAction(ids.app)).ok).toBe(false)
      expect(await runtime.loadAppMeta(slug)).toBeNull()
      expect(await runtime.loadPublishedApp(slug, { authenticated: true, roleId: 'manager', email: '', company: '', enrolled: false })).toBeNull()
      const { loadApp } = await import('./app-write-access')
      expect(await loadApp(slug)).toBeNull()
    } finally {
      await db.update(apps).set({ draft: definition, published: definition }).where(eq(apps.id, ids.app))
    }
  })
  it('uses the record workspace rather than an embedded workspace ID', async () => {
    const { db, apps } = database
    await db.update(apps).set({ published: { ...definition, workspaceId: ids.foreignWorkspace } }).where(eq(apps.id, ids.app))
    try {
      expect((await runtime.loadAppMeta(slug))!.app.workspaceId).toBe(ids.workspace)
    } finally {
      await db.update(apps).set({ published: definition }).where(eq(apps.id, ids.app))
    }
  })
  const fileValue = (key: string) => [{ id: newId('attachment'), key, name: 'synthetic.txt', mime: 'text/plain', size: 1 }]
  it('rejects a foreign attachment without changing the row, history or file binding', async () => {
    const { db, rows, attachments, rowChanges } = database
    const [before] = await db.select().from(rows).where(eq(rows.id, ids.row))
    const changes = await db.select().from(rowChanges).where(eq(rowChanges.rowId, ids.row))
    expect((await actions.setCellAction(ids.table, ids.row, ids.fileField, fileValue(foreignKey))).ok).toBe(false)
    const [after] = await db.select().from(rows).where(eq(rows.id, ids.row))
    expect(after).toEqual(before)
    expect(await db.select().from(rowChanges).where(eq(rowChanges.rowId, ids.row))).toHaveLength(changes.length)
    const [file] = await db.select().from(attachments).where(eq(attachments.key, foreignKey))
    expect(file!.rowId).toBe(ids.foreignRow)
  })
  it('binds an own attachment and releases it when the cell is cleared', async () => {
    const { db, attachments } = database
    expect((await actions.setCellAction(ids.table, ids.row, ids.fileField, fileValue(ownKey))).ok).toBe(true)
    const [linked] = await db.select().from(attachments).where(eq(attachments.key, ownKey))
    expect(linked!.rowId).toBe(ids.row)
    expect(linked!.referenced).toBe(true)
    expect((await actions.setCellAction(ids.table, ids.row, ids.fileField, [])).ok).toBe(true)
    const [released] = await db.select().from(attachments).where(eq(attachments.key, ownKey))
    expect(released!.referenced).toBe(false)
    expect(released!.rowId).toBeNull()
  })
  it('does not expose foreign rows even when the low-level runtime gets an unsafe definition', async () => {
    const unsafe = appSchema.parse({ ...definition, screens: [{ id: 'foreign', appId: ids.app, name: 'Foreign', position: 'z0', type: 'detail', tableId: ids.foreignTable }] })
    const result = await runtime.loadRuntimeForApp(unsafe, { authenticated: true, roleId: 'manager', email: '', company: '', enrolled: false })
    expect(result!.tables[ids.foreignTable]).toBeUndefined()
    expect(JSON.stringify(result)).not.toContain('SYNTHETIC_FOREIGN_SECRET')
  })
  it('does not cascade deletion into a foreign movements table from a legacy definition', async () => {
    const { db, apps, rows, rowChanges } = database
    const source = newId('row'), movement = newId('row')
    await db.insert(rows).values([
      { id: source, tableId: ids.table, position: 'c0', data: {} },
      { id: movement, tableId: ids.foreignTable, position: 'c0', data: { [ids.foreignField]: [source] } },
    ])
    const unsafe = { ...definition, production: { tables: { production: ids.table, movements: ids.foreignTable }, movement: { run: ids.foreignField } } }
    await db.update(apps).set({ draft: unsafe, published: unsafe }).where(eq(apps.id, ids.app))
    try {
      expect((await actions.deleteRowAction(ids.table, source)).ok).toBe(true)
      const [foreign] = await db.select().from(rows).where(eq(rows.id, movement))
      expect(foreign!.deletedAt).toBeNull()
      expect(await db.select().from(rowChanges).where(eq(rowChanges.rowId, movement))).toHaveLength(0)
    } finally {
      await db.update(apps).set({ draft: definition, published: definition }).where(eq(apps.id, ids.app))
    }
  })
  it('rejects a foreign file through sync and links an own file through the same path', async () => {
    const { POST } = await import('@/app/api/sync/route')
    const { db, rows, attachments } = database
    const send = async (key: string) => {
      const response = await POST(new Request('http://localhost/api/sync', { method: 'POST', body: JSON.stringify({
        tableId: ids.table, deviceId: 'isolation-test', mutations: [{ id: newId('action'), op: 'update', rowId: ids.row, fieldId: ids.fileField, base: [], next: fileValue(key) }],
      }) }))
      return response.json()
    }
    const [before] = await db.select().from(rows).where(eq(rows.id, ids.row))
    const denied = await send(foreignKey)
    expect(denied.rejected[0].status).toBe('dropped')
    const [after] = await db.select().from(rows).where(eq(rows.id, ids.row))
    expect(after).toEqual(before)
    const accepted = await send(ownKey)
    expect(accepted.applied).toHaveLength(1)
    expect(accepted.rejected).toHaveLength(0)
    const [file] = await db.select().from(attachments).where(eq(attachments.key, ownKey))
    expect(file!.rowId).toBe(ids.row)
    expect((await actions.setCellAction(ids.table, ids.row, ids.fileField, [])).ok).toBe(true)
  })
  it('validates attachments through runtime create/update and rolls back invalid bindings', async () => {
    const { appCreateRowAction, appUpdateRowAction } = await import('@/app/runtime-actions')
    const { db, apps, rows, fields, attachments } = database
    const [fileField] = await db.select().from(fields).where(eq(fields.id, ids.fileField))
    const withFiles = structuredClone(definition)
    for (const screen of withFiles.screens) if (screen.type === 'form') {
      screen.components.push({ id: newId('component'), position: 'z0', type: 'form_field', fieldId: ids.fileField, visibleWhen: null, roles: null, label: null, required: false, placeholder: null })
    }
    await db.update(apps).set({ published: withFiles }).where(eq(apps.id, ids.app))
    try {
      expect((await appCreateRowAction(slug, ids.table, { [ids.fileField]: fileValue(foreignKey) })).ok).toBe(false)
      expect((await appUpdateRowAction(slug, ids.table, ids.row, { [ids.fileField]: fileValue(foreignKey) })).ok).toBe(false)
      expect((await appUpdateRowAction(slug, ids.table, ids.row, { [ids.fileField]: fileValue(ownKey) })).ok).toBe(true)
      expect((await appUpdateRowAction(slug, ids.table, ids.row, { [ids.fileField]: [] })).ok).toBe(true)
      const [file] = await db.select().from(attachments).where(eq(attachments.key, ownKey))
      expect(file!.referenced).toBe(false)

      // A stale caller cannot write history/row first and discover a bad binding afterward.
      const { linkAttachments } = await import('./attachments')
      const [before] = await db.select().from(rows).where(eq(rows.id, ids.row))
      await expect(db.transaction(async (tx) => {
        await tx.update(rows).set({ data: { shouldRollback: true } }).where(eq(rows.id, ids.row))
        await linkAttachments({ tableId: ids.table, rowId: ids.row, fieldId: fileField!.id }, fileValue(foreignKey), tx)
      })).rejects.toThrow('Файл не найден')
      const [after] = await db.select().from(rows).where(eq(rows.id, ids.row))
      expect(after).toEqual(before)
    } finally {
      await db.update(apps).set({ published: definition }).where(eq(apps.id, ids.app))
    }
  })
})
