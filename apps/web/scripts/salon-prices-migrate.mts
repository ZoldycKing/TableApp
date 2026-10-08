import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { and, asc, eq, isNull } from 'drizzle-orm'
import { fieldSchema, normalizeFieldOptions, type Field } from '@tableapp/schema'
import type { RowTransaction } from '../src/lib/row-mutations'
const envFile = resolve(import.meta.dirname, '../../../.env')
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile)
const { db, fields, rows, tables, sql } = await import('@tableapp/db')
const { writeRows, updateRow } = await import('../src/lib/row-mutations')
const { planSalonPriceUpgrade } = await import('../src/lib/templates/salon-price-upgrade')
const { publishTable } = await import('../src/lib/live')
try {
  const workspaceId = process.argv.find(value => value.startsWith('--workspace='))?.slice(12)
  const tableId = process.argv.find(value => value.startsWith('--table='))?.slice(8)
  const run = process.argv.includes('--run')
  if (!workspaceId || !tableId) throw new Error('Укажите --workspace=ID и --table=ID таблицы посещений')
  if (run && !process.argv.includes('--accept-current-prices')) throw new Error('Перенос фиксирует текущие видимые цены, а не исторические. Для применения укажите --accept-current-prices')
  const inspect = async (context: RowTransaction) => {
    const [table] = await context.tx.select().from(tables).where(and(eq(tables.id, tableId), eq(tables.workspaceId, workspaceId)))
    if (table?.templateId !== 'salon') throw new Error('Ожидалась таблица шаблона салона в указанном пространстве')
    const stored = await context.tx.select().from(fields).where(eq(fields.tableId, tableId)).orderBy(asc(fields.id)).for('share')
    const columns = stored.map(field => fieldSchema.parse({ ...field, options: normalizeFieldOptions(field.type as Field['type'], field.options) }))
    const price = columns.find(field => field.name === 'Цена')
    if (price?.type === 'number' && price.options.initialFrom) return { changed: false, reason: 'Цена уже сохраняется отдельно' }
    if (price?.type !== 'lookup') throw new Error('Структура цены изменена')
    const relation = columns.find(field => field.id === price.options.relationFieldId)
    if (relation?.type !== 'relation') throw new Error('Связь с услугой не найдена')
    const [target] = await context.tx.select().from(tables).where(and(eq(tables.id, relation.options.tableId), eq(tables.workspaceId, workspaceId)))
    if (target?.templateId !== 'salon') throw new Error('Таблица услуг не принадлежит этому шаблону и пространству')
    const [sourceField] = await context.tx.select().from(fields).where(and(eq(fields.id, price.options.targetFieldId), eq(fields.tableId, target.id))).for('share')
    if (sourceField?.type !== 'number') throw new Error('Числовая цена услуги не найдена: требуется ручная проверка')
    const sourcePrice = fieldSchema.parse({ ...sourceField, options: normalizeFieldOptions('number', sourceField.options) })
    const serviceRows = await context.tx.select().from(rows).where(and(eq(rows.tableId, target.id), isNull(rows.deletedAt))).orderBy(asc(rows.id)).for('share')
    const visits = await context.tx.select().from(rows).where(and(eq(rows.tableId, tableId), isNull(rows.deletedAt))).orderBy(asc(rows.id)).for('update')
    const records = (data: unknown) => {
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Некорректные данные записи: требуется ручная проверка')
      return data as Record<string, unknown>
    }
    const plan = planSalonPriceUpgrade(columns, serviceRows.map(row => ({ ...row, data: records(row.data) })), visits.map(row => ({ ...row, data: records(row.data) })), sourcePrice)!
    if (run) {
      await context.tx.update(fields).set({ type: plan.field.type, options: plan.field.options, description: plan.field.description, updatedAt: new Date() }).where(eq(fields.id, price.id))
      context.fieldCache?.delete(tableId)
      for (const visit of plan.data) await updateRow(context, tableId, visit.id, { [price.id]: visit.data[price.id] }, { id: null, kind: 'price_snapshot_migration' })
    }
    return { changed: run, mode: run ? 'apply' : 'preview', visits: plan.data.length, note: plan.note,
      nextStep: 'Проверьте прошлые цены по квитанциям. В старых формах приложения добавьте поле цены, если сотрудникам нужно менять согласованную сумму.' }
  }
  const result = run ? await writeRows(workspaceId, inspect) : await db.transaction(tx => inspect({ tx, workspaceId, changed: new Set(), fieldCache: new Map() }))
  if (run) publishTable(tableId, 'structure')
  console.log(JSON.stringify(result))
} finally { await sql.end() }
