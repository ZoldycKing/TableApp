'use server'

import { appUsers, db, rowChanges, users } from '@tableapp/db'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { authorizeTable } from '@/lib/authorize'
import { loadTable } from '@/lib/queries'
import { projectMemberData } from '@/lib/table-permissions'

export type HistoryEntry = {
  id: string
  rowId: string
  op: 'create' | 'update' | 'delete'
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
  actor: string
  createdAt: string
}

const LIMIT = 100

/**
 * История правок таблицы. Доступ проверяется тем же путём, что и сами данные:
 * журнал показывает старые значения ячеек, поэтому прав на него нужно
 * ровно столько же, сколько на таблицу.
 */
export async function loadTableHistoryAction(
  tableId: string,
  rowId?: string,
): Promise<{ ok: true; entries: HistoryEntry[] } | { ok: false; error: string }> {
  const auth = await authorizeTable(tableId,false)
  if (!auth.ok) return { ok: false, error: auth.error }
  const table=await loadTable(tableId,auth.member.workspaceId,auth.member)
  if(!table)return {ok:false,error:'Таблица недоступна'}

  const rows = await db
    .select()
    .from(rowChanges)
    .where(rowId ? and(eq(rowChanges.tableId, tableId), eq(rowChanges.rowId, rowId)) : eq(rowChanges.tableId, tableId))
    .orderBy(desc(rowChanges.createdAt))
    .limit(LIMIT)

  const actor = await actorNames(rows.map((row) => row.actorId).filter((id): id is string => Boolean(id)))

  return {
    ok: true,
    entries: rows.map((row) => ({
      id: row.id,
      rowId: row.rowId,
      op: row.op as HistoryEntry['op'],
      before: row.before?projectMemberData(row.before as Record<string,unknown>,table.fields):null,
      after: row.after?projectMemberData(row.after as Record<string,unknown>,table.fields):null,
      // Автор мог быть удалён вместе с доступом — тогда честнее сказать,
      // что это был сотрудник, чем показать пустоту.
      actor: row.actorId
        ? actor.get(row.actorId) ?? (row.actorKind === 'app_user' ? 'Пользователь приложения' : 'Участник команды')
        : 'Неизвестно',
      createdAt: row.createdAt.toISOString(),
    })),
  }
}

/** Имена авторов из обоих контуров: команда и пользователи приложений. */
async function actorNames(ids: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>()
  if (ids.length === 0) return names

  const members = await db
    .select({ id: users.id, email: users.email, name: users.name })
    .from(users)
    .where(inArray(users.id, ids))
  for (const member of members) names.set(member.id, member.name ?? member.email)

  const visitors = await db
    .select({ id: appUsers.id, email: appUsers.email, name: appUsers.name })
    .from(appUsers)
    .where(inArray(appUsers.id, ids))
  for (const visitor of visitors) names.set(visitor.id, visitor.name ?? visitor.email)

  return names
}
