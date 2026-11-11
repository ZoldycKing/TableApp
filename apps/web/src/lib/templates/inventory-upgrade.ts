import { byPosition, positionBetween, type App, type Field, type View } from '@tableapp/schema'
import { buildTemplate, type BuiltTemplate } from './build'
import { sklad } from './defs/sklad'
import { asInventory, withInventoryOperations } from './inventory-app'
import { checkAppReferences } from '../app-references'

export class InventorySetupError extends Error {}

/** Preserve row/field IDs and existing balances; only add the journal and derived stock. */
export function prepareInventoryUpgrade(app: App, table: { id: string; workspaceId: string; templateId: string | null }, fields: Field[], views: View[], afterPosition: string | null) {
  if (app.inventory || app.production || app.roles.some(role => !['client', 'manager', 'staff'].includes(role.id)) ||
      table.templateId !== 'sklad' || !app.screens.some(s => s.type === 'list') || !app.screens.some(s => s.type === 'detail' && s.tableId === table.id)) throw new InventorySetupError('Этот склад уже настроен или содержит нестандартные роли. Настройте новый шаблон «Склад и остатки».')
  const opening = fields.find(field => field.name === 'Остаток' && field.type === 'number')
  if (app.screens.length !== 5 || app.screens.filter(screen => screen.type === 'list').length !== 1 ||
      app.screens.filter(screen => screen.type === 'detail').length !== 1 || app.screens.filter(screen => screen.type === 'dashboard').length !== 1 ||
      !['create', 'edit'].every(mode => app.screens.some(screen => screen.type === 'form' && screen.tableId === table.id && screen.mode === mode))) throw new InventorySetupError('Экраны склада доработаны. Автоматическое подключение не заменяет ваши экраны; используйте новый складской шаблон.')
  if (!opening || fields.some(field => ['Начальный остаток', 'Приёмки', 'Принято, шт', 'Движения', 'Изменение запаса, шт'].includes(field.name))) throw new InventorySetupError('Структура склада изменена: автоматическое подключение недоступно')
  const built = buildTemplate({ template: sklad, workspaceId: app.workspaceId, afterPosition })
  const replacements = new Map<string, string>([[built.appTableId, table.id]])
  const openingId = built.inventory!.item.opening
  const originalFields = new Set<string>()
  for (const field of built.fields.filter(field => field.tableId === built.appTableId)) {
    const existing = field.id === openingId ? opening : fields.find(existing => existing.name === field.name && existing.type === field.type)
    if (existing) { replacements.set(field.id, existing.id); originalFields.add(existing.id) }
    else if (!['Движения', 'Изменение запаса, шт', 'Остаток'].includes(field.name)) throw new InventorySetupError(`Не найдено поле «${field.name}» ожидаемого типа`)
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
  const legacyNames = new Set(['Движения', 'Склады'])
  const legacyTables = mapped.tables.filter(item => item.id !== table.id && legacyNames.has(item.name))
  const legacyIds = new Set(legacyTables.map(item => item.id))
  return { opening, fields: additions.filter(field => field.tableId === table.id || legacyIds.has(field.tableId)), tables: legacyTables,
    views: mapped.views.filter(view => legacyIds.has(view.tableId)), app: upgradedApp }
}

function remapRead<T>(value: T, from: string, to: string): T {
  if (Array.isArray(value)) return value.map(item => remapRead(item, from, to)) as T
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) =>
    [key, (key === 'fieldId' || key.endsWith('FieldId')) && item === from ? to : remapRead(item, from, to)])) as T
  return value
}

/** Upgrade receipt-only warehouses in place; never rewrite rows or published screens. */
export function prepareStockOperationsUpgrade(app: App, fields: Field[], views: View[]) {
  if (!app.inventory || app.inventory.operations) throw new InventorySetupError('Склад уже настроен или журнал приёмок ещё не подключён')
  const config = app.inventory
  if (!app.roles.some(role => role.id === 'manager') || app.roles.some(role => !['staff', 'manager', 'client'].includes(role.id)) ||
      app.screens.length !== 7 || !app.screens.some(s => s.type === 'detail' && s.tableId === config.tables.items) ||
      !app.screens.some(s => s.type === 'list' && s.metaFieldId === config.movement.qty)) throw new InventorySetupError('Склад содержит нестандартные роли или экраны. Автоматическое подключение не заменяет ваши настройки.')
  const catalog = { tableIds: new Set([config.tables.items, config.tables.movements]), fields: new Map(fields.map(f => [f.id, f])), views: new Map(views.map(v => [v.id, v])) }
  if (checkAppReferences(app, catalog)) throw new InventorySetupError('Структура склада изменена. Проверьте поля и формулу остатка перед подключением операций.')
  const built = buildTemplate({ template: sklad, workspaceId: app.workspaceId })
  const fresh = built.inventory!, operations = fresh.operations!
  const positions = new Map<string, string | null>([config.tables.items, config.tables.movements].map(id => [id, fields.filter(f => f.tableId === id).sort(byPosition).at(-1)?.position ?? null]))
  const additions = built.fields.filter(f => Object.values(operations.fields).includes(f.id)).map(f => {
    if (fields.some(existing => existing.tableId === config.tables.movements && existing.name === f.name)) throw new InventorySetupError(`Поле «${f.name}» уже существует. Автоматическое подключение не изменяет ваши поля.`)
    const position = positionBetween(positions.get(config.tables.movements) ?? null, null)
    positions.set(config.tables.movements, position)
    return { ...f, tableId: config.tables.movements, position }
  })
  const rollup = fields.find(f => f.tableId === config.tables.items && f.type === 'rollup' && f.options.relationFieldId === config.item.movements && f.options.targetFieldId === config.movement.qty && f.options.fn === 'sum')!
  const renames = new Map([
    [config.item.movements, 'Движения'], [rollup.id, 'Изменение запаса, шт'], [config.movement.name, 'Операция'],
    [config.movement.qty, 'Изменение, шт'], [config.movement.author, 'Кто записал'],
  ])
  const updates = fields.filter(f => renames.has(f.id) || f.id === config.item.stock).map(f => {
    const name = renames.get(f.id) ?? f.name
    if (fields.some(other => other.id !== f.id && other.tableId === f.tableId && other.name === name)) throw new InventorySetupError(`Название «${name}» уже занято другой колонкой.`)
    if (name !== f.name && fields.some(other => other.id !== config.item.stock && other.tableId === f.tableId && other.type === 'formula' && other.options.expression.includes(`{${f.name}}`))) throw new InventorySetupError(`Ваша формула использует «${f.name}». Автоматическое подключение не меняет пользовательские формулы.`)
    const corresponding = built.fields.find(field => field.name === name)
    return { ...f, name, description: corresponding?.description ?? f.description,
      options: f.id === config.item.stock ? { ...f.options, expression: `{${fields.find(field => field.id === config.item.opening)!.name}} + {Изменение запаса, шт}` } : f.options }
  })
  return { fields: additions, updates, app: withInventoryOperations(app, operations) }
}
