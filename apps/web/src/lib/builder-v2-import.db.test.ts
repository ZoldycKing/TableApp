import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { and, eq, inArray } from 'drizzle-orm'
import { newId } from '@tableapp/schema'
import { readAppDefinition } from '@tableapp/schema/app-definition'
import { builderV2Revision } from './builder-v2-revision'

const identity = vi.hoisted(() => ({ member: null as import('./session').Member | null }))
vi.mock('@/lib/session', async original => ({ ...await original<typeof import('./session')>(), currentMember: async () => identity.member }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
const env = resolve(import.meta.dirname, '../../../../.env')
if (!process.env.DATABASE_URL && existsSync(env)) process.loadEnvFile(env)

describe.skipIf(!process.env.DATABASE_URL)('one private starter per import', () => {
  let data: typeof import('@tableapp/db'), actions: typeof import('@/app/builder-v2-actions'), run: typeof import('./import-run')
  const userId = newId('user'), secondUser = newId('user'), workspaceId = newId('workspace'), foreignWorkspace = newId('workspace')
  const member = { userId, email: `${userId}@example.invalid`, workspaceId, workspaceName: 'Import starter test', name: 'Test', role: 'owner' as const }
  beforeAll(async () => {
    data = await import('@tableapp/db'); actions = await import('@/app/builder-v2-actions'); run = await import('./import-run')
    await data.db.insert(data.users).values([{ id: userId, email: member.email }, { id: secondUser, email: `${secondUser}@example.invalid` }])
    await data.db.insert(data.workspaces).values([{ id: workspaceId, ownerId: userId, name: 'Import starter test', slug: workspaceId, plan: 'business' }, { id: foreignWorkspace, ownerId: secondUser, name: 'Foreign import test', slug: foreignWorkspace, plan: 'business' }])
    await data.db.insert(data.workspaceMembers).values([{ workspaceId, userId, role: 'owner' }, { workspaceId: foreignWorkspace, userId: secondUser, role: 'owner' }])
  })
  beforeEach(() => { identity.member = member })
  afterAll(async () => { vi.unstubAllEnvs(); if (!data) return; await data.db.delete(data.workspaces).where(inArray(data.workspaces.id, [workspaceId, foreignWorkspace])); await data.db.delete(data.users).where(inArray(data.users.id, [userId, secondUser])); await data.sql.end() })
  async function importSheet(runId: string, sheet: string, by = member) {
    const result = await run.runSheetImport({ runId, sheet, fields: [{ id: 'source_title', tableId: 'source', name: 'Название', type: 'text', options: {}, description: null, position: 'a0' }], rows: [{ source_title: 'Свои данные' }], destination: { kind: 'new', name: sheet } }, by)
    if (!result.ok || !result.tableId) throw new Error('Import fixture failed')
    return result.tableId
  }
  async function read(id: string) {
    const [record] = await data.db.select().from(data.apps).where(eq(data.apps.id, id))
    const definition = readAppDefinition(record?.draft)
    if (!record || !definition.ok || definition.formatVersion !== 2) throw new Error('App fixture failed')
    return { record, app: definition.app }
  }
  it('makes competing requests and a lost response return one app and preserves subsequent author edits', async () => {
    const runId = newId('run'), first = await importSheet(runId, 'Проекты'), second = await importSheet(runId, 'Задачи')
    const before = await data.db.select().from(data.rows).where(inArray(data.rows.tableId, [first, second]))
    const results = await Promise.all([actions.prepareImportedBuilderAppAction(runId, second), actions.prepareImportedBuilderAppAction(runId, second)])
    expect(results[0]).toEqual(results[1]); expect(results[0]!.ok).toBe(true)
    if (!results[0]!.ok) throw new Error('Starter failed')
    const { app, record } = await read(results[0]!.appId)
    expect(record.published).toBeNull()
    expect(app.sources.map(source => source.tableId).sort()).toEqual([first, second].sort())
    expect(app.screens.find(screen => screen.id === app.homeScreenId)?.name).toBe('Задачи')
    expect(await actions.saveBuilderV2DraftAction(app.id, { ...app, name: 'Мои правки' }, builderV2Revision(record.draft))).toMatchObject({ ok: true })
    expect(await actions.prepareImportedBuilderAppAction(runId, first)).toEqual(results[0])
    expect((await read(app.id)).app.name).toBe('Мои правки')
    expect(await data.db.select().from(data.rows).where(inArray(data.rows.tableId, [first, second]))).toEqual(before)
    const stored = await data.db.select({ id: data.apps.id }).from(data.apps).where(and(eq(data.apps.workspaceId, workspaceId), eq(data.apps.id, app.id)))
    expect(stored).toHaveLength(1)
  })
  it('publishes a fresh import privately with read access for its author and no writes', async () => {
    const runId = newId('run'), tableId = await importSheet(runId, 'Мои заказы')
    const result = await actions.prepareImportedBuilderAppAction(runId, tableId)
    if (!result.ok) throw new Error(result.error)
    const { app, record } = await read(result.appId)
    expect(app.authentication).toEqual({ mode: 'invite_only', defaultRoleId: null, members: [{ email: member.email, roleIds: ['owner'], company: '' }] })
    const tableFields = await data.db.select({ id: data.fields.id }).from(data.fields).where(eq(data.fields.tableId, tableId))
    expect(app.policy.tables).toEqual([{ tableId, grants: [{ audience: { kind: 'roles', roleIds: ['owner'] }, read: { fieldIds: tableFields.map(field => field.id), rows: { kind: 'all' } } }] }])
    const list = app.nodes.find(node => node.type === 'collection')
    if (list?.type !== 'collection' || !list.events.itemPress) throw new Error('Missing card navigation')
    expect(app.policy.workflows).toEqual([{ workflowId: list.events.itemPress, audience: { kind: 'roles', roleIds: ['owner'] } }])
    const { publishBuilderV2Action } = await import('@/app/builder-v2-publish-actions')
    expect(await publishBuilderV2Action(app.id, builderV2Revision(record.draft))).toEqual({ ok: true, href: `/a/${app.slug}` })
    expect((await read(app.id)).record.published).toMatchObject({ authentication: app.authentication, policy: app.policy })
  })
  it('does not accept another import actor, another workspace, an invented run or an unrelated main table', async () => {
    const runId = newId('run'), tableId = await importSheet(runId, 'Проверка доступа')
    expect(await actions.prepareImportedBuilderAppAction(newId('run'))).toMatchObject({ ok: false })
    expect(await actions.prepareImportedBuilderAppAction(runId, 'foreign_table')).toMatchObject({ ok: false })
    identity.member = { ...member, userId: secondUser }
    expect(await actions.prepareImportedBuilderAppAction(runId, tableId)).toMatchObject({ ok: false })
    identity.member = { ...member, workspaceId: foreignWorkspace }
    expect(await actions.prepareImportedBuilderAppAction(runId, tableId)).toMatchObject({ ok: false })
  })
  it('does not create an app for an append-only run or deleted imported tables', async () => {
    const tableId = await importSheet(newId('run'), 'Для дополнения'), appendRun = newId('run')
    await data.db.insert(data.importRuns).values({ id: newId('import'), workspaceId, runId: appendRun, sheet: 'Добавление', tableId, tableName: 'Для дополнения', mode: 'append', added: 1, actorId: userId })
    expect(await actions.prepareImportedBuilderAppAction(appendRun)).toMatchObject({ ok: false })
    const deletedRun = newId('run'), deleted = await importSheet(deletedRun, 'Удалённая')
    await data.db.delete(data.tables).where(eq(data.tables.id, deleted))
    expect(await actions.prepareImportedBuilderAppAction(deletedRun)).toMatchObject({ ok: false })
  })
  it('checks workspace write permission and the rollout flag before preparing a draft', async () => {
    const runId = newId('run'); await importSheet(runId, 'Только просмотр')
    identity.member = { ...member, role: 'viewer' }
    expect(await actions.prepareImportedBuilderAppAction(runId)).toMatchObject({ ok: false })
    identity.member = member
    vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('TABLEAPP_BUILDER_V2', '0')
    expect(await actions.prepareImportedBuilderAppAction(runId)).toMatchObject({ ok: false })
  })
})
