import { apps, db, rows, tables } from '@tableapp/db'
import { appSchema, type App } from '@tableapp/schema'
import { and, eq, isNull } from 'drizzle-orm'
import { currentAppAccess, type AppViewer } from './app-session'
import { defaultRole, permits, type AppAction, type Visitor } from './app-roles'
import { assertTableAllowed, loadApp } from './app-write-access'
import { canAccessRow, ownRowsDeclared, rulesFor } from './row-access'
import { authorizeApp, type Authorization } from './authorize'
import { RowWriteError } from './row-mutations'

/**
 * Central authorization helpers for runtime / IDOR checks.
 *
 * Rules:
 * 1. Principal comes only from cookies/session — never from the client body.
 * 2. Resource is loaded scoped to the app's workspace, then role + ownership.
 * 3. Cross-app IDs are rejected.
 * 4. Unknown / invisible resources fail as not-found (callers map to 404).
 */

const NOT_FOUND = 'Объект не найден'
const DENIED = 'Действие недоступно'

export class AccessError extends Error {
  readonly code: 'not_found' | 'denied'
  constructor(code: 'not_found' | 'denied', message: string) {
    super(message)
    this.code = code
  }
}

export function isCustomerVisitor(app: Pick<App, 'roles'>, visitor: Visitor): boolean {
  const client = defaultRole(app)
  return Boolean(visitor.authenticated && visitor.roleId && client && visitor.roleId === client)
}

/** Customer roles fail closed when ownership rules are missing — never allow-all. */
export function customerRequiresOwnRows(app: App, tableId: string, visitor: Visitor): boolean {
  return (visitor.enrolled || isCustomerVisitor(app, visitor)) && !ownRowsDeclared(app, tableId, visitor.roleId)
}

export async function requireAppVisitor(slug: string): Promise<{ app: App; visitor: Visitor; viewer: AppViewer | null }> {
  const app = await loadApp(slug)
  if (!app) throw new AccessError('not_found', NOT_FOUND)
  const { visitor, viewer } = await currentAppAccess(app)
  return { app, visitor, viewer }
}

/** Workspace member must own the app; never trust a client-supplied workspace id. */
export async function assertAppMember(appId: string, write = true): Promise<Authorization> {
  return authorizeApp(appId, write)
}

export type RecordAccess = {
  app: App
  visitor: Visitor
  viewer: AppViewer | null
  row: typeof rows.$inferSelect
  rules: ReturnType<typeof rulesFor>
}

/**
 * Resolve app by slug, confirm table belongs to the app, load the row in the
 * app workspace, then check role permission and row ownership.
 */
export async function requireRecordAccess(input: {
  slug: string
  tableId: string
  rowId: string
  action: AppAction | 'read'
}): Promise<RecordAccess> {
  const { app, visitor, viewer } = await requireAppVisitor(input.slug)
  const tableError = await assertTableAllowed(app, input.tableId)
  if (tableError) throw new AccessError('not_found', NOT_FOUND)

  if (input.action !== 'read') {
    if (customerRequiresOwnRows(app, input.tableId, visitor)) throw new AccessError('denied', DENIED)
    if (!permits(app, input.tableId, input.action, visitor)) throw new AccessError('denied', DENIED)
  } else if (customerRequiresOwnRows(app, input.tableId, visitor)) {
    throw new AccessError('denied', DENIED)
  }

  const [found] = await db.select({ row: rows }).from(rows)
    .innerJoin(tables, eq(rows.tableId, tables.id))
    .where(and(
      eq(rows.id, input.rowId),
      eq(rows.tableId, input.tableId),
      eq(tables.workspaceId, app.workspaceId),
      isNull(rows.deletedAt),
    ))
    .limit(1)
  if (!found) throw new AccessError('not_found', NOT_FOUND)

  const accessViewer = viewer
    ? { email: viewer.email, company: viewer.company, enrolled: viewer.enrolled, customer: isCustomerVisitor(app, visitor) }
    : visitor.email
      ? { email: visitor.email, company: visitor.company, enrolled: visitor.enrolled, customer: isCustomerVisitor(app, visitor) }
      : null
  const rules = rulesFor(app, input.tableId, visitor)
  if (!canAccessRow(rules, accessViewer, found.row.data as Record<string, unknown>)) {
    throw new AccessError('not_found', NOT_FOUND)
  }

  return { app, visitor, viewer, row: found.row, rules }
}

/** Published app must live in the caller's workspace when acting as a member. */
export async function requirePublishedAppInWorkspace(appId: string, workspaceId: string): Promise<App> {
  const [record] = await db.select().from(apps).where(eq(apps.id, appId)).limit(1)
  const parsed = record?.published ? appSchema.safeParse(record.published) : null
  if (!record || !parsed?.success || record.workspaceId !== workspaceId) {
    throw new AccessError('not_found', NOT_FOUND)
  }
  return { ...parsed.data, id: record.id, workspaceId: record.workspaceId, slug: record.slug }
}

export function asRowWriteError(error: unknown): never {
  if (error instanceof AccessError) {
    throw new RowWriteError(error.code === 'not_found' ? 'denied' : 'denied', error.message)
  }
  throw error
}
