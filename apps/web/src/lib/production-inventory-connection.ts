import { type App, type Field, type View } from '@tableapp/schema'
import { generateApp } from './app-builder'
import { composeModules, ModuleCompositionError, scopeModuleAccess } from './module-composition'
import { orderStockPair } from './order-stock-config'
import { buildTemplate } from './templates/build'
import { findTemplate } from './templates/catalog'
import { DIRECTOR } from './templates/production-app'
import { templatePreset } from './templates/presets'

/** Fresh production records share exact warehouse product IDs; no products, quantities or historical rows are copied. */
export function connectProductionInventory(input: App, ownerEmail: string, existingFields: ReadonlyMap<string, Field>, existingViews: ReadonlyMap<string, { tableId: string }>, afterPosition: string | null = null) {
  const base = scopeModuleAccess(input, existingViews), pair = orderStockPair(base)
  const inventoryModule = base.modules!.find(module => module.kind === 'inventory')
  if (!pair || !inventoryModule || base.production || base.modules!.some(module => module.kind === 'production')) throw new ModuleCompositionError('Сначала подключите продажи и склад с общим каталогом; производство должно быть новым')
  const title = existingFields.get(pair.inventory.item.name)
  if (!title || title.tableId !== pair.inventory.tables.items || !['text', 'long_text'].includes(title.type)) throw new ModuleCompositionError('Сохраните явную привязку названия товара в общем каталоге')

  const template = structuredClone(findTemplate('proizvodstvo')!)
  for (const table of template.tables) table.rows = []
  const products = template.tables.find(table => table.key === 'products')!
  // Production needs read access to product names, without a second product directory or access to sales/warehouse editing.
  products.fields = products.fields.filter(field => field.key === 'name')
  products.views = [{ name: 'Вся продукция', type: 'grid' }]
  const built = buildTemplate({ template, workspaceId: base.workspaceId, afterPosition })
  const table = built.tables.find(table => table.id === built.appTableId)!
  const generated = generateApp({ appId: base.id, workspaceId: base.workspaceId, name: built.appName, slug: base.slug, table,
    fields: built.fields.filter(field => field.tableId === table.id) as Field[], view: built.views.find(view => view.id === built.appViewId)! as View })
  const addition = templatePreset(generated, built)
  addition.allowlist = [{ email: ownerEmail, roleId: DIRECTOR, company: '' }]
  const scoped = scopeModuleAccess(addition, new Map(built.views.map(view => [view.id, view])))
  const product = built.production!.products
  const mapping = new Map([[product.table, pair.inventory.tables.items], [product.name, pair.inventory.item.name]])
  const rewrite = (value: unknown): unknown => typeof value === 'string' ? mapping.get(value) ?? value : Array.isArray(value) ? value.map(rewrite)
    : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, part]) => [key, rewrite(part)])) : value
  const production = rewrite(scoped) as App
  production.production!.stock = { itemsTableId: pair.inventory.tables.items, materialStockFieldId: built.production!.material.stock }
  production.modules![0]!.dependsOn = [inventoryModule.id]
  const views = built.views.map(view => rewrite(view) as typeof view)
  const app = composeModules(base, production, new Map([...existingViews, ...views.map(view => [view.id, view] as const)]))
  return { already: false as const, app, tables: built.tables.filter(table => table.id !== product.table),
    fields: built.fields.filter(field => field.tableId !== product.table).map(field => rewrite(field) as typeof field), views, source: null }
}
