import { apps, businessCustomers, conversationMessages as messages, conversationReads as reads, conversations, db, fields, rows, tables, workspaces } from '@tableapp/db'
import { appSchema, customerWorkflows, dateInstant, fieldTimeZone, normalizeFieldOptions, type App, type Field } from '@tableapp/schema'
import { readAppDefinition } from '@tableapp/schema/app-definition'
import { projectAppV2Row, readableAppV2Fields, type AppV2 } from '@tableapp/schema/app-v2'
import { and, desc, eq, inArray, isNull, isNotNull, lt, or, sql } from 'drizzle-orm'
import { createHash } from 'node:crypto'
import { appAccessFor, currentAppAccess, currentStaffEmail, type AppViewer } from './app-session'
import { canEnter, canOpenScreen, type Visitor } from './app-roles'
import { appReadPolicy } from './app-read-policy'
import { validateAppReferences } from './app-references'
import { legacyAppModules } from './app-modules'
import { conversationResource } from './conversation-resource'
import { conversationDetailScreenV2, conversationManagerV2, conversationResourceV2, conversationStaffV2 } from './conversation-resource-v2'
import { conversationAccess } from './conversations'
import { hasRole, moduleForTable, workflowRole } from './module-access'
import { currentMember } from './session'
import { RowWriteError } from './row-mutations'
import { customerHistoryContext } from './customer-history'
import type { ConversationInboxPage } from './conversation-types'
import { GENERAL_CONVERSATION_TABLE, GENERAL_CONVERSATION_SELF } from './conversation-types'
import { generalChatAvailableApp } from './general-conversation-config'
import { generalConversationAccess, generalOperator } from './general-conversation-access'
import { publishedV2Actor, publishedV2Roles } from './builder-v2-published'

const denied = () => new RowWriteError('denied', 'Сообщения недоступны. Войдите в кабинет этого бизнеса.')
const person = (workspace: string, email: string) => `person_${createHash('sha256').update(`${workspace}:${email.trim().toLowerCase()}`).digest('hex')}`
export type InboxInput = { slug?: string; before?: string; unreadOnly?: boolean; appId?: string; customer?: { tableId: string; rowId: string } }

/** Paginate candidates before projection, retaining the cursor even on an empty authorized page. */
export async function listConversationInbox(input: InboxInput = {}, business = false): Promise<ConversationInboxPage> {
  if (!input || typeof input !== 'object' || typeof business !== 'boolean' || input.unreadOnly !== undefined && typeof input.unreadOnly !== 'boolean') throw denied()
  for (const value of [input.slug, input.appId]) if (value !== undefined && (typeof value !== 'string' || !value || value.length > 200)) throw denied()
  if (input.before !== undefined && typeof input.before !== 'string') throw denied()
  const cursor = input.before?.split('~')
  if (input.before !== undefined && (typeof input.before !== 'string' || !cursor || cursor.length !== 2 || !/^\d{1,16}$/.test(cursor[0]!) || !Number.isSafeInteger(Number(cursor[0])) || !cursor[1] || cursor[1].length > 200)) throw denied()
  const member = business ? await currentMember() : null
  if(member&&member.role!=='owner'&&member.tableAccess!=null)throw new RowWriteError('denied','Переписка недоступна')
  let workspaceId: string, actorEmail: string
  if (business) {
    if (!member) throw denied()
    workspaceId = member.workspaceId; actorEmail = member.email
  } else {
    if (!input.slug) throw denied()
    const [root] = await db.select().from(apps).where(eq(apps.slug, input.slug)).limit(1)
    if (!root) throw denied()
    const definition = readAppDefinition(root.published)
    if (definition.ok && definition.formatVersion === 2) {
      const app = { ...definition.app, id: root.id, workspaceId: root.workspaceId, slug: root.slug }
      const actor = await publishedV2Actor(app)
      const verifiedEmail = await currentStaffEmail()
      if ((!actor.authenticated || !actor.email) && !verifiedEmail) throw denied()
      workspaceId = root.workspaceId; actorEmail = actor.email ?? verifiedEmail!
    } else {
      const parsed = appSchema.safeParse(root.published)
      if (!parsed.success) throw denied()
      const app = { ...parsed.data, id: root.id, workspaceId: root.workspaceId, slug: root.slug }
      const access = await currentAppAccess(app), verifiedEmail = await currentStaffEmail()
      if ((!access.viewer || !access.visitor.authenticated || !canEnter(app, access.visitor)) && (!verifiedEmail || !generalChatAvailableApp(app))) throw denied()
      workspaceId = root.workspaceId; actorEmail = access.viewer?.email ?? verifiedEmail!
    }
  }
  const [space] = await db.select({ ownerId: workspaces.ownerId }).from(workspaces).where(eq(workspaces.id, workspaceId))
  const owner = Boolean(business && member?.role === 'owner' && space?.ownerId === member.userId)
  // The source card establishes the customer on the server; callers never provide an email or tenant.
  const customerContext = input.customer === undefined ? null : await customerHistoryContext({ ...input.customer, slug: input.slug }, business)
  if (input.customer !== undefined && (!customerContext || customerContext.app.workspaceId !== workspaceId)) throw denied()
  if (customerContext && !customerContext.email) return { items: [], next: null }
  const records = await db.select().from(apps).where(and(eq(apps.workspaceId, workspaceId), input.appId ? eq(apps.id, input.appId) : undefined))
  const operator = await generalOperator(workspaceId, business)
  const generalApps: App[] = []
  type Scope = {
    app: App | AppV2
    tableId: string
    emailFieldId: string
    moduleId: string
    staff: boolean
    owner: boolean
    visitor: Visitor | null
    viewer: AppViewer | null
    policy: Awaited<ReturnType<typeof appReadPolicy>> | null
    detailScreenId: string
    titleFieldId?: string
    statusFieldId?: string
    v2?: boolean
  }
  const scopes: Scope[] = []
  for (const record of records) {
    const definition = readAppDefinition(record.published)
    if (definition.ok && definition.formatVersion === 2) {
      const app = { ...definition.app, id: record.id, workspaceId, slug: record.slug }
      const actor = owner
        ? { authenticated: true as const, roleIds: ['owner'], email: actorEmail, name: member?.name ?? null, company: '', id: member?.userId ?? 'owner' }
        : business
          ? (() => {
              const roles = publishedV2Roles(app, actorEmail)
              return { authenticated: roles.roleIds.length > 0, roleIds: roles.roleIds, email: actorEmail, name: member?.name ?? null, company: roles.company, id: member?.userId ?? actorEmail }
            })()
          : await publishedV2Actor(app)
      if (!owner && (!actor.authenticated || !actor.email)) continue
      for (const tableId of [app.service?.repairsTableId, app.prokat?.bookingsTableId, app.support?.ticketsTableId].filter((id): id is string => Boolean(id))) {
        const resource = conversationResourceV2(app, tableId)
        if (!resource) continue
        const staff = owner || conversationStaffV2(app, tableId, actor.roleIds)
        const manager = owner || conversationManagerV2(app, tableId, actor.roleIds)
        if (!owner && (business ? !staff : !staff && !actor.roleIds.includes('client'))) continue
        const statusFieldId = app.service?.repairsTableId === tableId ? app.service.repair.status
          : app.prokat?.bookingsTableId === tableId ? app.prokat.booking.status
          : app.support?.ticketsTableId === tableId ? app.support.ticket.status
          : undefined
        scopes.push({
          app, tableId, emailFieldId: resource.emailFieldId, moduleId: resource.moduleId, staff: staff || manager, owner,
          visitor: null, viewer: null, policy: null,
          detailScreenId: conversationDetailScreenV2(resource, staff || manager || owner),
          titleFieldId: resource.titleFieldId, statusFieldId, v2: true,
        })
      }
      continue
    }
    const parsed = appSchema.safeParse(record.published)
    if (!parsed.success) continue
    const app = { ...parsed.data, id: record.id, workspaceId, slug: record.slug }
    if (await validateAppReferences(app)) continue
    if (generalChatAvailableApp(app)) {
      if (operator) generalApps.push(app)
      else if (!business) {
        try { await generalConversationAccess(app, GENERAL_CONVERSATION_SELF); generalApps.push(app) }
        catch (error) { if (!(error instanceof RowWriteError)) throw error }
      }
    }
    const access = owner ? null : await appAccessFor(app, actorEmail)
    if (!owner && (!access?.viewer || !access.visitor.authenticated || !canEnter(app, access.visitor))) continue
    const ids = [...new Set(app.screens.filter(screen => screen.type === 'detail').map(screen => screen.tableId))]
    for (const tableId of ids) {
      const resource = conversationResource(app, tableId)
      const module = moduleForTable(app, tableId) ?? legacyAppModules(app).find(module => module.source.type === 'booking' ? app.booking?.tables.visits === tableId : module.source.type === 'customer' && module.source.tableId === tableId)
      if (!resource || !module) continue
      const staff = owner || hasRole(access!.visitor, workflowRole(app, tableId, 'manager')) || hasRole(access!.visitor, workflowRole(app, tableId, 'staff')) || module.source.type === 'booking' && hasRole(access!.visitor, workflowRole(app, tableId, 'master'))
      if (!owner && (business ? !staff : !staff && access!.visitor.roleId !== 'client')) continue
      const detail = app.screens.find(screen => screen.type === 'detail' && screen.tableId === tableId && (owner || canOpenScreen(screen, access!.visitor)))
      if (!detail) continue
      scopes.push({ app, tableId, emailFieldId: resource.emailFieldId, moduleId: module.id, staff, owner, visitor: access?.visitor ?? null, viewer: access?.viewer ?? null, policy: owner ? null : await appReadPolicy(app, tableId, access!.visitor, access!.viewer!), detailScreenId: detail.id })
    }
  }
  if (!scopes.length && !generalApps.length) return { items: [], next: null }
  generalApps.sort((a, b) => Number(b.slug === input.slug) - Number(a.slug === input.slug))
  const actorId = person(workspaceId, actorEmail)
  // Clients must not page through other customers' threads in SQL — filter before projection.
  const seesAllCustomers = owner || Boolean(operator) || scopes.some(scope => scope.staff || scope.owner)
  const lastSequence = sql<number>`coalesce((select max(m.sequence) from conversation_messages m where m.conversation_id=${conversations.id}),0)`
  const unread = sql<number>`(select count(*) from conversation_messages m where m.conversation_id=${conversations.id} and m.deleted_at is null and m.author_id<>${actorId} and m.sequence>coalesce((select r.sequence from conversation_reads r where r.workspace_id=${workspaceId} and r.conversation_id=${conversations.id} and r.actor_id=${actorId}),0))`
  const found = await db.select({ thread: conversations, row: rows, primary: tables.primaryFieldId, customer: businessCustomers.name, email: businessCustomers.email, lastSequence, unread,
    preview: sql<string | null>`(select case when m.deleted_at is not null then 'Сообщение удалено' when m.body='' then 'Документ' else left(m.body,160) end from conversation_messages m where m.conversation_id=${conversations.id} order by m.sequence desc limit 1)`,
    lastAt: sql<string | null>`(select m.created_at::text from conversation_messages m where m.conversation_id=${conversations.id} order by m.sequence desc limit 1)`,
    lastAuthor: sql<string | null>`(select m.author_name from conversation_messages m where m.conversation_id=${conversations.id} and m.deleted_at is null order by m.sequence desc limit 1)` })
    .from(conversations).leftJoin(rows, and(eq(rows.id, conversations.rowId), eq(rows.tableId, conversations.tableId)))
    .leftJoin(tables, and(eq(tables.id, conversations.tableId), eq(tables.workspaceId, workspaceId)))
    .innerJoin(businessCustomers, and(eq(businessCustomers.id, conversations.customerId), eq(businessCustomers.workspaceId, workspaceId)))
    .where(and(eq(conversations.workspaceId, workspaceId), or(
      and(eq(conversations.kind, 'record'), isNotNull(rows.id), isNull(rows.deletedAt), eq(tables.workspaceId, workspaceId), inArray(conversations.tableId, scopes.map(scope => scope.tableId))),
      generalApps.length ? and(eq(conversations.kind, 'general'), operator ? undefined : eq(businessCustomers.email, actorEmail.trim().toLowerCase())) : sql`false`),
      customerContext ? eq(businessCustomers.email, customerContext.email) : undefined,
      seesAllCustomers ? undefined : eq(businessCustomers.email, actorEmail.trim().toLowerCase()),
      input.unreadOnly ? sql`${unread}>0` : undefined,
      cursor ? or(lt(lastSequence, Number(cursor[0])), and(eq(lastSequence, Number(cursor[0])), lt(conversations.id, cursor[1]!))) : undefined))
    .orderBy(desc(lastSequence), sql`(select m.created_at from conversation_messages m where m.conversation_id=${conversations.id} order by m.sequence desc limit 1) desc nulls last`, desc(conversations.id)).limit(51)
  const page = found.slice(0, 50), items: ConversationInboxPage['items'] = []
  const titles = new Map<string, string>()
  const servicePolicies = new Map<string, Awaited<ReturnType<typeof appReadPolicy>>>()
  const statusLabels = new Map<string, Map<string, string>>()
  const statusFieldIds = [...new Set(scopes.map(scope => scope.statusFieldId).filter((id): id is string => Boolean(id)))]
  if (statusFieldIds.length) {
    const statusFields = await db.select().from(fields).where(inArray(fields.id, statusFieldIds))
    for (const field of statusFields) {
      const choices = (field.options as { choices?: { id: string; name: string }[] } | null)?.choices
      if (!choices?.length) continue
      statusLabels.set(field.id, new Map(choices.map(choice => [choice.id, choice.name])))
    }
  }
  for (const item of page) {
    if (item.thread.kind === 'general') {
      const app = generalApps[0]
      if (!app || !operator && item.email !== actorEmail.trim().toLowerCase()) continue
      items.push({ id: item.thread.id, kind: 'general', slug: app.slug, tableId: GENERAL_CONVERSATION_TABLE, rowId: item.thread.customerId,
        title: 'Вопрос бизнесу', customer: item.customer || (operator ? item.email : 'Вы'), appName: app.name, detailScreenId: '',
        preview: item.preview ?? 'Сообщений пока нет', lastAt: item.lastAt ? new Date(item.lastAt).toISOString() : item.thread.createdAt.toISOString(),
        unread: Number(item.unread), closed: Boolean(item.thread.closedAt), lastAuthor: item.lastAuthor?.trim() || undefined })
      continue
    }
    if (!item.row) continue
    const data = item.row.data as Record<string, unknown>
    const scope = scopes.filter(scope => scope.tableId === item.thread.tableId && scope.moduleId === item.thread.moduleId)
      .sort((a, b) => Number(b.app.slug === input.slug) - Number(a.app.slug === input.slug))
      .find(scope => {
        if (String(data[scope.emailFieldId] ?? '').trim().toLowerCase() !== item.email) return false
        if (scope.owner || scope.staff || item.email === actorEmail.trim().toLowerCase()) {
          if (scope.v2) {
            if (scope.owner || scope.staff) return true
            const actor = { authenticated: true as const, roleIds: ['client'], email: actorEmail, name: null, company: '', id: actorEmail }
            const record = { id: item.row!.id, tableId: item.thread.tableId!, values: Object.fromEntries(Object.entries(data).map(([key, value]) => [key, value as never])) }
            return readableAppV2Fields(scope.app as AppV2, actor, record).size > 0
          }
          return scope.owner || scope.policy!.canRead(data, item.row!)
        }
        return false
      })
    if (!scope) continue
    let projected = data
    if (scope.v2 && !scope.owner) {
      const actor = {
        authenticated: true as const,
        roleIds: scope.staff ? ['staff'] : ['client'],
        email: actorEmail,
        name: null,
        company: '',
        id: actorEmail,
      }
      const record = { id: item.row.id, tableId: item.thread.tableId!, values: Object.fromEntries(Object.entries(data).map(([key, value]) => [key, value as never])) }
      projected = projectAppV2Row(scope.app as AppV2, actor, record) as Record<string, unknown>
    } else if (scope.policy) projected = scope.policy.project(data, item.row)
    let title = String(projected[scope.titleFieldId ?? item.primary ?? ''] ?? 'Обращение').slice(0, 160)
    const booking = !scope.v2 && 'booking' in scope.app ? scope.app.booking : undefined
    if (booking?.tables.visits === item.thread.tableId) {
      const ids = projected[booking.visit.service], serviceId = Array.isArray(ids) && typeof ids[0] === 'string' ? ids[0] : ''
      const key = `${scope.app.id}:${serviceId}`
      if (!titles.has(key)) {
        const [service] = serviceId ? await db.select().from(rows).where(and(eq(rows.id, serviceId), eq(rows.tableId, booking.tables.services), isNull(rows.deletedAt))) : []
        let serviceData = service?.data as Record<string, unknown> | undefined
        if (service && !scope.owner) {
          if (!servicePolicies.has(scope.app.id)) servicePolicies.set(scope.app.id, await appReadPolicy(scope.app as App, booking.tables.services, scope.visitor!, scope.viewer!))
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
    if (!scope.detailScreenId) continue
    const nameField = booking?.tables.visits === item.thread.tableId ? booking.visit.client
      : !scope.v2 ? customerWorkflows(scope.app as App).find(workflow => workflow.tableId === item.thread.tableId)?.profile?.nameFieldId : undefined
    const recordName = nameField && typeof projected[nameField] === 'string' ? String(projected[nameField]).trim().slice(0, 80) : ''
    const statusRaw = scope.statusFieldId ? String(projected[scope.statusFieldId] ?? '').trim() : ''
    const statusNames = scope.statusFieldId ? statusLabels.get(scope.statusFieldId) : undefined
    const statusLabel = statusRaw
      ? statusNames?.get(statusRaw) ?? ([...statusNames?.values() ?? []].includes(statusRaw) ? statusRaw : undefined)
      : undefined
    items.push({ id: item.thread.id, slug: scope.app.slug, tableId: item.thread.tableId!, rowId: item.thread.rowId!, title,
      customer: item.customer || recordName || (scope.staff ? 'Клиент' : 'Вы'), appName: scope.app.name, detailScreenId: scope.detailScreenId,
      preview: item.preview ?? 'Сообщений пока нет', lastAt: item.lastAt ? new Date(item.lastAt).toISOString() : item.thread.createdAt.toISOString(),
      unread: Number(item.unread), closed: Boolean(item.thread.closedAt),
      lastAuthor: item.lastAuthor?.trim() || undefined, statusLabel })
  }
  const last = page.at(-1)
  return { items, next: found.length > 50 && last ? `${last.lastSequence}~${last.thread.id}` : null }
}

/** Mark only the messages actually delivered to the screen; concurrent new replies stay unread. */
export async function markConversationRead(slug: string, tableId: string, rowId: string, sequence: number, business = false) {
  if (!Number.isSafeInteger(sequence) || sequence <= 0) throw denied()
  const access = await conversationAccess(slug, tableId, rowId, db, business)
  if (!access.customerId) throw denied()
  const [thread] = await db.select().from(conversations).where(and(eq(conversations.workspaceId, access.app.workspaceId), eq(conversations.kind, access.kind), eq(conversations.customerId, access.customerId),
    access.kind === 'record' ? and(eq(conversations.tableId, tableId), eq(conversations.rowId, rowId), eq(conversations.moduleId, access.module.id)) : undefined))
  if (!thread) throw denied()
  const [message] = await db.select({ id: messages.id }).from(messages).where(and(eq(messages.conversationId, thread.id), eq(messages.sequence, sequence)))
  if (!message) throw denied()
  await db.insert(reads).values({ workspaceId: access.app.workspaceId, conversationId: thread.id, actorId: access.actorId, sequence })
    .onConflictDoUpdate({ target: [reads.workspaceId, reads.conversationId, reads.actorId], set: { sequence: sql`greatest(${reads.sequence},${sequence})` } })
}
