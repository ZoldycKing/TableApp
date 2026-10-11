import { apps, fields, tables, views } from '@tableapp/db'
import { appSchema, normalizeFieldOptions, type App, type Field } from '@tableapp/schema'
import { eq, inArray } from 'drizzle-orm'
import type { Transaction } from './db-transaction'
import { checkAppReferences } from './app-references'
import { moduleContract } from './app-modules'

async function definitions(tx: Transaction, workspaceId: string): Promise<App[]> {
  const records = await tx.select().from(apps).where(eq(apps.workspaceId, workspaceId))
  return records.flatMap(record => [record.draft, record.published].flatMap(value => {
    const parsed = appSchema.safeParse(value)
    return parsed.success && parsed.data.modules ? [{ ...parsed.data, id: record.id, workspaceId }] : []
  }))
}

/** Caller holds the workspace write lock; paused modules still need their historical fields. */
export async function modularFieldChangeError(tx: Transaction, workspaceId: string, fieldId: string, next: Field | null): Promise<string | null> {
  const definitionsInBusiness = await definitions(tx, workspaceId)
  if (!definitionsInBusiness.length) return null
  if (!next && definitionsInBusiness.some(app => app.modules!.some(module => moduleContract(app, module)?.fields.some(field => field.fieldId === fieldId)))) return 'Поле используется рабочим модулем приложения. Сначала настройте другую совместимую привязку; история тоже использует это поле.'
  const scoped = tx.select({ id: tables.id }).from(tables).where(eq(tables.workspaceId, workspaceId))
  const [tableRows, fieldRows, viewRows] = await Promise.all([scoped, tx.select().from(fields).where(inArray(fields.tableId, scoped)), tx.select().from(views).where(inArray(views.tableId, scoped))])
  const current = { tableIds: new Set(tableRows.map(table => table.id)), fields: new Map(fieldRows.map(field => [field.id, { ...field, options: normalizeFieldOptions(field.type as Field['type'], field.options) } as unknown as Field])), views: new Map(viewRows.map(view => [view.id, view])) }
  const changed = { ...current, fields: new Map(current.fields) }
  if (next) changed.fields.set(fieldId, next); else changed.fields.delete(fieldId)
  for (const app of definitionsInBusiness) if (!checkAppReferences(app, current)) {
    const error = checkAppReferences(app, changed)
    if (error) return `Изменение нарушит работу приложения «${app.name}»: ${error}`
  }
  return null
}

export async function modularViewDeletionError(tx: Transaction, workspaceId: string, viewId: string): Promise<string | null> {
  return (await definitions(tx, workspaceId)).some(app => app.screens.some(screen => 'source' in screen ? screen.source.viewId === viewId : screen.type === 'dashboard' && screen.blocks.some(block => 'source' in block && block.source.viewId === viewId)))
    ? 'Представление используется модулем приложения. Сначала выберите другое представление для его экрана.' : null
}
