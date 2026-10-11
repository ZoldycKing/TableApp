import { describe, expect, it } from 'vitest'
import { appSchema, type Field } from '@tableapp/schema'
import { ANONYMOUS, canOpenScreen, permits, visitorFor } from './app-roles'
import { checkAppReferences } from './app-references'
import { scopeModuleAccess, composePilot } from './module-composition'
import { hasRole, setModuleGrant, workflowRole } from './module-access'
import { templateExample } from './templates/presentation'
import { TEMPLATES } from './templates/catalog'

function fixture(id: string) {
  const example = templateExample(id)
  return { app: example.app, catalog: { tableIds: new Set(example.built.tables.map(table => table.id)),
    fields: new Map(example.fields.map(field => [field.id, field])), views: new Map(example.views.map(view => [view.id, view])) } }
}

describe('scoped module roles and pilot composition', () => {
  it.each(TEMPLATES.map(template => template.id))('preserves existing permissions while scoping %s', id => {
    const { app, catalog } = fixture(id)
    app.allowlist = app.roles.map(role => ({ email: `${role.id}@example.invalid`, roleId: role.id, company: '' }))
    const before = JSON.stringify(app), scoped = scopeModuleAccess(app, catalog.views)
    expect(checkAppReferences(scoped, catalog)).toBeNull()
    expect(JSON.stringify(app)).toBe(before)
    for (const entry of app.allowlist.filter(entry => !app.roles.find(role => role.id === entry.roleId)?.isDefault)) {
      const old = visitorFor(app, entry.email), current = visitorFor(scoped, entry.email)
      expect(scoped.screens.filter(screen => canOpenScreen(screen, current)).map(screen => screen.id)).toEqual(app.screens.filter(screen => canOpenScreen(screen, old)).map(screen => screen.id))
    }
    expect(scopeModuleAccess(scoped, catalog.views)).toEqual(scoped)
  })
  it('combines catalogs and cabinets without granting sales work to a salon employee', () => {
    const salon = fixture('salon'), sales = fixture('katalog')
    salon.app.allowlist = [{ email: 'master@example.invalid', roleId: 'staff', company: '' }]
    sales.app.allowlist = [{ email: 'sales@example.invalid', roleId: 'staff', company: '' }]
    for (const id of sales.catalog.tableIds) salon.catalog.tableIds.add(id)
    for (const [id, field] of sales.catalog.fields) salon.catalog.fields.set(id, field)
    for (const [id, view] of sales.catalog.views) salon.catalog.views.set(id, view)
    const app = composePilot(salon.app, sales.app, salon.catalog.views)
    expect(checkAppReferences(app, salon.catalog)).toBeNull()
    expect(app.catalogScreenIds).toHaveLength(2)
    const master = visitorFor(app, 'master@example.invalid'), seller = visitorFor(app, 'sales@example.invalid'), client = visitorFor(app, 'client@example.invalid')
    expect(permits(app, app.customer!.tableId, 'update', master)).toBe(false)
    expect(permits(app, app.booking!.tables.visits, 'update', seller)).toBe(false)
    expect(hasRole(master, workflowRole(app, app.booking!.tables.visits, 'staff'))).toBe(true)
    expect(client.enrolled).toBe(true)
    expect(permits(app, app.customer!.tableId, 'create', client)).toBe(true)
    expect(permits(app, app.booking!.tables.visits, 'create', client)).toBe(true)
    expect(app.screens.filter(screen => screen.tab && canOpenScreen(screen, ANONYMOUS))).toHaveLength(1)
    const salesModule = app.modules!.find(module => module.kind === 'sales')!
    app.moduleAccess = setModuleGrant(app.moduleAccess!, 'master@example.invalid', salesModule.id, salesModule.roles!.staff!)
    const both = visitorFor(app, 'master@example.invalid')
    expect(permits(app, app.customer!.tableId, 'update', both)).toBe(true)
    app.moduleAccess = setModuleGrant(app.moduleAccess!, 'master@example.invalid', salesModule.id, null)
    expect(permits(app, app.customer!.tableId, 'update', visitorFor(app, 'master@example.invalid'))).toBe(false)
    const paused = structuredClone(app); paused.modules!.find(module => module.kind === 'sales')!.intakeEnabled = false
    expect(permits(paused, paused.customer!.tableId, 'create', client)).toBe(false)
    expect(permits(paused, paused.booking!.tables.visits, 'create', client)).toBe(true)
    expect(canOpenScreen(paused.screens.find(screen => screen.id === paused.customer!.listScreenId)!, client)).toBe(true)
  })
  it('rejects a role granted to the wrong module and dropping scoped access', async () => {
    const { app, catalog } = fixture('salon'), scoped = scopeModuleAccess(app, catalog.views)
    scoped.moduleAccess!.grants.push({ email: 'someone@example.invalid', moduleId: scoped.modules![0]!.id, roleId: 'manager' })
    expect(checkAppReferences(scoped, catalog)).toMatch(/другого модуля/)
    expect(appSchema.safeParse({ ...scoped, moduleAccess: { grants: [{ email: 'bad', moduleId: 'x', roleId: 'y' }] } }).success).toBe(false)
  })
})
