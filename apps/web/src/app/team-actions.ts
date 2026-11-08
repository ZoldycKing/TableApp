'use server'

import { authTokens, db, users, workspaceMembers,tables } from '@tableapp/db'
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
import { currentAccount, currentMember, listMemberships } from '@/lib/session'
import type { ActionResult } from './actions'
import { validateTableAccess } from '@/lib/validate-table-access'
import { publishTable } from '@/lib/live'

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
  tableAccess?:unknown,
): Promise<{ ok: true; delivered: boolean; hint: string | null } | { ok: false; error: string }> {
  const auth = await requireOwner()
  if (!auth.ok) return auth

  const email = normalizeEmail(rawEmail)
  if (!isValidEmail(email)) return { ok: false, error: 'Введите корректный адрес почты' }
  if (!isKnownRole(role)) return { ok: false, error: 'Неизвестная роль' }
  const scope=await validateTableAccess(auth.member.workspaceId,role,tableAccess)
  if(!scope.ok)return scope

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
      tableAccess:scope.access,
      invitedEmail: email,
      acceptedAt: null,
    })
  }else if(scope.access!==null)return {ok:false,error:'Участник уже в команде. Измените доступ в его настройках.'}

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

export async function setMemberTableAccessAction(userId:string,input:unknown):Promise<ActionResult>{
  const auth=await requireOwner()
  if(!auth.ok)return auth
  if(typeof userId!=='string'||!userId||userId.length>128)return {ok:false,error:'Участник не найден'}
  const [target]=await db.select().from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId,auth.member.workspaceId),eq(workspaceMembers.userId,userId)))
  if(!target)return {ok:false,error:'Участник не найден'}
  if(target.role==='owner')return {ok:false,error:'Владельцу доступны все таблицы'}
  const scope=await validateTableAccess(auth.member.workspaceId,target.role,input)
  if(!scope.ok)return scope
  const saved=await db.transaction(async tx=>{
    const [owner]=await tx.select().from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId,auth.member.workspaceId),eq(workspaceMembers.userId,auth.member.userId))).for('share')
    if(owner?.role!=='owner')return false
    const [current]=await tx.select().from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId,auth.member.workspaceId),eq(workspaceMembers.userId,userId))).for('update')
    if(!current||current.role!==target.role||current.role==='owner')return false
    await tx.update(workspaceMembers).set({tableAccess:scope.access}).where(and(eq(workspaceMembers.workspaceId,auth.member.workspaceId),eq(workspaceMembers.userId,userId)))
    return true
  })
  if(!saved)return {ok:false,error:'Роль участника изменилась. Откройте настройки заново.'}
  const affected=await db.select({id:tables.id}).from(tables).where(eq(tables.workspaceId,auth.member.workspaceId))
  for(const table of affected)publishTable(table.id,'structure')
  revalidatePath('/','layout')
  return {ok:true}
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
    .set({ role,...(role==='owner'?{tableAccess:null}:{}) })
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
  const member = await currentMember() ?? await currentAccount()
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
