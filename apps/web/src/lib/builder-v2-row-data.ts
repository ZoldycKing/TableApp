import { fields, tables } from '@tableapp/db'
import { compileTableFormulas, computeDerivedRow, relatedIndexFrom } from '@tableapp/formula'
import { normalizeFieldOptions, systemRowData, type Field } from '@tableapp/schema'
import type { AppV2Json } from '@tableapp/schema/app-v2'
import { asc, eq, inArray } from 'drizzle-orm'
import type { Transaction } from './db-transaction'
import type { BuilderV2DataRecord } from './builder-v2-data-types'
import type { builderV2CalculationPlan } from './builder-v2-read-plan'
import { formatCell } from './format'
import { loadPageRowData } from './runtime-page-data'
import type { RuntimeSourceRow } from './runtime-project'
import { RowWriteError } from './row-mutations'

export type BuilderV2ReadMetadata = { runner: Transaction; owned: { id: string; primaryFieldId: string | null }[]; allFields: Field[]; tableIds: Set<string>; fieldsByTable: Map<string, Field[]>; primaryByTable: Map<string, string | null> }
export async function loadBuilderV2ReadMetadata(runner: Transaction, workspaceId: string, roots: readonly string[]): Promise<BuilderV2ReadMetadata> {
  const owned = await runner.select({ id: tables.id, primaryFieldId: tables.primaryFieldId }).from(tables).where(eq(tables.workspaceId, workspaceId)).orderBy(asc(tables.id))
  if (roots.some(id => !owned.some(table => table.id === id))) throw new RowWriteError('denied', 'Источник данных недоступен')
  const records = owned.length ? await runner.select().from(fields).where(inArray(fields.tableId, owned.map(table => table.id))).orderBy(asc(fields.position), asc(fields.id)) : []
  const allFields = records.map(field => ({ ...field, options: normalizeFieldOptions(field.type as Field['type'], field.options) }) as unknown as Field)
  const tableIds = new Set(roots)
  for (const tableId of tableIds) for (const field of allFields) if (field.tableId === tableId && field.type === 'relation' && owned.some(table => table.id === field.options.tableId)) tableIds.add(field.options.tableId)
  const fieldsByTable = new Map([...tableIds].map(id => [id, allFields.filter(field => field.tableId === id)]))
  const primaryByTable = new Map(owned.filter(table => tableIds.has(table.id)).map(table => [table.id, table.primaryFieldId]))
  return { runner, owned, allFields, tableIds, fieldsByTable, primaryByTable }
}
type Plan = ReturnType<typeof builderV2CalculationPlan>
export const builderV2Json = (value: unknown): AppV2Json => JSON.parse(JSON.stringify(value ?? null)) as AppV2Json

export async function deriveBuilderV2Rows(meta: BuilderV2ReadMetadata, roots: RuntimeSourceRow[], plan: Plan, asOf: number) {
  if (plan.invalidFormulas.length) throw new RowWriteError('invalid', `Проверьте формулу «${plan.invalidFormulas[0]}»: в ней ошибка или циклическая зависимость.`)
  const loaded = await loadPageRowData({ ...meta, neededFields: plan.neededFields }, roots), buckets = new Map<string, Map<string, Record<string, unknown>>>()
  for (const row of loaded) { const bucket = buckets.get(row.tableId) ?? new Map(); bucket.set(row.id, systemRowData(row, meta.fieldsByTable.get(row.tableId) ?? [])); buckets.set(row.tableId, bucket) }
  const options = { now: new Date(asOf) }, related = relatedIndexFrom(buckets, plan.calculationFields, options)
  const formulas = new Map([...plan.calculationFields].map(([id, fields]) => [id, compileTableFormulas(fields)]))
  return roots.map(root => {
    const columns = meta.fieldsByTable.get(root.tableId) ?? [], computeFields = plan.calculationFields.get(root.tableId) ?? []
    const data = computeDerivedRow(systemRowData(root, columns), computeFields, related, formulas.get(root.tableId) ?? new Map(), options)
    const display = Object.fromEntries(columns.map(field => {
      if (field.type !== 'relation') return [field.id, formatCell(field, data[field.id])]
      const targetId = field.options.tableId, targets = meta.fieldsByTable.get(targetId) ?? []
      const primary = targets.find(field => field.id === meta.primaryByTable.get(targetId)) ?? targets[0]
      const ids = Array.isArray(data[field.id]) ? data[field.id] as string[] : []
      const available = ids.filter(id => related.get(targetId)?.has(id))
      data[field.id] = available
      return [field.id, available.map(id => primary ? formatCell(primary, related.get(targetId)?.get(id)?.[primary.id]) : 'Без названия').join(', ')]
    }))
    return { ...root, data, display }
  })
}
export type BuilderV2DerivedRow = Awaited<ReturnType<typeof deriveBuilderV2Rows>>[number]
export function projectBuilderV2Record(meta: BuilderV2ReadMetadata, row: BuilderV2DerivedRow, displayed: ReadonlySet<string>): BuilderV2DataRecord {
  return { id: row.id, tableId: row.tableId, values: Object.fromEntries((meta.fieldsByTable.get(row.tableId) ?? []).filter(field => displayed.has(field.id)).map(field => [field.id, builderV2Json(row.data[field.id])])), display: Object.fromEntries(Object.entries(row.display).filter(([id]) => displayed.has(id))) }
}
