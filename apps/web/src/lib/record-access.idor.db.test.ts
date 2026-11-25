import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { eq, inArray } from 'drizzle-orm'
import { newId } from '@tableapp/schema'
import { templateExample } from './templates/presentation'

/**
 * Authorization / IDOR matrix: two apps, two clients, one staff member.
 * Swapping IDs must fail for cross-client, cross-app, client→staff-only, staff A→app B.
 */

const state = vi.hoisted(() => ({
  jar: new Map<string, string>(),
  member: null as import('./session').Member | null,
}))
vi.mock('@/lib/session', async original => ({
  ...await original<typeof import('./session')>(),
  currentMember: async () => state.member,
}))
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => state.jar.has(name) ? { value: state.jar.get(name) } : undefined,
    set: (name: string, value: string) => state.jar.set(name, value),
    delete: (name: string) => state.jar.delete(name),
  }),
  headers: async () => new Headers({ 'user-agent': 'IDOR authorization test' }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const envFile = resolve(import.meta.dirname, '../../../../.env')
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile)

describe.skipIf(!process.env.DATABASE_URL)('IDOR: swapped identifiers across apps and clients', () => {
  const clientA = `${newId('appUser')}@idor-a.invalid`
  const clientB = `${newId('appUser')}@idor-b.invalid`
  const staffEmail = `${newId('appUser')}@idor-staff.invalid`
  const fixtures = [0, 1].map(index => {
    const example = templateExample('portal', undefined, true)
    return {
      example,
      userId: newId('user'),
      workspaceId: newId('workspace'),
      slug: `idor-${index}-${newId('app').toLowerCase()}`,
      clientRowId: '' as string,
    }
  })
  let database: typeof import('@tableapp/db')
  let sessions: typeof import('./app-session')
  let actions: typeof import('@/app/runtime-actions')
  let access: typeof import('./record-access')
  let runtime: typeof import('./app-runtime')

  beforeAll(async () => {
    database = await import('@tableapp/db')
    sessions = await import('./app-session')
    actions = await import('@/app/runtime-actions')
    access = await import('./record-access')
    runtime = await import('./app-runtime')
    const { SESSION_TTL_MS } = await import('./auth')

    for (const fixture of fixtures) {
      const { example, workspaceId, userId, slug } = fixture
      example.app.workspaceId = workspaceId
      example.app.slug = slug
      example.app.allowlist = [
        ...example.app.allowlist,
        { email: clientA, roleId: 'client', company: '' },
        { email: clientB, roleId: 'client', company: '' },
        { email: staffEmail, roleId: 'staff', company: '' },
      ]
      await database.db.insert(database.users).values({ id: userId, email: `${userId}@example.invalid` })
      await database.db.insert(database.workspaces).values({ id: workspaceId, ownerId: userId, name: `IDOR ${slug}`, slug })
      await database.db.insert(database.tables).values(example.built.tables.map(table => ({ ...table, workspaceId })))
      await database.db.insert(database.fields).values(example.built.fields)
      await database.db.insert(database.views).values(example.built.views)
      await database.db.insert(database.rows).values(example.built.rows)
      await database.db.insert(database.apps).values({
        id: example.app.id, workspaceId, name: example.app.name, slug,
        draft: example.app, published: example.app, publishedAt: new Date(),
      })
      await database.db.insert(database.appUsers).values([
        { id: newId('appUser'), appId: example.app.id, email: clientA, roleId: 'client', name: 'A' },
        { id: newId('appUser'), appId: example.app.id, email: clientB, roleId: 'client', name: 'B' },
        { id: newId('appUser'), appId: example.app.id, email: staffEmail, roleId: 'staff', name: 'Staff' },
      ])
    }

    // Create owned rows for each client in app 0 as clientA / clientB.
    const sessionA = newId('session')
    await database.db.insert(database.staffSessions).values({
      id: sessionA, email: clientA, expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    })
    state.jar.set('tableapp_staff', sessionA)
    const createdA = await actions.appCreateRowAction(fixtures[0]!.example.app.slug, fixtures[0]!.example.table('orders').id, {
      [fixtures[0]!.example.field('orders', 'title').id]: 'Order A',
      [fixtures[0]!.example.field('orders', 'email').id]: clientA,
    })
    expect(createdA.ok).toBe(true)
    fixtures[0]!.clientRowId = createdA.rowId!

    const sessionB = newId('session')
    await database.db.insert(database.staffSessions).values({
      id: sessionB, email: clientB, expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    })
    state.jar.set('tableapp_staff', sessionB)
    const createdB = await actions.appCreateRowAction(fixtures[0]!.example.app.slug, fixtures[0]!.example.table('orders').id, {
      [fixtures[0]!.example.field('orders', 'title').id]: 'Order B',
      [fixtures[0]!.example.field('orders', 'email').id]: clientB,
    })
    expect(createdB.ok).toBe(true)
    // Store B's row on fixture 1 slot for cross-client checks against app 0.
    fixtures[1]!.clientRowId = createdB.rowId!

    // Also create a row in app 1 for clientA (cross-app target).
    const createdCross = await actions.appCreateRowAction(fixtures[1]!.example.app.slug, fixtures[1]!.example.table('orders').id, {
      [fixtures[1]!.example.field('orders', 'title').id]: 'App1 order',
      [fixtures[1]!.example.field('orders', 'email').id]: clientB,
    })
    expect(createdCross.ok).toBe(true)
  })

  afterAll(async () => {
    if (!database) return
    await database.db.delete(database.workspaces).where(inArray(database.workspaces.id, fixtures.map(f => f.workspaceId)))
    await database.db.delete(database.users).where(inArray(database.users.id, fixtures.map(f => f.userId)))
    await database.db.delete(database.staffSessions).where(inArray(database.staffSessions.email, [clientA, clientB, staffEmail]))
    state.jar.clear()
    state.member = null
    await database.sql.end()
  })

  async function asEmail(email: string) {
    const { SESSION_TTL_MS } = await import('./auth')
    const id = newId('session')
    await database.db.insert(database.staffSessions).values({
      id, email, expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    }).onConflictDoNothing()
    // staffSessions id is primary key — just insert fresh each time
    state.jar.set('tableapp_staff', id)
    expect(await sessions.currentStaffEmail()).toBe(email)
  }

  it('cross-client: client A cannot read or update client B row in the same app', async () => {
    await asEmail(clientA)
    const app0 = fixtures[0]!.example
    const rowB = fixtures[1]!.clientRowId
    await expect(access.requireRecordAccess({
      slug: app0.app.slug, tableId: app0.table('orders').id, rowId: rowB, action: 'read',
    })).rejects.toMatchObject({ code: 'not_found' })

    const updated = await actions.appUpdateRowAction(app0.app.slug, app0.table('orders').id, rowB, {
      [app0.field('orders', 'title').id]: 'Hijacked',
    })
    expect(updated.ok).toBe(false)

    const loaded = await runtime.loadPublishedApp(app0.app.slug, (await sessions.currentAppAccess(app0.app)).visitor)
    expect(loaded!.tables[app0.table('orders').id]!.rows.map(row => row.id)).toContain(fixtures[0]!.clientRowId)
    expect(loaded!.tables[app0.table('orders').id]!.rows.map(row => row.id)).not.toContain(rowB)
  })

  it('cross-app: client cannot use app A slug with app B table/row ids', async () => {
    await asEmail(clientA)
    const app0 = fixtures[0]!.example
    const app1 = fixtures[1]!.example
    await expect(access.requireRecordAccess({
      slug: app0.app.slug,
      tableId: app1.table('orders').id,
      rowId: fixtures[1]!.clientRowId,
      action: 'read',
    })).rejects.toMatchObject({ code: 'not_found' })

    const created = await actions.appCreateRowAction(app0.app.slug, app1.table('orders').id, {
      [app1.field('orders', 'title').id]: 'Must not cross',
    })
    expect(created.ok).toBe(false)
  })

  it('client cannot update when ownership rules are removed (fail closed)', async () => {
    await asEmail(clientA)
    const app0 = fixtures[0]!.example
    const stripped = { ...app0.app, rowAccessRules: [] }
    await database.db.update(database.apps).set({ published: stripped }).where(eq(database.apps.id, app0.app.id))
    const denied = await actions.appUpdateRowAction(app0.app.slug, app0.table('orders').id, fixtures[0]!.clientRowId, {
      [app0.field('orders', 'title').id]: 'No rules',
    })
    expect(denied.ok).toBe(false)
    await expect(access.requireRecordAccess({
      slug: app0.app.slug, tableId: app0.table('orders').id, rowId: fixtures[0]!.clientRowId, action: 'read',
    })).rejects.toMatchObject({ code: 'denied' })
    // Restore for later staff checks.
    await database.db.update(database.apps).set({ published: app0.app }).where(eq(database.apps.id, app0.app.id))
  })

  it('staff of app A cannot access app B records via swapped ids', async () => {
    await asEmail(staffEmail)
    const app0 = fixtures[0]!.example
    const app1 = fixtures[1]!.example
    // Staff can see own-app client rows.
    const own = await access.requireRecordAccess({
      slug: app0.app.slug, tableId: app0.table('orders').id, rowId: fixtures[0]!.clientRowId, action: 'read',
    })
    expect(own.row.id).toBe(fixtures[0]!.clientRowId)

    // Cross-app table id under app A slug fails.
    await expect(access.requireRecordAccess({
      slug: app0.app.slug,
      tableId: app1.table('orders').id,
      rowId: fixtures[1]!.clientRowId,
      action: 'read',
    })).rejects.toMatchObject({ code: 'not_found' })

    // Staff session for app A must not mutate app B through wrong slug+ids.
    const hijack = await actions.appUpdateRowAction(app0.app.slug, app1.table('orders').id, fixtures[1]!.clientRowId, {
      [app1.field('orders', 'title').id]: 'Staff cross-app',
    })
    expect(hijack.ok).toBe(false)
  })

  it('invite-list client without rules cannot read foreign rows (customer flag)', async () => {
    const { canAccessRow } = await import('./row-access')
    expect(canAccessRow([], { email: clientA, customer: true }, { email: clientB })).toBe(false)
    expect(canAccessRow([], { email: staffEmail }, { email: clientB })).toBe(true)
  })
})
