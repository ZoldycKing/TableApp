import { apps, businessCustomers, conversationMessages as messages, conversationReads as reads, conversations, db, fields, rows, tables, workspaces } from '@tableapp/db'
import { appSchema, customerWorkflows, dateInstant, fieldTimeZone, normalizeFieldOptions, type App, type Field } from '@tableapp/schema'
import { and, desc, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm'
import { createHash } from 'node:crypto'
import { appAccessFor, currentAppAccess, type AppViewer } from './app-session'
import { canEnter, canOpenScreen, type Visitor } from './app-roles'
import { appReadPolicy } from './app-read-policy'
import { validateAppReferences } from './app-references'
import { legacyAppModules } from './app-modules'
import { conversationResource } from './conversation-resource'
import { conversationAccess } from './conversations'
import { hasRole, moduleForTable, workflowRole } from './module-access'
import { currentMember } from './session'
import { RowWriteError } from './row-mutations'
import type { ConversationInboxPage } from './conversation-types'

const denied = () => new RowWriteError('denied', 'Сообщения недоступны. Войдите в кабинет этого бизнеса.')
const person = (workspace: string, email: string) => `person_${createHash('sha256').update(`${workspace}:${email.trim().toLowerCase()}`).digest('hex')}`
export type InboxInput = { slug?: string; before?: string; unreadOnly?: boolean; appId?: string }

/** Paginate candidates before projection, retaining the cursor even on an empty authorized page. */
export async function listConversationInbox(input: InboxInput = {}, business = false): Promise<ConversationInboxPage> {
  if (!input || typeof input !== 'object' || typeof business !== 'boolean' || input.unreadOnly !== undefined && typeof input.unreadOnly !== 'boolean') throw denied()
  for (const value of [input.slug, input.appId]) if (value !== undefined && (typeof value !== 'string' || !value || value.length > 200)) throw denied()
  if (input.before !== undefined && typeof input.before !== 'string') throw denied()
  const cursor = input.before?.split('~')
  if (input.before !== undefined && (typeof input.before !== 'string' || !cursor || cursor.length !== 2 || !/^\d{1,16}$/.test(cursor[0]!) || !Number.isSafeInteger(Number(cursor[0])) || !cursor[1] || cursor[1].length > 200)) throw denied()
  const member = business ? await currentMember() : null
  let workspaceId: string, actorEmail: string
  if (business) {
    if (!member) throw denied()
    workspaceId = member.workspaceId; actorEmail = member.email
  } else {
    if (!input.slug) throw denied()
    const [root] = await db.select().from(apps).where(eq(apps.slug, input.slug)).limit(1)
    const parsed = appSchema.safeParse(root?.published)
    if (!root || !parsed.success) throw denied()
    const access = await currentAppAccess({ ...parsed.data, id: root.id })
    if (!access.viewer || !access.visitor.authenticated || !canEnter(parsed.data, access.visitor)) throw denied()
    workspaceId = root.workspaceId; actorEmail = access.viewer.email
  }
  const [space] = await db.select({ ownerId: workspaces.ownerId }).from(workspaces).where(eq(workspaces.id, workspaceId))
  const owner = Boolean(business && member?.role === 'owner' && space?.ownerId === member.userId)
  const records = await db.select().from(apps).where(and(eq(apps.workspaceId, workspaceId), input.appId ? eq(apps.id, input.appId) : undefined))
  type Scope = { app: App; tableId: string; emailFieldId: string; moduleId: string; staff: boolean; owner: boolean; visitor: Visitor | null; viewer: AppViewer | null; policy: Awaited<ReturnType<typeof appReadPolicy>> | null }
  const scopes: Scope[] = []
  for (const record of records) {
    const parsed = appSchema.safeParse(record.published)
    if (!parsed.success) continue
    const app = { ...parsed.data, id: record.id, workspaceId, slug: record.slug }
    if (await validateAppReferences(app)) continue
    const access = owner ? null : await appAccessFor(app, actorEmail)
    if (!owner && (!access?.viewer || !access.visitor.authenticated || !canEnter(app, access.visitor))) continue
    const ids = [...new Set(app.screens.filter(screen => screen.type === 'detail').map(screen => screen.tableId))]
    for (const tableId of ids) {
      const resource = conversationResource(app, tableId)
      const module = moduleForTable(app, tableId) ?? legacyAppModules(app).find(module => module.source.type === 'booking' ? app.booking?.tables.visits === tableId : module.source.type === 'customer' && module.source.tableId === tableId)
      if (!resource || !module) continue
      const staff = owner || hasRole(access!.visitor, workflowRole(app, tableId, 'manager')) || hasRole(access!.visitor, workflowRole(app, tableId, 'staff')) || module.source.type === 'booking' && hasRole(access!.visitor, workflowRole(app, tableId, 'master'))
      if (!owner && (business ? !staff : !staff && access!.visitor.roleId !== 'client')) continue
      scopes.push({ app, tableId, emailFieldId: resource.emailFieldId, moduleId: module.id, staff, owner, visitor: access?.visitor ?? null, viewer: access?.viewer ?? null, policy: owner ? null : await appReadPolicy(app, tableId, access!.visitor, access!.viewer!) })
    }
  }
  if (!scopes.length) return { items: [], next: null }
  const actorId = person(workspaceId, actorEmail)
  const lastSequence = sql<number>`coalesce((select max(m.sequence) from conversation_messages m where m.conversation_id=${conversations.id}),0)`
  const unread = sql<number>`(select count(*) from conversation_messages m where m.conversation_id=${conversations.id} and m.deleted_at is null and m.author_id<>${actorId} and m.sequence>coalesce((select r.sequence from conversation_reads r where r.workspace_id=${workspaceId} and r.conversation_id=${conversations.id} and r.actor_id=${actorId}),0))`
  const found = await db.select({ thread: conversations, row: rows, primary: tables.primaryFieldId, customer: businessCustomers.name, email: businessCustomers.email, lastSequence, unread,
    preview: sql<string | null>`(select case when m.deleted_at is not null then 'Сообщение удалено' when m.body='' then 'Документ' else left(m.body,160) end from conversation_messages m where m.conversation_id=${conversations.id} order by m.sequence desc limit 1)`,
    lastAt: sql<string | null>`(select m.created_at::text from conversation_messages m where m.conversation_id=${conversations.id} order by m.sequence desc limit 1)` })
    .from(conversations).innerJoin(rows, and(eq(rows.id, conversations.rowId), eq(rows.tableId, conversations.tableId)))
    .innerJoin(tables, and(eq(tables.id, conversations.tableId), eq(tables.workspaceId, workspaceId)))
    .innerJoin(businessCustomers, and(eq(businessCustomers.id, conversations.customerId), eq(businessCustomers.workspaceId, workspaceId)))
    .where(and(eq(conversations.workspaceId, workspaceId), isNull(rows.deletedAt), inArray(conversations.tableId, scopes.map(scope => scope.tableId)),
      input.unreadOnly ? sql`${unread}>0` : undefined,
      cursor ? or(lt(lastSequence, Number(cursor[0])), and(eq(lastSequence, Number(cursor[0])), lt(conversations.id, cursor[1]!))) : undefined))
    .orderBy(desc(lastSequence), desc(conversations.id)).limit(51)
  const page = found.slice(0, 50), items: ConversationInboxPage['items'] = []
  const titles = new Map<string, string>()
  const servicePolicies = new Map<string, Awaited<ReturnType<typeof appReadPolicy>>>()
  for (const item of page) {
    const data = item.row.data as Record<string, unknown>
    const scope = scopes.filter(scope => scope.tableId === item.thread.tableId && scope.moduleId === item.thread.moduleId)
      .sort((a, b) => Number(b.app.slug === input.slug) - Number(a.app.slug === input.slug))
      .find(scope => String(data[scope.emailFieldId] ?? '').trim().toLowerCase() === item.email && (scope.owner || scope.policy!.canRead(data, item.row) && (scope.staff || item.email === actorEmail.trim().toLowerCase())))
    if (!scope) continue
    const projected = scope.policy ? scope.policy.project(data, item.row) : data
    let title = String(projected[item.primary ?? ''] ?? 'Обращение').slice(0, 160)
    const booking = scope.app.booking
    if (booking?.tables.visits === item.thread.tableId) {
      const ids = projected[booking.visit.service], serviceId = Array.isArray(ids) && typeof ids[0] === 'string' ? ids[0] : ''
      const key = `${scope.app.id}:${serviceId}`
      if (!titles.has(key)) {
        const [service] = serviceId ? await db.select().from(rows).where(and(eq(rows.id, serviceId), eq(rows.tableId, booking.tables.services), isNull(rows.deletedAt))) : []
        let serviceData = service?.data as Record<string, unknown> | undefined
        if (service && !scope.owner) {
          if (!servicePolicies.has(scope.app.id)) servicePolicies.set(scope.app.id, await appReadPolicy(scope.app, booking.tables.services, scope.visitor!, scope.viewer!))
          const policy = servicePolicies.get(scope.app.id)!
          serviceData = policy.canRead(serviceData!, service) ? policy.project(serviceData!, service) : undefined
        }
        titles.set(key, String(serviceData?.[booking.service.name] ?? 'Запись').slice(0, 120))
      }
      const [start] = await db.select().from(fields).where(and(eq(fields.id, booking.visit.start), eq(fields.tableId, item.thread.tableId)))
      const zone = start ? fieldTimeZone({ type: 'datetime', options: normalizeFieldOptions('datetime', start.options) as Field['options'] }) : 'UTC'
      const instant = dateInstant(projected[booking.visit.start])
      title = `${titles.get(key)}${instant ? ` · ${new Date(instant).toLocaleString('ru-RU', { timeZone: zone, day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}` : ''}`
    }
    const detail = scope.app.screens.find(screen => screen.type === 'detail' && screen.tableId === item.thread.tableId && (scope.owner || canOpenScreen(screen, scope.visitor!)))!
    if (!detail) continue
    const nameField = booking?.tables.visits === item.thread.tableId ? booking.visit.client : customerWorkflows(scope.app).find(workflow => workflow.tableId === item.thread.tableId)?.profile?.nameFieldId
    const recordName = nameField && typeof projected[nameField] === 'string' ? String(projected[nameField]).trim().slice(0, 80) : ''
    items.push({ id: item.thread.id, slug: scope.app.slug, tableId: item.thread.tableId, rowId: item.thread.rowId, title,
      customer: item.customer || recordName || (scope.staff ? 'Клиент' : 'Вы'), appName: scope.app.name, detailScreenId: detail.id,
      preview: item.preview ?? 'Сообщений пока нет', lastAt: item.lastAt ? new Date(item.lastAt).toISOString() : item.thread.createdAt.toISOString(), unread: Number(item.unread), closed: Boolean(item.thread.closedAt) })
  }
  const last = page.at(-1)
  return { items, next: found.length > 50 && last ? `${last.lastSequence}~${last.thread.id}` : null }
}

/** Mark only the messages actually delivered to the screen; concurrent new replies stay unread. */
export async function markConversationRead(slug: string, tableId: string, rowId: string, sequence: number, business = false) {
  if (!Number.isSafeInteger(sequence) || sequence <= 0) throw denied()
  const access = await conversationAccess(slug, tableId, rowId, db, business)
  if (!access.customerId) throw denied()
  const [thread] = await db.select().from(conversations).where(and(eq(conversations.workspaceId, access.app.workspaceId), eq(conversations.tableId, tableId), eq(conversations.rowId, rowId), eq(conversations.customerId, access.customerId), eq(conversations.moduleId, access.module.id)))
  if (!thread) throw denied()
  const [message] = await db.select({ id: messages.id }).from(messages).where(and(eq(messages.conversationId, thread.id), eq(messages.sequence, sequence)))
  if (!message) throw denied()
  await db.insert(reads).values({ workspaceId: access.app.workspaceId, conversationId: thread.id, actorId: access.actorId, sequence })
    .onConflictDoUpdate({ target: [reads.workspaceId, reads.conversationId, reads.actorId], set: { sequence: sql`greatest(${reads.sequence},${sequence})` } })
}
