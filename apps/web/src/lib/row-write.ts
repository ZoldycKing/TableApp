import { db, fields as fieldsTable } from '@tableapp/db'
import type { App, Field } from '@tableapp/schema'
import { customerWorkflows, normalizeFieldOptions } from '@tableapp/schema'
import { asc, eq } from 'drizzle-orm'
import type { AppViewer } from './app-session'
import type { Visitor } from './app-roles'
import { assertCurrentModuleState, createRow, writeRows } from './row-mutations'
import type { Transaction } from './db-transaction'
import { rulesFor, stampOwner } from './row-access'
import { createCustomerRecord } from './customer-create'
import { updateBusinessCustomerContact } from './business-customer'

/**
 * Создание строки от имени посетителя приложения.
 *
 * Вынесено из серверного действия, потому что путей к созданию строки стало
 * два: обычная форма и заявка с витрины, подтверждённая почтой. Оба обязаны
 * одинаково проставить владельца, пересчитать формулы и оставить запись
 * в журнале изменений — если бы второй путь писал сам по себе, правило
 * «клиент видит только свои заявки» держалось бы на одном из них.
 *
 * Права здесь **не** проверяются: значения приходят уже отфильтрованными
 * по праву записи. Это сознательно — проверка прав зависит от того, откуда
 * пришёл человек, и размазывать её по двум местам опаснее, чем оставить
 * снаружи, где видно целиком.
 */

export async function loadTableFields(tableId: string): Promise<Field[]> {
  const rows = await db
    .select()
    .from(fieldsTable)
    .where(eq(fieldsTable.tableId, tableId))
    .orderBy(asc(fieldsTable.position))
  return rows.map(
    (row) =>
      ({ ...row, options: normalizeFieldOptions(row.type as Field['type'], row.options) }) as unknown as Field,
  )
}

export type RowAuthor = {
  viewer: AppViewer | null
  visitor: Visitor
  /** Адрес пишем только для заявок от не вошедших: по нему считается частота. */
  ip: string | null
}

export async function insertRow(
  app: App,
  tableId: string,
  values: Record<string, unknown>,
  author: RowAuthor,
  _fields?: Field[],
  beforeInsert?: (tx: Transaction) => Promise<void>,
): Promise<{ id: string }> {
  const rules = rulesFor(app, tableId, author.visitor)
  const owned = stampOwner(rules, author.viewer, values)
  if (app.booking?.tables.visits === tableId) owned[app.booking.visit.status] = app.booking.statuses.booked
  const customer = customerWorkflows(app).find(config => config.tableId === tableId)
  return writeRows(app.workspaceId, async context => {
    await assertCurrentModuleState(context, app)
    const result = customer && author.visitor.roleId === 'client' ? await createCustomerRecord(context, app, customer, owned, author, beforeInsert) : await createRow(context, tableId,
    owned,
    { id: author.viewer?.id ?? null, kind: 'app_user', ip: author.ip },
    { origin: 'runtime', beforeInsert })
    if (author.viewer && author.visitor.roleId === 'client') {
      const name = app.booking?.tables.visits === tableId ? app.booking.visit.client : customer?.profile?.nameFieldId
      const phone = app.booking?.tables.visits === tableId ? app.booking.visit.phone : customer?.profile?.phoneFieldId
      if (name && phone) await updateBusinessCustomerContact(context.tx, app.workspaceId, author.viewer.email, owned[name], owned[phone])
    }
    return result
  })
}
