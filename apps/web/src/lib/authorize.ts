import { apps, db, tables, views } from '@tableapp/db'
import { eq } from 'drizzle-orm'
import { canEdit, currentMember, NOT_EDITOR, type Member } from './session'

/**
 * Проверки доступа для серверных действий.
 *
 * Идентификаторы таблиц, представлений и приложений приходят с клиента,
 * поэтому каждое действие обязано убедиться, что объект принадлежит воркспейсу
 * вошедшего участника. Без этого знание чужого id даёт доступ к чужим данным.
 */

export type Allowed = { ok: true; member: Member }
export type Denied = { ok: false; error: string }
export type Authorization = Allowed | Denied

const NO_SESSION = 'Нужно войти в систему'
const NOT_FOUND = 'Объект не найден или принадлежит другому воркспейсу'

async function base(write: boolean): Promise<Authorization> {
  const member = await currentMember()
  if (!member) return { ok: false, error: NO_SESSION }
  if (write && !canEdit(member)) return { ok: false, error: NOT_EDITOR }
  return { ok: true, member }
}

export async function authorizeWorkspace(write = true): Promise<Authorization> {
  return base(write)
}

export async function authorizeTable(tableId: string, write = true): Promise<Authorization> {
  const auth = await base(write)
  if (!auth.ok) return auth

  const [table] = await db
    .select({ workspaceId: tables.workspaceId })
    .from(tables)
    .where(eq(tables.id, tableId))
    .limit(1)

  if (!table || table.workspaceId !== auth.member.workspaceId) {
    return { ok: false, error: NOT_FOUND }
  }
  return auth
}

export async function authorizeView(viewId: string, write = true): Promise<Authorization> {
  const auth = await base(write)
  if (!auth.ok) return auth

  const [row] = await db
    .select({ workspaceId: tables.workspaceId })
    .from(views)
    .innerJoin(tables, eq(tables.id, views.tableId))
    .where(eq(views.id, viewId))
    .limit(1)

  if (!row || row.workspaceId !== auth.member.workspaceId) {
    return { ok: false, error: NOT_FOUND }
  }
  return auth
}

export async function authorizeApp(appId: string, write = true): Promise<Authorization> {
  const auth = await base(write)
  if (!auth.ok) return auth

  const [app] = await db
    .select({ workspaceId: apps.workspaceId })
    .from(apps)
    .where(eq(apps.id, appId))
    .limit(1)

  if (!app || app.workspaceId !== auth.member.workspaceId) {
    return { ok: false, error: NOT_FOUND }
  }
  return auth
}
