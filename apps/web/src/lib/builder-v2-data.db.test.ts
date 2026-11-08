import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq, inArray, sql } from 'drizzle-orm'
import { newId } from '@tableapp/schema'
import { addNode, createCollectionCard, updateNodeSource } from '@/components/builder/v2/model'
import type { AppV2 } from '@tableapp/schema/app-v2'

const identity = vi.hoisted(() => ({ member: null as import('./session').Member | null }))
vi.mock('@/lib/session', async original => ({ ...await original<typeof import('./session')>(), currentMember: async () => identity.member }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
const env = resolve(import.meta.dirname, '../../../../.env')
if (!process.env.DATABASE_URL && existsSync(env)) process.loadEnvFile(env)

describe.skipIf(!process.env.DATABASE_URL)('v2 author data queries', () => {
  let data: typeof import('@tableapp/db'), query: typeof import('@/app/builder-v2-data-actions'), builder: typeof import('./builder-v2')
  let app: AppV2, collectionId: string, metricId: string
  const userId = newId('user'), workspaceId = newId('workspace'), otherId = newId('workspace'), tableId = newId('table'), targetId = newId('table'), foreignTableId = newId('table')
  const title = newId('field'), amount = newId('field'), total = newId('field'), active = newId('field'), secret = newId('field'), link = newId('field'), rollup = newId('field')
  const targetTitle = newId('field'), targetAmount = newId('field'), targetTotal = newId('field'), foreignField = newId('field'), viewId = newId('view'), relatedId = newId('row'), foreignRow = newId('row')
  const rowIds = Array.from({ length: 237 }, () => newId('row'))
  const member = { userId, workspaceId, email: `${userId}@example.invalid`, name: 'Проверка источников', workspaceName: 'V4 synthetic', role: 'owner' as const }
  beforeAll(async () => {
    data = await import('@tableapp/db'); query = await import('@/app/builder-v2-data-actions'); builder = await import('./builder-v2')
    identity.member = member
    await data.db.insert(data.users).values({ id: userId, email: member.email })
    await data.db.insert(data.workspaces).values([{ id: workspaceId, ownerId: userId, slug: workspaceId, name: 'V4 read fixtures', plan: 'business' }, { id: otherId, ownerId: userId, slug: otherId, name: 'V4 foreign fixtures' }])
    await data.db.insert(data.workspaceMembers).values({ workspaceId, userId, role: 'owner' })
    await data.db.insert(data.tables).values([{ id: tableId, workspaceId, name: 'Задачи', position: 'a0', primaryFieldId: null }, { id: targetId, workspaceId, name: 'Материалы', position: 'a1' }, { id: foreignTableId, workspaceId: otherId, name: 'Чужая таблица', position: 'a0' }])
    await data.db.insert(data.fields).values([
      { id: title, tableId, name: 'Название', type: 'text', position: 'a0' }, { id: amount, tableId, name: 'Сумма', type: 'number', position: 'a1' },
      { id: total, tableId, name: 'Итого', type: 'formula', options: { expression: '{Сумма} * 2' }, position: 'a2' }, { id: active, tableId, name: 'Активна', type: 'checkbox', position: 'a3' },
      { id: secret, tableId, name: 'Не показываем в списке', type: 'text', position: 'a4' }, { id: link, tableId, name: 'Материал', type: 'relation', options: { tableId: targetId }, position: 'a5' },
      { id: rollup, tableId, name: 'Связанный итог', type: 'rollup', options: { relationFieldId: link, targetFieldId: targetTotal, fn: 'sum' }, position: 'a6' },
      { id: targetTitle, tableId: targetId, name: 'Материал', type: 'text', position: 'a0' }, { id: targetAmount, tableId: targetId, name: 'Цена', type: 'number', position: 'a1' },
      { id: targetTotal, tableId: targetId, name: 'Цена дважды', type: 'formula', options: { expression: '{Цена} * 2' }, position: 'a2' }, { id: foreignField, tableId: foreignTableId, name: 'Чужое название', type: 'text', position: 'a0' },
    ])
    await data.db.update(data.tables).set({ primaryFieldId: title }).where(eq(data.tables.id, tableId))
    await data.db.update(data.tables).set({ primaryFieldId: targetTitle }).where(eq(data.tables.id, targetId))
    await data.db.insert(data.rows).values([{ id: relatedId, tableId: targetId, position: 'a0', data: { [targetTitle]: 'Коробки', [targetAmount]: 17 } }, { id: foreignRow, tableId: foreignTableId, position: 'a0', data: { [foreignField]: 'Нельзя возвращать' } }])
    await data.db.insert(data.rows).values(rowIds.map((id, i) => ({ id, tableId, position: `a${String(i).padStart(4, '0')}`, data: { [title]: `Задача ${String(i).padStart(3, '0')}`, [amount]: i, [active]: i % 2 === 0, [secret]: 'Только сервер', [link]: [relatedId, foreignRow] } })))
    await data.db.insert(data.views).values({ id: viewId, tableId, name: 'Активные', type: 'grid', position: 'a0', config: { filter: { id: 'active_filter', conjunction: 'and', conditions: [{ id: 'active_condition', fieldId: active, op: 'is', value: true }] } } })
    app = builder.newBuilderV2App({ id: newId('app'), workspaceId, name: 'Источники', slug: `read-${userId.replaceAll('_', '-')}`, email: member.email })
    const metadata = await builder.loadBuilderV2Catalog(workspaceId)
    const list = addNode(app, app.screens[0]!.id, 'collection', metadata.tables, null, tableId)
    collectionId = list.id; app = list.app
    const metric = addNode(app, app.screens[0]!.id, 'metric', metadata.tables, null, tableId)
    metricId = metric.id; app = metric.app
    await data.db.insert(data.apps).values({ id: app.id, workspaceId, name: app.name, slug: app.slug, draft: app, theme: app.theme, accessMode: 'allowlist' })
  })
  beforeEach(() => { identity.member = member })
  afterAll(async () => { if (!data) return; await data.db.delete(data.workspaces).where(inArray(data.workspaces.id, [workspaceId, otherId])); await data.db.delete(data.users).where(eq(data.users.id, userId)); await data.sql.end() })
  const read = (definition = app, request: unknown = { nodeId: collectionId }) => query.readBuilderV2DataAction(app.id, definition, request)


  it('loads an exact card and filters nested tasks by the independently loaded folder', async () => {
    const metadata = await builder.loadBuilderV2Catalog(workspaceId)
    const folders = addNode(app, app.screens[0]!.id, 'collection', metadata.tables, null, targetId)
    const card = createCollectionCard(folders.app, folders.id, metadata.tables)
    const nested = addNode(card.app, card.screenId, 'collection', metadata.tables, null, tableId)
    const configured = updateNodeSource(nested.app, nested.id, { pageSize: 2 })
    const nestedSource = configured.sources.find(source => source.id === (configured.nodes.find(node => node.id === nested.id) as { sourceId: string }).sourceId)!
    expect(nestedSource).toMatchObject({ screenTableId: targetId, filter: { op: 'includes', left: { fieldId: link }, right: { kind: 'screen_row_id' } } })
    const scope = { screenId: card.screenId, recordId: relatedId }
    const record = await query.readBuilderV2RecordAction(app.id, configured, scope)
    expect(record).toMatchObject({ ok: true, title: 'Коробки', record: { values: { [targetTitle]: 'Коробки', [targetTotal]: 34 } } })
    if (record.ok) expect(record.record.values).not.toHaveProperty(secret)
    const first = await read(configured, { nodeId: nested.id, ...scope })
    expect(first.ok).toBe(true); if (!first.ok) return
    expect(first.page.total).toBe(237); expect(first.page.rows).toHaveLength(2)
    const search = await read(configured, { nodeId: nested.id, ...scope, search: 'ЗАДАЧА 23' })
    expect(search.ok && search.page.total).toBe(7)
    await data.db.update(data.rows).set({ data: { [targetTitle]: 'Коробки обновлены', [targetAmount]: 17 }, syncRevision: sql`nextval('row_sync_revision_seq')` }).where(eq(data.rows.id, relatedId))
    expect(await read(configured, { nodeId: nested.id, ...scope, cursor: first.page.next })).toMatchObject({ ok: false, stale: true })
    await data.db.update(data.rows).set({ data: { [targetTitle]: 'Коробки', [targetAmount]: 17 }, syncRevision: sql`nextval('row_sync_revision_seq')` }).where(eq(data.rows.id, relatedId))
    const secondFolder = newId('row')
    await data.db.insert(data.rows).values({ id: secondFolder, tableId: targetId, position: 'a1', data: { [targetTitle]: 'Работа', [targetAmount]: 18 } })
    const other = await read(configured, { nodeId: nested.id, screenId: card.screenId, recordId: secondFolder })
    expect(other.ok && other.page.rows).toEqual([])
    const stolen = await read(configured, { nodeId: nested.id, screenId: card.screenId, recordId: secondFolder, cursor: first.page.next })
    expect(stolen).toMatchObject({ ok: false, stale: true })
    const derivedFilter = updateNodeSource(configured, nested.id, { filter: { op: 'and', conditions: [nestedSource.filter!, { op: 'eq', left: { kind: 'row', fieldId: amount }, right: { kind: 'screen_row', fieldId: targetTotal } }] } })
    const derived = await read(derivedFilter, { nodeId: nested.id, ...scope })
    expect(derived.ok && derived.page.rows.map(row => row.values[title])).toEqual(['Задача 034'])
    for (const invalid of [{ screenId: card.screenId, recordId: foreignRow }, { screenId: card.screenId, recordId: rowIds[0]! }, { screenId: app.screens[0]!.id, recordId: relatedId }, { ...scope, values: { [targetTitle]: 'Подмена' } }, { ...scope, tableId: foreignTableId }, { ...scope, actor: { roleIds: ['owner'] } }]) expect((await query.readBuilderV2RecordAction(app.id, configured, invalid)).ok).toBe(false)
    expect((await read(configured, { nodeId: nested.id })).ok).toBe(false)
    expect((await read(configured, { nodeId: nested.id, screenId: app.screens[0]!.id, recordId: relatedId })).ok).toBe(false)
    await data.db.update(data.rows).set({ deletedAt: new Date() }).where(eq(data.rows.id, secondFolder))
    expect((await query.readBuilderV2RecordAction(app.id, configured, { screenId: card.screenId, recordId: secondFolder })).ok).toBe(false)
    expect((await read(configured, { nodeId: nested.id, screenId: card.screenId, recordId: secondFolder })).ok).toBe(false)
    identity.member = { ...member, role: 'viewer' }
    expect((await query.readBuilderV2RecordAction(app.id, configured, scope)).ok).toBe(true)
    identity.member = { ...member, role: 'editor', tableAccess: { [targetId]: 'view' } }
    expect((await query.readBuilderV2RecordAction(app.id, configured, scope)).ok).toBe(false)
    expect((await data.db.select().from(data.apps).where(eq(data.apps.id, app.id)))[0]!.draft).toEqual(app)
  })
  it('returns a bounded stable page and a disjoint continuation without unrelated fields or writes', async () => {
    const first = await read()
    expect(first).toMatchObject({ok:true}); if (!first.ok) return
    expect(first.page.total).toBe(237); expect(first.page.rows).toHaveLength(30)
    expect(first.page.rows[0]!.values).toEqual({ [title]: 'Задача 000' })
    const next = await read(app, { nodeId: collectionId, cursor: first.page.next })
    expect(next.ok).toBe(true); if (!next.ok) return
    expect(next.page.rows[0]!.values[title]).toBe('Задача 030')
    expect(next.page.rows.every(row => !first.page.rows.some(previous => previous.id === row.id))).toBe(true)
    expect((await data.db.select().from(data.rows).where(eq(data.rows.id, rowIds[0]!)))[0]!.data).toMatchObject({ [secret]: 'Только сервер', [link]: [relatedId, foreignRow] })
    expect((await data.db.select().from(data.apps).where(eq(data.apps.id, app.id)))[0]!.draft).toEqual(app)
  })
  it('applies global search and sort before paging, including Russian case folding', async () => {
    const configured = updateNodeSource(app, collectionId, { pageSize: 3, sorts: [{ fieldId: amount, direction: 'desc' }] })
    const result = await read(configured, { nodeId: collectionId, search: 'ЗАДАЧА 23' })
    expect(result.ok).toBe(true); if (!result.ok) return
    expect(result.page.total).toBe(7)
    expect(result.page.rows.map(row => row.values[title])).toEqual(['Задача 236', 'Задача 235', 'Задача 234'])
    const next = await read(configured, { nodeId: collectionId, search: 'ЗАДАЧА 23', cursor: result.page.next })
    expect(next.ok && next.page.rows.map(row => row.values[title])).toEqual(['Задача 233', 'Задача 232', 'Задача 231'])
  })
  it('groups matches across SQL batches, keeping the configured sort inside each group', async () => {
    const grouped = { ...app, nodes: app.nodes.map(node => node.id === collectionId && node.type === 'collection' ? { ...node, listGroupFieldId: active } : node) }
    const configured = updateNodeSource(grouped, collectionId, { pageSize: 3, sorts: [{ fieldId: amount, direction: 'desc' }] })
    const request = { nodeId: collectionId, search: 'Задача 23' }
    const first = await read(configured, request)
    if (!first.ok || !first.page.next) throw new Error('Missing grouped continuation')
    expect(first.page.total).toBe(7)
    expect(first.page.rows.map(row => [row.values[title], row.group?.label])).toEqual([['Задача 236', 'Да'], ['Задача 234', 'Да'], ['Задача 232', 'Да']])
    const next = await read(configured, { ...request, cursor: first.page.next })
    expect(next.ok && next.page.rows.map(row => [row.values[title], row.group?.label])).toEqual([['Задача 230', 'Да'], ['Задача 235', 'Нет'], ['Задача 233', 'Нет']])
    expect(await read(app, { ...request, cursor: first.page.next })).toMatchObject({ ok: false, stale: true })
  })
  it('combines view and component filters and calculates the metric over every match, not one page', async () => {
    let configured = updateNodeSource(app, metricId, { pageSize: 1, viewId, filter: { op: 'gte', left: { kind: 'row', fieldId: amount }, right: { kind: 'literal', value: 230 } } })
    configured = { ...configured, nodes: configured.nodes.map(node => node.id === metricId && node.type === 'metric' ? { ...node, operation: 'sum', fieldId: total } : node) }
    const result = await read(configured, { nodeId: metricId })
    expect(result).toMatchObject({ ok: true })
    expect(result.ok && result.page).toMatchObject({ total: 4, value: 1864, rows: [], next: null })
    const all = await read({ ...app, nodes: app.nodes.map(node => node.id === metricId && node.type === 'metric' ? { ...node, operation: 'count' } : node) }, { nodeId: metricId })
    expect(all.ok && all.page.value).toBe(237)
    expect(configured.policy).toEqual(app.policy)
  })
  it('computes relations and target formulas server-side and never follows an out-of-scope relation ID', async () => {
    const configured = { ...app, nodes: app.nodes.map(node => node.id === collectionId && node.type === 'collection' ? { ...node, subtitleFieldId: rollup } : node) }
    const result = await read(configured)
    expect(result.ok && result.page.rows[0]!.values[rollup]).toBe(34)
    const related = await read({ ...configured, nodes: configured.nodes.map(node => node.id === collectionId && node.type === 'collection' ? { ...node, subtitleFieldId: link } : node) })
    expect(related.ok && related.page.rows[0]!.values[link]).toEqual([relatedId])
    expect(related.ok && related.page.rows[0]!.display[link]).toBe('Коробки')
    expect(JSON.stringify(related)).not.toContain('Нельзя возвращать')
  })
  it('rejects tampered, cross-query and stale cursors, while unrelated application naming leaves the page usable', async () => {
    const first = await read(); if (!first.ok || !first.page.next) throw new Error('fixture')
    expect(await read(app, { nodeId: collectionId, search: 'другое', cursor: first.page.next })).toMatchObject({ ok: false, stale: true })
    expect(await read(app, { nodeId: collectionId, cursor: `${first.page.next}x` })).toMatchObject({ ok: false, stale: true })
    expect(await read({ ...app, name: 'Другое название' }, { nodeId: collectionId, cursor: first.page.next })).toMatchObject({ ok: true })
    await data.db.update(data.rows).set({ data: { [title]: 'Правка', [amount]: 1000 }, syncRevision: sql`nextval('row_sync_revision_seq')` }).where(eq(data.rows.id, rowIds[0]!))
    expect(await read(app, { nodeId: collectionId, cursor: first.page.next })).toMatchObject({ ok: false, stale: true })
    await data.db.update(data.rows).set({ data: { [title]: 'Задача 000', [amount]: 0, [active]: true, [secret]: 'Только сервер', [link]: [relatedId, foreignRow] }, syncRevision: sql`nextval('row_sync_revision_seq')` }).where(eq(data.rows.id, rowIds[0]!))
  })
  it('rejects foreign tables and identity spoofing, and accepts no role claims in request arguments', async () => {
    const foreign = { ...app, sources: app.sources.map(source => source.id === (app.nodes.find(node => node.id === collectionId) as { sourceId: string }).sourceId ? { ...source, tableId: foreignTableId } : source) }
    expect(await read(foreign)).toMatchObject({ ok: false })
    expect(await read({ ...app, workspaceId: otherId })).toMatchObject({ ok: false })
    expect(await read(app, { nodeId: collectionId, actor: { role: 'owner' } })).toMatchObject({ ok: false })
    identity.member = { ...member, role: 'editor', tableAccess: { [tableId]: 'edit' } }
    expect(await read()).toMatchObject({ ok: false })
    identity.member = { ...member, role: 'viewer' }; expect(await read()).toMatchObject({ ok: true })
    identity.member = null; expect(await read()).toMatchObject({ ok: false })
  })
  it('does not evaluate unrelated cyclic formulas when displaying plain fields or counting rows', async () => {
    const cyclic = newId('field'), relatedCycle = newId('field')
    await data.db.insert(data.fields).values([{ id: cyclic, tableId, name: 'Неиспользуемый цикл', type: 'formula', position: 'z0', options: { expression: '{Неиспользуемый цикл}' } }, { id: relatedCycle, tableId: targetId, name: 'Другой цикл', type: 'formula', position: 'z0', options: { expression: '{Другой цикл}' } }])
    try {
      expect(await read()).toMatchObject({ ok: true })
      expect(await read(updateNodeSource(app, metricId, { sorts: [{ fieldId: cyclic, direction: 'desc' }] }), { nodeId: metricId })).toMatchObject({ ok: true, page: { value: 237 } })
      const related = await read({ ...app, nodes: app.nodes.map(node => node.id === collectionId && node.type === 'collection' ? { ...node, subtitleFieldId: rollup } : node) })
      expect(related.ok && related.page.rows[0]!.values[rollup]).toBe(34)
      const broken = await read({ ...app, nodes: app.nodes.map(node => node.id === collectionId && node.type === 'collection' ? { ...node, subtitleFieldId: cyclic } : node) })
      expect(broken).toMatchObject({ ok: false, error: expect.stringContaining('Проверьте формулу') })
    } finally { await data.db.delete(data.fields).where(inArray(data.fields.id, [cyclic, relatedCycle])) }
  })
})
