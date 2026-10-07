import { db, fields as fieldsTable } from '@tableapp/db'
import { renameInExpression } from '@tableapp/formula'
import type { Field } from '@tableapp/schema'
import { and, eq } from 'drizzle-orm'

/**
 * Переименование поля внутри формул таблицы.
 *
 * Формула ссылается на поле именем, поэтому переименование колонки обязано
 * пройти и по выражениям: иначе человек переименовал «Остаток», а соседняя
 * колонка «Пора докупать», которая на него смотрела, молча перестала считаться.
 * Шаблоны прямо предлагают переименовывать колонки под себя — значит, это
 * должно работать, а не ломаться.
 */
export async function renameInFormulas(
  tx: Pick<typeof db, 'update'>,
  tableId: string,
  fields: readonly Field[],
  from: string,
  to: string,
): Promise<void> {
  if (from === to) return

  for (const field of fields) {
    if (field.type !== 'formula') continue
    const expression = renameInExpression(field.options.expression, from, to)
    if (expression === field.options.expression) continue

    await tx
      .update(fieldsTable)
      .set({ options: { ...field.options, expression }, updatedAt: new Date() })
      .where(and(eq(fieldsTable.id, field.id), eq(fieldsTable.tableId, tableId)))
  }
}
