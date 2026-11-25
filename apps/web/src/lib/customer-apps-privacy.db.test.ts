import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { eq, inArray } from 'drizzle-orm'
import { newId } from '@tableapp/schema'
import { templateExample } from './templates/presentation'

const state = vi.hoisted(() => ({ jar: new Map<string, string>() }))
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => state.jar.has(name) ? { value: state.jar.get(name) } : undefined,
    set: (name: string, value: string) => state.jar.set(name, value),
    delete: (name: string) => state.jar.delete(name),
  }),
  headers: async () => new Headers({ 'user-agent': 'Customer apps privacy test' }),
}))

const envFile = resolve(import.meta.dirname, '../../../../.env')
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile)

describe.skipIf(!process.env.DATABASE_URL)('platform /my: staff apps + client businesses without data leakage', () => {
  const clientEmail = `${newId('appUser')}@client-privacy.invalid`
  const staffEmail = `${newId('appUser')}@staff-privacy.invalid`
  const fixtures = [0, 1].map(index => {
    const example = templateExample('portal', undefined, true)
    return {
      example,
      userId: newId('user'),
      workspaceId: newId('workspace'),
      slug: `privacy-apps-${index}-${newId('app').toLowerCase()}`,
    }
  })
  let database: typeof import('@tableapp/db')
  let directory: typeof import('./customer-apps')
  let auth: typeof import('@/app/auth-actions')
  let sessions: typeof import('./app-session')

  beforeAll(async () => {
    database = await import('@tableapp/db')
    directory = await import('./customer-apps')
    auth = await import('@/app/auth-actions')
    sessions = await import('./app-session')
    for (const [index, fixture] of fixtures.entries()) {
      const { example, workspaceId, userId, slug } = fixture
      example.app.workspaceId = workspaceId
      example.app.slug = slug
      example.app.allowlist = [
        ...example.app.allowlist,
        { email: clientEmail, roleId: 'client', company: '' },
        { email: staffEmail, roleId: 'staff', company: '' },
      ]
      await database.db.insert(database.users).values({ id: userId, email: `${userId}@example.invalid` })
      await database.db.insert(database.workspaces).values({
        id: workspaceId, ownerId: userId, name: `Privacy biz ${slug}`, slug,
        businessProfile: { name: `Бизнес ${index + 1}`, location: '', phone: '' },
      })
      await database.db.insert(database.tables).values(example.built.tables.map(table => ({ ...table, workspaceId })))
      await database.db.insert(database.fields).values(example.built.fields)
      await database.db.insert(database.views).values(example.built.views)
      await database.db.insert(database.rows).values(example.built.rows)
      await database.db.insert(database.apps).values({
        id: example.app.id, workspaceId, name: example.app.name, slug,
        draft: example.app, published: example.app, publishedAt: new Date(),
      })
      await database.db.insert(database.appUsers).values([
        { id: newId('appUser'), appId: example.app.id, email: clientEmail, roleId: 'client', name: 'Клиент' },
        { id: newId('appUser'), appId: example.app.id, email: staffEmail, roleId: 'staff', name: 'Сотрудник' },
      ])
    }
  })

  afterAll(async () => {
    if (!database) return
    await database.db.delete(database.workspaces).where(inArray(database.workspaces.id, fixtures.map(f => f.workspaceId)))
    await database.db.delete(database.users).where(inArray(database.users.id, fixtures.map(f => f.userId)))
    await database.db.delete(database.staffSessions).where(inArray(database.staffSessions.email, [clientEmail, staffEmail]))
    state.jar.clear()
    await database.sql.end()
  })

  it('hides allowlist-only enrolments from both platform directories until client activity exists', async () => {
    expect(await directory.listAccessibleApps(clientEmail)).toEqual([])
    expect(await directory.listClientBusinesses(clientEmail)).toEqual([])

    const first = fixtures[0]!
    const sections = await directory.listAccessibleApps(clientEmail, first.workspaceId)
    expect(sections.map(item => item.slug)).toContain(first.slug)
    expect(sections.every(item => item.businessId === first.workspaceId)).toBe(true)
    expect(sections.some(item => item.slug === fixtures[1]!.slug)).toBe(false)
  })

  it('lists client businesses only after activity, as name+link without orders or messages', async () => {
    for (const fixture of fixtures) {
      await database.db.insert(database.businessCustomers).values({
        id: newId('businessCustomer'),
        workspaceId: fixture.workspaceId,
        email: clientEmail,
        name: 'Клиент',
      })
    }

    const clients = await directory.listClientBusinesses(clientEmail)
    expect(clients).toHaveLength(2)
    expect(clients.map(item => item.businessId).sort()).toEqual(fixtures.map(f => f.workspaceId).sort())
    expect(clients.every(item => item.slug && item.businessName && !('orders' in item) && !('messages' in item) && !('count' in item))).toBe(true)
    // Platform staff directory stays empty for pure clients.
    expect(await directory.listAccessibleApps(clientEmail)).toEqual([])
  })

  it('lists staff apps on /my and never mixes foreign businesses for a client session', async () => {
    const { SESSION_TTL_MS } = await import('./auth')
    const staffSession = newId('session')
    const clientSession = newId('session')
    await database.db.insert(database.staffSessions).values([
      { id: staffSession, email: staffEmail, expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
      { id: clientSession, email: clientEmail, expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
    ])

    state.jar.set('tableapp_staff', staffSession)
    expect(await sessions.currentStaffEmail()).toBe(staffEmail)
    const staffApps = await auth.appsForStaff(staffEmail)
    expect(staffApps.map(item => item.slug).sort()).toEqual(fixtures.map(f => f.slug).sort())
    // Staff already sees working apps — client section omits the same workspaces.
    expect(await auth.businessesForClient(staffEmail)).toEqual([])

    state.jar.set('tableapp_staff', clientSession)
    expect(await sessions.currentStaffEmail()).toBe(clientEmail)
    expect(await auth.appsForStaff(clientEmail)).toEqual([])
    expect(await directory.listAccessibleApps(clientEmail)).toEqual([])
    const forClient = await auth.businessesForClient(clientEmail)
    expect(forClient).toHaveLength(2)
    expect(forClient.every(item => typeof item.businessName === 'string' && typeof item.slug === 'string')).toBe(true)
  })
})
