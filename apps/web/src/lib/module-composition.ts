import { appSchema, MODULE_DEFINITIONS, positionSequence, type App, type AppModule, type Screen } from '@tableapp/schema'
import { legacyAppModules, moduleContract } from './app-modules'

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

/** Pilot only: one appointment engine and one sales engine, each retaining its own tables and rules. */
export function composePilot(base: App, addition: App, views: ViewTables): App {
  const first = scopeModuleAccess(base, views), second = scopeModuleAccess(addition, views)
  const kinds = [...first.modules!, ...second.modules!].map(module => module.kind).sort()
  if (kinds.join(',') !== 'booking,sales') throw new ModuleCompositionError('Сейчас можно объединить запись на услуги и продажу товаров')
  const screens = [...first.screens, ...second.screens]
  const publicCatalog = (app: App) => app.screens.find(screen => (screen.type === 'list' || screen.type === 'tiles') && screen.access.public)?.id
  const catalogScreens = [publicCatalog(first), publicCatalog(second)]
  if (catalogScreens.some(id => !id)) throw new ModuleCompositionError('Для каждого раздела требуется публичный каталог')
  const bookingOwner = first.booking ? first : second, booking = bookingOwner.booking!
  const listScreenId = booking.listScreenId ?? bookingOwner.screens.find(screen => (screen.type === 'list' || screen.type === 'tiles') &&
    screen.access.roles.includes('client') && views.get(screen.source.viewId)?.tableId === booking.tables.visits)?.id
  if (!listScreenId) throw new ModuleCompositionError('Для записи требуется экран собственных посещений клиента')
  return appSchema.parse({ ...first, booking: { ...booking, listScreenId }, customer: first.customer ?? second.customer,
    modules: [...first.modules!, ...second.modules!], moduleAccess: { grants: [...first.moduleAccess!.grants, ...second.moduleAccess!.grants] },
    roles: [...first.roles, ...second.roles.filter(role => !first.roles.some(existing => existing.id === role.id))],
    rowAccessRules: [...first.rowAccessRules, ...second.rowAccessRules], catalogScreenIds: catalogScreens, homeScreenId: catalogScreens[0],
    screens: screens.map((screen, index) => ({ ...screen, appId: first.id, position: positionSequence(screens.length)[index]!,
      ...(screen.id === catalogScreens[0] ? { name: 'Каталог', tab: { icon: 'grid', label: 'Каталог' } } : screen.id === catalogScreens[1] ? { tab: null } : {}) })),
  })
}
