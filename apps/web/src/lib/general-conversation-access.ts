import { appUsers, businessCustomers, db, generalMessageOperators, users, workspaceMembers } from '@tableapp/db'
import type { App } from '@tableapp/schema'
import { and, asc, eq } from 'drizzle-orm'
import { createHash } from 'node:crypto'
import { currentStaffEmail } from './app-session'
import { defaultRole, visitorFor } from './app-roles'
import { normalizeEmail, isValidEmail } from './auth'
import { currentMember } from './session'
import { RowWriteError } from './row-mutations'
import type { Transaction } from './db-transaction'
import { GENERAL_CONVERSATION_SELF } from './conversation-types'
import { generalChatAvailableApp } from './general-conversation-config'

type Runner = typeof db | Transaction
const denied = () => new RowWriteError('denied', 'Переписка недоступна')
export const conversationPerson = (workspaceId: string, email: string) => `person_${createHash('sha256').update(`${workspaceId}:${normalizeEmail(email)}`).digest('hex')}`

/** A live verified identity and an explicit grant; module roles never imply this permission. */
export async function generalOperator(workspaceId: string, business: boolean, runner: Runner = db) {
  const member = business ? await currentMember() : null
  if (business && (!member || member.workspaceId !== workspaceId)) return null
  const rawEmail = business ? member!.email : await currentStaffEmail()
  if (!rawEmail || !isValidEmail(rawEmail)) return null
  const email = normalizeEmail(rawEmail)
  const [membership] = await runner.select({ userId: users.id, email: users.email, name: users.name, role: workspaceMembers.role })
    .from(workspaceMembers).innerJoin(users, eq(users.id, workspaceMembers.userId))
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), business ? eq(users.id, member!.userId) : eq(users.email, email))).limit(1)
  if (!membership || normalizeEmail(membership.email) !== email || !['owner', 'editor'].includes(membership.role)) return null
  if (membership.role !== 'owner') {
    const [grant] = await runner.select({ id: generalMessageOperators.userId }).from(generalMessageOperators)
      .where(and(eq(generalMessageOperators.workspaceId, workspaceId), eq(generalMessageOperators.userId, membership.userId))).limit(1)
    if (!grant) return null
  }
  return { ...membership, owner: membership.role === 'owner' }
}

export async function generalConversationAccess(app: App, target: string, runner: Runner = db, business = false) {
  if (!generalChatAvailableApp(app)) throw denied()
  const operator = await generalOperator(app.workspaceId, business, runner)
  if (operator) {
    if (target === GENERAL_CONVERSATION_SELF) throw denied()
    const [customer] = await runner.select().from(businessCustomers)
      .where(and(eq(businessCustomers.workspaceId, app.workspaceId), eq(businessCustomers.id, target))).limit(1)
    if (!customer) throw denied()
    return { kind: 'general' as const, app, parent: null, module: null, readableData: {}, access: null,
      customerId: customer.id as string | null, email: customer.email, staff: true, manager: true, owner: operator.owner,
      actorId: conversationPerson(app.workspaceId, operator.email), uploadId: operator.userId,
      authorKind: operator.owner ? 'business' : 'staff', authorName: (operator.name ?? (operator.owner ? 'Владелец бизнеса' : 'Сотрудник')).slice(0, 80) }
  }
  if (business) throw denied()
  const rawEmail = await currentStaffEmail()
  if (!rawEmail || !isValidEmail(rawEmail)) throw denied()
  const email = normalizeEmail(rawEmail)
  const declared = visitorFor(app, email), clientRole = defaultRole(app)
  const [appUser] = await runner.select({ roleId: appUsers.roleId }).from(appUsers)
    .where(and(eq(appUsers.appId, app.id), eq(appUsers.email, email))).limit(1)
  // A worker without a general-message grant cannot enter through the client circuit.
  if ((declared.roleIds ?? (declared.roleId ? [declared.roleId] : [])).some(role => role !== clientRole) || appUser?.roleId && appUser.roleId !== clientRole) throw denied()
  const [customer] = await runner.select().from(businessCustomers)
    .where(and(eq(businessCustomers.workspaceId, app.workspaceId), eq(businessCustomers.email, email))).limit(1)
  if (target !== GENERAL_CONVERSATION_SELF && (!customer || target !== customer.id)) throw denied()
  return { kind: 'general' as const, app, parent: null, module: null, readableData: {}, access: null,
    customerId: customer?.id ?? null, email, staff: false, manager: false, owner: false,
    actorId: conversationPerson(app.workspaceId, email), uploadId: conversationPerson(app.workspaceId, email),
    authorKind: 'client', authorName: (customer?.name ?? 'Клиент').slice(0, 80) }
}

async function requireGeneralOwner(runner: Runner = db) {
  const member = await currentMember()
  if (!member) throw denied()
  const operator = await generalOperator(member.workspaceId, true, runner)
  if (!operator?.owner) throw denied()
  return member
}

export async function getGeneralMessageAccess() {
  const member = await requireGeneralOwner()
  const candidates = await db.select({ userId: users.id, name: users.name, email: users.email }).from(workspaceMembers)
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .where(and(eq(workspaceMembers.workspaceId, member.workspaceId), eq(workspaceMembers.role, 'editor')))
    .orderBy(asc(workspaceMembers.createdAt), asc(users.id))
  const grants = await db.select({ userId: generalMessageOperators.userId }).from(generalMessageOperators).where(eq(generalMessageOperators.workspaceId, member.workspaceId))
  const allowed = new Set(grants.map(grant => grant.userId))
  return { operators: candidates.map(candidate => ({ ...candidate, allowed: allowed.has(candidate.userId) })) }
}

export async function setGeneralMessageAccess(userId: string, allowed: boolean) {
  if (typeof userId !== 'string' || !userId || userId.length > 200 || typeof allowed !== 'boolean') throw denied()
  const member = await requireGeneralOwner()
  await db.transaction(async tx => {
    await requireGeneralOwner(tx)
    const [target] = await tx.select({ role: workspaceMembers.role }).from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, member.workspaceId), eq(workspaceMembers.userId, userId))).for('update')
    if (!target || target.role !== 'editor') throw denied()
    if (allowed) await tx.insert(generalMessageOperators).values({ workspaceId: member.workspaceId, userId }).onConflictDoNothing()
    else await tx.delete(generalMessageOperators).where(and(eq(generalMessageOperators.workspaceId, member.workspaceId), eq(generalMessageOperators.userId, userId)))
  })
  return {}
}
