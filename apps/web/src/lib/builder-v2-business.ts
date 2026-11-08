import { apps, db } from '@tableapp/db'
import { appSchema, INVENTORY_OPERATIONS, type App, type Screen } from '@tableapp/schema'
import type { AppV2, AppV2Actor, AppV2BusinessOperation, AppV2Node, AppV2Record } from '@tableapp/schema/app-v2'
import { and, asc, eq, inArray, isNotNull } from 'drizzle-orm'
import { appEntryPath } from './app-entry'
import { validateAppReferences } from './app-references'
import { asRole, canOpenScreen, defaultRole, permits, screensFor, visitorFor } from './app-roles'
import type { BuilderBusinessApp, BuilderBusinessLink } from './builder-v2-business-types'
import { builderV2ScreenNodes } from './builder-v2-data-types'
import { offersCustomerCheckout } from './customer-checkout'
import type { Transaction } from './db-transaction'
import { inventoryScreen } from './inventory'
import { acceptsModuleIntake } from './module-access'

type BusinessNode = Extract<AppV2Node, { type: 'business' }>
type Operation = { operation: AppV2BusinessOperation; screen: Screen; recordTableId: string | null }
type BusinessTarget = { app: App; operations: Operation[] }
type ViewCatalog = ReadonlyMap<string, { tableId: string }>

function operationsOf(app: App, views: ViewCatalog): Operation[] {
  const operations: Operation[] = []
  const addForm = (operation: AppV2BusinessOperation, screenId: string | null, tableId: string, recordTableId: string | null = null) => {
    const screen = app.screens.find(screen => screen.id === screenId)
    if (screen?.type === 'form' && screen.tableId === tableId && screen.mode === 'create') operations.push({ operation, screen, recordTableId })
  }
  const inventory = app.inventory
  if (inventory) {
    const lists = app.screens.filter(screen => (screen.type === 'list' || screen.type === 'tiles') && views.get(screen.source.viewId)?.tableId === inventory.tables.items)
    const items = lists.find(screen => screen.id === app.homeScreenId) ?? lists[0]
    if (items) operations.push({ operation: 'inventory_items', screen: items, recordTableId: null })
    for (const operation of INVENTORY_OPERATIONS) {
      addForm(`inventory_${operation}`, inventoryScreen(inventory, operation), inventory.tables.movements, inventory.tables.items)
    }
  }
  if (app.production) {
    addForm('production_run', app.production.formScreenId, app.production.tables.production)
    addForm('production_movement', app.production.movementScreenId, app.production.tables.movements)
  }
  if (app.booking && acceptsModuleIntake(app, app.booking.tables.visits)) {
    addForm('booking_create', app.booking.formScreenId, app.booking.tables.visits)
  }
  return operations
}

export async function loadBuilderBusinessTargets(workspaceId: string, views: ViewCatalog, tx: Transaction | typeof db = db, ids?: readonly string[]) {
  const targets = new Map<string, BusinessTarget>()
  if (ids?.length === 0) return targets
  const records = await tx.select({ id: apps.id, slug: apps.slug, published: apps.published })
    .from(apps).where(and(eq(apps.workspaceId, workspaceId), isNotNull(apps.published), ids && inArray(apps.id, [...ids])))
    .orderBy(asc(apps.name), asc(apps.id))
  for (const record of records) {
    const read = appSchema.safeParse(record.published)
    if (!read.success || read.data.id !== record.id || read.data.workspaceId !== workspaceId) continue
    const app = { ...read.data, slug: record.slug }
    const operations = operationsOf(app, views)
    if (operations.length) targets.set(app.id, { app, operations })
  }
  return targets
}

export async function loadBuilderBusinessApps(workspaceId: string, views: ViewCatalog): Promise<BuilderBusinessApp[]> {
  const targets = await loadBuilderBusinessTargets(workspaceId, views)
  return [...targets.values()].map(({ app, operations }) => ({
    id: app.id, name: app.name, operations: operations.map(({ operation, recordTableId }) => ({ operation, recordTableId })),
  }))
}

export function builderBusinessLink(targets: ReadonlyMap<string, BusinessTarget>, node: BusinessNode, actor: AppV2Actor, row?: AppV2Record): BuilderBusinessLink | null {
  const target = targets.get(node.target?.appId ?? '')
  const selected = target?.operations.find(action => action.operation === node.target?.operation)
  if (!target || !selected || (selected.recordTableId && selected.recordTableId !== row?.tableId)) return null
  const visitor = visitorFor(target.app, actor.authenticated ? actor.email : null)
  if (visitor.authenticated || selected.operation === 'inventory_items') {
    if (!screensFor(target.app, visitor).some(screen => screen.id === selected.screen.id)) return null
  } else {
    // A guest may start the existing verified booking flow. No internal operation
    // becomes public, and the destination still checks the session on arrival.
    const role = defaultRole(target.app)
    if (selected.operation !== 'booking_create' || selected.screen.type !== 'form' || target.app.accessMode !== 'public' || !role ||
      !canOpenScreen(selected.screen, asRole(role)) || !permits(target.app, selected.screen.tableId, 'create', asRole(role, null, '', true)) ||
      !target.app.screens.some(source => offersCustomerCheckout(target.app, source, selected.screen.id))) return null
  }
  const entry = { e: selected.screen.id, ...(selected.recordTableId && row ? { r: row.id } : {}) }
  return { operation: selected.operation, name: target.app.name, href: appEntryPath(target.app.slug, entry) }
}

export async function validateBuilderBusinessTargets(app: AppV2, views: ViewCatalog, tx: Transaction) {
  const nodes = app.nodes.filter((node): node is BusinessNode => node.type === 'business')
  if (!nodes.length) return null
  const targets = await loadBuilderBusinessTargets(app.workspaceId, views, tx, [...new Set(nodes.flatMap(node => node.target ? [node.target.appId] : []))])
  const checked = new Set<string>()
  for (const screen of app.screens) {
    for (const node of builderV2ScreenNodes(app, screen.id)) {
      if (node.type !== 'business') continue
      const target = targets.get(node.target?.appId ?? '')
      const action = target?.operations.find(item => item.operation === node.target?.operation)
      const title = node.name.trim() || 'Бизнес-операция'
      if (!target || !action || target.app.id === app.id) return `«${title}»: выберите доступную операцию в опубликованном сценарии`
      if (action.recordTableId && action.recordTableId !== screen.contextTableId) return `«${title}»: разместите операцию в карточке товара этого склада`
      if (!checked.has(target.app.id)) {
        if (await validateAppReferences(target.app, tx)) return `«${title}»: проверьте настройки связанного сценария`
        checked.add(target.app.id)
      }
    }
  }
  return null
}
