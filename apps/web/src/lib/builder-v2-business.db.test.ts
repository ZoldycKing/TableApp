import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { eq, inArray } from 'drizzle-orm'
import { newId } from '@tableapp/schema'
import type { AppV2, AppV2BusinessOperation } from '@tableapp/schema/app-v2'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { builderV2Revision } from './builder-v2-revision'
import { templateExample } from './templates/presentation'

const state = vi.hoisted(() => ({ jar: new Map<string, string>(), link: '', member: null as import('./session').Member | null }))
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (name: string) => state.jar.has(name) ? { value: state.jar.get(name) } : undefined,
    set: (name: string, value: string) => state.jar.set(name, value), delete: (name: string) => state.jar.delete(name) }),
  headers: async () => new Headers({ host: 'localhost:3101', 'x-real-ip': `business-builder-${state.member?.userId}` }),
}))
vi.mock('@/lib/session', async original => ({ ...await original<typeof import('./session')>(), currentMember: async () => state.member, currentAccount: async () => null }))
vi.mock('@/lib/mailer', () => ({ sendMagicLink: async (letter: { link: string }) => { state.link = letter.link; return { delivered: true } }, mailHintFor: () => null }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const env = resolve(import.meta.dirname, '../../../../.env')
if (!process.env.DATABASE_URL && existsSync(env)) process.loadEnvFile(env)

describe.skipIf(!process.env.DATABASE_URL)('business operations in published v2 screens', () => {
  let data: typeof import('@tableapp/db')
  const userId = newId('user'), workspaceId = newId('workspace'), staffSession = newId('session')
  const email = `business-${userId}@example.invalid`, guest = `booking-${userId}@example.invalid`
  const workspaceName = 'Synthetic builder business operations'

  beforeAll(async () => {
    data = await import('@tableapp/db')
    state.member = { userId, workspaceId, email, name: 'Owner', workspaceName, role: 'owner' }
    await data.db.insert(data.users).values({ id: userId, email })
    await data.db.insert(data.workspaces).values({ id: workspaceId, ownerId: userId, name: workspaceName, slug: workspaceId, plan: 'business' })
    await data.db.insert(data.workspaceMembers).values({ workspaceId, userId, role: 'owner' })
    await data.db.insert(data.staffSessions).values({ id: staffSession, email, expiresAt: new Date(Date.now() + 3600_000) })
  })

  afterAll(async () => {
    if (!data) return
    await data.db.delete(data.workspaces).where(eq(data.workspaces.id, workspaceId))
    await data.db.delete(data.users).where(eq(data.users.id, userId))
    for (const table of [data.authEvents, data.authTokens, data.staffSessions]) await data.db.delete(table).where(inArray(table.email, [email, guest]))
    state.jar.clear()
    await data.sql.end()
  })

  async function install(id: string, roleId: string) {
    const { built, app } = templateExample(id)
    const target = { ...app, workspaceId, slug: `business-test-${app.id.toLowerCase()}`, allowlist: [{ email, roleId, company: '' }] }
    await data.db.insert(data.tables).values(built.tables.map(table => ({ ...table, workspaceId })))
    await data.db.insert(data.fields).values(built.fields)
    await data.db.insert(data.views).values(built.views)
    await data.db.insert(data.rows).values(built.rows)
    await data.db.insert(data.apps).values({ id: target.id, workspaceId, name: target.name, slug: target.slug, draft: target, published: target })
    return { built, target }
  }

  it('validates stock context, keeps internal operations private and hands public booking off through verified email', async () => {
    const { newBuilderV2App, loadBuilderV2Catalog } = await import('./builder-v2')
    const { loadBuilderBusinessApps } = await import('./builder-v2-business')
    const { loadPublishedV2Page } = await import('./builder-v2-published-page')
    const { loadPublishedApp } = await import('./app-runtime')
    const { currentAppAccess } = await import('./app-session')
    const { STAFF_SESSION_COOKIE } = await import('./auth')
    const { newScreen, addNode } = await import('@/components/builder/v2/model')
    const { publishBuilderV2Action } = await import('@/app/builder-v2-publish-actions')
    const { requestAppLoginAction } = await import('@/app/auth-actions')
    const { GET: followMagicLink } = await import('@/app/a/[slug]/auth/route')

    const stock = await install('sklad', 'manager'), production = await install('proizvodstvo', 'director'), salon = await install('salon', 'manager')
    const itemTable = stock.target.inventory!.tables.items
    const item = stock.built.rows.find(row => row.tableId === itemTable)!
    const { catalog, tables } = await loadBuilderV2Catalog(workspaceId)
    const choices = await loadBuilderBusinessApps(workspaceId, catalog.views)
    const operations = (id: string) => choices.find(app => app.id === id)?.operations.map(item => item.operation)
    expect(operations(stock.target.id)).toEqual(expect.arrayContaining(['inventory_items', 'inventory_receipt', 'inventory_issue', 'inventory_stocktake', 'inventory_writeOff', 'inventory_returnIn', 'inventory_returnOut']))
    expect(operations(production.target.id)).toEqual(['production_run', 'production_movement'])
    expect(operations(salon.target.id)).toEqual(['booking_create'])

    const id = newId('app')
    let app: AppV2 = newScreen(newBuilderV2App({ id, workspaceId, name: 'Рабочие операции', slug: id.replace('_', '-'), email }), 'Товар')
    const home = app.screens[0]!, card = app.screens[1]!
    home.audience = { kind: 'public' }
    card.contextTableId = itemTable
    card.navigation = false
    app.policy.tables = [{ tableId: itemTable, grants: [{ audience: { kind: 'roles', roleIds: ['owner'] }, read: { fieldIds: [stock.target.inventory!.item.name], rows: { kind: 'all' } } }] }]
    const add = (screenId: string, appId: string, operation: AppV2BusinessOperation) => {
      const result = addNode(app, screenId, 'business', tables, null, itemTable)
      app = result.app
      const node = app.nodes.find(node => node.id === result.id)
      if (node?.type !== 'business') throw new Error('Business component is missing')
      node.target = { appId, operation }
      return result.id
    }
    const stockList = add(home.id, stock.target.id, 'inventory_items')
    const release = add(home.id, production.target.id, 'production_run')
    const booking = add(home.id, salon.target.id, 'booking_create')
    const receipt = add(card.id, stock.target.id, 'inventory_receipt')
    const invalid = { ...app, screens: app.screens.map(screen => ({ ...screen, rootIds: screen.id === home.id ? [...screen.rootIds, receipt] : [] })) }
    await data.db.insert(data.apps).values({ id, workspaceId, name: app.name, slug: app.slug, draft: invalid })
    expect(await publishBuilderV2Action(id, builderV2Revision(invalid))).toMatchObject({ ok: false, error: expect.stringContaining('карточке товара') })
    await data.db.update(data.apps).set({ draft: app }).where(eq(data.apps.id, id))
    expect(await publishBuilderV2Action(id, builderV2Revision(app))).toMatchObject({ ok: true })

    const anonymous = await loadPublishedV2Page(app.slug, {})
    if (anonymous.login) throw new Error('The v2 landing screen is public')
    expect(Object.keys(anonymous.businessLinks ?? {})).toEqual([booking])
    expect(anonymous.app.nodes).toContainEqual(expect.objectContaining({ id: booking, target: null }))
    expect(JSON.stringify(anonymous)).not.toContain(stock.target.slug)
    expect(JSON.stringify(anonymous)).not.toContain(production.target.slug)
    const appointment = new URL(anonymous.businessLinks![booking]!.href, 'http://localhost:3101')
    const form = salon.target.booking!.formScreenId
    expect(appointment.searchParams.get('e')).toBe(form)
    const guestRuntime = await loadPublishedApp(salon.target.slug, (await currentAppAccess(salon.target)).visitor)
    expect(guestRuntime?.app.screens.some(screen => screen.id === form)).toBe(false)
    expect(await requestAppLoginAction(salon.target.slug, guest, 'default', { e: form })).toMatchObject({ ok: true })
    expect(new URL(state.link).searchParams.get('e')).toBe(form)
    expect((await followMagicLink(new Request(state.link), { params: Promise.resolve({ slug: salon.target.slug }) })).headers.get('location')).toBe(`${appointment.pathname}${appointment.search}`)
    const customer = await currentAppAccess(salon.target)
    expect(customer.visitor).toMatchObject({ email: guest, roleId: 'client' })
    expect((await loadPublishedApp(salon.target.slug, customer.visitor, { screenId: form }))?.app.screens.some(screen => screen.id === form)).toBe(true)
    await expect(loadPublishedV2Page(app.slug, { screen: card.id, row: item.id })).rejects.toThrow('недоступен')

    state.jar.set(STAFF_SESSION_COOKIE, staffSession)
    expect(await loadPublishedV2Page(app.slug, {})).toMatchObject({ businessLinks: {
      [stockList]: { operation: 'inventory_items' }, [release]: { operation: 'production_run', href: expect.stringContaining(production.target.production!.formScreenId!) },
    } })
    const selected = await loadPublishedV2Page(app.slug, { screen: card.id, row: item.id })
    if (selected.login) throw new Error('The owner can access the item card')
    const receiptLink = new URL(selected.businessLinks![receipt]!.href, 'http://localhost:3101')
    expect(receiptLink.searchParams.get('e')).toBe(stock.target.inventory!.receiptScreenId)
    expect(receiptLink.searchParams.get('r')).toBe(item.id)
    const stockRuntime = await loadPublishedApp(stock.target.slug, (await currentAppAccess(stock.target)).visitor, { screenId: receiptLink.searchParams.get('e'), rowId: item.id })
    expect(stockRuntime?.tables[itemTable]?.rows.some(row => row.id === item.id)).toBe(true)
    await expect(loadPublishedV2Page(app.slug, { screen: card.id, row: newId('row') })).rejects.toThrow('Запись недоступна')

    await data.db.update(data.apps).set({ published: null }).where(eq(data.apps.id, stock.target.id))
    const inactive = await loadPublishedV2Page(app.slug, { screen: card.id, row: item.id })
    expect(inactive).not.toHaveProperty('businessLinks')
  }, 30_000)
})
