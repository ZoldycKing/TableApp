'use server'

import { db, fields as fieldsTable, rows as rowsTable, tables, rowChanges } from '@tableapp/db'
import { compile, compileTableFormulas, topologicalOrder } from '@tableapp/formula'
import type { Field, FieldType } from '@tableapp/schema'
import {
  FIELD_OPTIONS,
  coerceCellValue,
  isComputed,
  newId,
  normalizeFieldOptions,
  positionBetween,
} from '@tableapp/schema'
import { and, asc, eq, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { publishTable } from '@/lib/live'
import { authorizeTable } from '@/lib/authorize'
import { renameInFormulas } from '@/lib/formula-rename'
import { lockRowUsage } from '@/lib/row-mutations'
import { modularFieldChangeError } from '@/lib/module-resource-guard'
import type { ActionResult } from './actions'

async function loadFields(tableId: string): Promise<Field[]> {
  const rows = await db
    .select()
    .from(fieldsTable)
    .where(eq(fieldsTable.tableId, tableId))
    .orderBy(asc(fieldsTable.position))
  return rows.map(
    (row) => ({ ...row, options: normalizeFieldOptions(row.type as FieldType, row.options) }) as unknown as Field,
  )
}

/**
 * Проверка настроек поля до записи.
 * Формула, которая не компилируется, и Lookup в несуществующую таблицу
 * должны отсекаться здесь, а не всплывать ошибкой на каждой строке при чтении.
 */
async function validateField(
  workspaceId: string,
  candidate: Field,
  siblings: Field[],
): Promise<string | null> {
  const others = siblings.filter((field) => field.id !== candidate.id)

  if (candidate.name.trim() === '') return 'Имя поля не может быть пустым'
  if (others.some((field) => field.name.trim().toLowerCase() === candidate.name.trim().toLowerCase())) {
    return `Поле с именем «${candidate.name}» уже есть в таблице`
  }

  if (candidate.type === 'relation') {
    const [target] = await db
      .select({ id: tables.id })
      .from(tables)
      .where(and(eq(tables.id, candidate.options.tableId), eq(tables.workspaceId, workspaceId)))
      .limit(1)
    if (!target) return 'Выбранная таблица для связи не найдена'
  }
  if (candidate.type === 'number' && candidate.options.initialFrom) {
    const initial = candidate.options.initialFrom
    const relation = others.find(field => field.id === initial.relationFieldId)
    if (relation?.type !== 'relation' || relation.options.allowMultiple) return 'Для начальной цены выберите связь с одной строкой'
    const [target] = await db.select({ id: tables.id }).from(tables)
      .where(and(eq(tables.id, relation.options.tableId), eq(tables.workspaceId, workspaceId))).limit(1)
    if (!target) return 'Таблица начальной цены не найдена'
    const targetFields = await loadFields(target.id)
    if (!targetFields.some(field => field.id === initial.targetFieldId && field.type === 'number')) return 'Начальная цена должна ссылаться на числовое поле'
  }

  if (candidate.type === 'lookup' || candidate.type === 'rollup' || candidate.type === 'count') {
    const relation = others.find((field) => field.id === candidate.options.relationFieldId)
    if (!relation || relation.type !== 'relation') return 'Не выбрано поле связи'

    const [target] = await db.select({ id: tables.id }).from(tables)
      .where(and(eq(tables.id, relation.options.tableId), eq(tables.workspaceId, workspaceId))).limit(1)
    if (!target) return 'Выбранная таблица для связи не найдена'

    if (candidate.type !== 'count') {
      const targetFields = await loadFields(relation.options.tableId)
      if (!targetFields.some((field) => field.id === candidate.options.targetFieldId)) {
        return 'Не выбрано поле в связанной таблице'
      }
    }
  }

  if (candidate.type === 'formula') {
    const expression = candidate.options.expression.trim()
    if (expression === '') return null
    try {
      compile(expression, [...others, candidate])
    } catch (error) {
      return error instanceof Error ? error.message : 'Формула содержит ошибку'
    }
    const plan = topologicalOrder(compileTableFormulas([...others, candidate]))
    if ('cycle' in plan) {
      const names = plan.cycle.map((id) => siblings.find((field) => field.id === id)?.name ?? id)
      return `Формулы ссылаются друг на друга по кругу: ${names.join(' → ')}`
    }
  }

  return null
}

/**
 * Тип результата формулы выводится компилятором и кладётся в настройки поля:
 * рантайм и форматирование не должны гадать, число перед ними или текст.
 */
function withInferredResultType(candidate: Field, siblings: Field[]): Field {
  if (candidate.type !== 'formula') return candidate
  const expression = candidate.options.expression.trim()
  if (expression === '') return candidate
  try {
    const compiled = compile(expression, [...siblings.filter((f) => f.id !== candidate.id), candidate])
    return { ...candidate, options: { ...candidate.options, resultType: compiled.resultType } }
  } catch {
    return candidate
  }
}

export async function createFieldAction(
  tableId: string,
  input: { name: string; type: FieldType; options?: unknown; afterFieldId?: string },
): Promise<{ ok: true; fieldId: string } | { ok: false; error: string }> {
  const auth = await authorizeTable(tableId)
  if (!auth.ok) return auth

  const siblings = await loadFields(tableId)

  const parsed = FIELD_OPTIONS[input.type].safeParse(input.options ?? {})
  if (!parsed.success) return { ok: false, error: 'Настройки поля заполнены не полностью' }

  const index = input.afterFieldId
    ? siblings.findIndex((field) => field.id === input.afterFieldId)
    : siblings.length - 1

  const candidate = {
    id: newId('field'),
    tableId,
    name: input.name.trim(),
    description: null,
    position: positionBetween(
      siblings[index]?.position ?? null,
      siblings[index + 1]?.position ?? null,
    ),
    type: input.type,
    options: parsed.data,
  } as Field

  const error = await validateField(auth.member.workspaceId, candidate, siblings)
  if (error) return { ok: false, error }

  const enriched = withInferredResultType(candidate, siblings)

  await db.insert(fieldsTable).values({
    id: enriched.id,
    tableId,
    name: enriched.name,
    type: enriched.type,
    options: enriched.options as Record<string, unknown>,
    description: null,
    position: candidate.position,
  })

  revalidatePath('/t/[tableId]', 'page')
  publishTable(tableId, 'structure')
  return { ok: true, fieldId: candidate.id }
}

export async function updateFieldAction(
  tableId: string,
  fieldId: string,
  input: { name?: string; type?: FieldType; options?: unknown },
): Promise<ActionResult> {
  const auth = await authorizeTable(tableId)
  if (!auth.ok) return auth

  const siblings = await loadFields(tableId)
  const current = siblings.find((field) => field.id === fieldId)
  if (!current) return { ok: false, error: 'Поле не найдено' }

  const nextType = input.type ?? current.type
  const rawOptions = input.options ?? (nextType === current.type ? current.options : {})
  const parsed = FIELD_OPTIONS[nextType].safeParse(rawOptions)
  if (!parsed.success) return { ok: false, error: 'Настройки поля заполнены не полностью' }

  const candidate = {
    ...current,
    name: (input.name ?? current.name).trim(),
    type: nextType,
    options: parsed.data,
  } as Field

  const error = await validateField(auth.member.workspaceId, candidate, siblings)
  if (error) return { ok: false, error }

  const enriched = withInferredResultType(candidate, siblings)
  const typeChanged = nextType !== current.type

  const moduleError = await db.transaction(async (tx) => {
    await lockRowUsage({ tx, workspaceId: auth.member.workspaceId, changed: new Set() })
    const error = await modularFieldChangeError(tx, auth.member.workspaceId, fieldId, enriched)
    if (error) return error
    await tx
      .update(fieldsTable)
      .set({
        name: enriched.name,
        type: enriched.type,
        options: enriched.options as Record<string, unknown>,
        updatedAt: new Date(),
      })
      .where(and(eq(fieldsTable.id, fieldId), eq(fieldsTable.tableId, tableId)))

    await renameInFormulas(tx, tableId, siblings, current.name, enriched.name)

    if (!typeChanged) return

    // Смена типа переписывает значения: что не переводится, обнуляется.
    // Вычисляемые поля значений не хранят, поэтому их просто чистим.
    const rows = await tx.select().from(rowsTable).where(eq(rowsTable.tableId, tableId)).orderBy(asc(rowsTable.id)).for('update')
    for (const row of rows) {
      const data = row.data as Record<string, unknown>
      const next = { ...data }
      if (isComputed(candidate.type)) delete next[fieldId]
      else next[fieldId] = coerceCellValue(current, candidate, data[fieldId])
      await tx.update(rowsTable).set({ data: next, updatedBy: auth.member.userId, updatedAt: new Date(), version: sql`${rowsTable.version} + 1`, syncRevision: sql`nextval('row_sync_revision_seq')` }).where(eq(rowsTable.id, row.id))
      await tx.insert(rowChanges).values({ id: newId('change'), tableId, rowId: row.id, op: 'update',
        actorId: auth.member.userId, actorKind: 'member', before: data, after: next })
    }
  })
  if (moduleError) return { ok: false, error: moduleError }
  revalidatePath('/t/[tableId]', 'page')
  publishTable(tableId, 'structure')
  return { ok: true }
}

export async function deleteFieldAction(tableId: string, fieldId: string): Promise<ActionResult> {
  const auth = await authorizeTable(tableId)
  if (!auth.ok) return auth

  const siblings = await loadFields(tableId)
  const target = siblings.find((field) => field.id === fieldId)
  if (!target) return { ok: false, error: 'Поле не найдено' }

  const [table] = await db.select().from(tables).where(eq(tables.id, tableId)).limit(1)
  if (table?.primaryFieldId === fieldId) {
    return { ok: false, error: 'Нельзя удалить первичное поле — оно служит заголовком строки' }
  }

  // Поле, на которое опираются Lookup, Rollup или формула, молча удалять нельзя:
  // иначе зависящие колонки превратятся в пустые без объяснения причины.
  const dependants = siblings.filter((field) => {
    if (field.id === fieldId) return false
    if (field.type === 'lookup' || field.type === 'rollup') {
      return field.options.relationFieldId === fieldId || field.options.targetFieldId === fieldId
    }
    if (field.type === 'count') return field.options.relationFieldId === fieldId
    if (field.type === 'number' && field.options.initialFrom) return field.options.initialFrom.relationFieldId === fieldId
    if (field.type === 'formula') {
      try {
        return compile(field.options.expression, siblings).dependencies.includes(fieldId)
      } catch {
        return false
      }
    }
    return false
  })

  if (dependants.length > 0) {
    const names = dependants.map((field) => `«${field.name}»`).join(', ')
    return { ok: false, error: `Сначала измените поля, которые на него ссылаются: ${names}` }
  }

  const moduleError = await db.transaction(async (tx) => {
    await lockRowUsage({ tx, workspaceId: auth.member.workspaceId, changed: new Set() })
    const error = await modularFieldChangeError(tx, auth.member.workspaceId, fieldId, null)
    if (error) return error
    await tx.delete(fieldsTable).where(and(eq(fieldsTable.id, fieldId), eq(fieldsTable.tableId, tableId)))

    const rows = await tx.select().from(rowsTable).where(eq(rowsTable.tableId, tableId)).orderBy(asc(rowsTable.id)).for('update')
    for (const row of rows) {
      const before = row.data as Record<string, unknown>
      const data = { ...before }
      if (!(fieldId in data)) continue
      delete data[fieldId]
      await tx.update(rowsTable).set({ data, updatedBy: auth.member.userId, updatedAt: new Date(), version: sql`${rowsTable.version} + 1`, syncRevision: sql`nextval('row_sync_revision_seq')` }).where(eq(rowsTable.id, row.id))
      await tx.insert(rowChanges).values({ id: newId('change'), tableId, rowId: row.id, op: 'update',
        actorId: auth.member.userId, actorKind: 'member', before, after: data })
    }
  })
  if (moduleError) return { ok: false, error: moduleError }
  revalidatePath('/t/[tableId]', 'page')
  publishTable(tableId, 'structure')
  return { ok: true }
}

/** Живая проверка формулы для редактора: возвращает тип результата или ошибку. */
export async function checkFormulaAction(
  tableId: string,
  fieldId: string | null,
  expression: string,
): Promise<{ ok: true; resultType: string; dependencies: string[] } | { ok: false; error: string }> {
  // Проверка формулы читает состав полей, поэтому требует доступа на чтение.
  const auth = await authorizeTable(tableId, false)
  if (!auth.ok) return auth

  const siblings = await loadFields(tableId)
  try {
    const compiled = compile(expression, siblings)
    if (fieldId && compiled.dependencies.includes(fieldId)) {
      return { ok: false, error: 'Формула ссылается сама на себя' }
    }
    return { ok: true, resultType: compiled.resultType, dependencies: compiled.dependencies }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Формула содержит ошибку' }
  }
}
