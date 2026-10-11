'use server'

import { stripDerived } from '@tableapp/formula'
import type { App, Field } from '@tableapp/schema'
import { customerWorkflows, dateInstant, parseCellValue } from '@tableapp/schema'
import { revalidatePath } from 'next/cache'
import { currentAppAccess, type AppViewer } from '@/lib/app-session'
import { hasRole, workflowRole } from '@/lib/module-access'
import { permits, writableFields, type AppAction, type Visitor } from '@/lib/app-roles'
import { assertTableAllowed, loadApp } from '@/lib/app-write-access'
import { validateRowAttachments } from '@/lib/attachments'
import { explainToCustomer } from '@tableapp/schema'
import { isPlanLimitError } from '@/lib/limits'
import { assertCurrentModuleState, deleteRow, updateRow, writeRows, RowWriteError } from '@/lib/row-mutations'
import { insertRow, loadTableFields } from '@/lib/row-write'
import { canAccessRow, dropOwnerChange, ownRowsDeclared, rulesFor } from '@/lib/row-access'
import type { ActionResult } from './actions'
import { canCreateWithValues } from '@/lib/form-required'

/**
 * Одна дверь для всех трёх действий: приложение опубликовано, роль посетителя
 * посчитана по списку доступа, и действие разрешено хотя бы одним экраном,
 * открытым этой роли. Право выводится из экранов, поэтому подменить в запросе
 * идентификатор чужой таблицы нельзя — её нет ни на одном экране.
 */
async function allow(
  slug: string,
  tableId: string,
  action: AppAction,
): Promise<{ ok: true; app: App; viewer: AppViewer | null; visitor: Visitor } | { ok: false; error: string }> {
  const app = await loadApp(slug)
  if (!app) return { ok: false, error: 'Приложение не опубликовано' }
  if (app.inventory?.tables.movements === tableId) return { ok: false, error: 'Движения записываются через действия в карточке товара' }
  const tableError = await assertTableAllowed(app, tableId)
  if (tableError) return { ok: false, error: tableError }

  const { visitor, viewer } = await currentAppAccess(app)
  if (visitor.enrolled && !ownRowsDeclared(app, tableId, visitor.roleId)) {
    return { ok: false, error: 'Приём заявок сейчас недоступен. Свяжитесь с организацией.' }
  }
  if (!permits(app, tableId, action, visitor)) {
    return {
      ok: false,
      error: visitor.authenticated
        ? 'Это действие вам недоступно'
        : 'Чтобы это сделать, войдите в приложение',
    }
  }

  return { ok: true, app, viewer, visitor }
}

/**
 * Значения, пригодные к записи.
 *
 * Кроме типа проверяется и право: поле, которого нет в доступной роли форме,
 * отбрасывается. Без этого «клиенту не показываем статус» было бы только
 * про показ — прислать статус в обход формы мог бы кто угодно.
 */
function sanitize(
  values: Record<string, unknown>,
  fields: Field[],
  allowed: ReadonlySet<string>,
): Record<string, unknown> {
  const byId = new Map(fields.map((field) => [field.id, field]))
  const clean: Record<string, unknown> = {}
  for (const [fieldId, value] of Object.entries(stripDerived(values, fields))) {
    const field = byId.get(fieldId)
    if (!field || !allowed.has(fieldId)) continue
    try {
      clean[fieldId] = parseCellValue(field, value)
    } catch {
      // Значение, не подходящее типу, отбрасывается, а не пишется как есть.
    }
  }
  return clean
}

export async function appCreateRowAction(
  slug: string,
  tableId: string,
  values: Record<string, unknown>,
): Promise<ActionResult> {
  const access = await allow(slug, tableId, 'create')
  if (!access.ok) return access
  const { app, viewer, visitor } = access

  /*
   * Ограничения частоты здесь нет, и это не упущение: сюда доходит только
   * вошедший — не вошедшему `permits` отказывает всегда. Заказ с витрины
   * идёт через подтверждение почты, и частоту считает оно, по попыткам входа.
   */
  const fields = await loadTableFields(tableId)
  const clean = sanitize(values, fields, writableFields(app, tableId, visitor, 'create'))
  if (!canCreateWithValues(app, tableId, visitor, clean)) return { ok: false, error: 'Заполните обязательные поля заявки.' }
  const attachmentError = await validateRowAttachments(tableId, fields, clean)
  if (attachmentError) return { ok: false, error: attachmentError }

  try {
    await insertRow(app, tableId, clean, { viewer, visitor, ip: null }, fields)
  } catch (error) {
    /*
     * Про чужой тариф человеку не говорят: это не его дела и не его деньги.
     * Он видит то же, что увидел бы при поломке, — и это честнее, чем
     * объяснять ему, что у владельца кончилось место.
     */
    if (isPlanLimitError(error)) return { ok: false, error: explainToCustomer() }
    if (error instanceof RowWriteError) return { ok: false, error: error.message }
    throw error
  }

  revalidatePath(`/a/${slug}`)
  return { ok: true }
}

export async function appUpdateRowAction(
  slug: string, tableId: string, rowId: string, values: Record<string, unknown>, baseVersion?: number,
): Promise<ActionResult> {
  const access = await allow(slug, tableId, 'update')
  if (!access.ok) return access
  const { app, viewer, visitor } = access
  const rules = rulesFor(app, tableId, visitor)
  const customer = customerWorkflows(app).find(config => config.tableId === tableId)
  if (customer && !Number.isSafeInteger(baseVersion)) return { ok: false, error: 'Обновите карточку перед изменением.' }
  if (app.booking?.tables.visits === tableId && visitor.enrolled && !Number.isInteger(baseVersion)) return { ok: false, error: 'Обновите запись перед переносом.' }
  const allowed = writableFields(app, tableId, visitor, 'update')
  try {
    await writeRows(app.workspaceId, async (context) => {
      await assertCurrentModuleState(context, app)
      return updateRow(context, tableId, rowId,
      (fields, row) => {
        const patch = dropOwnerChange(rules, sanitize(values, fields, allowed))
        if (customer && hasRole(visitor, workflowRole(app, tableId, 'staff')) && !hasRole(visitor, workflowRole(app, tableId, 'manager')) && customer.terminalStatuses.includes(String((row.data as Record<string, unknown>)[customer.statusFieldId])) && customer.statusFieldId in patch && patch[customer.statusFieldId] !== (row.data as Record<string, unknown>)[customer.statusFieldId]) throw new RowWriteError('invalid', 'Обращение завершено. Для изменения статуса обратитесь к администратору.')
        return patch
      },
      { id: viewer?.id ?? null, kind: 'app_user' },
      { baseVersion, guard: (data) => canAccessRow(rules, viewer, data) && (!app.booking || tableId !== app.booking.tables.visits || !visitor.enrolled ||
        data[app.booking.visit.status] === app.booking.statuses.booked && (dateInstant(data[app.booking.visit.start]) ?? 0) > Date.now()) })
    })
  } catch (error) {
    if (error instanceof RowWriteError) return { ok: false, error: error.message }
    throw error
  }
  revalidatePath(`/a/${slug}`)
  return { ok: true }
}

export async function appDeleteRowAction(
  slug: string, tableId: string, rowId: string, baseVersion?: number,
): Promise<ActionResult> {
  const access = await allow(slug, tableId, 'delete')
  if (!access.ok) return access
  const { app, viewer, visitor } = access
  const rules = rulesFor(app, tableId, visitor)
  try {
    await writeRows(app.workspaceId, async (context) => {
      await assertCurrentModuleState(context, app)
      return deleteRow(context, tableId, rowId,
      { id: viewer?.id ?? null, kind: 'app_user' },
      { baseVersion, guard: (data) => canAccessRow(rules, viewer, data) })
    })
  } catch (error) {
    if (error instanceof RowWriteError) return { ok: false, error: error.message }
    throw error
  }
  revalidatePath(`/a/${slug}`)
  return { ok: true }
}
