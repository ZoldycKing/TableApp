import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq, inArray, sql } from 'drizzle-orm'
import { newId } from '@tableapp/schema'
import type { AppV2 } from '@tableapp/schema/app-v2'
import { addNode, createCollectionCard } from '@/components/builder/v2/model'
import { builderV2FormInputs, type BuilderV2Form, type BuilderV2FormState } from './builder-v2-form-types'

const identity = vi.hoisted(() => ({ member: null as import('./session').Member | null }))
vi.mock('@/lib/session', async original => ({ ...await original<typeof import('./session')>(), currentMember: async () => identity.member }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
const env = resolve(import.meta.dirname, '../../../../.env')
if (!process.env.DATABASE_URL && existsSync(env)) process.loadEnvFile(env)

describe.skipIf(!process.env.DATABASE_URL)('v2 form author preflight', () => {
  let data: typeof import('@tableapp/db'), actions: typeof import('@/app/builder-v2-form-actions'), builder: typeof import('./builder-v2')
  let app: AppV2, form: BuilderV2Form, scope: { screenId: string; formId: string; recordId: string }
  const userId = newId('user'), workspaceId = newId('workspace'), otherWorkspace = newId('workspace'), clients = newId('table'), orders = newId('table'), foreignTable = newId('table')
  const clientName = newId('field'), title = newId('field'), amount = newId('field'), relation = newId('field'), status = newId('field'), owner = newId('field'), date = newId('field'), done = newId('field'), formula = newId('field')
  const selected = newId('row'), second = newId('row'), foreign = newId('row')
  const member = { userId, workspaceId, email: `${userId}@example.invalid`, name: 'Проверка форм', workspaceName: 'V6 synthetic', role: 'owner' as const }
  beforeAll(async () => {
    data = await import('@tableapp/db'); actions = await import('@/app/builder-v2-form-actions'); builder = await import('./builder-v2'); identity.member = member
    await data.db.insert(data.users).values({ id: userId, email: member.email })
    await data.db.insert(data.workspaces).values([{ id: workspaceId, ownerId: userId, slug: workspaceId, name: 'V6 form fixtures', plan: 'business' }, { id: otherWorkspace, ownerId: userId, slug: otherWorkspace, name: 'V6 foreign' }])
    await data.db.insert(data.workspaceMembers).values({ workspaceId, userId, role: 'owner' })
    await data.db.insert(data.tables).values([{ id: clients, workspaceId, name: 'Клиенты', position: 'a0' }, { id: orders, workspaceId, name: 'Заказы', position: 'a1' }, { id: foreignTable, workspaceId: otherWorkspace, name: 'Чужая', position: 'a0' }])
    await data.db.insert(data.fields).values([
      { id: clientName, tableId: clients, name: 'Клиент', type: 'text', position: 'a0' }, { id: title, tableId: orders, name: 'Заказ', type: 'text', position: 'a0' },
      { id: amount, tableId: orders, name: 'Сумма', type: 'number', position: 'a1' }, { id: relation, tableId: orders, name: 'Клиент', type: 'relation', options: { tableId: clients, allowMultiple: false }, position: 'a2' },
      { id: status, tableId: orders, name: 'Статус', type: 'single_select', options: { choices: [{ id: 'new', name: 'Новый', color: 'green' }, { id: 'work', name: 'В работе', color: 'gray' }], defaultChoiceId: 'new' }, position: 'a3' },
      { id: owner, tableId: orders, name: 'Почта', type: 'email', position: 'a4' }, { id: date, tableId: orders, name: 'Дата', type: 'date', options: { defaultToday: true, timeZone: 'Europe/Moscow' }, position: 'a5' },
      { id: done, tableId: orders, name: 'Подтверждение', type: 'checkbox', position: 'a6' }, { id: formula, tableId: orders, name: 'Итого', type: 'formula', options: { expression: '{Сумма} * 2' }, position: 'a7' },
    ])
    await data.db.update(data.tables).set({ primaryFieldId: clientName }).where(eq(data.tables.id, clients)); await data.db.update(data.tables).set({ primaryFieldId: title }).where(eq(data.tables.id, orders))
    await data.db.insert(data.rows).values([{ id: selected, tableId: clients, position: 'a0', data: { [clientName]: 'Анна' } }, { id: second, tableId: clients, position: 'a1', data: { [clientName]: 'Павел' } }, { id: foreign, tableId: foreignTable, position: 'a0', data: {} }])
    app = builder.newBuilderV2App({ id: newId('app'), workspaceId, name: 'Форма', slug: `form-${userId.replaceAll('_', '-')}`, email: member.email })
    const tables = (await builder.loadBuilderV2Catalog(workspaceId)).tables, list = addNode(app, app.screens[0]!.id, 'collection', tables, null, clients), card = createCollectionCard(list.app, list.id, tables)
    const added = addNode(card.app, card.screenId, 'form', tables, null, orders); app = added.app
    for (let i = 0; i < 4; i++) app = addNode(app, card.screenId, 'input', tables, added.id, '').app
    form = app.nodes.find(node => node.id === added.id) as BuilderV2Form
    const emailInput = builderV2FormInputs(app, form).find(input => input.fieldId === owner)!
    emailInput.initialValue = { kind: 'user', property: 'email' }; emailInput.readOnly = true
    scope = { formId: form.id, screenId: card.screenId, recordId: selected }
    await data.db.insert(data.apps).values({ id: app.id, workspaceId, name: app.name, slug: app.slug, draft: app, theme: app.theme, accessMode: 'allowlist' })
  })
  beforeEach(() => { identity.member = member })
  afterAll(async () => { if (!data) return; await data.db.delete(data.workspaces).where(inArray(data.workspaces.id, [workspaceId, otherWorkspace])); await data.db.delete(data.users).where(eq(data.users.id, userId)); await data.sql.end() })
  const run = (request: Record<string, unknown>, definition = app) => actions.inspectBuilderV2FormAction(app.id, definition, { ...scope, ...request })
  const initial = async (definition = app): Promise<BuilderV2FormState> => { const result = await run({ mode: 'initial' }, definition); expect(result.ok).toBe(true); if (!result.ok || !('state' in result)) throw new Error(JSON.stringify(result)); return result.state }
  const values = { [title]: 'Стол', [amount]: 0, [status]: 'new', [date]: '2026-11-02', [done]: false }

  it('prefills the exact relation, verified actor and field defaults without any data writes', async () => {
    const state = await initial()
    expect(state.values).toMatchObject({ [relation]: [selected], [owner]: member.email, [status]: 'new', [done]: false })
    expect(state.labels[relation]).toBe('Анна'); expect(state.values[date]).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    const check = await run({ mode: 'check', fingerprint: state.fingerprint, values })
    expect(check).toMatchObject({ ok: true, state: { values: { ...values, [date]: '2026-11-01T21:00:00.000Z', [relation]: [selected], [owner]: member.email } } })
    expect(await data.db.select().from(data.rows).where(eq(data.rows.tableId, orders))).toEqual([])
    expect(await data.db.select().from(data.rowChanges).where(eq(data.rowChanges.tableId, orders))).toEqual([])
    expect((await data.db.select().from(data.apps).where(eq(data.apps.id, app.id)))[0]!.draft).toEqual(app)
  })
  it('reports required, type, option and date errors at their input nodes', async () => {
    const state = await initial(), ids = Object.fromEntries(builderV2FormInputs(app, form).map(input => [input.fieldId, input.id]))
    const result = await run({ mode: 'check', fingerprint: state.fingerprint, values: { ...values, [title]: '  ', [amount]: 'много', [status]: 'unknown', [date]: 'not-a-date' } })
    expect(result).toMatchObject({ ok: false, errors: { [ids[title]!]: expect.any(String), [ids[amount]!]: expect.any(String), [ids[status]!]: expect.any(String), [ids[date]!]: expect.any(String) } })
  })
  it('rejects posted locked, computed or unknown fields, caller identity, wrong contexts and stale state', async () => {
    const state = await initial()
    for (const bad of [{ ...values, [relation]: [second] }, { ...values, [owner]: 'fake@example.ru' }, { ...values, [formula]: 900 }, { ...values, unknown: 'hidden' }]) expect(await run({ mode: 'check', fingerprint: state.fingerprint, values: bad })).toMatchObject({ ok: false })
    expect(await run({ mode: 'initial', actor: { email: 'fake@example.ru' } })).toMatchObject({ ok: false })
    expect(await run({ mode: 'initial', recordId: foreign })).toMatchObject({ ok: false })
    expect(await run({ mode: 'initial', screenId: app.screens[0]!.id })).toMatchObject({ ok: false })
    expect(await run({ mode: 'initial', recordId: undefined })).toMatchObject({ ok: false })
    const newer = structuredClone(app); (newer.nodes.find(node => node.id === form.id) as BuilderV2Form).submitLabel = 'Добавить заказ'
    expect(await run({ mode: 'check', fingerprint: state.fingerprint, values }, newer)).toMatchObject({ ok: false, stale: true })
    await data.db.update(data.rows).set({ deletedAt: new Date(), version: 2 }).where(eq(data.rows.id, second))
    expect(await run({ mode: 'initial', recordId: second })).toMatchObject({ ok: false })
  })
  it('validates editable relations against the target table and searches options only there', async () => {
    const editable = structuredClone(app), input = editable.nodes.find(node => node.type === 'input' && node.fieldId === relation)!
    if (input.type !== 'input') throw new Error('fixture'); input.readOnly = false
    const state = await initial(editable)
    for (const bad of [[foreign], [selected, foreign], [selected, selected], ['missing']]) expect(await run({ mode: 'check', fingerprint: state.fingerprint, values: { ...values, [relation]: bad } }, editable)).toMatchObject({ ok: false })
    const options = await run({ mode: 'options', fieldId: relation, search: 'Анн' }, editable)
    expect(options).toEqual({ ok: true, options: [{ id: selected, label: 'Анна' }], next: null })
    expect(await run({ mode: 'options', fieldId: relation, search: '%' }, editable)).toEqual({ ok: true, options: [], next: null })
    expect(await run({ mode: 'options', fieldId: relation, search: '' })).toMatchObject({ ok: false })
  })
  it('prefills edit forms from the selected row and detects an intervening row version change', async () => {
    const tables = (await builder.loadBuilderV2Catalog(workspaceId)).tables, listing = addNode(app, app.screens[0]!.id, 'collection', tables, null, orders), card = createCollectionCard(listing.app, listing.id, tables), added = addNode(card.app, card.screenId, 'form', tables, null, orders)
    const edit = added.app.nodes.find(node => node.id === added.id) as BuilderV2Form; edit.mode = 'edit'
    const id = newId('row')
    await data.db.insert(data.rows).values({ id, tableId: orders, position: 'a0', data: { [title]: 'Существующий заказ', [amount]: 0, [relation]: [selected] } })
    const request = { mode: 'initial', formId: edit.id, screenId: card.screenId, recordId: id }
    const state = await run(request, added.app)
    expect(state).toMatchObject({ ok: true, state: { values: { [title]: 'Существующий заказ', [amount]: 0, [relation]: [selected] } } })
    if (!state.ok || !('state' in state)) throw new Error('fixture')
    await data.db.update(data.rows).set({ version: 2, syncRevision: sql`nextval('row_sync_revision_seq')` }).where(eq(data.rows.id, id))
    expect(await run({ ...request, mode: 'check', fingerprint: state.state.fingerprint, values: { [title]: 'Моя правка', [amount]: 0, [relation]: [selected] } }, added.app)).toMatchObject({ ok: false, stale: true })
    expect((await data.db.select().from(data.rows).where(eq(data.rows.id, id)))[0]!.data).toMatchObject({ [title]: 'Существующий заказ' })
    await data.db.delete(data.rows).where(eq(data.rows.id, id))
  })
  it('permits a viewer preflight and denies restricted or unauthenticated readers', async () => {
    identity.member = { ...member, role: 'viewer' }; await initial()
    identity.member = { ...member, role: 'editor', tableAccess: { [orders]: 'view', [clients]: 'view' } }; expect(await run({ mode: 'initial' })).toMatchObject({ ok: false })
    identity.member = null; expect(await run({ mode: 'initial' })).toMatchObject({ ok: false })
  })
})
