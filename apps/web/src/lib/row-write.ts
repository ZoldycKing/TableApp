import { db, fields as fieldsTable, rowChanges, rows as rowsTable } from '@tableapp/db'
import { compileTableFormulas, computeDerivedRow, stripDerived } from '@tableapp/formula'
import type { App, Field } from '@tableapp/schema'
import { newId, normalizeFieldOptions, positionBetween } from '@tableapp/schema'
import { and, asc, eq, isNull } from 'drizzle-orm'
import { linkRowAttachments } from './attachments'
import type { AppViewer } from './app-session'
import type { Visitor } from './app-roles'
import { assertCanAddRowTo } from './limits'
import { rulesFor, stampOwner } from './row-access'
import { publishTable } from './live'

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
  fields?: Field[],
): Promise<{ id: string }> {
  /*
   * Сюда приходит запись из опубликованного приложения: заказ клиента или
   * подтверждённая заявка с витрины. Ей доступен аварийный резерв — владельцу
   * его не потратить ни руками, ни импортом. Отказ приходит исключением:
   * забытая проверка возвращённого значения — это тихо пропущенный потолок.
   */
  await assertCanAddRowTo(tableId, 'runtime')

  const columns = fields ?? (await loadTableFields(tableId))
  const rules = rulesFor(app, tableId, author.visitor)

  const existing = await db
    .select({ position: rowsTable.position })
    .from(rowsTable)
    .where(and(eq(rowsTable.tableId, tableId), isNull(rowsTable.deletedAt)))
    .orderBy(asc(rowsTable.position))

  const own = stampOwner(rules, author.viewer, values)
  const data = computeDerivedRow(own, columns, new Map(), compileTableFormulas(columns))
  const id = newId('row')

  await db.transaction(async (tx) => {
    await tx.insert(rowsTable).values({
      id,
      tableId,
      data: stripDerived(data, columns),
      position: positionBetween(existing[existing.length - 1]?.position ?? null, null),
    })
    await tx.insert(rowChanges).values({
      id: newId('change'),
      tableId,
      rowId: id,
      op: 'create',
      after: data,
      actorId: author.viewer?.id ?? null,
      actorKind: 'app_user',
      actorIp: author.ip,
    })
  })

  await linkRowAttachments(tableId, id, columns, data)
  // Заказ клиента — такое же изменение таблицы, как правка владельца: вкладка
  // с открытой таблицей должна увидеть новую строку, а не узнать о ней завтра.
  publishTable(tableId, 'rows')
  return { id }
}
