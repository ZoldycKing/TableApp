'use server'

import { db, views as viewsTable } from '@tableapp/db'
import type { ViewType } from '@tableapp/schema'
import { VIEW_CONFIG_SCHEMA, defaultViewConfig, newId, positionBetween } from '@tableapp/schema'
import { and, asc, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { publishTable } from '@/lib/live'
import { authorizeTable } from '@/lib/authorize'
import { lockRowUsage } from '@/lib/row-mutations'
import { modularViewDeletionError } from '@/lib/module-resource-guard'
import type { ActionResult } from './actions'

const VIEW_TYPE_NAMES: Record<ViewType, string> = {
  grid: 'Таблица',
  kanban: 'Канбан',
  calendar: 'Календарь',
  gallery: 'Галерея',
}

export async function createViewAction(
  tableId: string,
  type: ViewType,
  name?: string,
): Promise<{ ok: true; viewId: string } | { ok: false; error: string }> {
  const auth = await authorizeTable(tableId)
  if (!auth.ok) return auth

  const existing = await db
    .select({ position: viewsTable.position })
    .from(viewsTable)
    .where(eq(viewsTable.tableId, tableId))
    .orderBy(asc(viewsTable.position))

  const last = existing[existing.length - 1]?.position ?? null
  const id = newId('view')

  await db.insert(viewsTable).values({
    id,
    tableId,
    name: name?.trim() || VIEW_TYPE_NAMES[type],
    type,
    config: defaultViewConfig(type, newId('filter')),
    position: positionBetween(last, null),
  })

  revalidatePath('/t/[tableId]', 'page')
  publishTable(tableId, 'structure')
  return { ok: true, viewId: id }
}

/**
 * Конфигурация приходит с клиента и разбирается схемой своего типа:
 * в базу не должно попасть представление, которое рантайм не сможет прочитать.
 */
export async function updateViewConfigAction(
  tableId: string,
  viewId: string,
  type: ViewType,
  config: unknown,
): Promise<ActionResult> {
  const auth = await authorizeTable(tableId)
  if (!auth.ok) return auth

  const parsed = VIEW_CONFIG_SCHEMA[type].safeParse(config)
  if (!parsed.success) {
    return { ok: false, error: 'Настройки представления не прошли проверку' }
  }

  await db
    .update(viewsTable)
    .set({ config: parsed.data as Record<string, unknown>, updatedAt: new Date() })
    .where(and(eq(viewsTable.id, viewId), eq(viewsTable.tableId, tableId)))

  revalidatePath('/t/[tableId]', 'page')
  publishTable(tableId, 'structure')
  return { ok: true }
}

export async function renameViewAction(
  tableId: string,
  viewId: string,
  name: string,
): Promise<ActionResult> {
  const auth = await authorizeTable(tableId)
  if (!auth.ok) return auth

  const trimmed = name.trim()
  if (trimmed === '') return { ok: false, error: 'Название представления не может быть пустым' }

  await db
    .update(viewsTable)
    .set({ name: trimmed, updatedAt: new Date() })
    .where(and(eq(viewsTable.id, viewId), eq(viewsTable.tableId, tableId)))

  revalidatePath('/t/[tableId]', 'page')
  publishTable(tableId, 'structure')
  return { ok: true }
}

export async function deleteViewAction(tableId: string, viewId: string): Promise<ActionResult> {
  const auth = await authorizeTable(tableId)
  if (!auth.ok) return auth

  const remaining = await db
    .select({ id: viewsTable.id })
    .from(viewsTable)
    .where(eq(viewsTable.tableId, tableId))

  // Таблица без представлений нечитаема — последнее удалить нельзя.
  if (remaining.length <= 1) return { ok: false, error: 'Нельзя удалить единственное представление' }

  const error = await db.transaction(async tx => {
    await lockRowUsage({ tx, workspaceId: auth.member.workspaceId, changed: new Set() })
    const error = await modularViewDeletionError(tx, auth.member.workspaceId, viewId)
    if (error) return error
    await tx.delete(viewsTable).where(and(eq(viewsTable.id, viewId), eq(viewsTable.tableId, tableId)))
  })
  if (error) return { ok: false, error }

  revalidatePath('/t/[tableId]', 'page')
  publishTable(tableId, 'structure')
  return { ok: true }
}
