import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import { drizzle } from 'drizzle-orm/postgres-js'
import type { SQL } from 'drizzle-orm'
import { tables as tableSchema } from '../../../../packages/db/src/schema'

const mocks = vi.hoisted(() => ({ calls: [] as { selection: Record<string, unknown>; where?: unknown; source?: unknown; joins: unknown[] }[], results: [] as unknown[][] }))
vi.mock('@tableapp/db', async () => {
  const schema = await import('../../../../packages/db/src/schema')
  return { ...schema, db: { select: (selection: Record<string, unknown>) => {
    const call = { selection, joins: [] as unknown[], where: undefined as unknown, source: undefined as unknown }
    const result = mocks.results[mocks.calls.length] ?? []
    mocks.calls.push(call)
    const builder = { from: (source: unknown) => { call.source = source; return builder },
      innerJoin: (_table: unknown, condition: unknown) => { call.joins.push(condition); return builder },
      where: (condition: unknown) => { call.where = condition; return builder },
      orderBy: () => builder,
      then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => Promise.resolve(result).then(resolve, reject),
    }
    return builder
  } } }
})

const { assembleTableDirectory, loadTableDirectory } = await import('./table-directory-data')
const at = new Date('2026-10-19T12:00:00.000Z')
const table = (id: string, name: string) => ({ id, name, icon: 'table', rowCount: 12, fieldCount: 2, createdAt: at, updatedAt: at })
const field = (id: string, tableId: string, name: string, targetId?: string) => ({ id, tableId, name, type: targetId ? 'relation' : 'text', description: null, options: targetId ? { tableId: targetId } : {} })
const dialect = new PgDialect()
const query = (value: unknown) => dialect.sqlToQuery(value as Parameters<PgDialect['sqlToQuery']>[0])

beforeEach(() => { mocks.calls.length = 0; mocks.results.length = 0 })

describe('business table directory metadata', () => {
  it('counts live records in PostgreSQL and scopes every metadata query to the selected business', async () => {
    mocks.results.push([table('tbl_orders', 'Заказы')], [], [], [])
    const result = await loadTableDirectory('wsp_selected')
    expect(result[0]?.rowCount).toBe(12)
    expect(mocks.calls).toHaveLength(4)
    for (const call of mocks.calls) {
      const condition = query(call.where)
      expect(condition.sql).toContain('workspace_id')
      expect(condition.params).toEqual(['wsp_selected'])
      expect(Object.keys(call.selection)).not.toContain('data')
    }
    const count = query(mocks.calls[0]!.selection.rowCount)
    expect(count.sql).toContain('count(*)::int')
    expect(count.sql).toContain('"rows"."deleted_at" is null')
    expect(count.sql).toContain('"rows"."table_id" = "tables"."id"')
    const modified = query(mocks.calls[0]!.selection.updatedAt)
    expect(modified.sql).toContain('"rows"."updated_at"')
    expect(modified.sql).toContain('"rows"."deleted_at"')
    expect(modified.sql).toContain('"fields"."updated_at"')
    expect(mocks.calls[1]!.joins).toHaveLength(1)
    expect(mocks.calls[2]!.joins).toHaveLength(1)
    // Inspect the FULL single-table SELECT: Drizzle strips column qualifiers
    // from projection SQL, so inspecting the isolated SQL fragment misses this.
    const projected = drizzle.mock().select({
      rowCount: mocks.calls[0]!.selection.rowCount as SQL<number>,
      fieldCount: mocks.calls[0]!.selection.fieldCount as SQL<number>,
      updatedAt: mocks.calls[0]!.selection.updatedAt as SQL<Date>,
    }).from(tableSchema).toSQL().sql
    expect(projected).toContain('where "table_id" = "tables"."id"')
    expect(projected).not.toContain('"table_id" = "id"')
  })

  it('shows one source with several field links while excluding foreign and broken relation targets', () => {
    const result = assembleTableDirectory([table('orders', 'Заказы'), table('products', 'Товары'), table('clients', 'Клиенты')], [
      field('product', 'orders', 'Товар', 'products'), field('client', 'orders', 'Клиент', 'clients'),
      field('foreign', 'orders', 'Чужая связь', 'foreign-table'), field('foreign-source', 'foreign-table', 'Чужой источник', 'products'),
    ], [], [])
    expect(result[0]!.relations.map(link => link.fieldName)).toEqual(['Товар', 'Клиент'])
    expect(result[1]!.relations).toHaveLength(1)
    expect(result[1]!.relations[0]!.sourceName).toBe('Заказы')
    expect(JSON.stringify(result)).not.toContain('foreign-table')
  })

  it('links both draft and published dependencies including source views, but never literal content or foreign views', () => {
    const result = assembleTableDirectory([table('orders', 'Заказы'), table('products', 'Товары'), table('notes', 'Заметки')], [], [
      { id: 'orders-view', tableId: 'orders' }, { id: 'foreign-view', tableId: 'foreign-table' },
    ], [{ id: 'app_shop', name: 'Магазин', draft: { screens: [{ source: { viewId: 'orders-view' } }],
      booking: { tables: { services: 'products' } }, literal: { kind: 'literal', value: { tableId: 'notes' } },
      invalid: { source: { viewId: 'foreign-view' } },
    }, published: { customer: { tableId: 'products' } } }])
    expect(result[0]!.apps).toEqual([{ id: 'app_shop', name: 'Магазин', inDraft: true, inPublished: false }])
    expect(result[1]!.apps[0]).toMatchObject({ inDraft: true, inPublished: true })
    expect(result[2]!.apps).toEqual([])
    expect(result[0]!.updatedAt).toBe(at.toISOString())
  })
})
