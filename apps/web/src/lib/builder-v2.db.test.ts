import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq, inArray } from 'drizzle-orm'
import { appSchema, newId } from '@tableapp/schema'
import { readAppDefinition } from '@tableapp/schema/app-definition'
import type { AppV2 } from '@tableapp/schema/app-v2'
import { builderV2Revision } from './builder-v2-revision'

const identity = vi.hoisted(() => ({ member: null as import('./session').Member | null }))
vi.mock('@/lib/session', async original => ({ ...await original<typeof import('./session')>(), currentMember: async () => identity.member }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
const env = resolve(import.meta.dirname, '../../../../.env')
if (!process.env.DATABASE_URL && existsSync(env)) process.loadEnvFile(env)

describe.skipIf(!process.env.DATABASE_URL)('v2 editor persistence and workspace isolation', () => {
  let data: typeof import('@tableapp/db'), actions: typeof import('@/app/builder-v2-actions'), oldActions: typeof import('@/app/app-actions')
  const ownerId = newId('user'), workspaceId = newId('workspace'), otherWorkspace = newId('workspace'), tableId = newId('table'), foreignTable = newId('table'), fieldId = newId('field'), rowId = newId('row')
  const member = { userId: ownerId, email: `${ownerId}@example.invalid`, workspaceId, workspaceName: 'V2 synthetic workspace', name: 'Test', role: 'owner' as const }
  beforeAll(async () => {
    data = await import('@tableapp/db'); actions = await import('@/app/builder-v2-actions'); oldActions = await import('@/app/app-actions')
    await data.db.insert(data.users).values({ id: ownerId, email: member.email })
    await data.db.insert(data.workspaces).values([{ id: workspaceId, ownerId, slug: workspaceId, name: 'V2 synthetic', plan: 'business' }, { id: otherWorkspace, ownerId, slug: otherWorkspace, name: 'V2 foreign synthetic', plan: 'business' }])
    await data.db.insert(data.workspaceMembers).values([{ workspaceId, userId: ownerId, role: 'owner' }, { workspaceId: otherWorkspace, userId: ownerId, role: 'owner' }])
    await data.db.insert(data.tables).values([{ id: tableId, workspaceId, name: 'Own table', position: 'a0' }, { id: foreignTable, workspaceId: otherWorkspace, name: 'Foreign table', position: 'a0' }])
    await data.db.insert(data.fields).values({ id: fieldId, tableId, name: 'Title', type: 'text', position: 'a0' })
    await data.db.insert(data.rows).values({ id: rowId, tableId, position: 'a0', data: { [fieldId]: 'Existing data stays unchanged' } })
  })
  beforeEach(() => { identity.member = member })
  afterAll(async () => { vi.unstubAllEnvs(); if (!data) return; await data.db.delete(data.workspaces).where(inArray(data.workspaces.id, [workspaceId, otherWorkspace])); await data.db.delete(data.users).where(eq(data.users.id, ownerId)); await data.sql.end() })
  async function record(id: string) { const [record] = await data.db.select().from(data.apps).where(eq(data.apps.id, id)); return record! }
  async function create() {
    const id = newId('app'), result = await actions.createBuilderV2AppAction({ requestId: id, name: 'Новый черновик' })
    expect(result).toEqual({ ok: true, appId: id })
    const value = await record(id), read = readAppDefinition(value.draft)
    if (!read.ok || read.formatVersion !== 2) throw new Error('Fixture was not created')
    return { app: read.app, revision: builderV2Revision(value.draft) }
  }
  it('creates an empty app without creating tables or rows and makes retries idempotent', async () => {
    const value = await create()
    expect(value.app.sources).toEqual([])
    expect(value.app.screens).toHaveLength(1)
    expect((await record(value.app.id)).published).toBeNull()
    expect(await actions.createBuilderV2AppAction({ requestId: value.app.id, name: 'Retry' })).toEqual({ ok: true, appId: value.app.id })
    expect((await data.db.select().from(data.rows).where(eq(data.rows.id, rowId)))[0]!.data).toEqual({ [fieldId]: 'Existing data stays unchanged' })
  })
  it('persists a draft and canonical revision without touching published or table data', async () => {
    const { app, revision } = await create(), next = { ...app, name: 'Сохранённый черновик' }
    const result = await actions.saveBuilderV2DraftAction(app.id, next, revision)
    expect(result).toMatchObject({ ok: true })
    const stored = await record(app.id)
    expect(stored.name).toBe(next.name)
    expect(stored.published).toBeNull()
    expect(builderV2Revision(stored.draft)).toBe(builderV2Revision(next))
    expect(await actions.saveBuilderV2DraftAction(app.id, JSON.parse(JSON.stringify(next)), revision)).toEqual(result)
    expect(await actions.reloadBuilderV2DraftAction(app.id)).toMatchObject({ ok: true, app: { name: next.name } })
    const versions = await data.db.select().from(data.appConfigVersions).where(eq(data.appConfigVersions.appId, app.id))
    expect(versions).toHaveLength(1)
    expect((versions[0]!.definition as AppV2).name).toBe(app.name)
  })
  it('lets exactly one competing edit succeed and keeps the losing snapshot out of storage', async () => {
    const { app, revision } = await create()
    const results = await Promise.all([actions.saveBuilderV2DraftAction(app.id, { ...app, name: 'Вкладка А' }, revision), actions.saveBuilderV2DraftAction(app.id, { ...app, name: 'Вкладка Б' }, revision)])
    expect(results.filter(result => result.ok)).toHaveLength(1)
    expect(results.find(result => !result.ok)).toMatchObject({ ok: false, conflict: true })
    const stored = await record(app.id)
    expect(['Вкладка А', 'Вкладка Б']).toContain(stored.name)
  })
  it('denies foreign applications, foreign sources and altered identity coordinates', async () => {
    const { app, revision } = await create()
    identity.member = { ...member, workspaceId: otherWorkspace }
    expect(await actions.saveBuilderV2DraftAction(app.id, app, revision)).toMatchObject({ ok: false })
    expect(await actions.reloadBuilderV2DraftAction(app.id)).toMatchObject({ ok: false })
    identity.member = member
    expect(await actions.saveBuilderV2DraftAction(app.id, { ...app, workspaceId: otherWorkspace }, revision)).toMatchObject({ ok: false })
    expect(await actions.saveBuilderV2DraftAction(app.id, { ...app, slug: 'changed-address' }, revision)).toMatchObject({ ok: false })
    const foreign = { ...app, sources: [{ id: 'foreign_source', tableId: foreignTable, viewId: null, filter: null, sorts: [], searchFieldIds: [], pageSize: 10 }] }
    expect(await actions.saveBuilderV2DraftAction(app.id, foreign, revision)).toMatchObject({ ok: false })
    expect(builderV2Revision((await record(app.id)).draft)).toBe(revision)
  })
  it('keeps viewer and selected-table members out of configuration writes', async () => {
    const { app, revision } = await create()
    for (const restricted of [{ ...member, role: 'viewer' as const }, { ...member, role: 'editor' as const, tableAccess: { [tableId]: 'edit' as const } }]) {
      identity.member = restricted
      expect(await actions.saveBuilderV2DraftAction(app.id, { ...app, name: 'Denied' }, revision)).toMatchObject({ ok: false })
      expect(await actions.createBuilderV2AppAction({ requestId: newId('app'), name: 'Denied' })).toMatchObject({ ok: false })
    }
    expect((await record(app.id)).name).toBe(app.name)
  })
  it('prevents cross-format overwrites in both directions and blocks premature publication', async () => {
    const { app, revision } = await create()
    const legacy = appSchema.parse({ id: app.id, workspaceId, name: 'Legacy overwrite', slug: app.slug, theme: {} })
    expect(await oldActions.updateAppDraftAction(app.id, legacy)).toMatchObject({ ok: false })
    expect(await oldActions.publishAppAction(app.id)).toMatchObject({ ok: false })
    await data.db.update(data.apps).set({ draft: legacy }).where(eq(data.apps.id, app.id))
    expect(await actions.saveBuilderV2DraftAction(app.id, app, revision)).toMatchObject({ ok: false })
    expect(appSchema.safeParse((await record(app.id)).draft).success).toBe(true)
  })
  it('disables new writes in production unless the explicit rollout flag is enabled', async () => {
    const { app, revision } = await create()
    vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('TABLEAPP_BUILDER_V2', '')
    try { expect(await actions.saveBuilderV2DraftAction(app.id, app, revision)).toMatchObject({ ok: false }); expect(await actions.createBuilderV2AppAction({ requestId: newId('app'), name: 'Denied' })).toMatchObject({ ok: false }) }
    finally { vi.unstubAllEnvs() }
  })
})
