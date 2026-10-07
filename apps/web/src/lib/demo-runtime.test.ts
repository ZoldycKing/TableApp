import { describe, expect, it, vi } from 'vitest'
// Importing the demo must not initialise a database client or query tenant data.
vi.mock('@tableapp/db', () => { throw new Error('Demo attempted to import the database') })
import { DEMO_CLIENT_EMAIL, loadDemoApp, loadDemoRuntime } from './demo-runtime'
import { ANONYMOUS, asRole, companyOf } from './app-roles'

describe('isolated synthetic demo', () => {
  it('uses no tenant database even when legacy demo environment variables are set', () => {
    vi.stubEnv('DEMO_APP_SLUG', 'private-tenant-draft')
    vi.stubEnv('DEMO_CLIENT_EMAIL', 'private@example.invalid')
    try {
      const app = loadDemoApp()
      expect(app.workspaceId).toBe('demo_fixture_workspace')
      expect(app.slug).toBe('demo-fixture')
      expect(DEMO_CLIENT_EMAIL).toBe('petrov@example.ru')
      expect(JSON.stringify(loadDemoRuntime(asRole('staff')))).not.toContain('private-tenant-draft')
    } finally { vi.unstubAllEnvs() }
  })
  it('projects public columns while keeping internal costs out of the public snapshot', () => {
    const publicRuntime = loadDemoRuntime(ANONYMOUS)
    const staffRuntime = loadDemoRuntime(asRole('staff'))
    expect(JSON.stringify(publicRuntime.tables)).not.toContain('Себестоимость')
    expect(JSON.stringify(staffRuntime.tables)).toContain('Себестоимость')
    expect(Object.values(publicRuntime.tables).flatMap((table) => table.rows).length).toBeGreaterThan(0)
  })
  it('applies client ownership rules to synthetic orders', () => {
    const app = loadDemoApp(), rule = app.rowAccessRules.find((rule) => rule.match === 'email')!
    const runtime = loadDemoRuntime(asRole('client', DEMO_CLIENT_EMAIL, companyOf(app, DEMO_CLIENT_EMAIL)))
    const client = runtime.tables[rule.tableId]!.rows
    const staff = loadDemoRuntime(asRole('staff')).tables[rule.tableId]!.rows
    expect(client.length).toBeGreaterThan(0)
    expect(client.length).toBeLessThan(staff.length)
  })
  it('keeps stable fixture IDs and returns fresh copies across requests', () => {
    const first = loadDemoRuntime(asRole('staff'))
    const before = structuredClone(first)
    first.app.name = 'Changed'
    for (const table of Object.values(first.tables)) for (const row of table.rows) row.data = { corrupted: true }
    expect(loadDemoRuntime(asRole('staff'))).toEqual(before)
    expect(loadDemoApp().id).toBe(first.app.id)
  })
})
