import { rows } from '@tableapp/db'
import { fieldsOfFilter, isGroup, type Field, type FilterGroup, type ScreenOf, type View } from '@tableapp/schema'
import { and, asc, eq, gt, isNull, or, sql, type SQL } from 'drizzle-orm'
import { canOpenScreen } from './app-roles'
import type { runtimeCollectionPlan } from './runtime-collection-query'
import type { RuntimePageMetadata } from './runtime-page-data'
import { RUNTIME_PAGE_SIZE } from './runtime-page-types'
import type { RuntimeSourceRow } from './runtime-project'

type Plan = ReturnType<typeof runtimeCollectionPlan>
type Collection = ScreenOf<'list'> | ScreenOf<'tiles'>
const TEXT_TYPES = new Set(['text', 'long_text', 'email', 'phone', 'url'])
const ASCII_ONLY = '^[\\x01-\\x7f]*$'
const ASCII_RUSSIAN = '^[\\x01-\\x7fА-Яа-яЁё]*$'

/** SQL implements exactly the existing checkbox evaluator's JSON truthiness. */
export function runtimeCheckboxFilter(node: FilterGroup | null | undefined, fields: ReadonlyMap<string, Field>): SQL | null {
  if (!node || !node.conditions.length) return sql`true`
  const parts: SQL[] = []
  for (const condition of node.conditions) {
    if (isGroup(condition)) {
      const group = runtimeCheckboxFilter(condition, fields)
      if (group === null) return null
      parts.push(group); continue
    }
    const field = fields.get(condition.fieldId)
    // The reference evaluator ignores a condition whose field no longer exists.
    if (!field) { parts.push(sql`true`); continue }
    if (field.type !== 'checkbox' || condition.op !== 'is') return null
    // A null operand is ignored before checkbox evaluation by evalFilter.
    if (condition.value === null) { parts.push(sql`true`); continue }
    const truthy = sql`coalesce(${rows.data}->${condition.fieldId}, 'null'::jsonb) not in ('null'::jsonb, 'false'::jsonb, '0'::jsonb, '""'::jsonb)`
    parts.push(Boolean(condition.value) ? truthy : sql`not (${truthy})`)
  }
  return (node.conjunction === 'and' ? and(...parts) : or(...parts)) ?? sql`true`
}

/** Narrow, exact optimization. Other configured semantics retain the universal reader. */
export async function tryRuntimeCollectionSql(meta: RuntimePageMetadata, screen: Collection, view: View, plan: Plan,
  anchor: RuntimeSourceRow | null): Promise<{ source: RuntimeSourceRow[]; total: number; matched: number } | null> {
  if (!screen.access.public || !canOpenScreen(screen, plan.reading) || plan.rules.length || plan.query.bookingSection || plan.query.customerSection ||
    plan.query.choiceId !== null || plan.choices.length || view.config.sorts.length) return null
  const fields = new Map((meta.fieldsByTable.get(view.tableId) ?? []).map(field => [field.id, field]))
  const native = runtimeCheckboxFilter(view.config.filter, fields), extra = runtimeCheckboxFilter(screen.source.extraFilter, fields)
  if (native === null || extra === null) return null
  const scope = and(eq(rows.tableId, view.tableId), isNull(rows.deletedAt))!, base = and(scope, native, extra)!
  // JSONB can retain tiny nonzero numbers that JSON.parse rounds to zero.
  // Test the whole scope before filters, since this can change either boolean branch.
  const checkboxIds = [...new Set([...fieldsOfFilter(view.config.filter), ...fieldsOfFilter(screen.source.extraFilter)])].filter(id => fields.get(id)?.type === 'checkbox')
  if (checkboxIds.length) {
    const [tiny] = await meta.runner.select({ id: rows.id }).from(rows).where(and(scope, or(...checkboxIds.map(id =>
      sql`case when jsonb_typeof(${rows.data}->${id}) = 'number' then abs((${rows.data}->>${id})::numeric) > 0 and abs((${rows.data}->>${id})::numeric) < 1e-300 else false end`)))).limit(1)
    if (tiny) return null
  }
  // Generated positions and IDs are ASCII. Refuse a malformed legacy corpus
  // where UTF-16 comparison and PostgreSQL C byte ordering could differ.
  const [unusualKey] = await meta.runner.select({ id: rows.id }).from(rows).where(and(base,
    or(sql`not ((${rows.position} collate "C") ~ ${ASCII_ONLY})`, sql`not ((${rows.id} collate "C") ~ ${ASCII_ONLY})`))).limit(1)
  if (unusualKey) return null
  let search: SQL = sql`true`
  if (plan.query.query) {
    const searchable = screen.source.searchFieldIds.flatMap(id => fields.has(id) && plan.policy.fields.has(id) ? [fields.get(id)!] : [])
    if (searchable.some(field => !TEXT_TYPES.has(field.type))) return null
    if (!searchable.length) search = sql`false`
    else {
      const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZАБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ'
      const folded = await meta.runner.execute(sql`select lower(${alphabet}) as folded`)
      const lower = (folded as unknown as { folded: string }[])[0]?.folded ?? ''
      if (lower.slice(0, 26) !== alphabet.slice(0, 26).toLowerCase()) return null
      const russian = lower === alphabet.toLowerCase()
      if (!(russian ? /^[\x00-\x7fА-Яа-яЁё]*$/ : /^[\x00-\x7f]*$/).test(plan.query.query)) return null
      const pattern = russian ? ASCII_RUSSIAN : ASCII_ONLY
      const invalidValues = searchable.map(field => sql`(jsonb_typeof(${rows.data}->${field.id}) not in ('string','null') or
        (jsonb_typeof(${rows.data}->${field.id}) = 'string' and not (((${rows.data}->>${field.id}) collate "C") ~ ${pattern})))`)
      const [malformed] = await meta.runner.select({ id: rows.id }).from(rows).where(and(base, or(...invalidValues))).limit(1)
      if (malformed) return null
      search = or(...searchable.map(field => sql`strpos(lower(coalesce(${rows.data}->>${field.id},'')), ${plan.query.query}) > 0`))!
    }
  }
  const [counts] = await meta.runner.select({ total: sql<number>`count(*)`, matched: sql<number>`count(*) filter (where ${search})` }).from(rows).where(base)
  const position = sql`${rows.position} collate "C"`, id = sql`${rows.id} collate "C"`
  const after = anchor ? or(gt(position, sql`${anchor.position} collate "C"`), and(eq(position, sql`${anchor.position} collate "C"`), gt(id, sql`${anchor.id} collate "C"`))) : undefined
  const source = await meta.runner.select().from(rows).where(and(base, search, after)).orderBy(asc(position), asc(id)).limit(RUNTIME_PAGE_SIZE + 1)
  return { source: source as RuntimeSourceRow[], total: Number(counts?.total ?? 0), matched: Number(counts?.matched ?? 0) }
}
