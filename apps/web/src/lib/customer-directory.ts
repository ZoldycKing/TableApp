import { businessCustomers, db, rows, tables } from '@tableapp/db'
import { and, asc, eq, gt, isNull, or, sql } from 'drizzle-orm'
import { canOpenScreen } from './app-roles'
import { crmAccessCandidates } from './customer-history'
import { configFingerprint } from './app-config-history'
import { historyCursor, readHistoryCursor } from './history-cursor'
import { CRM_PROFILE_PREFIX, type CustomerDirectoryPage } from './customer-history-types'
import { RowWriteError } from './row-mutations'

export type DirectoryInput = { tableId: string; slug?: string; before?: string; query?: string }
const denied = () => new RowWriteError('denied', 'Список клиентов недоступен')
const emailOf = (value: unknown) => typeof value === 'string' ? value.trim().toLowerCase() : ''

/** Business profiles are projected through the same private CRM screen policy as manual contacts. */
export async function readCustomerDirectory(input: DirectoryInput, business = false): Promise<CustomerDirectoryPage> {
  if (!input || input.query !== undefined && (typeof input.query !== 'string' || input.query.length > 120) || input.before !== undefined && typeof input.before !== 'string') throw denied()
  for await (const context of crmAccessCandidates(input.tableId, input.slug, business)) {
    const { app, config, owner, access, policy } = context, crm = config.crm
    const screen = crm?.listScreenId && app.screens.find(screen => screen.id === crm.listScreenId)
    if (!crm || input.tableId !== crm.clientsTableId || !screen || !owner && (!canOpenScreen(screen, access!.visitor) || !policy!.readable.fields.has(crm.emailFieldId))) continue
    const allowed = [crm.nameFieldId, crm.emailFieldId, crm.phoneFieldId].filter(id => owner || policy!.readable.fields.has(id))
    const query = input.query?.trim().toLowerCase() ?? '', pattern = `%${query.replace(/[\\%_]/g, '\\$&')}%`
    const binding = configFingerprint(['directory', business, context.actor, app, input.tableId, query, policy?.fingerprint])
    const cursor = readHistoryCursor(input.before, binding) as { type: 'row' | 'profile'; id: string } | null
    if (cursor && (!['row', 'profile'].includes(cursor.type) || typeof cursor.id !== 'string' || cursor.id.length > 200 || !cursor.id)) throw denied()
    const contacts = cursor?.type === 'profile' ? [] : await db.select({ row: rows }).from(rows).innerJoin(tables, eq(rows.tableId, tables.id))
      .where(and(eq(rows.tableId, crm.clientsTableId), eq(tables.workspaceId, app.workspaceId), isNull(rows.deletedAt), cursor ? gt(rows.id, cursor.id) : undefined,
        query ? or(...allowed.map(id => sql`lower(coalesce(${rows.data}->>${id},'')) like ${pattern}`)) : undefined)).orderBy(asc(rows.id)).limit(51)
    const profileFields = { [crm.nameFieldId]: businessCustomers.name, [crm.emailFieldId]: businessCustomers.email, [crm.phoneFieldId]: businessCustomers.phone }
    const profiles = contacts.length > 50 ? [] : await db.select().from(businessCustomers).where(and(eq(businessCustomers.workspaceId, app.workspaceId),
      cursor?.type === 'profile' ? gt(businessCustomers.id, cursor.id) : undefined,
      query ? or(...allowed.map(id => sql`lower(coalesce(${profileFields[id]},'')) like ${pattern}`)) : undefined)).orderBy(asc(businessCustomers.id)).limit(51)
    const candidates = [...contacts.map(({ row }) => ({ type: 'row' as const, row })), ...profiles.map(row => ({ type: 'profile' as const, row }))]
    const items: CustomerDirectoryPage['items'] = [], seen = new Set<string>()
    for (const candidate of candidates.slice(0, 50)) {
      let row = candidate.row, profile = candidate.type === 'profile'
      let data: Record<string, unknown> = candidate.type === 'row' ? candidate.row.data as Record<string, unknown> : { [crm.nameFieldId]: candidate.row.name, [crm.emailFieldId]: candidate.row.email, [crm.phoneFieldId]: candidate.row.phone }
      if (policy && !policy.canRead(data, row)) continue
      if (profile) {
        // Prefer a readable manual contact, without copying or merging either source.
        const matches = await db.select().from(rows).where(and(eq(rows.tableId, crm.clientsTableId), isNull(rows.deletedAt), sql`lower(btrim(coalesce(${rows.data}->>${crm.emailFieldId},'')))=${emailOf(data[crm.emailFieldId])}`)).orderBy(asc(rows.id)).limit(51)
        const manual = matches.find(row => !policy || policy.canRead(row.data as Record<string, unknown>, row))
        if (manual) { row = manual; data = manual.data as Record<string, unknown>; profile = false }
      }
      const visible = policy ? policy.project(data, row) : data, id = profile ? `${CRM_PROFILE_PREFIX}${row.id}` : row.id
      const email = typeof visible[crm.emailFieldId] === 'string' ? String(visible[crm.emailFieldId]) : null, identity = emailOf(email) || id
      if (seen.has(identity)) continue
      seen.add(identity)
      items.push({ id, profile, name: typeof visible[crm.nameFieldId] === 'string' && String(visible[crm.nameFieldId]).trim() ? String(visible[crm.nameFieldId]).slice(0, 160) : 'Клиент',
        email, phone: typeof visible[crm.phoneFieldId] === 'string' ? String(visible[crm.phoneFieldId]) : null })
    }
    const last = candidates.slice(0, 50).at(-1)
    return { items, next: candidates.length > 50 && last ? historyCursor({ type: last.type, id: last.row.id }, binding) : null }
  }
  throw denied()
}
