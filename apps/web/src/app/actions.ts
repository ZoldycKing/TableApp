'use server'

import {
  db,
  fields as fieldsTable,
  tables,
  views as viewsTable,
} from '@tableapp/db'
import type { Field } from '@tableapp/schema'
import { defaultViewConfig, isComputed, newId, parseCellValue, positionBetween, positionSequence } from '@tableapp/schema'
import { and, asc, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { publishTable } from '@/lib/live'
import { assertCanIncreaseUsage, isPlanLimitError } from '@/lib/limits'
import { authorizeTable,authorizeTableStructure, authorizeWorkspace } from '@/lib/authorize'
import { createRow, deleteRow, lockRowUsage, mutationFields, RowWriteError, updateRow, writeRows } from '@/lib/row-mutations'
import { renameInFormulas } from '@/lib/formula-rename'

async function loadFields(tableId: string): Promise<Field[]> {
  const rows = await db.select().from(fieldsTable).where(eq(fieldsTable.tableId, tableId))
  return rows as unknown as Field[]
}

export type ActionResult = { ok: true } | { ok: false; error: string }

/**
 * Сервер — источник истины: значение проверяется по типу поля и формулы
 * пересчитываются здесь, что бы ни прислал клиент.
 */
export async function setCellAction(
  tableId: string,
  rowId: string,
  fieldId: string,
  value: unknown,
  /**
   * Значение, которое человек видел перед правкой. Если в базе уже другое,
   * значит, пока он печатал, ячейку изменил кто-то ещё, — и затирать чужую
   * работу молча нельзя. Необязательное: старые вызовы и очередь устройств
   * основания не присылают.
   */
  base?: unknown,
): Promise<ActionResult> {
  const auth = await authorizeTable(tableId)
  if (!auth.ok) return auth

  try {
    await writeRows(auth.member.workspaceId, (context) => updateRow(context, tableId, rowId, (fields) => {
      const field = fields.find((column) => column.id === fieldId)
      if (!field) throw new RowWriteError('missing', 'Поле не найдено')
      if (isComputed(field.type)) {
        throw new RowWriteError('invalid', 'Вычисляемое поле нельзя изменить')
      }
      try { return { [fieldId]: parseCellValue(field, value) } }
      catch { throw new RowWriteError('invalid', 'Значение не подходит типу поля') }
    }, { id: auth.member.userId, kind: 'member' }, { base: base === undefined ? undefined : { [fieldId]: base } }))
  } catch (error) {
    if (error instanceof RowWriteError) return { ok: false, error: error.message }
    throw error
  }

  revalidatePath('/t/[tableId]', 'page')
  return { ok: true }
}

/**
 * Идентификатор строки может прийти с клиента: тогда строка, показанная сразу,
 * и строка на сервере — одна и та же. Иначе после ответа сервера локальная
 * подменяется другой, и всё, что человек успел в неё вписать, теряется.
 */
export async function addRowAction(
  tableId: string,
  afterRowId?: string,
  rowId?: string,
): Promise<ActionResult> {
  const auth = await authorizeTable(tableId)
  if (!auth.ok) return auth

  try {
    await writeRows(auth.member.workspaceId, async (context) => {
      await lockRowUsage(context)
      const fields = await mutationFields(context, tableId)
      const data: Record<string, unknown> = {}
      for (const field of fields) if (field.type === 'checkbox') data[field.id] = false
      await createRow(context, tableId, data, { id: auth.member.userId, kind: 'member' }, { id: rowId, afterRowId })
    })
  } catch (error) {
    if (error instanceof RowWriteError || isPlanLimitError(error)) return { ok: false, error: error.message }
    throw error
  }

  revalidatePath('/t/[tableId]', 'page')
  return { ok: true }
}

export async function deleteRowAction(tableId: string, rowId: string, baseVersion?: number): Promise<ActionResult> {
  const auth = await authorizeTable(tableId)
  if (!auth.ok) return auth
  try {
    await writeRows(auth.member.workspaceId, (context) => deleteRow(context, tableId, rowId,
      { id: auth.member.userId, kind: 'member' }, { baseVersion }))
  } catch (error) {
    if (error instanceof RowWriteError) return { ok: false, error: error.message }
    throw error
  }
  revalidatePath('/t/[tableId]', 'page')
  return { ok: true }
}

export async function renameFieldAction(
  tableId: string,
  fieldId: string,
  name: string,
): Promise<ActionResult> {
  const auth = await authorizeTableStructure(tableId)
  if (!auth.ok) return auth

  const trimmed = name.trim()
  if (trimmed === '') return { ok: false, error: 'Имя поля не может быть пустым' }

  const fields = await loadFields(tableId)
  const current = fields.find((field) => field.id === fieldId)
  if (!current) return { ok: false, error: 'Поле не найдено' }

  await db.transaction(async (tx) => {
    await tx
      .update(fieldsTable)
      .set({ name: trimmed, updatedAt: new Date() })
      .where(and(eq(fieldsTable.id, fieldId), eq(fieldsTable.tableId, tableId)))
    // Формулы ссылаются на поля именами — переименование идёт и по ним.
    await renameInFormulas(tx, tableId, fields, current.name, trimmed)
  })

  revalidatePath('/t/[tableId]', 'page')
  publishTable(tableId, 'rows')
  return { ok: true }
}

/** Создание пустой таблицы: импорт файла — не единственный способ начать. */
export async function createTableAction(
  name: string,
): Promise<{ ok: true; tableId: string } | { ok: false; error: string }> {
  const trimmed = name.trim() || 'Новая таблица'

  const auth = await authorizeWorkspace()
  if (!auth.ok) return auth
  const workspace = { id: auth.member.workspaceId }

  const existing = await db
    .select({ position: tables.position })
    .from(tables)
    .where(eq(tables.workspaceId, workspace.id))
    .orderBy(asc(tables.position))

  const tableId = newId('table')
  const primaryFieldId = newId('field')
  const [namePosition, notePosition] = positionSequence(2) as [string, string]

  try {
    await db.transaction(async (tx) => {
      await assertCanIncreaseUsage({ workspaceId: workspace.id, resource: 'tables', tx })
      await tx.insert(tables).values({
        id: tableId,
        workspaceId: workspace.id,
        name: trimmed,
        icon: 'table',
        position: positionBetween(existing[existing.length - 1]?.position ?? null, null),
        primaryFieldId,
      })
      await tx.insert(fieldsTable).values([
        {
          id: primaryFieldId,
          tableId,
          name: 'Название',
          type: 'text',
          options: {},
          description: null,
          position: namePosition,
        },
        {
          id: newId('field'),
          tableId,
          name: 'Заметки',
          type: 'long_text',
          options: { richText: false },
          description: null,
          position: notePosition,
        },
      ])
      await tx.insert(viewsTable).values({
        id: newId('view'),
        tableId,
        name: 'Все записи',
        type: 'grid',
        config: defaultViewConfig('grid', newId('filter')),
        position: positionBetween(null, null),
      })
    })

  } catch (error) {
    if (isPlanLimitError(error)) return { ok: false, error: error.message }
    throw error
  }

  revalidatePath('/', 'page')
  return { ok: true, tableId }
}
