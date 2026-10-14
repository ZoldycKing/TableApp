import { MODULE_DEFINITIONS, type App, type AppModule, type ModuleKind, type Screen } from '@tableapp/schema'

type ViewTables = Readonly<Record<string, { tableId: string }>>
export type RuntimeNavigationGroup = { id: string; moduleId: string | null; kind: ModuleKind | null; label: string; screens: Screen[] }
export type RuntimeNavigationIssue = { code: 'catalog-detail-mismatch' | 'ambiguous-module-screen'; screenId: string; expectedScreenId?: string; actualScreenId?: string | null }
export type RuntimeNavigation = { mode: 'work' | 'client'; work: boolean; tabs: Screen[]; groups: RuntimeNavigationGroup[];
  actionsByScreen: Record<string, Screen[]>; activeParentByScreen: Record<string, string>; issues: RuntimeNavigationIssue[] }

const ORDER: readonly ModuleKind[] = ['sales', 'inventory', 'production', 'booking', 'repair', 'delivery', 'field_service', 'property', 'crm', 'requests', 'support']
const LABELS: Partial<Record<ModuleKind, string>> = { sales: 'Продажи', inventory: 'Склад', production: 'Производство' }
const collection = (screen: Screen) => screen.type === 'list' || screen.type === 'tiles'
const tableOf = (screen: Screen, views: ViewTables) => 'tableId' in screen ? screen.tableId : 'source' in screen ? views[screen.source.viewId]?.tableId : undefined

/** Default copy may be clarified; an edited screen or tab name remains the person's choice. */
function label(screen: Screen, defaults: readonly string[], replacement: string) {
  const names = new Set(defaults)
  if (screen.tab?.label && !names.has(screen.tab.label)) return screen.tab.label
  return names.has(screen.name) ? replacement : screen.name
}
function displayScreen(app: App, module: AppModule, screen: Screen, views: ViewTables): Screen {
  let name = screen.tab?.label ?? screen.name
  if (screen.type === 'dashboard') {
    const suffix = module.kind === 'sales' ? 'продаж' : module.kind === 'inventory' ? 'склада' : module.kind === 'production' ? 'производства' : null
    if (suffix) name = label(screen, ['Главная', 'Сводка', 'Сводка продаж', 'Сводка склада', 'Сводка производства'], `Сводка ${suffix}`)
    return { ...screen, name, tab: screen.tab ? { ...screen.tab, label: name, icon: 'chart' } : null }
  }
  if (collection(screen)) {
    const tableId = tableOf(screen, views)
    if (module.kind === 'inventory' && tableId === app.inventory?.tables.items) name = label(screen, ['Товары', 'Товары на складе', 'Склад', 'Остатки'], 'Остатки')
    if (module.kind === 'inventory' && tableId === app.inventory?.tables.movements) name = label(screen, ['Приёмки', 'Движения', 'Журнал', 'Журнал склада', 'Движения товаров'], 'Движения товаров')
    if (module.kind === 'production' && tableId === app.production?.tables.movements) name = label(screen, ['Журнал', 'Журнал склада', 'Движения', 'Движения материалов'], 'Движения материалов')
  }
  return { ...screen, name, tab: screen.tab ? { ...screen.tab, label: name } : null }
}

/** Input screens are already permission-projected by the live server or preview runtime. */
export function buildRuntimeNavigation(visibleApp: App, views: ViewTables): RuntimeNavigation {
  const app = visibleApp, modules = app.modules ?? [], byId = new Map(app.screens.map(screen => [screen.id, screen])), owners = new Map<string, AppModule>()
  const issues: RuntimeNavigationIssue[] = []
  const clientRoles = new Set(app.roles.filter(role => role.isDefault).map(role => role.id))
  const workScreen = (screen: Screen, module: AppModule) => !screen.access.public &&
    !screen.access.roles.some(role => clientRoles.has(role)) && screen.access.roles.some(role => Object.values(module.roles ?? {}).includes(role))
  const checkoutForms = new Set([app.booking?.formScreenId, app.customer?.formScreenId, ...(app.customerSections ?? []).map(config => config.formScreenId)].filter(Boolean))
  for (const module of modules) for (const id of module.screenIds ?? []) {
    if (!byId.has(id)) continue
    if (owners.has(id)) { issues.push({ code: 'ambiguous-module-screen', screenId: id }); owners.delete(id) }
    else if (!issues.some(issue => issue.code === 'ambiguous-module-screen' && issue.screenId === id)) owners.set(id, module)
  }
  const work = app.screens.some(screen => {
    const module = owners.get(screen.id)
    return module && workScreen(screen, module)
  })
  if (!work) return { mode: 'client', work: false, tabs: app.screens.filter(screen => screen.tab), groups: [], actionsByScreen: {}, activeParentByScreen: {}, issues }

  const actionsByScreen: Record<string, Screen[]> = {}, activeParentByScreen: Record<string, string> = {}, hiddenForms = new Set<string>()
  const displayed = new Map(app.screens.map(screen => [screen.id, owners.has(screen.id) ? displayScreen(app, owners.get(screen.id)!, screen, views) : screen]))
  for (const screen of app.screens) {
    const module = owners.get(screen.id)
    if (!module) continue
    const collections = app.screens.filter(candidate => candidate.tab && collection(candidate) && owners.get(candidate.id)?.id === module.id)
    if (screen.tab && screen.type === 'form' && screen.mode === 'create' && workScreen(screen, module) &&
      screen.id !== app.booking?.setupScreenId && !checkoutForms.has(screen.id)) {
      const success = collections.find(candidate => candidate.id === screen.successScreenId)
      const parent = success ?? collections.find(candidate => tableOf(candidate, views) === screen.tableId)
      if (parent) {
        const actions = actionsByScreen[parent.id] ??= []
        actions.push(module.kind === 'inventory' && screen.tableId === app.inventory?.tables.items
          ? { ...screen, name: label(screen, ['Добавить', 'Новая запись', 'Добавить запись'], 'Добавить товар') } : screen)
        activeParentByScreen[screen.id] = parent.id
        hiddenForms.add(screen.id)
      }
    } else if (screen.type === 'detail' || screen.type === 'form' && screen.mode === 'edit') {
      const parent = collections.find(candidate => (candidate.type === 'list' || candidate.type === 'tiles') && candidate.onTapScreenId === screen.id)
      if (parent) activeParentByScreen[screen.id] = parent.id
    }
  }
  for (const config of [app.customer, ...(app.customerSections ?? [])]) {
    if (!config?.catalog) continue
    for (const screen of app.screens) if ((screen.type === 'list' || screen.type === 'tiles') && screen.source.viewId === config.catalog.viewId && owners.get(screen.id)?.source.type === 'customer') {
      if (screen.onTapScreenId !== config.catalog.detailScreenId) issues.push({ code: 'catalog-detail-mismatch', screenId: screen.id, expectedScreenId: config.catalog.detailScreenId, actualScreenId: screen.onTapScreenId })
    }
  }
  const groups: RuntimeNavigationGroup[] = [...modules].sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind)).flatMap(module => {
    const screens = app.screens.filter(screen => screen.tab && owners.get(screen.id)?.id === module.id && !hiddenForms.has(screen.id))
      .map(screen => displayed.get(screen.id)!).sort((a, b) => Number(a.type === 'dashboard') - Number(b.type === 'dashboard'))
    return screens.length ? [{ id: module.id, moduleId: module.id, kind: module.kind, label: LABELS[module.kind] ?? MODULE_DEFINITIONS[module.kind].name, screens }] : []
  })
  const ungrouped = app.screens.filter(screen => screen.tab && !owners.has(screen.id))
  if (ungrouped.length) groups.push({ id: 'other', moduleId: null, kind: null, label: 'Другие разделы', screens: ungrouped })
  return { mode: 'work', work: true, tabs: app.screens.filter(screen => screen.tab && !hiddenForms.has(screen.id)).map(screen => displayed.get(screen.id)!), groups, actionsByScreen, activeParentByScreen, issues }
}
