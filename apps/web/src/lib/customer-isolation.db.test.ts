import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { eq, inArray } from 'drizzle-orm'
import { newId } from '@tableapp/schema'
import { templateExample } from './templates/presentation'

const state = vi.hoisted(() => ({ jar: new Map<string, string>(), lastCode: '', member: null as import('./session').Member | null }))
vi.mock('@/lib/session', async original => ({ ...await original<typeof import('./session')>(), currentMember: async () => state.member }))
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (name: string) => state.jar.has(name) ? { value: state.jar.get(name) } : undefined,
    set: (name: string, value: string) => state.jar.set(name, value), delete: (name: string) => state.jar.delete(name) }),
  headers: async () => new Headers({ 'user-agent': 'Customer isolation test' }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/mailer', () => ({ sendMagicLink: async (letter: { code: string }) => {
  state.lastCode = letter.code; return { delivered: true }
}, mailHintFor: () => null }))

const envFile = resolve(import.meta.dirname, '../../../../.env')
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile)

describe.skipIf(!process.env.DATABASE_URL)('shared customer login with separate businesses in PostgreSQL', () => {
  const email = `${newId('appUser')}@example.invalid`, first = templateExample('portal', undefined, true), second = templateExample('portal', undefined, true)
  const fixtures = [first, second].map((example, index) => ({ example,
    userId: newId('user'), workspaceId: newId('workspace'), slug: `customer-isolation-${index}-${newId('app').toLowerCase()}` }))
  let database: typeof import('@tableapp/db'), sessions: typeof import('./app-session'), runtime: typeof import('./app-runtime')
  let intake: typeof import('@/app/intake-actions'), actions: typeof import('@/app/runtime-actions')
  beforeAll(async () => {
    database = await import('@tableapp/db'); sessions = await import('./app-session')
    runtime = await import('./app-runtime'); intake = await import('@/app/intake-actions'); actions = await import('@/app/runtime-actions')
    for (const fixture of fixtures) {
      const { example, workspaceId, userId, slug } = fixture
      example.app.workspaceId = workspaceId; example.app.slug = slug
      await database.db.insert(database.users).values({ id: userId, email: `${userId}@example.invalid` })
      await database.db.insert(database.workspaces).values({ id: workspaceId, ownerId: userId, name: `Synthetic business ${slug}`, slug })
      await database.db.insert(database.tables).values(example.built.tables.map(table => ({ ...table, workspaceId })))
      await database.db.insert(database.fields).values(example.built.fields)
      await database.db.insert(database.views).values(example.built.views)
      await database.db.insert(database.rows).values(example.built.rows)
      await database.db.insert(database.apps).values({ id: example.app.id, workspaceId, name: example.app.name, slug,
        draft: example.app, published: example.app })
    }
  })
  afterAll(async () => {
    if (!database) return
    await database.db.delete(database.workspaces).where(inArray(database.workspaces.id, fixtures.map(f => f.workspaceId)))
    await database.db.delete(database.users).where(inArray(database.users.id, fixtures.map(f => f.userId)))
    await database.db.delete(database.staffSessions).where(eq(database.staffSessions.email, email))
    await database.db.delete(database.authTokens).where(eq(database.authTokens.email, email))
    await database.db.delete(database.authEvents).where(eq(database.authEvents.email, email))
    state.jar.clear(); state.member = null; await database.sql.end()
  })

  it('verification creates an owned request and a customer session without a workspace membership', async () => {
    const form = first.app.screens.find(screen => screen.type === 'form' && screen.mode === 'create')!
    const requested = await intake.requestIntakeAction(first.app.slug, form.id, email, {
      [first.field('orders', 'title').id]: 'First request', [first.field('orders', 'email').id]: 'someone-else@example.invalid',
      [first.field('orders', 'sum').id]: 1, [first.field('orders', 'note').id]: 'FORGED_PRIVATE_NOTE',
    })
    expect(requested.ok).toBe(true)
    expect(await intake.confirmIntakeAction(first.app.slug, state.lastCode)).toEqual({ ok: true })
    const access = await sessions.currentAppAccess(first.app)
    expect(access.visitor).toMatchObject({ email, roleId: 'client', enrolled: true })
    const loaded = await runtime.loadPublishedApp(first.app.slug, access.visitor)
    const own = loaded!.tables[first.table('orders').id]!.rows
    expect(own).toHaveLength(1)
    expect(own[0]!.data[first.field('orders', 'email').id]).toBe(email)
    expect(own[0]!.data[first.field('orders', 'sum').id]).toBeUndefined()
    const status = first.field('orders', 'status')
    expect(status.type === 'single_select' && status.options.choices.find(choice => choice.id === own[0]!.data[status.id])?.name).toBe('Принят')
    expect(own[0]!.data[first.field('orders', 'created').id]).toEqual(expect.any(String))
    expect(JSON.stringify(loaded)).not.toContain('FORGED_PRIVATE_NOTE')
    expect(await database.db.select().from(database.users).where(eq(database.users.email, email))).toHaveLength(0)
    expect((await intake.confirmIntakeAction(first.app.slug, state.lastCode)).ok).toBe(false)
  })

  it('uses the same login in another business, with separate profiles and no foreign orders', async () => {
    const a = await sessions.currentAppAccess(first.app), b = await sessions.currentAppAccess(second.app)
    expect(b.visitor).toMatchObject({ email, roleId: 'client', enrolled: true })
    expect(b.viewer!.id).not.toBe(a.viewer!.id)
    const loaded = await runtime.loadPublishedApp(second.app.slug, b.visitor)
    expect(loaded!.tables[second.table('orders').id]!.rows).toHaveLength(0)
    expect(await actions.appCreateRowAction(second.app.slug, second.table('orders').id, {
      [second.field('orders', 'title').id]: 'Other business request', [second.field('orders', 'email').id]: email,
    })).toEqual({ ok: true })
    expect((await runtime.loadPublishedApp(first.app.slug, a.visitor))!.tables[first.table('orders').id]!.rows).toHaveLength(1)
    expect((await runtime.loadPublishedApp(second.app.slug, b.visitor))!.tables[second.table('orders').id]!.rows).toHaveLength(1)
    expect((await actions.appCreateRowAction(first.app.slug, second.table('orders').id, {
      [second.field('orders', 'title').id]: 'Must not cross businesses',
    })).ok).toBe(false)
  })

  it('accepts repeated requests without a new code and stamps ownership from the shared session', async () => {
    expect((await actions.appCreateRowAction(first.app.slug, first.table('orders').id, {
      [first.field('orders', 'title').id]: '   ', [first.field('orders', 'wish').id]: 'Cannot replace required title',
    })).ok).toBe(false)
    expect(await actions.appCreateRowAction(first.app.slug, first.table('orders').id, {
      [first.field('orders', 'title').id]: 'Repeated request', [first.field('orders', 'email').id]: 'someone-else@example.invalid',
      [first.field('orders', 'sum').id]: 0,
    })).toEqual({ ok: true })
    const access = await sessions.currentAppAccess(first.app), loaded = await runtime.loadPublishedApp(first.app.slug, access.visitor)
    expect(loaded!.tables[first.table('orders').id]!.rows).toHaveLength(2)
    expect(loaded!.tables[first.table('orders').id]!.rows.every(row => row.data[first.field('orders', 'email').id] === email)).toBe(true)
  })

  it('keeps employee roles local and fails closed when a personal rule is removed', async () => {
    first.app.allowlist = [{ email, roleId: 'staff', company: 'Only first business' }]
    expect((await sessions.currentAppAccess(first.app)).visitor.roleId).toBe('staff')
    expect((await sessions.currentAppAccess(second.app)).visitor.roleId).toBe('client')
    second.app.rowAccessRules = []
    await database.db.update(database.apps).set({ published: second.app }).where(eq(database.apps.id, second.app.id))
    expect((await actions.appCreateRowAction(second.app.slug, second.table('orders').id, {
      [second.field('orders', 'title').id]: 'Must not create unowned rows',
    })).ok).toBe(false)
    const access = await sessions.currentAppAccess(second.app), loaded = await runtime.loadPublishedApp(second.app.slug, access.visitor)
    expect(loaded!.tables[second.table('orders').id]!.rows).toHaveLength(0)
    expect(loaded!.tables[second.table('services').id]!.rows.length).toBeGreaterThan(0)
    const { appReadPolicy } = await import('./app-read-policy')
    const privatePolicy = await appReadPolicy(second.app, second.table('orders').id, access.visitor, access.viewer)
    expect(privatePolicy.canRead({ [second.field('orders', 'email').id]: email })).toBe(false)
    expect(privatePolicy.readable.fields.size).toBe(0)
    const publicPolicy = await appReadPolicy(second.app, second.table('services').id, access.visitor, access.viewer)
    const published = second.rows.find(row => row.tableId === second.table('services').id && row.data[second.field('services', 'published').id])
      ?? second.rows.find(row => row.tableId === second.table('services').id)!
    expect(publicPolicy.canRead(published.data)).toBe(true)
    expect(publicPolicy.readable.fields.has(second.field('services', 'cost').id)).toBe(false)
  })

  it('upgrades an existing portal draft without rewriting rows, history or the published app', async () => {
    const fixture = fixtures[0]!, form = first.app.screens.find(screen => screen.type === 'form' && screen.mode === 'create')!
    if (form.type !== 'form') throw new Error('wrong fixture')
    const legacy = { ...first.app, screens: first.app.screens.map(screen => screen.id !== form.id ? screen : {
      ...form, access: { ...form.access, roles: [] }, components: [...form.components.map(component => component.type === 'form_field' ? { ...component, required: false } : component),
        { id: newId('component'), position: 'zz', type: 'form_field' as const, fieldId: first.field('orders', 'email').id,
          label: null, roles: null, visibleWhen: null, required: false, placeholder: null }],
    }) }
    await database.db.update(database.apps).set({ draft: legacy }).where(eq(database.apps.id, first.app.id))
    for (const column of [first.field('orders', 'status'), first.field('orders', 'created')]) {
      const options = { ...column.options } as Record<string, unknown>
      delete options.defaultChoiceId; delete options.defaultToday
      await database.db.update(database.fields).set({ options }).where(eq(database.fields.id, column.id))
    }
    state.member = { userId: fixture.userId, email: `${fixture.userId}@example.invalid`, name: null,
      workspaceId: fixture.workspaceId, workspaceName: 'First business', role: 'owner' }
    const before = (await database.db.select().from(database.apps).where(eq(database.apps.id, first.app.id)))[0]!
    const rowsBefore = await database.db.select().from(database.rows).where(eq(database.rows.tableId, first.table('orders').id))
    const historyBefore = await database.db.select().from(database.rowChanges).where(eq(database.rowChanges.tableId, first.table('orders').id))
    const { enableRepeatRequestsAction } = await import('@/app/portal-setup-actions')
    const result = await enableRepeatRequestsAction(first.app.id, first.table('orders').id, legacy)
    if (!result.ok) throw new Error(result.error)
    const after = (await database.db.select().from(database.apps).where(eq(database.apps.id, first.app.id)))[0]!
    expect(after.published).toEqual(before.published)
    expect(after.publishedAt).toEqual(before.publishedAt)
    expect(await database.db.select().from(database.rows).where(eq(database.rows.tableId, first.table('orders').id))).toEqual(rowsBefore)
    expect(await database.db.select().from(database.rowChanges).where(eq(database.rowChanges.tableId, first.table('orders').id))).toEqual(historyBefore)
    expect((await enableRepeatRequestsAction(first.app.id, first.table('orders').id, result.app)).ok).toBe(true)
    expect((await enableRepeatRequestsAction(first.app.id, first.table('orders').id, legacy)).ok).toBe(false)
    expect((await enableRepeatRequestsAction(second.app.id, second.table('orders').id, second.app)).ok).toBe(false)
    const upgradedFields = await database.db.select().from(database.fields).where(eq(database.fields.tableId, first.table('orders').id))
    expect(upgradedFields.find(field => field.id === first.field('orders', 'created').id)!.options).toMatchObject({ defaultToday: true })
  })
})
