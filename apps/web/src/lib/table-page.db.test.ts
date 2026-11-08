import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { defaultViewConfig, newId } from '@tableapp/schema'
import { eq } from 'drizzle-orm'
import type { Member } from './session'
import { editorPageRequestSchema } from './table-page'

const env = resolve(import.meta.dirname, '../../../../.env')
if (!process.env.DATABASE_URL && existsSync(env)) process.loadEnvFile(env)
const identity = vi.hoisted(() => ({ member: null as Member | null }))
vi.mock('./session', async original => ({ ...await original<typeof import('./session')>(), currentMember: async () => identity.member }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

describe.skipIf(!process.env.DATABASE_URL)('bounded table editor pages', () => {
  let fixture: import('../../scripts/readiness-fixture.mjs').ReadinessFixture
  let fixtures: typeof import('../../scripts/readiness-fixture.mjs')
  let queries: typeof import('./queries')
  let data: typeof import('@tableapp/db')
  const numeric = newId('field'), calculated = newId('field'), category = newId('field')
  beforeAll(async () => {
    fixtures = await import('../../scripts/readiness-fixture.mjs'); fixture = await fixtures.createReadinessFixture(230)
    data = await import('@tableapp/db'); queries = await import('./queries')
    await data.db.insert(data.fields).values([
      { id: numeric, tableId: fixture.ids.table, name: 'Количество', type: 'number', position: 'a4' },
      { id: calculated, tableId: fixture.ids.table, name: 'Удвоено', type: 'formula', options: { expression: '{Количество} * 2' }, position: 'a5' },
      { id: category, tableId: fixture.ids.table, name: 'Группа', type: 'text', position: 'a6' },
    ])
    for (let index = 0; index < fixture.recordIds.length; index++) await data.db.update(data.rows).set({ data: {
      [fixture.ids.text]: `Проверочная запись ${index + 1}`, [numeric]: index + 1, [category]: index % 2 ? 'Б' : 'А',
    }, sample: index < 3 }).where(eq(data.rows.id, fixture.recordIds[index]!))
    identity.member = { userId: fixture.ids.user, email: fixture.email, name: '', workspaceId: fixture.ids.workspace, workspaceName: 'Test', role: 'owner' }
  })
  afterAll(async () => { if (fixture) await fixtures.removeReadinessFixture(fixture); if (data) await data.sql.end() })
  const page = (input: unknown = {}) => queries.loadTable(fixture.ids.table, fixture.ids.workspace, identity.member!, editorPageRequestSchema.parse(input))
  it('does not expose a table name in metadata outside its workspace or table permissions', async () => {
    const member = identity.member!
    expect(await queries.loadTableTitle(fixture.ids.table, fixture.ids.workspace, member)).toBeTruthy()
    expect(await queries.loadTableTitle(fixture.ids.table, 'foreign-workspace', member)).toBeNull()
    expect(await queries.loadTableTitle(fixture.ids.table, fixture.ids.workspace, { ...member, role: 'editor', tableAccess: {} })).toBeNull()
  })
  it('loads only 100 rows, reports global counts and finds a directly linked row on the last page', async () => {
    const first = (await page())!, next = (await page({ offset: 100 }))!, last = (await page({ rowId: fixture.recordIds[229] }))!
    expect(first.rows).toHaveLength(100); expect(next.rows).toHaveLength(100); expect(last.rows).toHaveLength(30)
    expect(first.editorPage).toMatchObject({ total: 230, matched: 230, offset: 0, limit: 100, lastPosition: 'a0229' })
    expect(first.sampleCount).toBe(3)
    expect(next.rows[0]!.id).toBe(fixture.recordIds[100])
    expect(last.editorPage?.offset).toBe(200)
    expect(last.rows.some(row => row.id === fixture.recordIds[229])).toBe(true)
    expect((await page({ offset: 900 }))!.editorPage?.offset).toBe(200)
  })
  it('searches all rows in both modes, including calculated values outside the loaded page', async () => {
    for (const mode of ['records', 'grid']) {
      const found = (await page({ mode, search: 'запись 230' }))!
      expect(found.editorPage?.matched).toBe(1); expect(found.rows[0]!.id).toBe(fixture.recordIds[229])
      const formula = (await page({ mode, search: '460' }))!
      expect(formula.rows.some(row => row.id === fixture.recordIds[229])).toBe(true)
      expect(formula.rows.find(row => row.id === fixture.recordIds[229])!.data[calculated]).toBe(460)
    }
  })
  it('filters and sorts before slicing, without saving the previewed view config', async () => {
    const config = { ...defaultViewConfig('grid', 'test'), filter: { id: 'test', conjunction: 'and', conditions: [{ id: 'condition', fieldId: numeric, op: 'gt', value: 100 }] }, sorts: [{ fieldId: numeric, direction: 'desc' }], groupBy: [{ fieldId: category, direction: 'asc' }] }
    const first = (await page({ mode: 'grid', viewId: fixture.ids.view, config }))!, second = (await page({ mode: 'grid', viewId: fixture.ids.view, config, offset: 100 }))!
    expect(first.editorPage?.matched).toBe(130)
    expect(first.rows.map(row => row.data[numeric])).toEqual(Array.from({ length: 100 }, (_, i) => 230 - i))
    expect(second.rows.map(row => row.data[numeric])).toEqual(Array.from({ length: 30 }, (_, i) => 130 - i))
    expect((await data.db.select().from(data.views).where(eq(data.views.id, fixture.ids.view)))[0]!.config).toEqual(expect.objectContaining({ sorts: [] }))
    expect((await queries.loadTable(fixture.ids.table, fixture.ids.workspace, identity.member!))!.rows).toHaveLength(230)
    const retained = (await page({ mode: 'records', search: 'запись 1', rowId: fixture.recordIds[229] }))!
    expect(retained.rows.some(row => row.id === fixture.recordIds[229])).toBe(false)
    expect(retained.editorPinnedRow?.id).toBe(fixture.recordIds[229])
    expect(retained.editorPage?.matched).toBe(111)
  })
  it('enforces workspace and table permissions on the read action and rejects malformed requests', async () => {
    const { loadTablePageAction } = await import('@/app/table-editor-actions')
    expect((await loadTablePageAction(fixture.ids.table, { offset: -1 })).ok).toBe(false)
    expect((await loadTablePageAction(fixture.ids.table, { search: 'x'.repeat(501) })).ok).toBe(false)
    identity.member = { ...identity.member!, role: 'viewer' }
    expect((await loadTablePageAction(fixture.ids.table, {})).ok).toBe(true)
    identity.member = { ...identity.member!, role: 'editor', tableAccess: {} }
    expect((await loadTablePageAction(fixture.ids.table, {})).ok).toBe(false)
    identity.member = { ...identity.member!, role: 'owner', workspaceId: 'foreign' }
    expect((await loadTablePageAction(fixture.ids.table, {})).ok).toBe(false)
  })
})
