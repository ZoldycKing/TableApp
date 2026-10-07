'use server'

import {
  db,
  fields as fieldsTable,
  rowChanges,
  rows as rowsTable,
  tables,
  views as viewsTable,
  workspaces,
} from '@tableapp/db'
import { compile, computeRow, type Compiled } from '@tableapp/formula'
import type { Field } from '@tableapp/schema'
import { defaultViewConfig, newId, parseCellValue, positionBetween, positionSequence } from '@tableapp/schema'
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { publishTable } from '@/lib/live'
import { mayIncrease, noteRemoved } from '@/lib/limits'
import { dependentRows } from '@/lib/production-cascade'
import { isAttachmentField, linkAttachments, linkRowAttachments } from '@/lib/attachments'
import { authorizeTable, authorizeWorkspace } from '@/lib/authorize'
import { CELL_CONFLICT, sameCellValue } from '@/lib/cell-conflict'
import { renameInFormulas } from '@/lib/formula-rename'

async function loadFields(tableId: string): Promise<Field[]> {
  const rows = await db.select().from(fieldsTable).where(eq(fieldsTable.tableId, tableId))
  return rows as unknown as Field[]
}

function compileFormulas(fields: readonly Field[]): Map<string, Compiled> {
  const compiled = new Map<string, Compiled>()
  for (const field of fields) {
    if (field.type !== 'formula' || !field.options.expression.trim()) continue
    try {
      compiled.set(field.id, compile(field.options.expression, fields))
    } catch {
      // Сломанная формула не мешает записывать остальные поля.
    }
  }
  return compiled
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

  const fields = await loadFields(tableId)
  const field = fields.find((f) => f.id === fieldId)
  if (!field) return { ok: false, error: 'Поле не найдено' }

  let parsed: unknown
  try {
    parsed = parseCellValue(field, value)
  } catch {
    return { ok: false, error: 'Значение не подходит типу поля' }
  }

  const [current] = await db
    .select()
    .from(rowsTable)
    .where(and(eq(rowsTable.id, rowId), eq(rowsTable.tableId, tableId)))
    .limit(1)
  if (!current) return { ok: false, error: 'Строка не найдена' }

  const before = current.data as Record<string, unknown>

  if (base !== undefined && !sameCellValue(before[fieldId], base)) {
    return { ok: false, error: CELL_CONFLICT }
  }

  const after = computeRow({ ...before, [fieldId]: parsed }, compileFormulas(fields))

  await db.transaction(async (tx) => {
    await tx
      .update(rowsTable)
      // Правка снимает отметку «пример»: строка, в которую человек что-то
      // вписал, больше не должна исчезать по кнопке «удалить примеры».
      .set({ data: after, version: sql`${rowsTable.version} + 1`, updatedAt: new Date(), sample: false })
      .where(eq(rowsTable.id, rowId))
    await tx.insert(rowChanges).values({
      id: newId('change'),
      tableId,
      rowId,
      op: 'update',
      actorId: auth.member.userId,
      actorKind: 'member',
      before: { [fieldId]: before[fieldId] ?? null },
      after: { [fieldId]: after[fieldId] ?? null },
    })
  })

  // Загруженные файлы привязываются к ячейке: из этой связи потом выводится
  // право на файл.
  if (isAttachmentField(field)) {
    await linkAttachments({ tableId, rowId, fieldId }, parsed)
  }

  revalidatePath('/t/[tableId]', 'page')
  publishTable(tableId, 'rows')
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

  const allowed = await mayIncrease({ workspaceId: auth.member.workspaceId, resource: 'rows' })
  if (!allowed.ok) return allowed

  const fields = await loadFields(tableId)
  const existing = await db
    .select({ id: rowsTable.id, position: rowsTable.position })
    .from(rowsTable)
    .where(and(eq(rowsTable.tableId, tableId), isNull(rowsTable.deletedAt)))
    .orderBy(asc(rowsTable.position))

  const index = afterRowId ? existing.findIndex((r) => r.id === afterRowId) : existing.length - 1
  const position = positionBetween(
    existing[index]?.position ?? null,
    existing[index + 1]?.position ?? null,
  )

  const data: Record<string, unknown> = {}
  for (const field of fields) {
    if (field.type === 'checkbox') data[field.id] = false
  }
  const computed = computeRow(data, compileFormulas(fields))
  const id = rowId ?? newId('row')

  await db.transaction(async (tx) => {
    await tx.insert(rowsTable).values({ id, tableId, data: computed, position })
    await tx.insert(rowChanges).values({
      id: newId('change'),
      tableId,
      rowId: id,
      op: 'create',
      actorId: auth.member.userId,
      actorKind: 'member',
      after: computed,
    })
  })

  revalidatePath('/t/[tableId]', 'page')
  publishTable(tableId, 'rows')
  return { ok: true }
}

export async function deleteRowAction(tableId: string, rowId: string): Promise<ActionResult> {
  const auth = await authorizeTable(tableId)
  if (!auth.ok) return auth

  const [current] = await db.select().from(rowsTable).where(eq(rowsTable.id, rowId)).limit(1)
  if (!current) return { ok: false, error: 'Строка не найдена' }

  /*
   * Зависимые строки — например, списания материалов у выпуска продукции.
   * Уходят вместе с ним: движение без основания означает расход, которого
   * не было, и остаток, который никогда не сойдётся.
   */
  const dependent = await dependentRows(tableId, rowId)

  await db.transaction(async (tx) => {
    // Мягкое удаление: строка уходит в корзину, а не исчезает.
    await tx.update(rowsTable).set({ deletedAt: new Date() }).where(eq(rowsTable.id, rowId))
    if (dependent) {
      await tx
        .update(rowsTable)
        .set({ deletedAt: new Date() })
        .where(inArray(rowsTable.id, dependent.rows.map((row) => row.id)))
    }
    // Освобождаем место в той же транзакции: удаление не прошло — место
    // не освободилось.
    await noteRemoved(auth.member.workspaceId, 'rows', 1 + (dependent?.rows.length ?? 0), tx)
    await tx.insert(rowChanges).values([
      {
        id: newId('change'),
        tableId,
        rowId,
        op: 'delete' as const,
        actorId: auth.member.userId,
        actorKind: 'member' as const,
        before: current.data as Record<string, unknown>,
      },
      ...(dependent?.rows ?? []).map((row) => ({
        id: newId('change'),
        tableId: dependent!.tableId,
        rowId: row.id,
        op: 'delete' as const,
        actorId: auth.member.userId,
        actorKind: 'member' as const,
        before: row.data,
      })),
    ])
  })

  revalidatePath('/t/[tableId]', 'page')
  publishTable(tableId, 'rows')
  return { ok: true }
}

export async function renameFieldAction(
  tableId: string,
  fieldId: string,
  name: string,
): Promise<ActionResult> {
  const auth = await authorizeTable(tableId)
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

  const allowed = await mayIncrease({ workspaceId: workspace.id, resource: 'tables' })
  if (!allowed.ok) return allowed

  const existing = await db
    .select({ position: tables.position })
    .from(tables)
    .where(eq(tables.workspaceId, workspace.id))
    .orderBy(asc(tables.position))

  const tableId = newId('table')
  const primaryFieldId = newId('field')
  const [namePosition, notePosition] = positionSequence(2) as [string, string]

  await db.transaction(async (tx) => {
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

  revalidatePath('/', 'page')
  return { ok: true, tableId }
}
