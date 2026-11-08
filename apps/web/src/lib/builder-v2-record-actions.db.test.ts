import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq, inArray } from 'drizzle-orm'
import { newId } from '@tableapp/schema'
import type { AppV2 } from '@tableapp/schema/app-v2'
import type { BuilderV2Form } from './builder-v2-form-types'
import type { BuilderV2WorkingFormState } from './builder-v2-submit-types'
import type { BuilderV2DeleteState } from './builder-v2-delete-types'
import { builderV2Revision } from './builder-v2-revision'

const identity = vi.hoisted(() => ({ member: null as import('./session').Member | null }))
vi.mock('@/lib/session', async original => ({ ...await original<typeof import('./session')>(), currentMember: async () => identity.member }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
const env = resolve(import.meta.dirname, '../../../../.env')
if (!process.env.DATABASE_URL && existsSync(env)) process.loadEnvFile(env)

describe.skipIf(!process.env.DATABASE_URL)('private v2 update and confirmed delete', () => {
  let data: typeof import('@tableapp/db'), forms: typeof import('@/app/builder-v2-form-actions'), deletes: typeof import('@/app/builder-v2-delete-actions'), builder: typeof import('./builder-v2'), model: typeof import('@/components/builder/v2/model'), configure: typeof import('./builder-v2-form-action'), deletion: typeof import('./builder-v2-delete-action')
  const userId = newId('user'), other = newId('user'), workspaceId = newId('workspace'), foreign = newId('workspace'), tableId = newId('table'), title = newId('field'), amount = newId('field'), done = newId('field'), owner = newId('field'), secret = newId('field'), computed = newId('field')
  const member = { userId, workspaceId, email: `${userId}@example.invalid`, name: 'Проверка действий', workspaceName: 'V10 record actions', role: 'owner' as const }, otherEmail = `${other}@example.invalid`
  beforeAll(async () => {
    data = await import('@tableapp/db'); forms = await import('@/app/builder-v2-form-actions'); deletes = await import('@/app/builder-v2-delete-actions'); builder = await import('./builder-v2'); model = await import('@/components/builder/v2/model'); configure = await import('./builder-v2-form-action'); deletion = await import('./builder-v2-delete-action')
    await data.db.insert(data.users).values([{ id: userId, email: member.email }, { id: other, email: otherEmail }])
    await data.db.insert(data.workspaces).values([{ id: workspaceId, ownerId: userId, name: member.workspaceName, slug: workspaceId, plan: 'business' }, { id: foreign, ownerId: other, name: 'V10 foreign', slug: foreign }])
    await data.db.insert(data.workspaceMembers).values([{ workspaceId, userId, role: 'owner' }, { workspaceId, userId: other, role: 'editor' }, { workspaceId: foreign, userId: other, role: 'owner' }])
    await data.db.insert(data.tables).values({ id: tableId, workspaceId, name: 'Проекты', position: 'a0' })
    await data.db.insert(data.fields).values([{ id: title, tableId, name: 'Название', type: 'text', position: 'a0' }, { id: amount, tableId, name: 'Бюджет', type: 'number', position: 'a1' }, { id: done, tableId, name: 'Завершён', type: 'checkbox', position: 'a2' }, { id: owner, tableId, name: 'Владелец', type: 'email', position: 'a3' }, { id: secret, tableId, name: 'Скрытое поле', type: 'text', position: 'a4' }, { id: computed, tableId, name: 'Удвоенный бюджет', type: 'formula', options: { expression: '{Бюджет} * 2' }, position: 'a5' }])
    await data.db.update(data.tables).set({ primaryFieldId: title }).where(eq(data.tables.id, tableId))
  })
  beforeEach(() => { identity.member = member })
  afterEach(() => vi.unstubAllEnvs())
  afterAll(async () => { if (!data) return; await data.db.delete(data.workspaces).where(inArray(data.workspaces.id, [workspaceId, foreign])); await data.db.delete(data.users).where(inArray(data.users.id, [userId, other])); await data.sql.end() })
  async function fixture() {
    let app = builder.newBuilderV2App({ id: newId('app'), workspaceId, name: 'Проекты', slug: newId('app').replace('_', '-'), email: member.email })
    app.roles.push({ id: 'worker', name: 'Сотрудник' }); app.authentication.members.push({ email: otherEmail, roleIds: ['worker'], company: '' })
    const screen = app.screens[0]!; screen.contextTableId = tableId; screen.navigation = false; screen.audience = { kind: 'roles', roleIds: ['owner', 'worker'] }; app.homeScreenId = null
    app.policy.tables = [{ tableId, grants: ['owner', 'worker'].map(role => ({ audience: { kind: 'roles' as const, roleIds: [role] }, read: { fieldIds: [title, amount, done, owner], rows: { kind: 'owned' as const, fieldId: owner, property: 'email' as const } }, update: { fieldIds: [title], rows: { kind: 'owned' as const, fieldId: owner, property: 'email' as const } }, delete: { rows: { kind: 'owned' as const, fieldId: owner, property: 'email' as const } } })) }]
    const tables = (await builder.loadBuilderV2Catalog(workspaceId)).tables, added = model.addNode(app, screen.id, 'form', tables, null, tableId)
    app = model.addNode(added.app, screen.id, 'input', tables, added.id, '', owner).app
    const form = app.nodes.find(node => node.id === added.id) as BuilderV2Form; form.mode = 'edit'
    const locked = app.nodes.find(node => node.type === 'input' && node.fieldId === owner)!; if (locked.type === 'input') locked.readOnly = true
    app = configure.configureBuilderV2FormSave(app, form.id, ['owner', 'worker'])
    const button = model.addNode(app, screen.id, 'button', tables, null, ''); app = deletion.configureBuilderV2Delete(button.app, button.id, ['owner', 'worker'])
    const rowId = newId('row'), otherRow = newId('row')
    await data.db.insert(data.rows).values([{ id: rowId, tableId, position: 'a0', data: { [title]: 'Проект Альфа', [amount]: 1200, [done]: true, [owner]: member.email, [secret]: 'Сохранить' } }, { id: otherRow, tableId, position: 'a1', data: { [title]: 'Проект другого участника', [amount]: 99, [done]: false, [owner]: otherEmail } }])
    await data.db.insert(data.apps).values({ id: app.id, workspaceId, name: app.name, slug: app.slug, theme: app.theme, draft: app })
    return { app, formId: form.id, nodeId: button.id, screenId: screen.id, rowId, otherRow, scope: { screenId: screen.id, formId: form.id, recordId: rowId }, deleteScope: { screenId: screen.id, nodeId: button.id, recordId: rowId } }
  }
  async function formState(f: Awaited<ReturnType<typeof fixture>>) { const result = await forms.inspectWorkingBuilderV2FormAction(f.app.id, { ...f.scope, mode: 'initial' }); if (!result.ok || !('state' in result)) throw new Error(JSON.stringify(result)); return result.state as BuilderV2WorkingFormState }
  async function deleteState(f: Awaited<ReturnType<typeof fixture>>) { const result = await deletes.inspectBuilderV2DeleteAction(f.app.id, f.deleteScope); if (!result.ok) throw new Error(result.error); return result.state }
  const request = (f: Awaited<ReturnType<typeof fixture>>, state: BuilderV2WorkingFormState) => ({ ...f.scope, requestId: `submit_${crypto.randomUUID().replaceAll('-', '')}`, revision: state.revision, fingerprint: state.fingerprint, values: { [title]: 'Исправлено', [amount]: 0, [done]: false } })
  const deleteRequest = (f: Awaited<ReturnType<typeof fixture>>, state: BuilderV2DeleteState) => ({ ...f.deleteScope, requestId: `delete_${crypto.randomUUID().replaceAll('-', '')}`, revision: state.revision, fingerprint: state.fingerprint, confirmed: true as const })
  const row = async (id: string) => (await data.db.select().from(data.rows).where(eq(data.rows.id, id)))[0]!
  const history = (id: string) => data.db.select().from(data.rowChanges).where(eq(data.rowChanges.rowId, id))
  it('prefills, updates once under competing retries, preserves closed fields and never creates another row', async () => {
    const f = await fixture(), state = await formState(f), before = (await data.db.select().from(data.rows).where(eq(data.rows.tableId, tableId))).length
    expect(state.values).toMatchObject({ [title]: 'Проект Альфа', [amount]: 1200, [done]: true, [owner]: member.email })
    const input = request(f, state), results = await Promise.all([forms.submitBuilderV2FormAction(f.app.id, input), forms.submitBuilderV2FormAction(f.app.id, input)])
    expect(results).toEqual(expect.arrayContaining([expect.objectContaining({ ok: true, rowId: f.rowId, repeated: false }), expect.objectContaining({ ok: true, rowId: f.rowId, repeated: true })]))
    expect((await row(f.rowId)).data).toMatchObject({ [title]: 'Исправлено', [amount]: 0, [done]: false, [owner]: member.email, [secret]: 'Сохранить' })
    expect((await row(f.rowId)).version).toBe(1); expect(await history(f.rowId)).toHaveLength(1)
    expect((await data.db.select().from(data.rows).where(eq(data.rows.tableId, tableId))).length).toBe(before)
    expect(await forms.submitBuilderV2FormAction(f.app.id, { ...input, values: { ...input.values, [title]: 'Подмена' } })).toMatchObject({ ok: false })
    await data.db.update(data.rows).set({ deletedAt: new Date() }).where(eq(data.rows.id, f.rowId))
    expect(await forms.submitBuilderV2FormAction(f.app.id, input)).toMatchObject({ ok: true, repeated: true })
    expect((await data.db.select().from(data.apps).where(eq(data.apps.id, f.app.id)))[0]!.draft).toEqual(f.app)
  })
  it('refuses stale row versions and stale app definitions without overwriting the newer data', async () => {
    const f = await fixture(), state = await formState(f), input = request(f, state)
    await data.db.update(data.rows).set({ version: 1, data: { ...((await row(f.rowId)).data as Record<string, unknown>), [title]: 'Внешнее изменение' } }).where(eq(data.rows.id, f.rowId))
    expect(await forms.submitBuilderV2FormAction(f.app.id, input)).toMatchObject({ ok: false, stale: true })
    expect(((await row(f.rowId)).data as Record<string, unknown>)[title]).toBe('Внешнее изменение')
    const fresh = await formState(f)
    await data.db.update(data.apps).set({ draft: { ...f.app, name: 'Переименовано' } }).where(eq(data.apps.id, f.app.id))
    expect(await forms.submitBuilderV2FormAction(f.app.id, request(f, fresh))).toMatchObject({ ok: false, stale: true })
    expect(await history(f.rowId)).toHaveLength(0)
  })
  it('keeps owned row scopes, rejects injected fields and identity, and checks current action and table grants', async () => {
    const f = await fixture(), state = await formState(f), input = request(f, state)
    for (const field of [owner, secret, computed, 'unknown']) expect(await forms.submitBuilderV2FormAction(f.app.id, { ...input, values: { ...input.values, [field]: 'подмена' } })).toMatchObject({ ok: false })
    expect(await forms.submitBuilderV2FormAction(f.app.id, { ...input, actor: { roleIds: ['owner'] } })).toMatchObject({ ok: false })
    expect(await forms.inspectWorkingBuilderV2FormAction(f.app.id, { ...f.scope, recordId: f.otherRow, mode: 'initial' })).toMatchObject({ ok: false })
    identity.member = { ...member, userId: other, email: otherEmail, role: 'editor' }
    expect(await forms.submitBuilderV2FormAction(f.app.id, input)).toMatchObject({ ok: false })
    expect(await forms.inspectWorkingBuilderV2FormAction(f.app.id, { ...f.scope, recordId: f.otherRow, mode: 'initial' })).toMatchObject({ ok: true })
    identity.member = member
    for (const policy of [{ ...f.app.policy, workflows: [] }, { ...f.app.policy, tables: [] }]) { await data.db.update(data.apps).set({ draft: { ...f.app, policy } }).where(eq(data.apps.id, f.app.id)); expect(await forms.submitBuilderV2FormAction(f.app.id, input)).toMatchObject({ ok: false }) }
    expect(await history(f.rowId)).toHaveLength(0)
  })
  it('requires confirmation and deletes once with a durable retry after the row is gone', async () => {
    const f = await fixture(), state = await deleteState(f), input = deleteRequest(f, state)
    expect(state.recordLabel).toBe('Проект Альфа')
    expect(await deletes.submitBuilderV2DeleteAction(f.app.id, { ...input, confirmed: false })).toMatchObject({ ok: false })
    expect((await row(f.rowId)).deletedAt).toBeNull(); expect(await history(f.rowId)).toHaveLength(0)
    const results = await Promise.all([deletes.submitBuilderV2DeleteAction(f.app.id, input), deletes.submitBuilderV2DeleteAction(f.app.id, input)])
    expect(results).toEqual(expect.arrayContaining([expect.objectContaining({ ok: true, repeated: false }), expect.objectContaining({ ok: true, repeated: true })]))
    expect((await row(f.rowId)).deletedAt).not.toBeNull(); expect((await row(f.otherRow)).deletedAt).toBeNull()
    expect(await history(f.rowId)).toHaveLength(1)
    expect(await deletes.submitBuilderV2DeleteAction(f.app.id, input)).toMatchObject({ ok: true, repeated: true })
    expect(await deletes.submitBuilderV2DeleteAction(f.app.id, { ...input, recordId: f.otherRow })).toMatchObject({ ok: false })
  })
  it('refuses stale deletion, foreign ownership, viewers, another workspace and disabled rollout', async () => {
    const f = await fixture(), state = await deleteState(f), input = deleteRequest(f, state)
    expect(await deletes.inspectBuilderV2DeleteAction(f.app.id, { ...f.deleteScope, recordId: f.otherRow })).toMatchObject({ ok: false })
    expect(await deletes.submitBuilderV2DeleteAction(f.app.id, { ...input, actor: { id: userId } })).toMatchObject({ ok: false })
    await data.db.update(data.rows).set({ version: 1 }).where(eq(data.rows.id, f.rowId))
    expect(await deletes.submitBuilderV2DeleteAction(f.app.id, input)).toMatchObject({ ok: false, stale: true })
    for (const denied of [{ ...member, role: 'viewer' as const }, { ...member, workspaceId: foreign }]) { identity.member = denied; expect(await deletes.submitBuilderV2DeleteAction(f.app.id, input)).toMatchObject({ ok: false }) }
    identity.member = member; vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('TABLEAPP_BUILDER_V2', '0')
    expect(await deletes.submitBuilderV2DeleteAction(f.app.id, input)).toMatchObject({ ok: false })
    expect((await row(f.rowId)).deletedAt).toBeNull(); expect(await history(f.rowId)).toHaveLength(0)
  })
  it('does not execute an unconfirmed or longer workflow and checks independent delete permission', async () => {
    const f = await fixture(), state = await deleteState(f), input = deleteRequest(f, state), button = f.app.nodes.find(node => node.id === f.nodeId)
    if (button?.type !== 'button') throw new Error('Button missing')
    const flow = f.app.workflows.find(flow => flow.id === button.events.press)!
    const variants: AppV2[] = [{ ...f.app, policy: { ...f.app.policy, tables: f.app.policy.tables.map(rule => ({ ...rule, grants: rule.grants.map(grant => ({ ...grant, delete: undefined })) })) } }, { ...f.app, workflows: f.app.workflows.map(item => item.id === flow.id ? { ...item, steps: [...item.steps, { id: 'notice', type: 'notify', message: { kind: 'literal', value: 'Удалено' } }] } : item) }]
    for (const app of variants) { await data.db.update(data.apps).set({ draft: app }).where(eq(data.apps.id, f.app.id)); expect(await deletes.submitBuilderV2DeleteAction(app.id, { ...input, revision: builderV2Revision(app) })).toMatchObject({ ok: false }) }
    expect((await row(f.rowId)).deletedAt).toBeNull(); expect(await history(f.rowId)).toHaveLength(0)
  })
  it('refuses silent legacy cascades even in read-only inspection and after confirmation', async () => {
    const f = await fixture(), state = await deleteState(f), movements = newId('table'), link = newId('field'), movement = newId('row'), legacy = newId('app')
    await data.db.insert(data.tables).values({ id: movements, workspaceId, name: 'Движения', position: 'a1' })
    await data.db.insert(data.fields).values({ id: link, tableId: movements, name: 'Выпуск', type: 'relation', options: { tableId }, position: 'a0' })
    await data.db.insert(data.rows).values({ id: movement, tableId: movements, position: 'a0', data: { [link]: [f.rowId] } })
    await data.db.insert(data.apps).values({ id: legacy, workspaceId, name: 'Cascade check', slug: legacy.replace('_', '-'), draft: { production: { tables: { production: tableId, movements }, movement: { run: link } } } })
    expect(await deletes.inspectBuilderV2DeleteAction(f.app.id, f.deleteScope)).toMatchObject({ ok: false, error: expect.stringContaining('зависимые') })
    expect(await deletes.submitBuilderV2DeleteAction(f.app.id, deleteRequest(f, state))).toMatchObject({ ok: false, error: expect.stringContaining('зависимые') })
    expect((await row(f.rowId)).deletedAt).toBeNull(); expect((await row(movement)).deletedAt).toBeNull()
  })
})
