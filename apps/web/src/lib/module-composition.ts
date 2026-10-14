import { appSchema, compatibleModuleKinds, customerWorkflows, MODULE_DEFINITIONS, positionSequence, type App, type AppModule, type Screen } from '@tableapp/schema'
import { legacyAppModules, moduleContract } from './app-modules'
import { orderStockPair } from './order-stock-config'

type ViewTables = ReadonlyMap<string, { tableId: string }>
export class ModuleCompositionError extends Error {}
function screenTables(screen: Screen, views: ViewTables): string[] {
  if ('tableId' in screen) return [screen.tableId]
  if ('source' in screen) return [views.get(screen.source.viewId)?.tableId ?? '']
  return [...new Set(screen.blocks.flatMap(block => 'source' in block ? [views.get(block.source.viewId)?.tableId ?? ''] : []))]
}

/** Preserve current access, allocating independent private role IDs for every installed module. */
export function scopeModuleAccess(input: App, views: ViewTables): App {
  if (input.moduleAccess) return structuredClone(input)
  const app = structuredClone(input), modules = app.modules ?? legacyAppModules(app)
  if (!modules.length) throw new ModuleCompositionError('У приложения нет готовых рабочих сценариев')
  if (app.rowAccessRules.some(rule => rule.match === 'company')) throw new ModuleCompositionError('Доступ по организации требует отдельного переноса. Существующие права приложения сохранены.')
  const client = app.roles.find(role => role.isDefault && role.id === 'client')
  const oldRoles = app.roles.filter(role => role.id !== client?.id)
  const owner = (tableId: string): AppModule | undefined => modules.find(module => moduleContract(app, module)?.writeTables.includes(tableId))
    ?? modules.find(module => Object.entries(moduleContract(app, module)?.tables ?? {}).some(([name, id]) => name !== 'parent' && id === tableId))
  const scopedRoles: App['roles'] = client ? [client] : []
  for (const module of modules) {
    module.roles = Object.fromEntries(oldRoles.map(role => [role.id, `${module.id}_${role.id}`]))
    module.screenIds = []
    scopedRoles.push(...oldRoles.map(role => ({ ...role, id: module.roles![role.id]!, name: `${module.kind === 'support' ? 'Вопросы' : MODULE_DEFINITIONS[module.kind].name} · ${role.name}`.slice(0, 40), isDefault: false })))
  }
  const mapParts = (value: unknown, roles: Record<string, string>): unknown => {
    if (Array.isArray(value)) return value.map(item => mapParts(item, roles))
    if (!value || typeof value !== 'object') return value
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, key === 'roles' && Array.isArray(item) ? item.map(id => roles[String(id)] ?? id) : mapParts(item, roles)]))
  }
  app.screens = app.screens.map(screen => {
    const owners = [...new Set(screenTables(screen, views).map(owner))]
    const module = modules.length === 1 ? modules[0] : owners[0]
    if (!module || modules.length > 1 && owners.length !== 1) throw new ModuleCompositionError('Экран использует разные сценарии. Сначала разделите его источники данных.')
    module.screenIds!.push(screen.id)
    return mapParts(screen, module.roles!) as Screen
  })
  app.rowAccessRules = app.rowAccessRules.map(rule => {
    const module = owner(rule.tableId)
    if (!module) throw new ModuleCompositionError('Не найден модуль для правила доступа к строкам')
    return { ...rule, appliesTo: rule.appliesTo.map(role => module.roles![role] ?? role) }
  })
  app.moduleAccess = { grants: modules.flatMap(module => app.allowlist.flatMap(entry => module.roles![entry.roleId] ? [{ email: entry.email.trim().toLowerCase(), moduleId: module.id, roleId: module.roles![entry.roleId]! }] : [])) }
  app.roles = scopedRoles; app.modules = modules
  if (!client) app.accessMode = 'allowlist'
  return appSchema.parse(app)
}

/** Join independent engines while retaining their original configuration and resource IDs. */
export function composeModules(base: App, addition: App, views: ViewTables): App {
  if (base.workspaceId !== addition.workspaceId) throw new ModuleCompositionError('Можно подключать возможности только внутри одного бизнеса')
  const first = scopeModuleAccess(base, views), second = scopeModuleAccess(addition, views)
  const modules = [...first.modules!, ...second.modules!]
  if (!compatibleModuleKinds(modules.map(module => module.kind))) throw new ModuleCompositionError('Этот модуль уже подключён или сочетание требует отдельной интеграции склада и производства')
  if (new Set(modules.map(module => module.id)).size !== modules.length) throw new ModuleCompositionError('Эти возможности уже используют один модуль')
  const screens = [...first.screens, ...second.screens]
  if (new Set(screens.map(screen => screen.id)).size !== screens.length) throw new ModuleCompositionError('Экраны подключаемых возможностей пересекаются')
  const publicCatalogs = (app: App) => (app.modules ?? []).flatMap(module => {
    if (module.kind === 'support' || module.kind === 'inventory' || module.kind === 'production') return []
    const config = module.source.type === 'customer' ? customerWorkflows(app).find(config => module.source.type === 'customer' && config.tableId === module.source.tableId) : null
    const catalog = app.screens.find(screen => (screen.type === 'list' || screen.type === 'tiles') && screen.access.public && module.screenIds?.includes(screen.id) &&
      (module.source.type === 'booking' ? views.get(screen.source.viewId)?.tableId === app.booking?.tables.services : screen.source.viewId === config?.catalog?.viewId))
    if (!catalog && module.kind !== 'crm') throw new ModuleCompositionError(`Для модуля «${MODULE_DEFINITIONS[module.kind].name}» требуется публичный каталог`)
    return catalog ? [catalog.id] : []
  })
  const catalogScreens = [...publicCatalogs(first), ...publicCatalogs(second)]
  if (!catalogScreens.length) throw new ModuleCompositionError('Для клиентского приложения требуется хотя бы один каталог')
  const bookingOwner = first.booking ? first : second.booking ? second : null, booking = bookingOwner?.booking
  const listScreenId = booking?.listScreenId ?? bookingOwner?.screens.find(screen => (screen.type === 'list' || screen.type === 'tiles') &&
    screen.access.roles.includes('client') && views.get(screen.source.viewId)?.tableId === booking!.tables.visits)?.id
  if (booking && !listScreenId) throw new ModuleCompositionError('Для записи требуется экран собственных посещений клиента')
  const workflows = [...customerWorkflows(first), ...customerWorkflows(second)]
  if (new Set(workflows.map(config => config.tableId)).size !== workflows.length) throw new ModuleCompositionError('Несколько возможностей используют одни и те же обращения')
  const primary = first.customer ?? second.customer ?? null
  // Opening the newly attached client module to customers must not expose
  // the internal CRM screens. Existing customer admission policies stay intact.
  const firstHasClients = first.screens.some(screen => screen.access.public || screen.access.roles.includes('client'))
  const combined = appSchema.parse({ ...first, accessMode: firstHasClients ? first.accessMode : second.accessMode,
    inventory: first.inventory ?? second.inventory,
    production: first.production ?? second.production,
    booking: booking ? { ...booking, listScreenId } : null, customer: primary, customerSections: workflows.filter(config => config !== primary),
    modules, moduleAccess: { grants: [...first.moduleAccess!.grants, ...second.moduleAccess!.grants] },
    roles: [...first.roles, ...second.roles.filter(role => !first.roles.some(existing => existing.id === role.id))],
    rowAccessRules: [...first.rowAccessRules, ...second.rowAccessRules], catalogScreenIds: catalogScreens, homeScreenId: catalogScreens[0],
    screens: screens.map((screen, index) => ({ ...screen, appId: first.id, position: positionSequence(screens.length)[index]!,
      ...(screen.id === catalogScreens[0] ? { name: 'Каталог', tab: { icon: 'grid', label: 'Каталог' } } : catalogScreens.includes(screen.id) ? { tab: null } : {}) })),
  })
  if (combined.inventory && !orderStockPair(combined)) throw new ModuleCompositionError('Продажи и склад должны использовать общий каталог и явные привязки товаров заказа. Подключите склад через возможность приложения; перенос существующего склада выполняется отдельно.')
  if (combined.production && (!combined.production.stock || combined.production.stock.itemsTableId !== combined.inventory?.tables.items)) throw new ModuleCompositionError('Производство подключается к общему каталогу продаж и склада. Перенос отдельного производства требует явной проверки продукции и истории.')
  return combined
}

/** Kept for existing pilot fixtures and callers. */
export const composePilot = composeModules
