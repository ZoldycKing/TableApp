import { byPosition, positionBetween, type App, type Field, type View } from '@tableapp/schema'
import { buildTemplate, type BuiltTemplate } from './build'
import { sklad } from './defs/sklad'
import { asInventory } from './inventory-app'

export class InventorySetupError extends Error {}

/** Preserve row/field IDs and existing balances; only add the journal and derived stock. */
export function prepareInventoryUpgrade(app: App, table: { id: string; workspaceId: string; templateId: string | null }, fields: Field[], views: View[], afterPosition: string | null) {
  if (app.inventory || app.production || app.roles.some(role => !['client', 'manager', 'staff'].includes(role.id)) ||
      table.templateId !== 'sklad' || !app.screens.some(s => s.type === 'list') || !app.screens.some(s => s.type === 'detail' && s.tableId === table.id)) throw new InventorySetupError('Этот склад уже настроен или содержит нестандартные роли. Настройте новый шаблон «Склад и остатки».')
  const opening = fields.find(field => field.name === 'Остаток' && field.type === 'number')
  if (app.screens.length !== 5 || app.screens.filter(screen => screen.type === 'list').length !== 1 ||
      app.screens.filter(screen => screen.type === 'detail').length !== 1 || app.screens.filter(screen => screen.type === 'dashboard').length !== 1 ||
      !['create', 'edit'].every(mode => app.screens.some(screen => screen.type === 'form' && screen.tableId === table.id && screen.mode === mode))) throw new InventorySetupError('Экраны склада доработаны. Автоматическое подключение не заменяет ваши экраны; используйте новый складской шаблон.')
  if (!opening || fields.some(field => ['Начальный остаток', 'Приёмки', 'Принято, шт'].includes(field.name))) throw new InventorySetupError('Структура склада изменена: автоматическое подключение недоступно')
  const built = buildTemplate({ template: sklad, workspaceId: app.workspaceId, afterPosition })
  const replacements = new Map<string, string>([[built.appTableId, table.id]])
  const openingId = built.inventory!.item.opening
  const originalFields = new Set<string>()
  for (const field of built.fields.filter(field => field.tableId === built.appTableId)) {
    const existing = field.id === openingId ? opening : fields.find(existing => existing.name === field.name && existing.type === field.type)
    if (existing) { replacements.set(field.id, existing.id); originalFields.add(existing.id) }
    else if (!['Приёмки', 'Принято, шт', 'Остаток'].includes(field.name)) throw new InventorySetupError(`Не найдено поле «${field.name}» ожидаемого типа`)
  }
  const list = app.screens.find(s => s.type === 'list')!
  const itemView = views.find(view => list.type === 'list' && view.id === list.source.viewId && view.tableId === table.id)
  if (!itemView) throw new InventorySetupError('Не найдено представление товаров')
  replacements.set(built.appViewId, itemView.id)
  const remap = (value: unknown): unknown => typeof value === 'string' ? replacements.get(value) ?? value
    : Array.isArray(value) ? value.map(remap)
    : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, value]) => [key, remap(value)])) : value
  const mapped = remap(built) as BuiltTemplate
  let position = [...fields].sort(byPosition).at(-1)?.position ?? null
  const additions = mapped.fields.filter(field => !originalFields.has(field.id))
  for (const field of additions.filter(field => field.tableId === table.id)) {
    position = positionBetween(position, null); field.position = position
  }
  // Keep existing form fields bound to the opening balance; read screens show derived stock.
  const stock = mapped.inventory!.item.stock
  const screens = app.screens.map(screen => screen.type === 'form' ? screen : remapRead(screen, opening.id, stock))
  let upgradedApp = asInventory({ ...app, screens }, mapped)
  // Existing assigned users keep their legacy role ID, with the worker's permissions.
  if (app.roles.some(role => role.id === 'client')) upgradedApp = { ...upgradedApp,
    roles: [...upgradedApp.roles, { id: 'client', name: 'Кладовщик (прежняя роль)', isDefault: false }],
    screens: upgradedApp.screens.map(screen => screen.access.roles.includes('staff') ? { ...screen, access: { ...screen.access, roles: [...screen.access.roles, 'client'] } } : screen),
  }
  return { opening, fields: additions, tables: mapped.tables.filter(t => t.id !== table.id),
    views: mapped.views.filter(view => view.tableId !== table.id), app: upgradedApp }
}

function remapRead<T>(value: T, from: string, to: string): T {
  if (Array.isArray(value)) return value.map(item => remapRead(item, from, to)) as T
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) =>
    [key, key.endsWith('FieldId') && item === from ? to : remapRead(item, from, to)])) as T
  return value
}
