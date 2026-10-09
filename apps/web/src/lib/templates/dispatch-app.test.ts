import { describe, expect, it } from 'vitest'
import { generateApp } from '../app-builder'
import { checkAppReferences } from '../app-references'
import { ANONYMOUS, asRole, homeScreenFor, permits, visibleScreensFor, writableFields } from '../app-roles'
import { projectRuntime } from '../runtime-project'
import { dispatchFields, hasDispatchPreset } from './dispatch-app'
import { prepareDispatchUpgrade } from './dispatch-upgrade'
import { templateExample } from './presentation'

function fixture() {
  const example = templateExample('zayavki')
  const main = example.table('zayavki'), clients = example.table('clients')
  const ownFields = example.byTable.get(main.id)!, clientFields = example.byTable.get(clients.id)!
  const oldFields = ownFields.filter(field => !['Почта мастера', 'Клиент для выезда'].includes(field.name))
  const legacy = generateApp({ appId: example.app.id, workspaceId: main.workspaceId, name: example.app.name,
    slug: example.app.slug, table: main, fields: oldFields, view: example.views.find(view => view.id === example.built.appViewId)! })
  const upgrade = (app = legacy, fields = oldFields, clientTable: typeof clients | null = clients) =>
    prepareDispatchUpgrade(app, main, fields, example.views, clientTable, clientFields)
  const runtime = (role: string, email?: string) => {
    const visitor = asRole(role, email)
    const now = new Date()
    return projectRuntime({ ...example.app, screens: visibleScreensFor(example.app, visitor) }, visitor,
      Object.fromEntries(example.views.map(view => [view.id, view])), example.built.tables, example.byTable,
      example.built.rows.map(row => ({ ...row, version: 0, createdAt: now, updatedAt: now, createdBy: null, updatedBy: null })),
      new Map(example.built.tables.map(table => [table.id, table.primaryFieldId])))
  }
  return { ...example, main, clients, ownFields, clientFields, legacy, oldFields, upgrade, runtime }
}

describe('dispatcher and master preset', () => {
  it('separates two masters, has no anonymous access and defaults to the assigned list', () => {
    const f = fixture(), config = dispatchFields(f.ownFields)
    expect(f.app.roles.map(role => role.name)).toEqual(['Мастер', 'Диспетчер'])
    expect(visibleScreensFor(f.app, ANONYMOUS)).toHaveLength(0)
    expect(homeScreenFor(f.app, asRole('staff'))?.type).toBe('list')
    expect(homeScreenFor(f.app, asRole('manager'))?.type).toBe('dashboard')
    const first = f.runtime('staff', ' Sergey@Example.Invalid ').tables[f.main.id]!
    const second = f.runtime('staff', 'andrey@example.invalid').tables[f.main.id]!
    expect(first.rows).toHaveLength(2)
    expect(second.rows).toHaveLength(2)
    expect(first.rows.some(row => second.rows.some(other => other.id === row.id))).toBe(false)
    expect(first.rows[0]!.data[config.clientName]).toEqual(['ИП Соколов'])
    expect(f.runtime('staff').tables[f.main.id]!.rows).toHaveLength(0)
    expect(f.runtime('staff', 'unassigned@example.invalid').tables[f.main.id]!.rows).toHaveLength(0)
    expect(f.runtime('manager', 'dispatcher@example.invalid').tables[f.main.id]!.rows).toHaveLength(6)
  })
  it('does not send financial fields, assignment email, the client relation or client directory to a master', () => {
    const f = fixture(), config = dispatchFields(f.ownFields), runtime = f.runtime('staff', 'sergey@example.invalid')
    for (const id of [config.price, config.paid, config.email, config.client]) {
      expect(runtime.tables[f.main.id]!.fields.some(field => field.id === id)).toBe(false)
      expect(runtime.tables[f.main.id]!.rows.some(row => id in row.data)).toBe(false)
    }
    expect(runtime.tables[f.clients.id]?.rows ?? []).toHaveLength(0)
    expect(JSON.stringify(runtime.relatedTitles)).not.toContain('ООО «Северный ветер»')
    expect(Object.keys(runtime.blocks)).toHaveLength(0)
  })
  it('derives worker writes from exactly the three form fields and preserves dispatcher assignment rights', () => {
    const f = fixture(), config = dispatchFields(f.ownFields), master = asRole('staff', 'sergey@example.invalid')
    expect([...writableFields(f.app, f.main.id, master, 'update')]).toEqual([config.status, config.photo, config.comment])
    expect(permits(f.app, f.main.id, 'create', master)).toBe(false)
    expect(permits(f.app, f.main.id, 'delete', master)).toBe(false)
    expect(writableFields(f.app, f.main.id, asRole('manager'), 'update').has(config.email)).toBe(true)
    const screen = visibleScreensFor(f.app, master).find(screen => screen.type === 'detail')!
    expect(screen.type === 'detail' && screen.components.filter(component => component.type === 'button')).toHaveLength(1)
    expect(checkAppReferences(f.app, { tableIds: new Set(f.built.tables.map(table => table.id)),
      fields: new Map(f.fields.map(field => [field.id, field])), views: new Map(f.views.map(view => [view.id, view])) })).toBeNull()
  })
})

describe('safe opt-in dispatch upgrade', () => {
  it('also upgrades the original three-role defaults without changing assigned role IDs', () => {
    const f = fixture()
    const legacy = { ...f.legacy, screens: f.legacy.screens.map(screen => ({ ...screen, access: { ...screen.access, roles: ['client', 'staff', 'manager'] } })) }
    expect(f.upgrade(legacy).app.allowlist).toEqual(legacy.allowlist)
    expect(hasDispatchPreset(f.upgrade(legacy).app, f.main.id)).toBe(true)
  })
  it('preserves old IDs, allowlist and source definition without assigning names to emails', () => {
    const f = fixture()
    f.legacy.allowlist = [{ email: 'legacy@example.invalid', roleId: 'client', company: '' }]
    const before = structuredClone(f.legacy)
    const upgraded = f.upgrade(), fields = [...f.oldFields, ...upgraded.fields]
    expect(f.legacy).toEqual(before)
    expect(upgraded.fields.map(field => field.name)).toEqual(['Почта мастера', 'Клиент для выезда'])
    expect(upgraded.app.allowlist).toEqual(before.allowlist)
    expect(upgraded.app.homeScreenId).toBe(before.homeScreenId)
    expect(before.screens.every(screen => upgraded.app.screens.some(next => next.id === screen.id))).toBe(true)
    expect(upgraded.app.roles.find(role => role.id === 'client')?.name).toBe('Мастер (прежняя роль)')
    const config = dispatchFields(fields)
    expect(upgraded.app.rowAccessRules[0]!.appliesTo).toEqual(['staff', 'client'])
    expect([...writableFields(upgraded.app, f.main.id, asRole('client'), 'update')]).toEqual([config.status, config.photo, config.comment])
    expect(checkAppReferences(upgraded.app, { tableIds: new Set(f.built.tables.map(table => table.id)),
      fields: new Map([...f.clientFields, ...fields].map(field => [field.id, field])), views: new Map(f.views.map(view => [view.id, view])) })).toBeNull()
    expect(hasDispatchPreset(upgraded.app, f.main.id)).toBe(true)
    const again = f.upgrade(upgraded.app, fields)
    expect(again.fields).toHaveLength(0)
    expect(again.app).toBe(upgraded.app)
  })
  it('refuses public access, customized roles, row rules, screens, actions and forms', () => {
    const f = fixture()
    const changed = [
      { ...f.legacy, accessMode: 'public' as const },
      { ...f.legacy, roles: f.legacy.roles.map(role => ({ ...role, name: 'Custom' })) },
      { ...f.legacy, rowAccessRules: [{ tableId: f.main.id, fieldId: 'custom', match: 'email' as const, appliesTo: ['staff'] }] },
      { ...f.legacy, screens: [...f.legacy.screens, { ...f.legacy.screens[0]!, id: 'extra' }] },
      { ...f.legacy, screens: f.legacy.screens.map(screen => ({ ...screen, access: { ...screen.access, public: true } })) },
      { ...f.legacy, screens: f.legacy.screens.map(screen => screen.type === 'form' ? { ...screen, components: screen.components.slice(1) } : screen) },
      { ...f.legacy, screens: f.legacy.screens.map(screen => screen.type === 'detail' ? { ...screen, components: screen.components.map(c => c.type === 'button' ? { ...c, action: { id: c.action.id, type: 'delete_row' as const, confirm: true } } : c) } : screen) },
    ]
    for (const app of changed) expect(() => f.upgrade(app)).toThrow()
  })
  it('rejects incompatible/missing fields and a foreign client directory', () => {
    const f = fixture()
    expect(() => f.upgrade(f.legacy, f.oldFields.filter(field => field.name !== 'Статус'))).toThrow()
    expect(() => f.upgrade(f.legacy, f.oldFields, { ...f.clients, workspaceId: 'foreign' })).toThrow('справочник')
    expect(() => f.upgrade(f.legacy, f.oldFields, null)).toThrow('справочник')
    const email = f.ownFields.find(field => field.name === 'Почта мастера')!
    const fields = [...f.oldFields, { ...email, type: 'text' as const, options: {} }]
    const app = generateApp({ appId: f.app.id, workspaceId: f.main.workspaceId, name: f.app.name, slug: f.app.slug,
      table: f.main, fields, view: f.views.find(view => view.id === f.built.appViewId)! })
    expect(() => f.upgrade(app, fields)).toThrow('Почта мастера')
  })
})
