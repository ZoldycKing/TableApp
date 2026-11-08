import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq, inArray } from 'drizzle-orm'
import { newId, planOf } from '@tableapp/schema'
import type { AppV2 } from '@tableapp/schema/app-v2'
import { builderV2Revision } from './builder-v2-revision'
import type { BuilderV2Form } from './builder-v2-form-types'
import type { BuilderV2WorkingFormState } from './builder-v2-submit-types'

const identity = vi.hoisted(() => ({ member: null as import('./session').Member | null }))
vi.mock('@/lib/session', async original => ({ ...await original<typeof import('./session')>(), currentMember: async () => identity.member }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
const env = resolve(import.meta.dirname, '../../../../.env')
if (!process.env.DATABASE_URL && existsSync(env)) process.loadEnvFile(env)

describe.skipIf(!process.env.DATABASE_URL)('canonical private form creation with independent app permissions', () => {
  let data: typeof import('@tableapp/db'), actions: typeof import('@/app/builder-v2-form-actions'), builder: typeof import('./builder-v2'), model: typeof import('@/components/builder/v2/model'), configure: typeof import('./builder-v2-form-action')
  const userId = newId('user'), outsider = newId('user'), workspaceId = newId('workspace'), foreignWorkspace = newId('workspace'), tableId = newId('table'), parentTable = newId('table'), title = newId('field'), amount = newId('field'), done = newId('field'), owner = newId('field'), computed = newId('field'), relation = newId('field'), parentName = newId('field'), parentRow = newId('row')
  const member = { userId, workspaceId, email: `${userId}@example.invalid`, name: 'Автор формы', workspaceName: 'V9 form writes', role: 'owner' as const }
  beforeAll(async () => {
    data = await import('@tableapp/db'); actions = await import('@/app/builder-v2-form-actions'); builder = await import('./builder-v2'); model = await import('@/components/builder/v2/model'); configure = await import('./builder-v2-form-action')
    await data.db.insert(data.users).values([{ id: userId, email: member.email }, { id: outsider, email: `${outsider}@example.invalid` }])
    await data.db.insert(data.workspaces).values([{ id: workspaceId, ownerId: userId, name: 'V9 form writes', slug: workspaceId, plan: 'business' }, { id: foreignWorkspace, ownerId: outsider, name: 'V9 foreign', slug: foreignWorkspace, plan: 'business' }])
    await data.db.insert(data.workspaceMembers).values([{ workspaceId, userId, role: 'owner' }, { workspaceId, userId: outsider, role: 'editor' }, { workspaceId: foreignWorkspace, userId: outsider, role: 'owner' }])
    await data.db.insert(data.tables).values([{ id: tableId, workspaceId, name: 'Проекты', position: 'a0' }, { id: parentTable, workspaceId, name: 'Клиенты', position: 'a1' }])
    await data.db.insert(data.fields).values([{ id: title, tableId, name: 'Название', type: 'text', position: 'a0' }, { id: amount, tableId, name: 'Сумма', type: 'number', position: 'a1' }, { id: done, tableId, name: 'Готово', type: 'checkbox', position: 'a2' }, { id: owner, tableId, name: 'Автор', type: 'email', position: 'a3' }, { id: computed, tableId, name: 'Удвоенная сумма', type: 'formula', options: { expression: '{Сумма} * 2' }, position: 'a4' }, { id: relation, tableId, name: 'Клиент', type: 'relation', options: { tableId: parentTable }, position: 'a5' }, { id: parentName, tableId: parentTable, name: 'Имя', type: 'text', position: 'a0' }])
    await data.db.update(data.tables).set({ primaryFieldId: title }).where(eq(data.tables.id, tableId)); await data.db.update(data.tables).set({ primaryFieldId: parentName }).where(eq(data.tables.id, parentTable))
    await data.db.insert(data.rows).values({ id: parentRow, tableId: parentTable, data: { [parentName]: 'Анна' }, position: 'a0' })
  })
  beforeEach(() => { identity.member = member })
  afterAll(async () => { vi.unstubAllEnvs(); if (!data) return; await data.db.delete(data.workspaces).where(inArray(data.workspaces.id, [workspaceId, foreignWorkspace])); await data.db.delete(data.users).where(inArray(data.users.id, [userId, outsider])); await data.sql.end() })
  async function fixture(contextual = false) {
    let app = builder.newBuilderV2App({ id: newId('app'), workspaceId, name: 'Новая запись', slug: newId('app').replace('_', '-'), email: member.email })
    if (contextual) { const screen = app.screens[0]!; screen.contextTableId = parentTable; screen.navigation = false; app.homeScreenId = null }
    const tables = (await builder.loadBuilderV2Catalog(workspaceId)).tables, screenId = app.screens[0]!.id
    const added = model.addNode(app, screenId, 'form', tables, null, tableId); app = added.app
    app = model.addNode(app, screenId, 'input', tables, added.id, '', owner).app
    const email = app.nodes.find(node => node.type === 'input' && node.fieldId === owner)!
    if (email.type === 'input') { email.readOnly = true; email.initialValue = { kind: 'user', property: 'email' } }
    app = configure.configureBuilderV2FormCreate(app, added.id, ['owner'])
    await data.db.insert(data.apps).values({ id: app.id, workspaceId, name: app.name, slug: app.slug, draft: app, theme: app.theme })
    const scope = { formId: added.id, screenId, ...(contextual ? { recordId: parentRow } : {}) }
    return { app, form: app.nodes.find(node => node.id === added.id) as BuilderV2Form, scope }
  }
  async function initial(f: Awaited<ReturnType<typeof fixture>>) {
    const result = await actions.inspectWorkingBuilderV2FormAction(f.app.id, { ...f.scope, mode: 'initial' })
    if (!result.ok || !('state' in result)) throw new Error(JSON.stringify(result))
    return result.state as BuilderV2WorkingFormState
  }
  const token = () => `submit_${crypto.randomUUID().replaceAll('-', '')}`
  const request = (scope: object, state: BuilderV2WorkingFormState, values = { [title]: 'Стол', [amount]: 0, [done]: false }) => ({ ...scope, values, fingerprint: state.fingerprint, revision: state.revision, requestId: token() })
  const records = () => data.db.select().from(data.rows).where(eq(data.rows.tableId, tableId))
  it('creates one real row, preserves zero/false and trusted defaults, records history and makes competing retries idempotent', async () => {
    const f = await fixture(), state = await initial(f), input = request(f.scope, state), before = (await records()).length
    const results = await Promise.all([actions.submitBuilderV2FormAction(f.app.id, input), actions.submitBuilderV2FormAction(f.app.id, input)])
    expect(results.every(result => result.ok)).toBe(true)
    if (!results[0]!.ok || !results[1]!.ok) throw new Error('Write failed')
    expect(results[0]!.rowId).toBe(results[1]!.rowId)
    expect(results.filter(result => result.ok && result.repeated)).toHaveLength(1)
    const [row] = await data.db.select().from(data.rows).where(eq(data.rows.id, results[0]!.rowId))
    expect(row!.data).toMatchObject({ [title]: 'Стол', [amount]: 0, [done]: false, [owner]: member.email })
    expect((await records()).length).toBe(before + 1)
    expect(await data.db.select().from(data.rowChanges).where(eq(data.rowChanges.rowId, row!.id))).toHaveLength(1)
    expect(await data.db.select().from(data.builderActionRuns).where(eq(data.builderActionRuns.appId, f.app.id))).toHaveLength(1)
    expect(await actions.submitBuilderV2FormAction(f.app.id, { ...input, values: { ...input.values, [title]: 'Другое' } })).toMatchObject({ ok: false })
    const [stored] = await data.db.select().from(data.apps).where(eq(data.apps.id, f.app.id)); expect(stored!.draft).toEqual(f.app); expect(stored!.published).toBeNull()
  })
  it('validates before writing and refuses locked/computed fields, spoofed identity, wrong context and changed settings', async () => {
    const f = await fixture(), state = await initial(f), before = (await records()).length, input = request(f.scope, state)
    expect(await actions.submitBuilderV2FormAction(f.app.id, { ...input, values: { ...input.values, [title]: ' ' } })).toMatchObject({ ok: false, errors: expect.any(Object) })
    for (const id of [owner, computed, 'unknown']) expect(await actions.submitBuilderV2FormAction(f.app.id, { ...input, values: { ...input.values, [id]: 'fake' } })).toMatchObject({ ok: false })
    expect(await actions.submitBuilderV2FormAction(f.app.id, { ...input, actor: { roleIds: ['owner'] } })).toMatchObject({ ok: false })
    expect(await actions.submitBuilderV2FormAction(f.app.id, { ...input, recordId: parentRow })).toMatchObject({ ok: false })
    await data.db.update(data.apps).set({ draft: { ...f.app, name: 'Changed' } }).where(eq(data.apps.id, f.app.id))
    expect(await actions.submitBuilderV2FormAction(f.app.id, input)).toMatchObject({ ok: false, stale: true })
    expect((await records()).length).toBe(before)
    expect(await data.db.select().from(data.builderActionRuns).where(eq(data.builderActionRuns.appId, f.app.id))).toHaveLength(0)
  })
  it('requires both workflow and field grants, current membership, application role and rollout', async () => {
    const f = await fixture(), state = await initial(f), input = request(f.scope, state), before = (await records()).length
    for (const policy of [{ ...f.app.policy, workflows: [] }, { ...f.app.policy, tables: [] }]) {
      await data.db.update(data.apps).set({ draft: { ...f.app, policy } }).where(eq(data.apps.id, f.app.id))
      expect(await actions.submitBuilderV2FormAction(f.app.id, input)).toMatchObject({ ok: false })
    }
    await data.db.update(data.apps).set({ draft: f.app }).where(eq(data.apps.id, f.app.id))
    identity.member = { ...member, userId: outsider, email: `${outsider}@example.invalid`, role: 'editor' }
    expect(await actions.submitBuilderV2FormAction(f.app.id, input)).toMatchObject({ ok: false })
    identity.member = { ...member, workspaceId: foreignWorkspace }
    expect(await actions.submitBuilderV2FormAction(f.app.id, input)).toMatchObject({ ok: false })
    identity.member = { ...member, role: 'viewer' }
    expect(await actions.submitBuilderV2FormAction(f.app.id, input)).toMatchObject({ ok: false })
    identity.member = member; vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('TABLEAPP_BUILDER_V2', '0')
    expect(await actions.submitBuilderV2FormAction(f.app.id, input)).toMatchObject({ ok: false }); vi.unstubAllEnvs()
    expect((await records()).length).toBe(before)
  })
  it('binds a contextual readonly relation on the server and detects stale selected records', async () => {
    const f = await fixture(true), state = await initial(f)
    expect(state.values[relation]).toEqual([parentRow])
    const result = await actions.submitBuilderV2FormAction(f.app.id, request(f.scope, state))
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error)
    expect((await data.db.select().from(data.rows).where(eq(data.rows.id, result.rowId)))[0]!.data).toMatchObject({ [relation]: [parentRow] })
    await data.db.update(data.rows).set({ version: 1 }).where(eq(data.rows.id, parentRow))
    expect(await actions.submitBuilderV2FormAction(f.app.id, request(f.scope, state))).toMatchObject({ ok: false, stale: true })
  })
  it('keeps preview read-only, refuses an unsupported workflow and does not recreate a deleted result on retry', async () => {
    const f = await fixture(), before = (await records()).length
    const preview = await actions.inspectBuilderV2FormAction(f.app.id, f.app, { ...f.scope, mode: 'initial' })
    if (!preview.ok || !('state' in preview)) throw new Error('Preview failed')
    await actions.inspectBuilderV2FormAction(f.app.id, f.app, { ...f.scope, mode: 'check', values: { [title]: 'Проба', [amount]: 0, [done]: false }, fingerprint: preview.state.fingerprint })
    expect((await records()).length).toBe(before)
    const state = await initial(f), input = request(f.scope, state), result = await actions.submitBuilderV2FormAction(f.app.id, input)
    if (!result.ok) throw new Error(result.error)
    await data.db.update(data.rows).set({ deletedAt: new Date() }).where(eq(data.rows.id, result.rowId))
    expect(await actions.submitBuilderV2FormAction(f.app.id, input)).toMatchObject({ ok: true, repeated: true, rowId: result.rowId })
    const flow = f.app.workflows.find(flow => flow.id === f.form.events.submit)!
    const next = { ...f.app, workflows: f.app.workflows.map(item => item.id === flow.id ? { ...flow, steps: [...flow.steps, { id: 'unsupported_step', type: 'delete_row' as const,tableId:tableId,target:{kind:'current' as const},confirm:false as const }] } : item) }
    await data.db.update(data.apps).set({ draft: next }).where(eq(data.apps.id, f.app.id))
    expect(await actions.submitBuilderV2FormAction(f.app.id, { ...input, requestId: token(), revision: builderV2Revision(next) })).toMatchObject({ ok: false })
  })
  it('rolls back the receipt and row at the plan limit and allows correction after the limit is lifted', async () => {
    const f = await fixture(), state = await initial(f), input = request(f.scope, state), before = (await records()).length
    const [usage] = await data.db.select().from(data.workspaceUsage).where(eq(data.workspaceUsage.workspaceId, workspaceId))
    const limitRows = Array.from({ length: planOf('free').limits.rows }, (_, index) => ({ id: newId('row'), tableId: parentTable, position: `quota_${index}`, data: { [parentName]: `Лимит ${index}` } }))
    await data.db.insert(data.rows).values(limitRows)
    await data.db.update(data.workspaces).set({ plan: 'free' }).where(eq(data.workspaces.id, workspaceId))
    await data.db.insert(data.workspaceUsage).values({ workspaceId, rows: 1000000000 }).onConflictDoUpdate({ target: data.workspaceUsage.workspaceId, set: { rows: 1000000000 } })
    try {
      const result = await actions.submitBuilderV2FormAction(f.app.id, input)
      expect(result).toMatchObject({ ok: false }); expect(result).not.toHaveProperty('uncertain', true)
      expect((await records()).length).toBe(before)
      expect(await data.db.select().from(data.builderActionRuns).where(eq(data.builderActionRuns.appId, f.app.id))).toHaveLength(0)
    } finally {
      await data.db.delete(data.rows).where(inArray(data.rows.id, limitRows.map(row => row.id)))
      await data.db.update(data.workspaces).set({ plan: 'business' }).where(eq(data.workspaces.id, workspaceId))
      await data.db.update(data.workspaceUsage).set({ rows: usage?.rows ?? before + 1 }).where(eq(data.workspaceUsage.workspaceId, workspaceId))
    }
    expect(await actions.submitBuilderV2FormAction(f.app.id, input)).toMatchObject({ ok: true, repeated: false })
  })
})
