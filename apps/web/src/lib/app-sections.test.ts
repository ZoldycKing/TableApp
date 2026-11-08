import { describe, expect, it } from 'vitest'
import { byPosition, defaultViewConfig, type Field, type View } from '@tableapp/schema'
import { personalApp, tablesApp, putSection, removeSection, moveSection, sectionIcon, type SectionSource } from './app-sections'
import { checkAppReferences } from './app-references'
import { visitorFor, visibleScreensFor } from './app-roles'
import { checkModuleAccess } from './module-access'
import { templateExample } from './templates/presentation'

export function personalSource(id: string, name: string): SectionSource {
  const fields: Field[] = [{ id: `${id}_name`, tableId: id, name: 'Название', type: 'text', options: {}, description: null, position: 'a0' },
    { id: `${id}_amount`, tableId: id, name: 'Сумма', type: 'number', options: { format: 'plain', precision: 0, currency: 'RUB', showThousandsSeparator: true }, description: null, position: 'a1' }]
  return { table: { id, name, primaryFieldId: fields[0]!.id, fields }, view: { id: `${id}_view`, tableId: id, name: 'Все записи', type: 'grid', position: 'a0', config: defaultViewConfig('grid', 'filter') } as View }
}
const expenses = personalSource('expenses', 'Расходы'), projects = personalSource('projects', 'Проекты')
const build = () => personalApp({ id: 'app_test', workspaceId: 'workspace', name: 'Мои дела', slug: 'moi-dela', email: 'me@example.invalid', sources: [expenses, projects] })
const catalog = { tableIds: new Set(['expenses', 'projects']), views: new Map([expenses, projects].map(source => [source.view.id, { tableId: source.table.id }])), fields: new Map([expenses, projects].flatMap(source => source.table.fields.map(field => [field.id, field] as const))) }

describe('personal apps and editable navigation sections', () => {
  it('prepares team roles while keeping an unlisted colleague and guests out', () => {
    const app = tablesApp({ id: 'app_team', workspaceId: 'workspace', name: 'Команда', slug: 'team', email: 'Owner@Example.invalid', sources: [expenses] }, 'business')
    expect(app.purpose).toBe('business')
    expect(app.accessMode).toBe('allowlist')
    expect(app.roles.find(role => role.isDefault)?.id).toBe('staff')
    expect(app.allowlist).toEqual([{ email: 'owner@example.invalid', roleId: 'manager', company: '' }])
    expect(visibleScreensFor(app, visitorFor(app, null))).toHaveLength(0)
    expect(visibleScreensFor(app, visitorFor(app, 'colleague@example.invalid'))).toHaveLength(0)
    const invited = { ...app, allowlist: [...app.allowlist, { email: 'colleague@example.invalid', roleId: 'staff', company: '' }] }
    expect(visibleScreensFor(invited, visitorFor(invited, 'colleague@example.invalid'))).toHaveLength(app.screens.length)
    expect(checkAppReferences(app, catalog)).toBeNull()
  })
  it('builds a private usable section for every table without changing the sources', () => {
    const app = build()
    expect(app.purpose).toBe('personal')
    expect(app.screens.filter(screen => screen.tab).map(screen => screen.name)).toEqual(['Расходы', 'Проекты'])
    expect(checkAppReferences(app, catalog)).toBeNull()
    expect(visibleScreensFor(app, visitorFor(app, null))).toHaveLength(0)
    expect(visibleScreensFor(app, visitorFor(app, 'other@example.invalid'))).toHaveLength(0)
    expect(visibleScreensFor(app, visitorFor(app, 'me@example.invalid'))).toHaveLength(app.screens.length)
    expect(app.screens.every(screen => !screen.access.public && screen.access.roles.join() === 'manager')).toBe(true)
  })
  it('retains record-card and form links when changing the data source and switching to cards', () => {
    const app = build(), root = app.screens.find(screen => screen.tab)!
    const ids = app.screens.filter(screen => screen.sectionId === root.id).map(screen => screen.id).sort()
    const result = putSection(app, { source: projects, type: 'tiles', name: 'Мои проекты', icon: 'clipboard', rootId: root.id })
    expect(result.screenId).toBe(root.id)
    expect(result.app.screens.filter(screen => screen.sectionId === root.id).map(screen => screen.id).sort()).toEqual(ids)
    expect(result.app.screens.find(screen => screen.id === root.id)?.type).toBe('tiles')
    expect(checkAppReferences(result.app, catalog)).toBeNull()
  })
  it.each(['dashboard', 'form'] as const)('creates a %s section with functional references', type => {
    const result = putSection(build(), { source: expenses, type, name: 'Новый раздел', icon: type === 'form' ? 'plus' : 'chart' })
    expect(result.app.screens.find(screen => screen.id === result.screenId)?.type).toBe(type)
    expect(checkAppReferences(result.app, catalog)).toBeNull()
  })
  it('uses a neutral count in a new summary instead of guessing a financial total', () => {
    const result = putSection(build(), { source: expenses, type: 'dashboard', name: 'Обзор', icon: 'chart' })
    const screen = result.app.screens.find(screen => screen.id === result.screenId)!
    expect(screen.type === 'dashboard' && screen.blocks.some(block => block.type === 'metric' && block.kind === 'sum')).toBe(false)
  })
  it('removes a section and its forms but keeps other data references and one navigation section', () => {
    const app = build(), root = app.screens.find(screen => screen.tab)!, before = JSON.stringify(expenses)
    const next = removeSection(app, root.id)
    expect(next.screens.some(screen => screen.sectionId === root.id)).toBe(false)
    expect(checkAppReferences(next, catalog)).toBeNull()
    expect(JSON.stringify(expenses)).toBe(before)
    expect(() => removeSection(next, next.screens.find(screen => screen.tab)!.id)).toThrow('хотя бы один')
  })
  it('changes section order without changing IDs or record sources', () => {
    const app = build(), roots = app.screens.filter(screen => screen.tab)
    const next = moveSection(app, roots[1]!.id, -1)
    expect(next.screens.filter(screen => screen.tab).sort(byPosition).map(screen => screen.id)).toEqual([roots[1]!.id, roots[0]!.id])
    expect(next.screens.filter(screen => screen.tab).map(screen => screen.id)).toEqual([roots[1]!.id, roots[0]!.id])
    expect(checkAppReferences(next, catalog)).toBeNull()
  })
  it('adds a private section to a modular app without giving it to the guest or worker', () => {
    const { app, built } = templateExample('sklad')
    const base = { ...app, roles: [...app.roles.map(role => ({ ...role, isDefault: false })), { id: 'client', name: 'Гость', isDefault: true }],
      moduleAccess: { grants: [{ moduleId: app.modules![0]!.id, email: 'me@example.invalid', roleId: 'manager' }] },
      modules: app.modules!.map(module => ({ ...module, roles: { manager: 'manager', staff: 'staff' }, screenIds: app.screens.map(screen => screen.id) })) }
    const table = built.tables.find(table => table.id === app.inventory!.tables.items)!
    const view = built.views.find(view => view.tableId === table.id) as unknown as View
    const source = { table: { ...table, fields: built.fields.filter(field => field.tableId === table.id) as Field[] }, view }
    const result = putSection(base, { source, type: 'list', name: 'Мой список', icon: 'list' })
    expect(checkModuleAccess(result.app)).toBeNull()
    expect(result.app.screens.find(screen => screen.id === result.screenId)!.access.roles).toEqual(['manager'])
    expect(result.app.modules![0]!.screenIds).toContain(result.screenId)
  })
  it('suggests existing icons for everyday names', () => {
    expect(sectionIcon('Расходы')).toBe('chart')
    expect(sectionIcon('Проекты')).toBe('clipboard')
    expect(sectionIcon('Заметки')).toBe('file')
  })
})
