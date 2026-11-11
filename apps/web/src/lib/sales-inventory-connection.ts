import { customerCartWorkflow, newId, positionBetween, type App, type Field } from '@tableapp/schema'
import { generateApp } from './app-builder'
import { buildTemplate } from './templates/build'
import { findTemplate } from './templates/catalog'
import { templatePreset } from './templates/presets'
import { scopeModuleAccess, composeModules, ModuleCompositionError } from './module-composition'

/** New warehouse journals reuse the sales catalogue; neither products nor historical stock are guessed/copied. */
export function connectSalesInventory(input: App, ownerEmail: string, existingFields: ReadonlyMap<string, Field>, existingViews: ReadonlyMap<string, { tableId: string }>, afterPosition: string | null = null) {
  const base = scopeModuleAccess(input, existingViews), order = customerCartWorkflow(base)
  if (!order?.catalog || !order.cart || base.inventory) throw new ModuleCompositionError('Склад подключается к продажам с каталогом и корзиной')
  const template = structuredClone(findTemplate('sklad')!)
  const itemsDefinition = template.tables.find(table => table.key === template.inventory!.tables.items)!
  itemsDefinition.fields = itemsDefinition.fields.filter(field => ['name', 'photo', 'sku', 'opening', 'receipts', 'received', 'qty'].includes(field.key))
  itemsDefinition.views = [{ name: 'Товары на складе', type: 'grid' }]; itemsDefinition.rows = []
  // Connection reuses the sales catalogue: no demo products, journals or warehouse places.
  for (const table of template.tables) table.rows = []
  const built = buildTemplate({ template, workspaceId: base.workspaceId, afterPosition })
  const oldTable = built.tables.find(table => table.id === built.appTableId)!, stock = built.inventory!
  const generated = generateApp({ appId: base.id, workspaceId: base.workspaceId, name: 'Склад', slug: base.slug, table: oldTable,
    fields: built.fields.filter(field => field.tableId === oldTable.id) as Field[], view: built.views.find(view => view.id === built.appViewId)! as import('@tableapp/schema').View })
  const addition = templatePreset(generated, built); addition.allowlist = [{ email: ownerEmail, roleId: 'manager', company: '' }]
  const scoped = scopeModuleAccess(addition, new Map(built.views.map(view => [view.id, view])))
  const originalPhoto = base.screens.find(screen => (screen.type === 'tiles' || screen.type === 'list') && screen.source.viewId === order.catalog!.viewId)
  const photo = originalPhoto && (originalPhoto.type === 'tiles' || originalPhoto.type === 'list') ? originalPhoto.imageFieldId : null
  const mapping = new Map<string, string>([[oldTable.id, order.catalog.tableId], [stock.item.name, order.catalog.titleFieldId]])
  if (photo) mapping.set(stock.item.image!, photo)
  const rewrite = (value: unknown): unknown => typeof value === 'string' ? mapping.get(value) ?? value : Array.isArray(value) ? value.map(rewrite) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, part]) => [key, rewrite(part)])) : value
  const fields = built.fields.filter(field => !mapping.has(field.id)).map(field => rewrite(field) as typeof field)
  const existingNames = new Set([...existingFields.values()].filter(field => field.tableId === order.catalog!.tableId).map(field => field.name))
  let position = [...existingFields.values()].filter(field => field.tableId === order.catalog!.tableId).map(field => field.position).sort().at(-1) ?? null
  for (const field of fields.filter(field => field.tableId === order.catalog!.tableId)) {
    if (field.id === stock.item.sku && existingNames.has(field.name)) field.name = 'Складской артикул'
    if (existingNames.has(field.name)) throw new ModuleCompositionError(`Колонка «${field.name}» уже есть в каталоге. Перенос существующего складского учёта требует отдельной проверки.`)
    existingNames.add(field.name); field.position = position = positionBetween(position, null)
  }
  if (!order.cart.productFieldId) {
    const id = newId('field'), itemFields = [...existingFields.values()].filter(field => field.tableId === order.cart!.itemsTableId)
    fields.push({ id, tableId: order.cart.itemsTableId, name: 'Товар каталога', type: 'relation', options: { tableId: order.catalog.tableId, allowMultiple: false }, description: 'Постоянная ссылка на товар для резерва заказа.', position: positionBetween(itemFields.map(field => field.position).sort().at(-1) ?? null, null) })
    order.cart.productFieldId = id
    const role = base.modules!.find(module => module.source.type === 'customer' && module.source.tableId === order.tableId)!.roles!.manager!
    for (const screen of base.screens) if (screen.type === 'detail' && screen.tableId === order.cart.itemsTableId) screen.components.push({ id: newId('component'), position: positionBetween(screen.components.map(component => component.position).sort().at(-1) ?? null, null), type: 'field', fieldId: id, roles: [role], visibleWhen: null, label: null, showWhenEmpty: false })
  }
  if (!order.stock) {
    const candidates = order.cancellableStatuses.filter(status => status !== order.initialStatus)
    if (candidates.length !== 1) throw new ModuleCompositionError('Для этого сценария требуется явная привязка этапа подтверждения заказа')
    order.stock = { confirmedStatus: candidates[0]! }
  }
  const warehouse = rewrite(scoped) as App
  warehouse.modules![0]!.dependsOn = [base.modules!.find(module => module.kind === 'sales')!.id]
  const views = built.views.map(view => rewrite(view) as typeof view)
  const app = composeModules(base, warehouse, new Map([...existingViews, ...views.map(view => [view.id, view] as const)]))
  return { already: false as const, app, tables: built.tables.filter(table => table.id !== oldTable.id), fields, views, source: null }
}
