import { appSchema, byPosition, newBlock, newId, positionSequence, type App, type Screen, type View } from '@tableapp/schema'
import type { TableSummary } from './queries'
import { generateApp } from './app-builder'

export type SectionSource = { table: TableSummary; view: View }
export type SectionType = 'list' | 'tiles' | 'dashboard' | 'form'
export const SECTION_TYPES: { id: SectionType; name: string; icon: string }[] = [
  { id: 'list', name: 'Список', icon: 'list' }, { id: 'tiles', name: 'Карточки', icon: 'grid' },
  { id: 'dashboard', name: 'Сводка', icon: 'chart' }, { id: 'form', name: 'Форма', icon: 'plus' },
]
export function sectionIcon(name: string) {
  return /расход|доход|финанс|бюджет/i.test(name) ? 'chart' : /проект|задач|план/i.test(name) ? 'clipboard'
    : /замет|дневник|документ/i.test(name) ? 'file' : /люди|контакт/i.test(name) ? 'users' : /книг|вещ|коллекц|товар/i.test(name) ? 'box' : 'list'
}
export function sectionSources(tables: TableSummary[], views: View[]): SectionSource[] {
  return tables.flatMap(table => {
    const view = views.find(view => view.tableId === table.id && view.type === 'grid') ?? views.find(view => view.tableId === table.id)
    return view ? [{ table, view }] : []
  })
}
const slot = (screen: Screen) => screen.type === 'form' ? `form:${screen.mode}` : screen.type === 'tiles' ? 'list' : screen.type
const remapLinks = (value: unknown, ids: Map<string, string>): unknown => {
  if (Array.isArray(value)) return value.map(item => remapLinks(item, ids))
  if (!value || typeof value !== 'object') return value
  if ('kind' in value && value.kind === 'literal') return value
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key,
    (key === 'screenId' || key.endsWith('ScreenId')) && typeof child === 'string' ? ids.get(child) ?? child : remapLinks(child, ids)]))
}

/** Reuses stable navigation and form IDs; tables and records are never changed here. */
export function putSection(app: App, input: { source: SectionSource; type: SectionType; name: string; icon: string; rootId?: string }) {
  const root = app.screens.find(screen => screen.id === input.rootId)
  if (input.rootId && (!root?.sectionId || root.sectionId !== root.id)) throw new Error('Этот раздел настраивается в полном конструкторе.')
  const old = root ? app.screens.filter(screen => screen.sectionId === root.id) : []
  const module = app.moduleAccess ? app.modules?.find(module => module.screenIds?.includes(root?.id ?? '')) ?? app.modules?.[0] : undefined
  const roles = root?.access.roles ?? (app.purpose === 'business' && !app.modules?.length
    ? app.roles.filter(role => role.id === 'manager' || role.id === 'staff').map(role => role.id)
    : [module?.roles?.manager ?? app.roles.find(role => role.id === 'manager')?.id ?? app.roles.find(role => !role.isDefault)?.id ?? app.roles[0]?.id].filter((id): id is string => Boolean(id)))
  if (!roles.length) throw new Error('Для раздела не настроен доступ.')
  const generated = generateApp({ appId: app.id, workspaceId: app.workspaceId, name: input.name, slug: app.slug, ...input.source, fields: input.source.table.fields })
  const mainSlot = input.type === 'form' ? 'form:create' : input.type === 'tiles' ? 'list' : input.type
  const rootId = root?.id ?? newId('screen')
  const ids = new Map(generated.screens.map(screen => [screen.id, slot(screen) === mainSlot ? rootId : old.find(previous => slot(previous) === slot(screen))?.id ?? screen.id]))
  const list = generated.screens.find(screen => screen.type === 'list')!
  const detail = generated.screens.find(screen => screen.type === 'detail')!
  const positions = positionSequence(app.screens.length + generated.screens.length)
  const group = generated.screens.filter(screen => input.type === 'dashboard' || screen.type !== 'dashboard').map(screen => {
    let next = { ...screen, id: ids.get(screen.id)!, sectionId: rootId, access: { ...screen.access, public: false, roles, publicFields: [] }, tab: null } as Screen
    if (next.type === 'dashboard') {
      const count = { ...newBlock('metric', { id: newId('component'), position: 'a0', viewId: input.source.view.id }), title: 'Записей', kind: 'count' }
      const recent = { ...newBlock('list', { id: newId('component'), position: 'a1', viewId: input.source.view.id }), title: input.source.table.name,
        titleFieldId: input.source.table.primaryFieldId, onTapScreenId: detail.id, moreScreenId: list.id }
      next = { ...next, blocks: [count, recent] } as Screen
    }
    if (next.id === rootId) next = { ...next, name: input.name.trim(), tab: { label: input.name.trim().slice(0, 30), icon: input.icon },
      ...(next.type === 'list' && input.type === 'tiles' ? { type: 'tiles', columns: 2 } : {}) } as Screen
    return remapLinks(next, ids) as Screen
  })
  const ordered = [...app.screens].sort(byPosition)
  const screens = root ? ordered.flatMap(screen => screen.id === root.id ? group : screen.sectionId === root.id ? [] : [screen]) : [...ordered, ...group]
  const next = appSchema.parse({ ...app, homeScreenId: app.homeScreenId ?? rootId,
    screens: screens.map((screen, index) => ({ ...screen, position: positions[index]! })),
    ...(module ? { modules: app.modules!.map(item => item.id === module.id ? { ...item, screenIds: [...(item.screenIds ?? []).filter(id => !old.some(screen => screen.id === id)), ...group.map(screen => screen.id)] } : item) } : {}) })
  return { app: next, screenId: rootId }
}

export function removeSection(app: App, rootId: string): App {
  const root = app.screens.find(screen => screen.id === rootId)
  if (!root?.sectionId || root.sectionId !== root.id) throw new Error('Этот раздел относится к готовому сценарию.')
  const removed = new Set(app.screens.filter(screen => screen.sectionId === rootId).map(screen => screen.id))
  const screens = app.screens.filter(screen => !removed.has(screen.id))
  if (!screens.some(screen => screen.tab)) throw new Error('Оставьте хотя бы один раздел приложения.')
  const home = removed.has(app.homeScreenId ?? '') ? screens.find(screen => screen.tab)!.id : app.homeScreenId
  // Drop links to the removed section, including overview lists and action buttons.
  const clean = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.filter(item => {
      if (!item || typeof item !== 'object') return true
      const candidate = item as Record<string, unknown>, action = candidate.action as Record<string, unknown> | undefined
      return !(typeof candidate.screenId === 'string' && removed.has(candidate.screenId)) && !(action?.type === 'open_screen' && removed.has(String(action.screenId)))
    }).map(clean)
    if (!value || typeof value !== 'object') return value
    if ('kind' in value && value.kind === 'literal') return value
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, (key === 'screenId' || key.endsWith('ScreenId')) && typeof child === 'string' && removed.has(child) ? null : clean(child)]))
  }
  return appSchema.parse({ ...app, homeScreenId: home, screens: clean(screens),
    ...(app.modules ? { modules: app.modules.map(module => ({ ...module, ...(module.screenIds ? { screenIds: module.screenIds.filter(id => !removed.has(id)) } : {}) })) } : {}) })
}

export function moveSection(app: App, id: string, delta: -1 | 1): App {
  const tabs = app.screens.filter(screen => screen.tab).sort(byPosition), at = tabs.findIndex(screen => screen.id === id), other = tabs[at + delta]
  if (at < 0 || !other) return app
  const current = tabs[at]!
  return { ...app, screens: app.screens.map(screen => screen.id === current.id ? { ...screen, position: other.position } : screen.id === other.id ? { ...screen, position: current.position } : screen).sort(byPosition) }
}

type TablesAppInput = { id: string; workspaceId: string; name: string; slug: string; email: string; sources: SectionSource[] }
export function tablesApp(input: TablesAppInput, purpose: 'personal' | 'business'): App {
  let app = appSchema.parse({ id: input.id, workspaceId: input.workspaceId, name: input.name, slug: input.slug, purpose,
    theme: { accent: 'green' }, roles: purpose === 'personal' ? [{ id: 'manager', name: 'Владелец', isDefault: true }]
      : [{ id: 'manager', name: 'Владелец', isDefault: false }, { id: 'staff', name: 'Сотрудник', isDefault: true }], accessMode: 'allowlist',
    allowlist: [{ email: input.email.trim().toLowerCase(), roleId: 'manager', company: '' }] })
  for (const source of input.sources) app = putSection(app, { source, type: 'list', name: source.table.name, icon: sectionIcon(source.table.name) }).app
  return app
}

export function personalApp(input: TablesAppInput): App { return tablesApp(input, 'personal') }
