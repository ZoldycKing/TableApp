import { rows, tables } from '@tableapp/db'
import { isComputed } from '@tableapp/schema'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { sameCellValue, CELL_CONFLICT } from './cell-conflict'
import { checkRow, createRow, lockedRow, mutationFields, RowWriteError, updateRow, writeRows, type RowActor } from './row-mutations'
import { MAX_EDITOR_CELLS, parseEditorValue, type EditorRowWrite } from './table-editor-values'

export class EditorWriteError extends RowWriteError {
  constructor(message: string, readonly rowId?: string, readonly fieldId?: string) { super('invalid', message) }
}

export function validateEditorWrites(input: unknown): EditorRowWrite[] {
  if (!Array.isArray(input) || !input.length || input.length > 500) throw new EditorWriteError('Пустой или слишком большой диапазон.')
  const seen = new Set<string>(); let cells = 0
  for (const value of input) {
    if (!value || typeof value !== 'object' || typeof value.id !== 'string' || !value.id || value.id.length > 128 || seen.has(value.id)) throw new EditorWriteError('Проверьте строки диапазона.')
    seen.add(value.id)
    if (value.create !== undefined && typeof value.create !== 'boolean') throw new EditorWriteError('Некорректная операция со строкой.')
    if (!value.data || typeof value.data !== 'object' || Array.isArray(value.data)) throw new EditorWriteError('Некорректные данные строки.')
    const ids = Object.keys(value.data)
    if ((!ids.length&&!value.create) || (cells += ids.length) > MAX_EDITOR_CELLS || ids.some(id => id.length > 128)) throw new EditorWriteError('За один раз можно сохранить до 5 000 ячеек.')
    if (!value.create && (!value.base || typeof value.base !== 'object' || Array.isArray(value.base) || ids.some(id => !Object.hasOwn(value.base, id)))) throw new EditorWriteError('Не хватает исходных значений. Обновите таблицу.')
    if (value.afterRowId !== undefined && (typeof value.afterRowId !== 'string' || value.afterRowId.length > 128)) throw new EditorWriteError('Некорректное положение строки.')
  }
  return input as EditorRowWrite[]
}

/** All validations, business cascades, history and notifications share one transaction. */
export async function commitEditorRows(workspaceId: string, tableId: string, input: unknown, actor: RowActor) {
  const writes = validateEditorWrites(input)
  await writeRows(workspaceId, async context => {
    const fields = await mutationFields(context, tableId)
    for (const write of writes) {
      const clean: Record<string, unknown> = {}
      for (const [fieldId, value] of Object.entries(write.data)) {
        const field = fields.find(column => column.id === fieldId)
        if (!field || isComputed(field.type)) throw new EditorWriteError(field ? `Поле «${field.name}» вычисляется автоматически.` : 'Поле больше не существует. Обновите таблицу.', write.id, fieldId)
        try { clean[fieldId] = parseEditorValue(field, value) }
        catch (error) { throw new EditorWriteError(error instanceof Error ? error.message : 'Проверьте значение.', write.id, fieldId) }
        if (field.type === 'relation' && Array.isArray(clean[fieldId]) && (clean[fieldId] as string[]).length) {
          const ids = clean[fieldId] as string[]
          const found = await context.tx.select({ id: rows.id }).from(rows).innerJoin(tables, eq(rows.tableId, tables.id))
            .where(and(eq(rows.tableId, field.options.tableId), eq(tables.workspaceId, workspaceId), isNull(rows.deletedAt), inArray(rows.id, ids)))
          if (new Set(found.map(row => row.id)).size !== new Set(ids).size) throw new EditorWriteError(`В поле «${field.name}» есть недоступная или удалённая запись.`, write.id, fieldId)
        }
      }
      const current = await lockedRow(context, tableId, write.id)
      if (write.create) {
        if (current) {
          checkRow(current)
          if (Object.entries(clean).some(([id,value]) => !sameCellValue((current.data as Record<string, unknown>)[id], value))) throw new EditorWriteError('Эта строка уже сохранена с другими значениями. Обновите таблицу перед повтором.', write.id)
        } else {
          await createRow(context, tableId, clean, actor, { id: write.id, afterRowId: write.afterRowId })
        }
      } else {
        checkRow(current)
        const patch: Record<string, unknown> = {}, base: Record<string, unknown> = {}
        for (const [fieldId,value] of Object.entries(clean)) {
          if (sameCellValue((current.data as Record<string, unknown>)[fieldId], value)) continue
          if (!sameCellValue((current.data as Record<string, unknown>)[fieldId], write.base![fieldId])) throw new EditorWriteError(CELL_CONFLICT, write.id, fieldId)
          patch[fieldId] = value; base[fieldId] = write.base![fieldId]
        }
        if (Object.keys(patch).length) await updateRow(context, tableId, write.id, patch, actor, { base })
      }
    }
  })
}
