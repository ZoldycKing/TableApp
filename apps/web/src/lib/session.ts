import { db, sessions, users, workspaceMembers, workspaces } from '@tableapp/db'
import { and, asc, eq, gt } from 'drizzle-orm'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { ACTIVE_WORKSPACE_COOKIE, MEMBER_SESSION_COOKIE } from './auth'
import { canEdit as canEditRole, type MemberRole } from './roles'

export type { MemberRole }

export type Member = {
  userId: string
  email: string
  name: string | null
  workspaceId: string
  workspaceName: string
  role: MemberRole
}

export type Membership = { workspaceId: string; workspaceName: string; role: MemberRole }

/** Идентификатор текущей сессии: нужен, чтобы отличить её в списке устройств. */
export async function currentSessionId(): Promise<string | null> {
  const store = await cookies()
  return store.get(MEMBER_SESSION_COOKIE)?.value ?? null
}

async function userIdFromSession(): Promise<string | null> {
  const store = await cookies()
  const sessionId = store.get(MEMBER_SESSION_COOKIE)?.value
  if (!sessionId) return null

  const [row] = await db
    .select({ userId: sessions.userId })
    .from(sessions)
    .where(and(eq(sessions.id, sessionId), gt(sessions.expiresAt, new Date())))
    .limit(1)

  return row?.userId ?? null
}

/** Все воркспейсы пользователя: свой и те, куда его пригласили. */
export async function listMemberships(userId: string): Promise<Membership[]> {
  const rows = await db
    .select({
      workspaceId: workspaces.id,
      workspaceName: workspaces.name,
      role: workspaceMembers.role,
      joinedAt: workspaceMembers.createdAt,
    })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(eq(workspaceMembers.userId, userId))
    .orderBy(asc(workspaceMembers.createdAt))

  return rows.map((row) => ({
    workspaceId: row.workspaceId,
    workspaceName: row.workspaceName,
    role: row.role as MemberRole,
  }))
}

/**
 * Участник команды по cookie сессии.
 *
 * После появления приглашений пользователь может состоять в нескольких
 * воркспейсах, поэтому активный хранится отдельной cookie. Если она указывает
 * на воркспейс, где участия больше нет, берётся первый доступный — иначе
 * исключённый участник застрял бы на пустом экране.
 */
export async function currentMember(): Promise<Member | null> {
  const userId = await userIdFromSession()
  if (!userId) return null

  const memberships = await listMemberships(userId)
  if (memberships.length === 0) return null

  const store = await cookies()
  const preferred = store.get(ACTIVE_WORKSPACE_COOKIE)?.value
  const active = memberships.find((item) => item.workspaceId === preferred) ?? memberships[0]!

  const [user] = await db
    .select({ id: users.id, email: users.email, name: users.name })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
  if (!user) return null

  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    workspaceId: active.workspaceId,
    workspaceName: active.workspaceName,
    role: active.role,
  }
}

export async function requireMember(): Promise<Member> {
  const member = await currentMember()
  if (!member) redirect('/login')
  return member
}

/** Зритель может смотреть базу, но любое изменение данных или схемы отклоняется. */
export function canEdit(member: Member): boolean {
  return canEditRole(member.role)
}

export const NOT_EDITOR = 'У вас права только на просмотр'
