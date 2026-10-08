import { byPosition, newId, type Field, type View } from '@tableapp/schema'
import { generateApp } from '../app-builder'
import { asRole, visibleScreensFor } from '../app-roles'
import { projectRuntime } from '../runtime-project'
import { buildTemplate } from './build'
import { sklad } from './defs/sklad'
import { asInventory } from './inventory-app'

export function inventoryFixture(role = 'staff') {
  const built = buildTemplate({ template: sklad, workspaceId: 'inventory_test' })
  const fields = built.fields as Field[], views = built.views as unknown as View[]
  const table = built.tables.find(table => table.id === built.appTableId)!
  const generated = generateApp({ appId: newId('app'), workspaceId: table.workspaceId, name: built.appName, slug: 'inventory-test',
    table, fields: fields.filter(field => field.tableId === table.id), view: views.find(view => view.id === built.appViewId)! })
  const app = asInventory(generated, built), visitor = asRole(role, 'warehouse@example.invalid'), now = new Date()
  const runtime = projectRuntime({ ...app, screens: visibleScreensFor(app, visitor) }, visitor,
    Object.fromEntries(views.map(view => [view.id, view])), built.tables,
    new Map(built.tables.map(table => [table.id, fields.filter(field => field.tableId === table.id).sort(byPosition)])),
    built.rows.map(row => ({ ...row, version: 0, createdAt: now, updatedAt: now, createdBy: null, updatedBy: null })),
    new Map(built.tables.map(table => [table.id, table.primaryFieldId])))
  return { built, app, generated, table, fields, views, runtime }
}
