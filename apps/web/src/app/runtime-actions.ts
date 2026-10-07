'use server'

import { db, rowChanges, rows as rowsTable } from '@tableapp/db'
import { stripDerived } from '@tableapp/formula'
import type { App, Field } from '@tableapp/schema'
import { newId, parseCellValue } from '@tableapp/schema'
import { and, eq, inArray } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { currentAppAccess, type AppViewer } from '@/lib/app-session'
import { permits, writableFields, type AppAction, type Visitor } from '@/lib/app-roles'
import { loadApp } from '@/lib/app-write-access'
import { linkRowAttachments } from '@/lib/attachments'
import { explainToCustomer } from '@tableapp/schema'
import { isPlanLimitError, noteRemoved, workspaceOfTable } from '@/lib/limits'
import { dependentRows } from '@/lib/production-cascade'
import { insertRow, loadTableFields } from '@/lib/row-write'
import { canAccessRow, dropOwnerChange, rulesFor } from '@/lib/row-access'
import type { ActionResult } from './actions'

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

  const { visitor, viewer } = await currentAppAccess(app)
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

  try {
    await insertRow(app, tableId, clean, { viewer, visitor, ip: null }, fields)
  } catch (error) {
    /*
     * Про чужой тариф человеку не говорят: это не его дела и не его деньги.
     * Он видит то же, что увидел бы при поломке, — и это честнее, чем
     * объяснять ему, что у владельца кончилось место.
     */
    if (isPlanLimitError(error)) return { ok: false, error: explainToCustomer() }
    throw error
  }

  revalidatePath(`/a/${slug}`)
  return { ok: true }
}

export async function appUpdateRowAction(
  slug: string,
  tableId: string,
  rowId: string,
  values: Record<string, unknown>,
): Promise<ActionResult> {
  const access = await allow(slug, tableId, 'update')
  if (!access.ok) return access
  const { app, viewer, visitor } = access

  const [current] = await db
    .select()
    .from(rowsTable)
    .where(and(eq(rowsTable.id, rowId), eq(rowsTable.tableId, tableId)))
    .limit(1)
  if (!current) return { ok: false, error: 'Запись не найдена' }

  const before = current.data as Record<string, unknown>
  const rules = rulesFor(app, tableId, visitor)
  if (!canAccessRow(rules, viewer, before)) {
    return { ok: false, error: 'Эта запись доступна только своему владельцу' }
  }

  const fields = await loadTableFields(tableId)
  const allowed = writableFields(app, tableId, visitor, 'update')
  const merged = { ...before, ...dropOwnerChange(rules, sanitize(values, fields, allowed)) }

  await db.transaction(async (tx) => {
    await tx
      .update(rowsTable)
      .set({ data: stripDerived(merged, fields), updatedAt: new Date(), sample: false })
      .where(eq(rowsTable.id, rowId))
    await tx.insert(rowChanges).values({
      id: newId('change'), tableId, rowId, op: 'update', before, after: merged,
      actorId: viewer?.id ?? null, actorKind: 'app_user',
    })
  })

  await linkRowAttachments(tableId, rowId, fields, merged)

  revalidatePath(`/a/${slug}`)
  return { ok: true }
}

export async function appDeleteRowAction(
  slug: string,
  tableId: string,
  rowId: string,
): Promise<ActionResult> {
  const access = await allow(slug, tableId, 'delete')
  if (!access.ok) return access
  const { app, viewer, visitor } = access

  const [current] = await db
    .select()
    .from(rowsTable)
    .where(and(eq(rowsTable.id, rowId), eq(rowsTable.tableId, tableId)))
    .limit(1)
  if (!current) return { ok: false, error: 'Запись не найдена' }

  if (!canAccessRow(rulesFor(app, tableId, visitor), viewer, current.data as Record<string, unknown>)) {
    return { ok: false, error: 'Эта запись доступна только своему владельцу' }
  }

  /*
   * Зависимые строки: списания материалов уходят вместе со своим выпуском.
   * Тот же путь, что и при удалении из таблицы, — двери разные, учёт один.
   */
  const dependent = await dependentRows(tableId, rowId)

  await db.transaction(async (tx) => {
    await tx.update(rowsTable).set({ deletedAt: new Date() }).where(eq(rowsTable.id, rowId))
    if (dependent) {
      await tx
        .update(rowsTable)
        .set({ deletedAt: new Date() })
        .where(inArray(rowsTable.id, dependent.rows.map((row) => row.id)))
    }
    const owner = await workspaceOfTable(tableId)
    if (owner) await noteRemoved(owner, 'rows', 1 + (dependent?.rows.length ?? 0), tx)
    await tx.insert(rowChanges).values([
      {
        id: newId('change'), tableId, rowId, op: 'delete' as const,
        before: current.data as Record<string, unknown>,
        actorId: viewer?.id ?? null, actorKind: 'app_user' as const,
      },
      ...(dependent?.rows ?? []).map((row) => ({
        id: newId('change'), tableId: dependent!.tableId, rowId: row.id, op: 'delete' as const,
        before: row.data,
        actorId: viewer?.id ?? null, actorKind: 'app_user' as const,
      })),
    ])
  })

  revalidatePath(`/a/${slug}`)
  return { ok: true }
}
