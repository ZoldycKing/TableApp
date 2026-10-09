'use server'

import {
  apps,
  db,
  fields as fieldsTable,
  rows as rowsTable,
  tables,
  views as viewsTable,
} from '@tableapp/db'
import type { Field, View } from '@tableapp/schema'
import { newId, positionBetween } from '@tableapp/schema'
import { and, asc, desc, eq, isNull } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { publishTable } from '@/lib/live'
import { assertCanIncreaseUsage, isPlanLimitError } from '@/lib/limits'
import { deleteRow, lockRowUsage, lockedRow, mutationFields, writeRows } from '@/lib/row-mutations'
import { generateApp, slugify } from '@/lib/app-builder'
import { uniqueSlug } from '@/lib/app-slug'
import { authorizeTable, authorizeWorkspace } from '@/lib/authorize'
import { buildTemplate } from '@/lib/templates/build'
import { findTemplate } from '@/lib/templates/catalog'
import { templatePreset } from '@/lib/templates/presets'
import type { ActionResult } from './actions'

export type AppliedTemplate = {
  ok: true
  /** Куда вести человека сразу после установки. */
  tableId: string
  appId: string
  appSlug: string
  tableIds: string[]
}

/**
 * Установка шаблона.
 *
 * Шаблон разворачивается в собственные таблицы воркспейса — с собственными
 * идентификаторами, примерами строк и готовым приложением. Всё одной
 * транзакцией: наполовину установленный шаблон хуже, чем неустановленный.
 */
export async function applyTemplateAction(
  templateId: string,
): Promise<AppliedTemplate | { ok: false; error: string }> {
  const template = findTemplate(templateId)
  if (!template) return { ok: false, error: 'Шаблон не найден' }

  const auth = await authorizeWorkspace()
  if (!auth.ok) return auth
  const workspaceId = auth.member.workspaceId

  const [last] = await db
    .select({ position: tables.position })
    .from(tables)
    .where(eq(tables.workspaceId, workspaceId))
    .orderBy(desc(tables.position))
    .limit(1)

  const built = buildTemplate({ template, workspaceId, afterPosition: last?.position ?? null })

  const appTable = built.tables.find((table) => table.id === built.appTableId)!
  const appFields = built.fields
    .filter((field) => field.tableId === built.appTableId)
    .map((field) => field as unknown as Field)
  const appView = built.views.find((view) => view.id === built.appViewId)! as unknown as View

  const appId = newId('app')
  const generated = generateApp({
    appId,
    workspaceId,
    name: built.appName,
    slug: await uniqueSlug(slugify(built.appName)),
    table: { id: appTable.id, name: appTable.name, primaryFieldId: appTable.primaryFieldId },
    fields: appFields,
    view: appView,
  })

  /*
   * Готовые сценарии поверх общего конструктора: кабинет клиента,
   * производственный учёт, склад с приёмками и заявки с ролями мастера и диспетчера.
   */
  const draft = templatePreset(generated, built)
  if (draft.booking || draft.customer) draft.allowlist = [{ email: auth.member.email, roleId: 'manager', company: '' }]

  try {
    await writeRows(workspaceId, async (context) => {
      const { tx } = context
      await lockRowUsage(context)
      await assertCanIncreaseUsage({ workspaceId, resource: 'tables', amount: built.tables.length, tx })
      await tx.insert(tables).values(built.tables)
      await tx.insert(fieldsTable).values(built.fields)
      await tx.insert(viewsTable).values(built.views)
      if (built.rows.length > 0) {
        await assertCanIncreaseUsage({ workspaceId, resource: 'rows', amount: built.rows.length, tx })
        await tx.insert(rowsTable).values(built.rows.map((row) => ({ ...row, createdBy: auth.member.userId, updatedBy: auth.member.userId })))
      }
      await tx.insert(apps).values({
        id: appId,
        workspaceId,
        name: draft.name,
        slug: draft.slug,
        theme: draft.theme,
        accessMode: draft.accessMode,
        allowlist: draft.allowlist,
        rowAccessRules: draft.rowAccessRules,
        homeScreenId: draft.homeScreenId,
        draft,
      })
    })

  } catch (error) {
    if (isPlanLimitError(error)) return { ok: false, error: error.message }
    throw error
  }

  revalidatePath('/', 'layout')
  return {
    ok: true,
    tableId: built.appTableId,
    appId,
    appSlug: draft.slug,
    tableIds: built.tables.map((table) => table.id),
  }
}

/**
 * Кабинет клиента поверх собранного приложения.
 *
 * Три вещи сразу: форму открываем гостю, список и карточку — только вошедшим,
 * строки сравниваем с почтой. По отдельности это четыре переключателя в трёх
 * местах конструктора, и до конца доходят единицы. Поэтому шаблон, который
 * обещает кабинет, приносит его настроенным.
 */
/**
 * Удаление примеров.
 *
 * Удаляются ровно те строки, которые положил шаблон: отметка `sample`
 * снимается с любой строки, которую человек тронул, поэтому его собственные
 * данные под эту операцию не попадают никогда.
 */
export async function deleteSampleRowsAction(tableId: string): Promise<ActionResult> {
  const auth = await authorizeTable(tableId)
  if (!auth.ok) return auth

  await writeRows(auth.member.workspaceId, async (context) => {
    await lockRowUsage(context)
    await mutationFields(context, tableId)
    // The predicate is rechecked after waiting for concurrent edits: an edited
    // sample has become user data and must survive this operation.
    const samples = await context.tx.select({ id: rowsTable.id }).from(rowsTable)
      .where(and(eq(rowsTable.tableId, tableId), eq(rowsTable.sample, true), isNull(rowsTable.deletedAt)))
      .orderBy(asc(rowsTable.id)).for('update')
    for (const row of samples) {
      const current = await lockedRow(context, tableId, row.id)
      if (!current || current.deletedAt !== null) continue
      await deleteRow(context, tableId, row.id, { id: auth.member.userId, kind: 'member' })
    }
  })

  revalidatePath('/t/[tableId]', 'page')
  return { ok: true }
}

/** Скрыть подсказку про примеры: человек разобрался и хочет работать. */
export async function dismissTemplateNoticeAction(tableId: string): Promise<ActionResult> {
  const auth = await authorizeTable(tableId)
  if (!auth.ok) return auth

  await db.update(tables).set({ templateId: null }).where(eq(tables.id, tableId))
  revalidatePath('/t/[tableId]', 'page')
  publishTable(tableId, 'rows')
  return { ok: true }
}
