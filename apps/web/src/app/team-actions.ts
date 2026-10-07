'use server'

import { authTokens, db, users, workspaceMembers } from '@tableapp/db'
import { newId } from '@tableapp/schema'
import { and, eq } from 'drizzle-orm'
import { cookies, headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import {
  ACTIVE_WORKSPACE_COOKIE,
  TOKEN_TTL_MS,
  createToken,
  expiresAt,
  isValidEmail,
  normalizeEmail,
} from '@/lib/auth'
import { sendMagicLink } from '@/lib/mailer'
import { canAdminister, isKnownRole, type MemberRole } from '@/lib/roles'
import { currentMember, listMemberships } from '@/lib/session'
import type { ActionResult } from './actions'

const NOT_OWNER = 'Управлять командой может только владелец'

async function requireOwner() {
  const member = await currentMember()
  if (!member) return { ok: false as const, error: 'Нужно войти в систему' }
  if (!canAdminister(member.role)) return { ok: false as const, error: NOT_OWNER }
  return { ok: true as const, member }
}

async function ownerCount(workspaceId: string): Promise<number> {
  const rows = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(eq(workspaceMembers.workspaceId, workspaceId))
  return rows.filter((row) => row.role === 'owner').length
}

export async function inviteMemberAction(
  rawEmail: string,
  role: string,
): Promise<{ ok: true; delivered: boolean; hint: string | null } | { ok: false; error: string }> {
  const auth = await requireOwner()
  if (!auth.ok) return auth

  const email = normalizeEmail(rawEmail)
  if (!isValidEmail(email)) return { ok: false, error: 'Введите корректный адрес почты' }
  if (!isKnownRole(role)) return { ok: false, error: 'Неизвестная роль' }

  // Пользователь может ещё не существовать: приглашение заводит запись,
  // но воркспейса ему не создаёт — он придёт в чужой.
  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1)
  const userId = existing?.id ?? newId('user')
  if (!existing) {
    await db.insert(users).values({ id: userId, email, name: null })
  }

  const [membership] = await db
    .select()
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, auth.member.workspaceId),
        eq(workspaceMembers.userId, userId),
      ),
    )
    .limit(1)

  if (!membership) {
    await db.insert(workspaceMembers).values({
      workspaceId: auth.member.workspaceId,
      userId,
      role: role as MemberRole,
      invitedEmail: email,
      acceptedAt: null,
    })
  }

  const { token, hash } = createToken()
  await db.insert(authTokens).values({
    id: newId('token'),
    email,
    tokenHash: hash,
    purpose: 'workspace_login',
    appId: null,
    expiresAt: expiresAt(TOKEN_TTL_MS),
  })

  const host = (await headers()).get('host') ?? 'localhost:3000'
  const protocol = host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https'
  const origin = process.env.APP_URL?.replace(/\/$/, '') ?? `${protocol}://${host}`
  const result = await sendMagicLink({
    kind: 'invite',
    to: email,
    subject: `Приглашение в «${auth.member.workspaceName}»`,
    appName: auth.member.workspaceName,
    invitedBy: auth.member.name ?? auth.member.email,
    link: `${origin}/auth?token=${token}&w=${auth.member.workspaceId}`,
  })

  revalidatePath('/team')
  return { ok: true, delivered: result.delivered, hint: result.delivered ? null : result.reason }
}

export async function changeRoleAction(userId: string, role: string): Promise<ActionResult> {
  const auth = await requireOwner()
  if (!auth.ok) return auth
  if (!isKnownRole(role)) return { ok: false, error: 'Неизвестная роль' }

  const [current] = await db
    .select()
    .from(workspaceMembers)
    .where(
      and(eq(workspaceMembers.workspaceId, auth.member.workspaceId), eq(workspaceMembers.userId, userId)),
    )
    .limit(1)
  if (!current) return { ok: false, error: 'Участник не найден' }

  // Воркспейс без владельца становится неуправляемым: роли никто не раздаст.
  if (current.role === 'owner' && role !== 'owner' && (await ownerCount(auth.member.workspaceId)) <= 1) {
    return { ok: false, error: 'В команде должен остаться хотя бы один владелец' }
  }

  await db
    .update(workspaceMembers)
    .set({ role })
    .where(
      and(eq(workspaceMembers.workspaceId, auth.member.workspaceId), eq(workspaceMembers.userId, userId)),
    )

  revalidatePath('/team')
  return { ok: true }
}

export async function removeMemberAction(userId: string): Promise<ActionResult> {
  const auth = await requireOwner()
  if (!auth.ok) return auth

  const [current] = await db
    .select()
    .from(workspaceMembers)
    .where(
      and(eq(workspaceMembers.workspaceId, auth.member.workspaceId), eq(workspaceMembers.userId, userId)),
    )
    .limit(1)
  if (!current) return { ok: false, error: 'Участник не найден' }

  if (current.role === 'owner' && (await ownerCount(auth.member.workspaceId)) <= 1) {
    return { ok: false, error: 'Нельзя исключить последнего владельца' }
  }

  await db
    .delete(workspaceMembers)
    .where(
      and(eq(workspaceMembers.workspaceId, auth.member.workspaceId), eq(workspaceMembers.userId, userId)),
    )

  revalidatePath('/team')
  return { ok: true }
}

/** Переключение активного воркспейса: право проверяется по списку участий. */
export async function switchWorkspaceAction(workspaceId: string): Promise<ActionResult> {
  const member = await currentMember()
  if (!member) return { ok: false, error: 'Нужно войти в систему' }

  const memberships = await listMemberships(member.userId)
  if (!memberships.some((item) => item.workspaceId === workspaceId)) {
    return { ok: false, error: 'Вы не состоите в этом воркспейсе' }
  }

  const store = await cookies()
  store.set(ACTIVE_WORKSPACE_COOKIE, workspaceId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  })

  revalidatePath('/', 'layout')
  return { ok: true }
}
