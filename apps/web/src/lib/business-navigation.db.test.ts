import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq, inArray } from 'drizzle-orm'
import { newId } from '@tableapp/schema'
import type { BusinessResourceDestination } from './business-navigation-types'
import type { Account, Member } from './session'

const envFile = resolve(import.meta.dirname, '../../../../.env')
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile)
const state = vi.hoisted(() => ({ member: null as Member | null, account: null as Account | null, setCookie: vi.fn() }))
vi.mock('@/lib/session', async original => ({ ...await original<typeof import('./session')>(), currentMember: async () => state.member, currentAccount: async () => state.account }))
vi.mock('next/headers', () => ({ cookies: async () => ({ set: state.setCookie }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

describe.skipIf(!process.env.DATABASE_URL)('owner business navigation against Postgres', () => {
  let database: typeof import('@tableapp/db')
  let navigation: typeof import('./business-navigation')
  let actions: typeof import('@/app/business-navigation-actions')
  let member: Member
  const ids = {
    user: newId('user'), foreignUser: newId('user'), first: newId('workspace'), second: newId('workspace'), foreign: newId('workspace'),
    firstTable: newId('table'), firstLaterTable: newId('table'), secondTable: newId('table'), foreignTable: newId('table'),
    firstApp: newId('app'), secondApp: newId('app'), foreignApp: newId('app'),
  }
  const created: string[] = []
  const stamp = `business-navigation-${Date.now()}-${ids.user}`

  beforeAll(async () => {
    database = await import('@tableapp/db')
    navigation = await import('./business-navigation')
    actions = await import('@/app/business-navigation-actions')
    const { db, users, workspaces, workspaceMembers, tables, apps } = database
    await db.insert(users).values([
      { id: ids.user, email: `${stamp}@example.invalid` },
      { id: ids.foreignUser, email: `${stamp}-foreign@example.invalid` },
    ])
    await db.insert(workspaces).values([
      { id: ids.first, ownerId: ids.user, name: 'Внутреннее название', slug: `${stamp}-a`, plan: 'start', businessProfile: { name: 'ООО «Ромашка»', location: 'PRIVATE_LOCATION', phone: 'PRIVATE_PHONE' } },
      { id: ids.second, ownerId: ids.foreignUser, name: 'ИП Иванов', slug: `${stamp}-b` },
      { id: ids.foreign, ownerId: ids.foreignUser, name: 'FOREIGN_BUSINESS_SECRET', slug: `${stamp}-foreign` },
    ])
    await db.insert(workspaceMembers).values([
      { userId: ids.user, workspaceId: ids.second, role: 'viewer', createdAt: new Date('2026-01-02') },
      { userId: ids.user, workspaceId: ids.first, role: 'owner', createdAt: new Date('2026-01-01') },
      { userId: ids.foreignUser, workspaceId: ids.foreign, role: 'owner' },
    ])
    await db.insert(tables).values([
      { id: ids.firstLaterTable, workspaceId: ids.first, name: 'Заказы', icon: 'list', position: 'a1' },
      { id: ids.firstTable, workspaceId: ids.first, name: 'Товары', icon: 'box', position: 'a0' },
      { id: ids.secondTable, workspaceId: ids.second, name: 'Услуги', icon: 'table', position: 'a0' },
      { id: ids.foreignTable, workspaceId: ids.foreign, name: 'FOREIGN_TABLE_SECRET', position: 'a0' },
    ])
    await db.insert(apps).values([
      { id: ids.firstApp, workspaceId: ids.first, name: 'Магазин', slug: `${stamp}-store`, draft: { secret: 'PRIVATE_DRAFT' }, published: { secret: 'PRIVATE_PUBLISHED' } },
      { id: ids.secondApp, workspaceId: ids.second, name: 'Салон', slug: `${stamp}-salon`, draft: {} },
      { id: ids.foreignApp, workspaceId: ids.foreign, name: 'FOREIGN_APP_SECRET', slug: `${stamp}-hidden`, draft: {} },
    ])
    member = { userId: ids.user, email: `${stamp}@example.invalid`, name: null, workspaceId: ids.first, workspaceName: 'Внутреннее название', role: 'owner' }
  })

  beforeEach(() => { state.member = member; state.account = null; state.setCookie.mockClear() })
  afterAll(async () => {
    if (!database) return
    const { db, workspaces, users, sql } = database
    await db.delete(workspaces).where(inArray(workspaces.id, [ids.first, ids.second, ids.foreign, ...created]))
    await db.delete(users).where(inArray(users.id, [ids.user, ids.foreignUser]))
    await sql.end()
  })

  it('returns membership-ordered businesses with only their own ordered metadata', async () => {
    const result = await navigation.loadBusinessNavigation()
    expect(result).toEqual([
      { workspaceId: ids.first, workspaceName: 'Внутреннее название', businessName: 'ООО «Ромашка»', role: 'owner', tables: [{ id: ids.firstTable, name: 'Товары', icon: 'box' }, { id: ids.firstLaterTable, name: 'Заказы', icon: 'list' }], apps: [{ id: ids.firstApp, name: 'Магазин', published: true }] },
      { workspaceId: ids.second, workspaceName: 'ИП Иванов', businessName: 'ИП Иванов', role: 'viewer', tables: [{ id: ids.secondTable, name: 'Услуги', icon: 'table' }], apps: [{ id: ids.secondApp, name: 'Салон', published: false }] },
    ])
    const serialized = JSON.stringify(result)
    for (const secret of ['FOREIGN_', 'PRIVATE_', member.email, 'businessProfile', 'draft']) expect(serialized).not.toContain(secret)
  })

  it('rejects a nonmember business and foreign resources without changing the active business', async () => {
    expect((await actions.navigateBusinessResourceAction(ids.foreign, { kind: 'home' })).ok).toBe(false)
    expect((await actions.navigateBusinessResourceAction(ids.first, { kind: 'table', id: ids.foreignTable })).ok).toBe(false)
    expect((await actions.navigateBusinessResourceAction(ids.first, { kind: 'app', id: ids.foreignApp })).ok).toBe(false)
    // Even two accessible businesses must not have their resources mixed up.
    expect((await actions.navigateBusinessResourceAction(ids.first, { kind: 'table', id: ids.secondTable })).ok).toBe(false)
    expect((await actions.navigateBusinessResourceAction(ids.first, { kind: 'app', id: ids.secondApp })).ok).toBe(false)
    expect(state.setCookie).not.toHaveBeenCalled()
  })

  it('opens a resource in another accessible business after validating membership and ownership', async () => {
    expect(await actions.navigateBusinessResourceAction(ids.second, { kind: 'table', id: ids.secondTable })).toEqual({ ok: true, href: `/tables/${ids.secondTable}` })
    expect(state.setCookie).toHaveBeenLastCalledWith('tableapp_workspace', ids.second, expect.objectContaining({ httpOnly: true, path: '/' }))
    expect(await actions.navigateBusinessResourceAction(ids.second, { kind: 'app', id: ids.secondApp })).toEqual({ ok: true, href: `/apps/${ids.secondApp}` })
  })

  it('accepts only fixed collection destinations and rejects supplied URLs or extra ids', async () => {
    expect(await actions.navigateBusinessResourceAction(ids.first, { kind: 'tables' })).toEqual({ ok: true, href: '/tables' })
    expect(await actions.navigateBusinessResourceAction(ids.first, { kind: 'apps' })).toEqual({ ok: true, href: '/apps' })
    state.setCookie.mockClear()
    for (const unsafe of [
      { kind: 'https://example.invalid' }, { kind: 'home', href: 'https://example.invalid' },
      { kind: 'app', id: '../../security' }, { kind: 'home', id: ids.firstTable }, null,
    ]) {
      expect((await actions.navigateBusinessResourceAction(ids.first, unsafe as unknown as BusinessResourceDestination)).ok).toBe(false)
    }
    expect(state.setCookie).not.toHaveBeenCalled()
  })

  it('returns no businesses and rejects navigation and creation for an anonymous visitor', async () => {
    state.member = null
    expect(await navigation.loadBusinessNavigation()).toEqual([])
    expect((await actions.navigateBusinessResourceAction(ids.first, { kind: 'home' })).ok).toBe(false)
    expect((await actions.createBusinessAction('Без входа')).ok).toBe(false)
    expect(state.setCookie).not.toHaveBeenCalled()
  })

  it('validates names before creating a business or changing active workspace', async () => {
    const before = await database.db.select({ id: database.workspaces.id }).from(database.workspaces).where(eq(database.workspaces.ownerId, ids.user))
    for (const name of ['', '   ', 'x'.repeat(101), 'Бизнес\u0000', 'Бизнес\nДва']) expect((await actions.createBusinessAction(name)).ok).toBe(false)
    const after = await database.db.select({ id: database.workspaces.id }).from(database.workspaces).where(eq(database.workspaces.ownerId, ids.user))
    expect(after).toEqual(before)
    expect(state.setCookie).not.toHaveBeenCalled()
  })

  it('allows an authenticated account without a current business to create one, but cannot switch to a foreign business', async () => {
    state.member = null
    state.account = { userId: member.userId, email: member.email, name: null }
    const { switchWorkspaceAction } = await import('@/app/team-actions')
    expect((await switchWorkspaceAction(ids.foreign)).ok).toBe(false)
    expect(state.setCookie).not.toHaveBeenCalled()
    const result = await actions.createBusinessAction('Первый бизнес после очистки')
    if (!result.ok || !('workspaceId' in result)) throw new Error('Business creation failed')
    created.push(result.workspaceId)
    expect(result.href).toBe('/app')
    const [membership] = await database.db.select().from(database.workspaceMembers).where(eq(database.workspaceMembers.workspaceId, result.workspaceId))
    expect(membership).toMatchObject({ userId: member.userId, role: 'owner' })
    expect(state.setCookie).toHaveBeenLastCalledWith('tableapp_workspace', result.workspaceId, expect.any(Object))
  })

  it('creates an empty independent free business with an accepted owner and makes it active', async () => {
    const result = await actions.createBusinessAction('  Новая мастерская  ')
    if (!result.ok || !('workspaceId' in result)) throw new Error('Business creation failed')
    created.push(result.workspaceId)
    expect(result.href).toBe('/app')
    const { db, workspaces, workspaceMembers, tables, apps } = database
    const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, result.workspaceId))
    expect(workspace).toMatchObject({ name: 'Новая мастерская', ownerId: ids.user, plan: 'free', businessProfile: { name: 'Новая мастерская', location: '', phone: '' } })
    const [membership] = await db.select().from(workspaceMembers).where(eq(workspaceMembers.workspaceId, result.workspaceId))
    expect(membership).toMatchObject({ userId: ids.user, role: 'owner' })
    expect(membership!.acceptedAt).toBeInstanceOf(Date)
    expect(await db.select({ id: tables.id }).from(tables).where(eq(tables.workspaceId, result.workspaceId))).toEqual([])
    expect(await db.select({ id: apps.id }).from(apps).where(eq(apps.workspaceId, result.workspaceId))).toEqual([])
    const [existing] = await db.select({ plan: workspaces.plan }).from(workspaces).where(eq(workspaces.id, ids.first))
    expect(existing!.plan).toBe('start')
    expect(state.setCookie).toHaveBeenLastCalledWith('tableapp_workspace', result.workspaceId, expect.any(Object))
  })
})
