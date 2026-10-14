import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { eq, inArray, sql } from 'drizzle-orm'
import { byPosition, defaultViewConfig, evalFilter, indexFields, newId, type Field, type ScreenOf, type ViewOf } from '@tableapp/schema'
import { generateApp } from './app-builder'
import { ANONYMOUS } from './app-roles'
import { runtimeCollectionPlan } from './runtime-collection-query'
import { RUNTIME_PAGE_SIZE } from './runtime-page-types'

vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }))
vi.mock('@/lib/session', async original => ({ ...await original<typeof import('./session')>(), currentMember: async () => null }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
const envFile = resolve(import.meta.dirname, '../../../../.env')
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile)

describe.skipIf(!process.env.DATABASE_URL)('bounded public collection SQL in PostgreSQL', () => {
  let database: typeof import('@tableapp/db'), pages: typeof import('./runtime-collection-pages'), data: typeof import('./runtime-page-data'), fast: typeof import('./runtime-collection-sql')
  const owner = newId('user'), spaces: string[] = []
  beforeAll(async () => {
    database = await import('@tableapp/db'); pages = await import('./runtime-collection-pages'); data = await import('./runtime-page-data'); fast = await import('./runtime-collection-sql')
    await database.db.insert(database.users).values({ id: owner, email: `${owner}@example.invalid` })
  })
  afterAll(async () => {
    if (!database) return
    if (spaces.length) await database.db.delete(database.workspaces).where(inArray(database.workspaces.id, spaces))
    await database.db.delete(database.users).where(eq(database.users.id, owner)); await database.sql.end()
  })

  async function fixture(count = 247) {
    const workspaceId = newId('workspace'); spaces.push(workspaceId)
    const tableId = newId('table'), name = newId('field'), active = newId('field'), gate = newId('field'), override = newId('field'), hidden = newId('field')
    const table = { id: tableId, workspaceId, name: 'Products', position: 'a', primaryFieldId: name }
    const fields: Field[] = [
      { id: name, tableId, name: 'Name', type: 'text', options: {}, position: 'a', description: null },
      { id: active, tableId, name: 'Active', type: 'checkbox', options: {}, position: 'b', description: null },
      { id: gate, tableId, name: 'Gate', type: 'checkbox', options: {}, position: 'c', description: null },
      { id: override, tableId, name: 'Override', type: 'checkbox', options: {}, position: 'd', description: null },
      { id: hidden, tableId, name: 'Private note', type: 'text', options: {}, position: 'e', description: null },
    ]
    const view: ViewOf<'grid'> = { id: newId('view'), tableId, name: 'Products', type: 'grid', position: 'a', config: defaultViewConfig('grid', newId('filter')) as ViewOf<'grid'>['config'] }
    view.config.filter = { id: newId('filter'), conjunction: 'or', conditions: [
      { id: newId('filter'), fieldId: active, op: 'is', value: true },
      { id: newId('filter'), conjunction: 'and', conditions: [{ id: newId('filter'), fieldId: override, op: 'is', value: true }] },
    ] }
    const app = generateApp({ appId: newId('app'), workspaceId, name: 'Public products', slug: `fast-${workspaceId}`, table, fields, view })
    const screen = app.screens.find(screen => screen.type === 'list') as ScreenOf<'list'>
    screen.access = { ...screen.access, public: true, publicFields: [name] }; screen.source.searchFieldIds = [name, hidden]
    screen.source.extraFilter = { id: newId('filter'), conjunction: 'and', conditions: [{ id: newId('filter'), fieldId: gate, op: 'is', value: true }] }
    app.screens = [screen]; app.homeScreenId = screen.id; app.rowAccessRules = []
    const products: { id: string; tableId: string; position: string; data: Record<string, unknown> }[] = Array.from({ length: count }, (_, i) => ({ id: newId('row'), tableId, position: `a${String(Math.floor(i / 2)).padStart(5, '0')}`, data: {
      [name]: i === count - 1 ? 'Product NEEDLE%_PAGE_LAST' : `Product ${String(i).padStart(3, '0')}`,
      [active]: true, [gate]: true, [hidden]: 'PRIVATE_SEARCH_MARKER',
    } }))
    const excluded = [
      { id: newId('row'), tableId, position: 'a', data: { [name]: 'EXCLUDED_INACTIVE', [active]: false, [gate]: true } },
      { id: newId('row'), tableId, position: 'a', data: { [name]: 'EXCLUDED_GATE', [override]: true, [gate]: false } },
      { id: newId('row'), tableId, position: 'a', data: { [name]: 'EXCLUDED_DELETED', [active]: true, [gate]: true }, deletedAt: new Date() },
    ]
    await database.db.insert(database.workspaces).values({ id: workspaceId, ownerId: owner, name: 'Synthetic bounded catalogue', slug: workspaceId })
    await database.db.insert(database.tables).values(table); await database.db.insert(database.fields).values(fields); await database.db.insert(database.views).values(view)
    await database.db.insert(database.rows).values([...products, ...excluded])
    return { app, screen, view, fields, products, tableId, name, active, gate, override }
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>
  async function sqlPage(f: Fixture, query = '') {
    const meta = await data.loadRuntimePageMetadata(f.app, ANONYMOUS)
    const plan = runtimeCollectionPlan(meta.app, ANONYMOUS, f.screen, f.view, f.fields, meta.views, { query }, Date.now())
    return fast.tryRuntimeCollectionSql(meta, f.screen, f.view, plan, null)
  }

  it('reads one bounded page, preserves anchor order, and searches the complete corpus with literal wildcards', async () => {
    const f = await fixture(), expected = [...f.products].sort(byPosition).map(row => row.id), bounded = await sqlPage(f)
    expect(bounded).not.toBeNull(); expect(bounded!.source).toHaveLength(RUNTIME_PAGE_SIZE + 1)
    expect(bounded).toMatchObject({ total: 247, matched: 247 })
    const seen: string[] = []
    let cursor: string | undefined
    for (let i = 0; i < 10; i++) {
      const result = await pages.readRuntimeCollection(f.app, ANONYMOUS, f.screen.id, {}, cursor), collection = result.screens[f.screen.id]!
      expect(result.tables[f.tableId]!.rows.length).toBeLessThanOrEqual(RUNTIME_PAGE_SIZE)
      expect(collection.page).toMatchObject({ total: 247, matched: 247 })
      expect(JSON.stringify(result)).not.toContain('EXCLUDED_'); expect(JSON.stringify(result)).not.toContain('PRIVATE_SEARCH_MARKER')
      seen.push(...collection.rowIds)
      if (!collection.page!.next) break
      cursor = collection.page!.next
    }
    expect(seen).toEqual(expected)
    const sqlFound = await sqlPage(f, 'needle%_page')
    expect(sqlFound).not.toBeNull(); expect(sqlFound!.source.map(row => row.id)).toEqual([f.products.at(-1)!.id])
    const found = await pages.readRuntimeCollection(f.app, ANONYMOUS, f.screen.id, { query: 'NEEDLE%_PAGE' })
    expect(found.screens[f.screen.id]!.rowIds).toEqual([f.products.at(-1)!.id]); expect(found.screens[f.screen.id]!.page!.matched).toBe(1)
  })

  it('matches JS checkbox truthiness for legacy JSON values and nested view/source gates', async () => {
    const f = await fixture(12), values = [null, false, 0, '', [], {}, 'false', '0', 1, true, undefined, -1]
    for (let i = 0; i < values.length; i++) {
      const row = f.products[i]!, value = values[i]
      row.data = { [f.name]: `Value ${i}`, [f.gate]: true, ...(value === undefined ? {} : { [f.active]: value }) }
      await database.db.update(database.rows).set({ data: row.data }).where(eq(database.rows.id, row.id))
    }
    const expected = f.products.filter(row => evalFilter(f.view.config.filter, row.data, indexFields(f.fields)) && evalFilter(f.screen.source.extraFilter, row.data, indexFields(f.fields))).sort(byPosition).map(row => row.id)
    const result = await sqlPage(f)
    expect(result).not.toBeNull(); expect(result!.total).toBe(expected.length); expect(result!.source.map(row => row.id)).toEqual(expected)
  })

  it('falls back on malformed text and Unicode outside the proven lower-case alphabet', async () => {
    const f = await fixture(3), malformed = f.products[0]!, unicode = f.products[1]!
    await database.db.update(database.rows).set({ data: { ...malformed.data, [f.name]: ['needle', 'array'] } }).where(eq(database.rows.id, malformed.id))
    expect(await sqlPage(f, 'needle')).toBeNull()
    const found = await pages.readRuntimeCollection(f.app, ANONYMOUS, f.screen.id, { query: 'needle, array' })
    expect(found.screens[f.screen.id]!.rowIds).toEqual([malformed.id])
    await database.db.update(database.rows).set({ data: malformed.data }).where(eq(database.rows.id, malformed.id))
    await database.db.update(database.rows).set({ data: { ...unicode.data, [f.name]: 'ЁЛКА' } }).where(eq(database.rows.id, unicode.id))
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZАБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ', lower = await database.db.execute(sql`select lower(${alphabet}) as folded`)
    const russian = await sqlPage(f, 'ёлка')
    if (lower[0]!.folded === alphabet.toLowerCase()) expect(russian!.source.map(row => row.id)).toEqual([unicode.id])
    else expect(russian).toBeNull()
    expect((await pages.readRuntimeCollection(f.app, ANONYMOUS, f.screen.id, { query: 'ЁЛКА' })).screens[f.screen.id]!.rowIds).toEqual([unicode.id])
    await database.db.update(database.rows).set({ data: { ...unicode.data, [f.name]: 'Café' } }).where(eq(database.rows.id, unicode.id))
    expect(await sqlPage(f, 'café')).toBeNull()
    expect((await pages.readRuntimeCollection(f.app, ANONYMOUS, f.screen.id, { query: 'CAFÉ' })).screens[f.screen.id]!.rowIds).toEqual([unicode.id])
    // Empty search still uses the bounded SQL path regardless of text alphabet.
    expect(await sqlPage(f)).not.toBeNull()
    await database.db.update(database.rows).set({ position: 'я' }).where(eq(database.rows.id, unicode.id))
    expect(await sqlPage(f)).toBeNull()
  })

  it('falls back when a legacy JSONB checkbox number underflows to zero in JavaScript', async () => {
    const f = await fixture(3), tiny = f.products[0]!
    await database.db.update(database.rows).set({ data: sql`jsonb_set(${database.rows.data}, array[${f.active}], '1e-400'::jsonb)` }).where(eq(database.rows.id, tiny.id))
    expect(await sqlPage(f)).toBeNull()
    const result = await pages.readRuntimeCollection(f.app, ANONYMOUS, f.screen.id)
    expect(result.screens[f.screen.id]!.page!.total).toBe(2)
    expect(result.screens[f.screen.id]!.rowIds).not.toContain(tiny.id)
  })
})
