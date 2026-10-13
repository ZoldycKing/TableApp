import { apps, db, rows, tables, workspaces } from '@tableapp/db'
import { appSchema } from '@tableapp/schema'
import { and, eq, isNull } from 'drizzle-orm'
import { currentMember } from './session'
import { appAccessFor, currentAppAccess } from './app-session'
import { canEnter } from './app-roles'
import { appReadPolicy } from './app-read-policy'
import { hasRole } from './module-access'
import { validateAppReferences } from './app-references'
import { orderStockPair } from './order-stock-config'
import { stockBalance } from './order-stock-store'
import { assertCurrentModuleState, checkRow, lockedRow, writeRows } from './row-mutations'

export async function readInventoryBalance(tableId: string, rowId: string, slug?: string, business = false) {
  if (typeof tableId !== 'string' || !tableId || typeof rowId !== 'string' || !rowId || tableId.length > 200 || rowId.length > 200 || slug !== undefined && (typeof slug !== 'string' || slug.length > 200) || typeof business !== 'boolean') return null
  const member = business ? await currentMember() : null
  if (business && !member || !business && !slug) return null
  const records = await db.select().from(apps).where(business ? and(eq(apps.workspaceId, member!.workspaceId), slug ? eq(apps.slug, slug) : undefined) : eq(apps.slug, slug!))
  for (const record of records) {
    const parsed = appSchema.safeParse(record.published)
    if (!parsed.success) continue
    const app = { ...parsed.data, id: record.id, workspaceId: record.workspaceId, slug: record.slug }, pair = orderStockPair(app)
    if (await validateAppReferences(app)) continue
    if (!pair || pair.inventory.tables.items !== tableId) continue
    const [space] = await db.select({ ownerId: workspaces.ownerId }).from(workspaces).where(eq(workspaces.id, app.workspaceId))
    const owner = Boolean(business && member?.role === 'owner' && member.userId === space?.ownerId)
    const access = owner ? null : business ? await appAccessFor(app, member!.email) : await currentAppAccess(app)
    const module = app.modules!.find(module => module.kind === 'inventory')!
    if (!owner && (!access?.viewer || !canEnter(app, access.visitor) || !['manager', 'staff'].some(role => module.roles?.[role] && hasRole(access.visitor, module.roles[role]!)))) continue
    const policy = owner ? null : await appReadPolicy(app, tableId, access!.visitor, access!.viewer!)
    if (policy && !policy.readable.fields.has(pair.inventory.item.stock)) continue
    const [parent] = await db.select({ row: rows }).from(rows).innerJoin(tables, eq(tables.id, rows.tableId)).where(and(eq(tables.workspaceId, app.workspaceId), eq(rows.tableId, tableId), eq(rows.id, rowId), isNull(rows.deletedAt)))
    if (!parent || policy && !policy.canRead(parent.row.data as Record<string, unknown>, parent.row)) continue
    return writeRows(app.workspaceId, async context => {
      await assertCurrentModuleState(context, app)
      const current = await lockedRow(context, tableId, rowId); checkRow(current, { guard: data => !policy || policy.canRead(data, current) })
      return stockBalance(context, pair.inventory, rowId, current.data as Record<string, unknown>)
    })
  }
  return null
}
