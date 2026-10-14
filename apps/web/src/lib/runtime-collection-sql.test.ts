import { describe, expect, it, vi } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { Field, FilterGroup } from '@tableapp/schema'

// SQL compilation only needs the table definition, never a live database client.
vi.mock('@tableapp/db', async () => ({ rows: (await import('../../../../packages/db/src/schema')).rows }))
import { runtimeCheckboxFilter } from './runtime-collection-sql'

const checkbox: Field = { id: 'field_gate', tableId: 'table_items', type: 'checkbox', name: 'Gate', options: {}, position: 'a', description: null }
const text: Field = { id: 'field_text', tableId: 'table_items', type: 'text', name: 'Text', options: {}, position: 'b', description: null }
const fields = new Map<string, Field>([[checkbox.id, checkbox], [text.id, text]])
const condition = (value: unknown, fieldId = checkbox.id): FilterGroup => ({ id: 'filter', conjunction: 'and',
  conditions: [{ id: 'condition', fieldId, op: 'is', value }] })
const dialect = new PgDialect()

describe('exact checkbox SQL predicate subset', () => {
  it('represents only JS falsey JSON values as false, retaining empty arrays and objects as true', () => {
    const predicate = runtimeCheckboxFilter(condition(true), fields)!
    const query = dialect.sqlToQuery(predicate)
    expect(query.sql).toContain("not in ('null'::jsonb, 'false'::jsonb, '0'::jsonb, '\"\"'::jsonb)")
    expect(query.sql).not.toContain("'[]'::jsonb")
    expect(query.sql).not.toContain("'{}'::jsonb")
    expect(query.params).toEqual([checkbox.id])
    const falsePredicate = dialect.sqlToQuery(runtimeCheckboxFilter(condition(false), fields)!)
    expect(falsePredicate.sql).toContain('not (coalesce(')
  })

  it('preserves ignored null operands and missing fields, including inside OR groups', () => {
    expect(dialect.sqlToQuery(runtimeCheckboxFilter(condition(null), fields)!).sql).toBe('true')
    expect(dialect.sqlToQuery(runtimeCheckboxFilter(condition('anything', 'field_missing'), fields)!).sql).toBe('true')
    const nested: FilterGroup = { id: 'outer', conjunction: 'or', conditions: [condition(false), condition('x', 'field_missing')] }
    expect(dialect.sqlToQuery(runtimeCheckboxFilter(nested, fields)!).sql).toContain(' or true')
    expect(dialect.sqlToQuery(runtimeCheckboxFilter({ id: 'empty', conjunction: 'or', conditions: [] }, fields)!).sql).toBe('true')
  })

  it('falls back for non-checkbox conditions and any unsupported operator at any nesting depth', () => {
    expect(runtimeCheckboxFilter(condition('visible text', text.id), fields)).toBeNull()
    const unsupported = condition(true)
    if ('conjunction' in unsupported.conditions[0]!) throw new Error('Expected condition')
    unsupported.conditions[0]!.op = 'is_not'
    expect(runtimeCheckboxFilter({ id: 'outer', conjunction: 'and', conditions: [condition(true), unsupported] }, fields)).toBeNull()
  })
})
