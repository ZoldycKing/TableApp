import { apps, businessCustomers, db, rows, tables, workspaces } from '@tableapp/db'
import { appSchema, customerWorkflows, MODULE_DEFINITIONS, type App, type CustomerWorkflow } from '@tableapp/schema'
import { and, desc, eq, isNull, lt, lte, or, sql, type SQL } from 'drizzle-orm'
import { appAccessFor, currentAppAccess, type AppAccess } from './app-session'
import { canEnter, canOpenScreen } from './app-roles'
import { appReadPolicy } from './app-read-policy'
import { validateAppReferences } from './app-references'
import { configFingerprint } from './app-config-history'
import { currentMember } from './session'
import { crmForTable } from './customer-history-config'
import { hasRole, moduleForTable, workflowRole } from './module-access'
import { RowWriteError } from './row-mutations'
import { historyCursor, readHistoryCursor } from './history-cursor'
import { conversationContextTitle } from './conversation-context'
import { formatCell } from './format'
import { CRM_PROFILE_PREFIX, type CustomerHistoryPage } from './customer-history-types'

export type HistoryInput = { tableId: string; rowId: string; slug?: string; before?: string; kind?: string; ordersOnly?: boolean }
const denied = () => new RowWriteError('denied', 'История клиента недоступна')
const ref = (value: unknown) => typeof value === 'string' && value.length > 0 && value.length <= 200
const emailValue = (value: unknown) => typeof value === 'string' && value.trim().length <= 254 && value.includes('@') ? value.trim().toLowerCase() : ''
export type HistoryContext = NonNullable<Awaited<ReturnType<typeof customerHistoryContext>>>

export async function* crmAccessCandidates(tableId: string, slug: string | undefined, business: boolean) {
  if (!ref(tableId) || slug !== undefined && !ref(slug) || typeof business !== 'boolean') throw denied()
  const member = business ? await currentMember() : null
  if (business && !member || !business && !slug) throw denied()
  const records = await db.select().from(apps).where(business ? and(eq(apps.workspaceId, member!.workspaceId), slug ? eq(apps.slug, slug) : undefined) : eq(apps.slug, slug!))
  for (const record of records) {
    const parsed = appSchema.safeParse(record.published)
    if (!parsed.success) continue
    const app = { ...parsed.data, id: record.id, workspaceId: record.workspaceId, slug: record.slug }, config = crmForTable(app, tableId)
    if (!config || await validateAppReferences(app)) continue
    const [space] = await db.select({ ownerId: workspaces.ownerId }).from(workspaces).where(eq(workspaces.id, app.workspaceId))
    const owner = Boolean(business && member?.role === 'owner' && space?.ownerId === member.userId)
    const access = owner ? null : business ? await appAccessFor(app, member!.email) : await currentAppAccess(app)
    if (!owner && (!access?.viewer || !access.visitor.authenticated || !canEnter(app, access.visitor) || !['staff', 'manager'].some(role => hasRole(access.visitor, workflowRole(app, config.tableId, role))))) continue
    const policy = owner ? null : await appReadPolicy(app, tableId, access!.visitor, access!.viewer!)
    yield { app, config, owner, access, policy, actor: owner ? member!.userId : access!.viewer!.email }
  }
}

/** No caller-supplied email or tenant. A CRM record, its live policy and explicit roles establish the context. */
export async function customerHistoryContext(input: Pick<HistoryInput, 'tableId' | 'rowId' | 'slug'>, business: boolean) {
  if (!input || !ref(input.tableId) || !ref(input.rowId) || input.slug !== undefined && !ref(input.slug) || typeof business !== 'boolean') throw denied()
  for await (const candidate of crmAccessCandidates(input.tableId, input.slug, business)) {
    const { app, config, owner, access, policy } = candidate
    const crm = config.crm
    let raw: Record<string, unknown>, visible: Record<string, unknown>, email: string, name: unknown, phone: unknown, visibleEmail: unknown
    if (input.rowId.startsWith(CRM_PROFILE_PREFIX)) {
      if (!crm || input.tableId !== crm.clientsTableId) continue
      const [profile] = await db.select().from(businessCustomers).where(and(eq(businessCustomers.workspaceId, app.workspaceId), eq(businessCustomers.id, input.rowId.slice(CRM_PROFILE_PREFIX.length))))
      if (!profile) continue
      raw = { [crm.nameFieldId]: profile.name, [crm.emailFieldId]: profile.email, [crm.phoneFieldId]: profile.phone }
      if (policy && !policy.canRead(raw, { id: profile.id, createdAt: profile.createdAt, updatedAt: profile.updatedAt })) continue
      visible = policy ? policy.project(raw, { id: profile.id, createdAt: profile.createdAt, updatedAt: profile.updatedAt }) : raw
      if (!owner && !policy!.readable.fields.has(crm.emailFieldId)) throw denied()
      email = profile.email; name = visible[crm.nameFieldId]; phone = visible[crm.phoneFieldId]; visibleEmail = visible[crm.emailFieldId]
    } else {
      const [parent] = await db.select({ row: rows }).from(rows).innerJoin(tables, eq(rows.tableId, tables.id))
        .where(and(eq(rows.tableId, input.tableId), eq(rows.id, input.rowId), eq(tables.workspaceId, app.workspaceId), isNull(rows.deletedAt)))
      if (!parent) continue
      raw = parent.row.data as Record<string, unknown>
      if (policy && !policy.canRead(raw, parent.row)) continue
      visible = policy ? policy.project(raw, parent.row) : raw
      if (crm && input.tableId === crm.clientsTableId) {
        if (!owner && !policy!.readable.fields.has(crm.emailFieldId)) throw denied()
        email = emailValue(raw[crm.emailFieldId]); name = visible[crm.nameFieldId]; phone = visible[crm.phoneFieldId]; visibleEmail = visible[crm.emailFieldId]
      } else {
        email = emailValue(raw[config.emailFieldId]); name = config.profile && visible[config.profile.nameFieldId]; phone = config.profile && visible[config.profile.phoneFieldId]; visibleEmail = visible[config.emailFieldId]
        const selected = crm && raw[crm.relationFieldId]
        if (crm && Array.isArray(selected) && selected.length) {
          if (selected.length !== 1 || !ref(selected[0])) throw denied()
          const [client] = await db.select().from(rows).where(and(eq(rows.id, selected[0]), eq(rows.tableId, crm.clientsTableId), isNull(rows.deletedAt)))
          if (!client) throw denied()
          // An assigned deal authorizes grouping by its explicit client, not browsing the client directory.
          email = emailValue((client.data as Record<string, unknown>)[crm.emailFieldId]); visibleEmail = null
          const clientPolicy = owner ? null : await appReadPolicy(app, crm.clientsTableId, access!.visitor, access!.viewer!)
          if (!clientPolicy || clientPolicy.canRead(client.data as Record<string, unknown>, client)) {
            const clientData = clientPolicy ? clientPolicy.project(client.data as Record<string, unknown>, client) : client.data as Record<string, unknown>
            name = clientData[crm.nameFieldId] ?? name; phone = clientData[crm.phoneFieldId] ?? phone; visibleEmail = clientData[crm.emailFieldId]
          }
        }
      }
    }
    return { ...candidate, email,
      customer: { name: typeof name === 'string' && name.trim() ? name.trim().slice(0, 160) : 'Клиент', email: typeof visibleEmail === 'string' ? visibleEmail : null, phone: typeof phone === 'string' ? phone : null } }
  }
  throw denied()
}

export async function hasCustomerHistoryTable(workspaceId: string, tableId: string) {
  const records = await db.select({ published: apps.published }).from(apps).where(eq(apps.workspaceId, workspaceId))
  return records.some(record => { const parsed = appSchema.safeParse(record.published); return parsed.success && Boolean(crmForTable(parsed.data, tableId)) })
}

/** Explicit CRM relations take precedence over a legacy email field in a deal. */
function matchesCustomer(config: CustomerWorkflow, email: string): SQL {
  const direct = sql`lower(btrim(coalesce(${rows.data}->>${config.emailFieldId},'')))=${email}`
  if (!config.crm) return direct
  const crm = config.crm, selected = sql`${rows.data}->${crm.relationFieldId}->>0`
  return or(and(sql`${selected} is null`, direct), sql`exists (select 1 from rows c where c.id=${selected} and c.table_id=${crm.clientsTableId} and c.deleted_at is null and lower(btrim(coalesce(c.data->>${crm.emailFieldId},'')))=${email})`)!
}

export async function readCustomerHistory(input: HistoryInput, business = false): Promise<CustomerHistoryPage | null> {
  if (input?.before !== undefined && typeof input.before !== 'string' || input?.kind !== undefined && (typeof input.kind !== 'string' || input.kind.length > 100) || input?.ordersOnly !== undefined && typeof input.ordersOnly !== 'boolean') throw denied()
  const context = await customerHistoryContext(input, business)
  if (!context) return null
  if (!context.email) return { customer: context.customer, items: [], kinds: [], next: null, reason: 'Укажите почту в карточке клиента, чтобы найти его заказы и записи.' }
  const records = await db.select().from(apps).where(eq(apps.workspaceId, context.app.workspaceId))
  type Scope = { app: App; tableId: string; email: SQL; config?: CustomerWorkflow; emailFieldId?: string; statusField: string; dateField?: string; kind: string; policy: Awaited<ReturnType<typeof appReadPolicy>> | null; access: AppAccess | null }
  const scopes: Scope[] = []
  for (const record of records) {
    const parsed = appSchema.safeParse(record.published)
    if (!parsed.success) continue
    const app = { ...parsed.data, id: record.id, workspaceId: record.workspaceId, slug: record.slug }
    if (await validateAppReferences(app)) continue
    const access = context.owner ? null : await appAccessFor(app, context.access!.viewer!.email)
    if (!context.owner && (!access?.viewer || !access.visitor.authenticated || !canEnter(app, access.visitor))) continue
    const candidates = [...customerWorkflows(app).map(config => ({ tableId: config.tableId, email: matchesCustomer(config, context.email), config, emailFieldId: config.emailFieldId, statusField: config.statusFieldId, dateField: config.createdFieldId, kind: moduleForTable(app, config.tableId)?.kind ?? 'requests' })),
      ...(app.booking ? [{ tableId: app.booking.tables.visits, email: sql`lower(btrim(coalesce(${rows.data}->>${app.booking.visit.email},'')))=${context.email}`, emailFieldId: app.booking.visit.email, statusField: app.booking.visit.status, dateField: app.booking.visit.start, kind: 'booking' }] : [])]
    for (const candidate of candidates) {
      if (input.ordersOnly && ('config' in candidate && candidate.config.crm || candidate.kind === 'crm' || candidate.kind === 'support')) continue
      if (!context.owner && !['manager', 'staff', 'master'].some(role => hasRole(access!.visitor, workflowRole(app, candidate.tableId, role)))) continue
      if (!app.screens.some(screen => screen.type === 'detail' && screen.tableId === candidate.tableId && (context.owner || canOpenScreen(screen, access!.visitor)))) continue
      scopes.push({ ...candidate, app, access, policy: context.owner ? null : await appReadPolicy(app, candidate.tableId, access!.visitor, access!.viewer!) })
    }
  }
  const kinds = [...new Map(scopes.map(scope => [scope.kind, { id: scope.kind, name: MODULE_DEFINITIONS[scope.kind as keyof typeof MODULE_DEFINITIONS]?.name ?? 'Обращения' }])).values()]
  const binding = configFingerprint(['history', business, context.actor, context.app.workspaceId, input.tableId, input.rowId, context.email, input.kind ?? '', Boolean(input.ordersOnly), scopes.map(scope => scope.app)])
  const cursor = readHistoryCursor(input.before, binding) as { revision: number; id: string; upper: number } | null
  if (cursor && (!Number.isSafeInteger(cursor.revision) || !Number.isSafeInteger(cursor.upper) || cursor.revision < 0 || cursor.upper < cursor.revision || !ref(cursor.id))) throw denied()
  const active = input.kind ? scopes.filter(scope => scope.kind === input.kind) : scopes
  if (!active.length) return { customer: context.customer, items: [], kinds, next: null }
  const candidates = await db.select({ row: rows, primary: tables.primaryFieldId }).from(rows).innerJoin(tables, eq(rows.tableId, tables.id))
    .where(and(eq(tables.workspaceId, context.app.workspaceId), isNull(rows.deletedAt), or(...active.map(scope => and(eq(rows.tableId, scope.tableId), scope.email))),
      cursor ? and(lte(rows.syncRevision, cursor.upper), or(lt(rows.syncRevision, cursor.revision), and(eq(rows.syncRevision, cursor.revision), lt(rows.id, cursor.id)))) : undefined))
    .orderBy(desc(rows.syncRevision), desc(rows.id)).limit(51)
  const page = candidates.slice(0, 50), items: CustomerHistoryPage['items'] = []
  const linkedEmails = new Map<string, string>(), ownerColumns = new Map<string, Awaited<ReturnType<typeof import('./row-write').loadTableFields>>>()
  for (const item of page) {
    const raw = item.row.data as Record<string, unknown>
    let scope: Scope | undefined
    for (const candidate of active.filter(scope => scope.tableId === item.row.tableId).sort((a, b) => Number(b.app.id === context.app.id) - Number(a.app.id === context.app.id))) {
      let identity = emailValue(raw[candidate.emailFieldId!])
      const crm = candidate.config?.crm, ids = crm && raw[crm.relationFieldId]
      if (crm && Array.isArray(ids) && ids.length) {
        if (ids.length !== 1 || !ref(ids[0])) continue
        const key = `${crm.clientsTableId}:${ids[0]}`
        if (!linkedEmails.has(key)) {
          const [client] = await db.select({ data: rows.data }).from(rows).where(and(eq(rows.id, String(ids[0])), eq(rows.tableId, crm.clientsTableId), isNull(rows.deletedAt)))
          linkedEmails.set(key, emailValue((client?.data as Record<string, unknown> | undefined)?.[crm.emailFieldId]))
        }
        identity = linkedEmails.get(key)!
      }
      if (identity === context.email && (!candidate.policy || candidate.policy.canRead(raw, item.row))) { scope = candidate; break }
    }
    if (!scope) continue
    const data = scope.policy ? scope.policy.project(raw, item.row) : raw
    const screen = scope.app.screens.find(screen => screen.type === 'detail' && screen.tableId === scope.tableId && (context.owner || canOpenScreen(screen, scope.access!.visitor)))!
    const label = (id: string | undefined) => { const field = id && scope.policy?.fields.find(field => field.id === id); return id && data[id] != null ? field ? formatCell(field, data[id]) : context.owner ? String(data[id]) : null : null }
    // Owner bypass still formats fields using the actual stored type, including time zones and select labels.
    if (context.owner && !ownerColumns.has(scope.tableId)) ownerColumns.set(scope.tableId, await (await import('./row-write')).loadTableFields(scope.tableId))
    const ownerFields = ownerColumns.get(scope.tableId) ?? []
    const text = (id: string | undefined) => { const field = ownerFields.find(field => field.id === id); return field && data[field.id] != null ? formatCell(field, data[field.id]) : label(id) }
    const statusField = (scope.policy?.fields ?? ownerFields).find(field => field.id === scope.statusField)
    const statusColor = statusField?.type === 'single_select' && data[scope.statusField] != null ? statusField.options.choices.find(choice => choice.id === data[scope.statusField])?.color ?? null : null
    items.push({ id: item.row.id, tableId: item.row.tableId, slug: scope.app.slug, screenId: screen.id, kind: scope.kind,
      module: kinds.find(kind => kind.id === scope.kind)!.name, title: await conversationContextTitle(scope.app, scope.tableId, data, scope.access, item.primary), status: text(scope.statusField), statusColor, when: scope.kind === 'booking' ? null : text(scope.dateField) })
  }
  const last = page.at(-1)
  return { customer: context.customer, items, kinds, next: candidates.length > 50 && last ? historyCursor({ revision: last.row.syncRevision, id: last.row.id, upper: cursor?.upper ?? candidates[0]!.row.syncRevision }, binding) : null }
}
