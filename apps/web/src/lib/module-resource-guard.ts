import { apps, fields, orderDeliveries, tables, views } from '@tableapp/db'
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
  // Accepted handoffs keep using these identifiers even after the original app is deleted.
  const links = await tx.select({ contract: orderDeliveries.contract }).from(orderDeliveries).where(eq(orderDeliveries.workspaceId, workspaceId))
  for (const link of links) for (const config of [link.contract.order, link.contract.delivery]) {
    const ids = [config.emailFieldId, config.statusFieldId, config.profile?.nameFieldId, config.profile?.phoneFieldId, config.logistics?.addressFieldId,
      ...(config.logistics?.kind === 'delivery' ? [config.logistics.contentsFieldId] : []), ...(config.cart ? [config.cart.positionsFieldId, config.cart.nameFieldId, config.cart.quantityFieldId, config.cart.itemPriceFieldId, config.cart.itemEmailFieldId] : [])]
    if (!ids.includes(fieldId)) continue
    if (!next) return 'Поле используется в зафиксированном заказе и доставке. Сохраните его для истории и обработки доставки.'
    const original = (await tx.select().from(fields).where(eq(fields.id, fieldId)))[0]
    if (!original || original.type !== next.type) return 'Тип поля используется связанной доставкой и не может быть изменён.'
    if (fieldId === config.statusFieldId && next.type === 'single_select') {
      const required = [config.initialStatus, config.cancelStatus, ...config.terminalStatuses, ...config.cancellableStatuses,
        ...(config.logistics ? [config.logistics.shippedStatus, config.logistics.deliveredStatus, ...(config.logistics.kind === 'delivery' ? [config.logistics.returnedStatus, config.logistics.missedStatus] : [])] : [])]
      if (required.some(id => !next.options.choices.some(choice => choice.id === id))) return 'Этот статус используется связанным заказом и доставкой. Его название можно изменить, идентификатор нужно сохранить.'
    }
    if (fieldId === config.cart?.positionsFieldId && next.type === 'relation' && next.options.tableId !== config.cart.itemsTableId) return 'Состав связанного заказа должен оставаться в своей таблице позиций.'
  }
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
