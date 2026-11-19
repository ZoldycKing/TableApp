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
import { deleteRow, lockRowUsage, lockedRow, mutationFields, RowWriteError, writeRows } from '@/lib/row-mutations'
import { validateAppV2Definition } from '@tableapp/schema/app-definition'
import { generateApp, slugify } from '@/lib/app-builder'
import { loadBuilderV2Catalog } from '@/lib/builder-v2'
import { lockAppSlugs, uniqueSlug } from '@/lib/app-slug'
import { authorizeApp, authorizeTable, authorizeWorkspace } from '@/lib/authorize'
import { inventoryPreparation } from '@/lib/inventory-preparation'
import { templatePreparation } from '@/lib/template-preparation'
import { buildTemplate } from '@/lib/templates/build'
import { findTemplate } from '@/lib/templates/catalog'
import { templatePreset } from '@/lib/templates/presets'
import { buildCrmV2App, isCrmTemplate } from '@/lib/templates/crm-v2'
import { buildInventoryV2App, isInventoryTemplate } from '@/lib/templates/inventory-v2'
import { buildShopV2App, isShopTemplate } from '@/lib/templates/shop-v2'
import { buildBookingV2App, isBookingTemplate } from '@/lib/templates/booking-v2'
import { buildDispatchV2App, isDispatchTemplate } from '@/lib/templates/dispatch-v2'
import { buildProjectsV2App, isProjectsTemplate } from '@/lib/templates/projects-v2'
import { buildInvoicesV2App, isInvoicesTemplate } from '@/lib/templates/invoices-v2'
import { stageDispatchPortrait } from '@/lib/templates/dispatch-portrait-files'
import { stageProjectsPortrait } from '@/lib/templates/projects-portrait-files'
import { stageBookingSampleFile } from '@/lib/templates/booking-sample-files'
import { stageSalonPortrait } from '@/lib/templates/salon-portraits'
import { discardInventorySampleFiles, stageInventorySampleFile } from '@/lib/templates/inventory-sample-files'
import { discardShopSampleFiles, stageShopSampleFile } from '@/lib/templates/shop-sample-files'
import { linkAttachments } from '@/lib/attachments'
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
    slug: slugify(built.appName),
    table: { id: appTable.id, name: appTable.name, primaryFieldId: appTable.primaryFieldId },
    fields: appFields,
    view: appView,
  })

  /*
   * Готовые сценарии поверх общего конструктора: кабинет клиента,
   * производственный учёт, склад с приёмками и заявки с ролями мастера и диспетчера.
   */
  const draft = templatePreset(generated, built)
  const nativeV2 = isShopTemplate(template.id) || isCrmTemplate(template.id) || isInventoryTemplate(template.id) || isBookingTemplate(template.id) || isDispatchTemplate(template.id) || isProjectsTemplate(template.id) || isInvoicesTemplate(template.id)
  // Production uses "director" for the creator's existing owner role.
  if (!nativeV2 && (draft.booking || draft.customer || draft.inventory || draft.production || template.id === 'crm')) draft.allowlist = [{ email: auth.member.email, roleId: draft.production ? 'director' : 'manager', company: '' }]

  const sampleFiles: { tableId: string; rowId: string; fieldId: string; file: NonNullable<Awaited<ReturnType<typeof stageShopSampleFile>>> }[] = []
  try {
    if (isBookingTemplate(template.id) && draft.booking) {
      const tableId = draft.booking.tables.services
      const image = built.fields.find(field => field.tableId === tableId && field.type === 'image')
      if (image) for (const row of built.rows.filter(row => row.tableId === tableId)) {
        const file = await stageBookingSampleFile(workspaceId, auth.member.userId, row.data[draft.booking.service.name])
        if (file) { row.data[image.id] = [file]; sampleFiles.push({ tableId, rowId: row.id, fieldId: image.id, file }) }
      }
      for (const [tableName, fieldName] of [['Мастера', 'Фото мастера'], ['Клиенты', 'Фото клиента']] as const) {
        const portraitTable = built.tables.find(table => table.name === tableName)
        const photo = portraitTable && built.fields.find(field => field.tableId === portraitTable.id && field.name === fieldName)
        if (!portraitTable?.primaryFieldId || !photo) continue
        for (const row of built.rows.filter(item => item.tableId === portraitTable.id)) {
          const file = await stageSalonPortrait(workspaceId, auth.member.userId, row.data[portraitTable.primaryFieldId])
          if (file) { row.data[photo.id] = [file]; sampleFiles.push({ tableId: portraitTable.id, rowId: row.id, fieldId: photo.id, file }) }
        }
      }
    }
    if (template.id === 'zakazy' && draft.customer?.catalog) {
      const { tableId, titleFieldId } = draft.customer.catalog
      const image = built.fields.find(field => field.tableId === tableId && field.type === 'image')
      if (image) {
        for (const row of built.rows.filter(row => row.tableId === tableId)) {
          const file = await stageShopSampleFile(workspaceId, auth.member.userId, row.data[titleFieldId])
          if (!file) continue
          row.data[image.id] = [file]
          sampleFiles.push({ tableId, rowId: row.id, fieldId: image.id, file })
        }
      }
    }
    if (isProjectsTemplate(template.id)) {
      const staff = built.tables.find(table => table.name === 'Сотрудники')
      const photo = staff && built.fields.find(field => field.tableId === staff.id && field.name === 'Фото')
      if (staff?.primaryFieldId && photo) {
        for (const row of built.rows.filter(item => item.tableId === staff.id)) {
          const file = await stageProjectsPortrait(workspaceId, auth.member.userId, row.data[staff.primaryFieldId])
          if (file) { row.data[photo.id] = [file]; sampleFiles.push({ tableId: staff.id, rowId: row.id, fieldId: photo.id, file }) }
        }
      }
    }
    if (isDispatchTemplate(template.id)) {
      const masters = built.tables.find(table => table.name === 'Мастера')
      const photo = masters && built.fields.find(field => field.tableId === masters.id && field.name === 'Фото')
      if (masters?.primaryFieldId && photo) {
        for (const row of built.rows.filter(item => item.tableId === masters.id)) {
          const file = await stageDispatchPortrait(workspaceId, auth.member.userId, row.data[masters.primaryFieldId])
          if (file) { row.data[photo.id] = [file]; sampleFiles.push({ tableId: masters.id, rowId: row.id, fieldId: photo.id, file }) }
        }
      }
    }
    if (isInventoryTemplate(template.id) && built.inventory?.item.image) {
      const tableId = built.inventory.tables.items
      const titleFieldId = built.inventory.item.name
      const imageFieldId = built.inventory.item.image
      for (const row of built.rows.filter(row => row.tableId === tableId)) {
        const file = await stageInventorySampleFile(workspaceId, auth.member.userId, row.data[titleFieldId])
        if (!file) continue
        row.data[imageFieldId] = [file]
        sampleFiles.push({ tableId, rowId: row.id, fieldId: imageFieldId, file })
      }
    }
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
      for (const { file, ...cell } of sampleFiles) await linkAttachments(cell, [file], tx)
      await lockAppSlugs(tx)
      draft.slug = await uniqueSlug(slugify(built.appName), undefined, tx)
      const meta = { id: appId, workspaceId, name: built.appName, slug: draft.slug, email: auth.member.email }
      const native = isShopTemplate(template.id) ? buildShopV2App(built, meta) : isCrmTemplate(template.id) ? buildCrmV2App(built, meta) : isInventoryTemplate(template.id) ? buildInventoryV2App(built, meta) : isBookingTemplate(template.id) ? buildBookingV2App(built, meta) : isDispatchTemplate(template.id) ? buildDispatchV2App(built, meta) : isProjectsTemplate(template.id) ? buildProjectsV2App(built, meta) : isInvoicesTemplate(template.id) ? buildInvoicesV2App(built, meta) : null
      if (native) {
        const { catalog } = await loadBuilderV2Catalog(workspaceId, tx)
        const valid = validateAppV2Definition(native, catalog)
        if (!valid.ok) throw new Error(valid.issues[0]?.message ?? 'Приложение не прошло проверку')
      }
      const stored = native ?? draft
      await tx.insert(apps).values({
        id: appId,
        workspaceId,
        name: stored.name,
        slug: draft.slug,
        theme: stored.theme,
        accessMode: native ? 'allowlist' : draft.accessMode,
        allowlist: native ? [] : draft.allowlist,
        rowAccessRules: native ? [] : draft.rowAccessRules,
        homeScreenId: stored.homeScreenId,
        draft: stored,
      })
    })

  } catch (error) {
    await Promise.allSettled([
      discardShopSampleFiles(workspaceId, sampleFiles.map(item => item.file)),
      discardInventorySampleFiles(workspaceId, sampleFiles.map(item => item.file)),
    ])
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

/** One atomic, recoverable cleanup of this app's untouched warehouse examples. */
export async function clearInventorySamplesAction(appId: string): Promise<ActionResult> {
  return clearTemplateSamples(appId, true)
}

/** One recoverable cleanup of untouched examples across the selected scenario. */
export async function clearTemplateSamplesAction(appId: string): Promise<ActionResult> {
  return clearTemplateSamples(appId, false)
}

async function clearTemplateSamples(appId: string, inventoryOnly: boolean): Promise<ActionResult> {
  const auth = await authorizeApp(appId)
  if (!auth.ok) return auth
  try {
    await writeRows(auth.member.workspaceId, async context => {
      await context.tx.select({ id: apps.id }).from(apps).where(and(eq(apps.id, appId), eq(apps.workspaceId, auth.member.workspaceId))).for('update')
      const state = await (inventoryOnly ? inventoryPreparation : templatePreparation)(auth.member.workspaceId, appId, context.tx)
      if (!state) throw new RowWriteError('missing', 'Шаблон недоступен. Обновите страницу.')
      for (const row of state.removable.sort((a, b) => a.id.localeCompare(b.id))) {
        const current = await lockedRow(context, row.tableId, row.id)
        if (!current?.sample || current.deletedAt) continue
        await deleteRow(context, row.tableId, row.id, { id: auth.member.userId, kind: 'member' })
      }
    })
  } catch (error) {
    if (error instanceof RowWriteError) return { ok: false, error: error.message }
    throw error
  }
  revalidatePath('/setup')
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
