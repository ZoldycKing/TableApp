import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { and, eq, inArray } from 'drizzle-orm'
import { newId, type App } from '@tableapp/schema'
import { templateExample } from './templates/presentation'

const state = vi.hoisted(() => ({ jar: new Map<string, string>(), lastCode: '', lastLink: '', letters: 0, ip: '' }))
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (name: string) => state.jar.has(name) ? { value: state.jar.get(name) } : undefined,
    set: (name: string, value: string) => state.jar.set(name, value), delete: (name: string) => state.jar.delete(name) }),
  headers: async () => new Headers({ host: '127.0.0.1:3101', 'user-agent': 'Question authentication test', 'x-real-ip': state.ip }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/mailer', () => ({ sendMagicLink: async (letter: { code: string; link: string }) => {
  state.lastCode = letter.code; state.lastLink = letter.link; state.letters += 1; return { delivered: true }
}, mailHintFor: () => null }))

const envFile = resolve(import.meta.dirname, '../../../../.env')
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile)

describe.skipIf(!process.env.DATABASE_URL)('verified question signup before an order against Postgres', () => {
  let database: typeof import('@tableapp/db'), auth: typeof import('@/app/auth-actions')
  let question: typeof import('@/app/question-auth-actions'), session: typeof import('./app-session')
  const fixtures: { workspaceId: string; ownerId: string; app: App; tableIds: string[] }[] = []
  const addresses = new Set<string>()
  const address = () => { const email = `${newId('appUser')}@example.invalid`; addresses.add(email); return email }

  beforeAll(async () => {
    database = await import('@tableapp/db'); auth = await import('@/app/auth-actions')
    question = await import('@/app/question-auth-actions'); session = await import('./app-session')
  })
  beforeEach(() => { state.jar.clear(); state.lastCode = ''; state.lastLink = ''; state.letters = 0; state.ip = `question-auth-${newId('row')}` })
  afterAll(async () => {
    if (!database) return
    const emails = [...addresses]
    await database.db.delete(database.workspaces).where(inArray(database.workspaces.id, fixtures.map(item => item.workspaceId)))
    await database.db.delete(database.users).where(inArray(database.users.id, fixtures.map(item => item.ownerId)))
    if (emails.length) {
      await database.db.delete(database.staffSessions).where(inArray(database.staffSessions.email, emails))
      await database.db.delete(database.authTokens).where(inArray(database.authTokens.email, emails))
      await database.db.delete(database.authEvents).where(inArray(database.authEvents.email, emails))
    }
    state.jar.clear(); await database.sql.end()
  })

  async function business(templateId = 'salon', change?: (app: App) => void) {
    const example = templateExample(templateId), workspaceId = newId('workspace'), ownerId = newId('user')
    const app: App = { ...example.app, workspaceId, slug: `question-auth-${newId('app')}`, accessMode: 'allowlist', communications: { enabled: true } }
    change?.(app)
    const fixture = { workspaceId, ownerId, app, tableIds: example.built.tables.map(table => table.id) }
    fixtures.push(fixture)
    await database.db.transaction(async tx => {
      await tx.insert(database.users).values({ id: ownerId, email: `${ownerId}@example.invalid` })
      await tx.insert(database.workspaces).values({ id: workspaceId, ownerId, name: 'Synthetic question business', slug: workspaceId })
      await tx.insert(database.workspaceMembers).values({ workspaceId, userId: ownerId, role: 'owner' })
      await tx.insert(database.tables).values(example.built.tables.map(table => ({ ...table, workspaceId })))
      await tx.insert(database.fields).values(example.built.fields)
      await tx.insert(database.views).values(example.built.views)
      await tx.insert(database.rows).values(example.built.rows)
      await tx.insert(database.apps).values({ id: app.id, workspaceId, name: app.name, slug: app.slug, draft: app, published: app, publishedAt: new Date() })
    })
    return fixture
  }

  async function known(email: string, appId: string) {
    return database.db.select().from(database.appUsers).where(and(eq(database.appUsers.appId, appId), eq(database.appUsers.email, email)))
  }
  async function profiles(email: string) {
    return database.db.select().from(database.businessCustomers).where(eq(database.businessCustomers.email, email))
  }
  async function signIn(email: string) {
    const id = newId('session')
    await database.db.insert(database.staffSessions).values({ id, email, expiresAt: new Date(Date.now() + 3600000) })
    state.jar.set('tableapp_staff', id)
  }

  it('creates no client, profile, order or session before OTP and then enrolls only a verified client', async () => {
    const fixture = await business(), email = address()
    const beforeRows = await database.db.select({ id: database.rows.id }).from(database.rows).where(inArray(database.rows.tableId, fixture.tableIds)).orderBy(database.rows.id)
    expect(await question.beginGeneralQuestionAction(fixture.app.slug)).toEqual({ ok: true, authenticated: false })
    expect(await auth.requestAppLoginAction(fixture.app.slug, email, 'question')).toMatchObject({ ok: true, delivered: true })
    expect(state.letters).toBe(1)
    const [attempt] = await database.db.select().from(database.authTokens).where(eq(database.authTokens.email, email))
    expect(attempt).toMatchObject({ purpose: 'app_login', intent: 'question', appId: fixture.app.id, consumedAt: null })
    expect(await known(email, fixture.app.id)).toEqual([])
    expect(await profiles(email)).toEqual([])
    expect(await database.db.select().from(database.staffSessions).where(eq(database.staffSessions.email, email))).toEqual([])
    expect((await auth.consumeAppCodeAction(fixture.app.slug, state.lastCode === '111111' ? '222222' : '111111')).ok).toBe(false)
    expect(await known(email, fixture.app.id)).toEqual([])
    expect(await profiles(email)).toEqual([])
    expect(await auth.consumeAppCodeAction(fixture.app.slug, state.lastCode)).toEqual({ ok: true })
    expect(await session.currentStaffEmail()).toBe(email)
    expect(await known(email, fixture.app.id)).toEqual([expect.objectContaining({ email, roleId: 'client', joinedVia: 'question' })])
    expect(await profiles(email)).toEqual([expect.objectContaining({ workspaceId: fixture.workspaceId, email, name: null, phone: null })])
    expect((await session.currentAppAccess(fixture.app)).visitor).toMatchObject({ authenticated: true, roleId: 'client', enrolled: true, email })
    expect(await database.db.select().from(database.users).where(eq(database.users.email, email))).toEqual([])
    expect(await database.db.select({ id: database.rows.id }).from(database.rows).where(inArray(database.rows.tableId, fixture.tableIds)).orderBy(database.rows.id)).toEqual(beforeRows)
    const [stored] = await database.db.select().from(database.apps).where(eq(database.apps.id, fixture.app.id))
    expect((stored!.published as App).allowlist).toEqual(fixture.app.allowlist)
    const token = new URL(state.lastLink).searchParams.get('token')!
    expect((await auth.consumeAppToken(fixture.app.slug, token)).ok).toBe(false)
  })

  it('leaves the default allowlist login unchanged for an unknown address', async () => {
    const fixture = await business(), email = address()
    expect(await auth.requestAppLoginAction(fixture.app.slug, email)).toMatchObject({ ok: true })
    expect(state.letters).toBe(0)
    expect(await known(email, fixture.app.id)).toEqual([])
    expect(await database.db.select().from(database.authTokens).where(eq(database.authTokens.email, email))).toEqual([])
  })

  it('reuses one verified session across businesses but keeps profiles, app roles and contacts separate', async () => {
    const first = await business(), second = await business(), email = address()
    await signIn(email)
    const cookie = state.jar.get('tableapp_staff')
    expect(await question.beginGeneralQuestionAction(first.app.slug)).toEqual({ ok: true, authenticated: true })
    const [firstProfile] = await profiles(email)
    await database.db.update(database.businessCustomers).set({ name: 'Only first business', phone: '+79000000000' }).where(eq(database.businessCustomers.id, firstProfile!.id))
    expect(await question.beginGeneralQuestionAction(second.app.slug)).toEqual({ ok: true, authenticated: true })
    expect(state.jar.get('tableapp_staff')).toBe(cookie)
    expect(state.letters).toBe(0)
    const records = await profiles(email)
    expect(records).toHaveLength(2)
    expect(records.find(profile => profile.workspaceId === first.workspaceId)).toMatchObject({ id: firstProfile!.id, name: 'Only first business', phone: '+79000000000' })
    expect(records.find(profile => profile.workspaceId === second.workspaceId)).toMatchObject({ name: null, phone: null })
    expect((await known(email, first.app.id))[0]!.id).not.toBe((await known(email, second.app.id))[0]!.id)
    expect((await known(email, second.app.id))[0]).toMatchObject({ roleId: 'client', joinedVia: 'question' })
    const links = await database.db.select().from(database.businessCustomerApps).where(inArray(database.businessCustomerApps.customerId, records.map(profile => profile.id)))
    expect(links.every(link => records.some(profile => profile.id === link.customerId && profile.workspaceId === link.workspaceId))).toBe(true)
    expect(links).toHaveLength(2)
  })

  it('denies internal, nonpublic, disabled, unpublished and nonclient-default applications', async () => {
    const fixtures = [
      await business('sklad'),
      await business('salon', app => { app.screens = app.screens.map(screen => ({ ...screen, access: { ...screen.access, public: false } })) }),
      await business('salon', app => { app.communications = { enabled: false } }),
      await business('salon', app => { app.roles = app.roles.map(role => ({ ...role, isDefault: role.id === 'manager' })) }),
      await business(),
    ]
    await database.db.update(database.apps).set({ published: null, publishedAt: null }).where(eq(database.apps.id, fixtures.at(-1)!.app.id))
    for (const fixture of fixtures) {
      const email = address()
      expect((await auth.requestAppLoginAction(fixture.app.slug, email, 'question')).ok).toBe(false)
      await signIn(email)
      expect((await question.beginGeneralQuestionAction(fixture.app.slug)).ok).toBe(false)
      expect(await known(email, fixture.app.id)).toEqual([])
      expect(await profiles(email)).toEqual([])
      expect(await database.db.select().from(database.authTokens).where(eq(database.authTokens.email, email))).toEqual([])
    }
    expect(state.letters).toBe(0)
  })

  it('rechecks publication and communication settings before consuming a previously issued question code', async () => {
    const fixture = await business(), email = address()
    expect((await auth.requestAppLoginAction(fixture.app.slug, email, 'question')).ok).toBe(true)
    await database.db.update(database.apps).set({ published: { ...fixture.app, communications: { enabled: false } } }).where(eq(database.apps.id, fixture.app.id))
    expect((await auth.consumeAppCodeAction(fixture.app.slug, state.lastCode)).ok).toBe(false)
    expect(await known(email, fixture.app.id)).toEqual([])
    expect(await profiles(email)).toEqual([])
    expect(await database.db.select().from(database.staffSessions).where(eq(database.staffSessions.email, email))).toEqual([])
    const [attempt] = await database.db.select().from(database.authTokens).where(eq(database.authTokens.email, email))
    expect(attempt!.consumedAt).toBeNull()
  })

  it('preserves both declared worker roles and existing app-user roles without granting a customer fallback', async () => {
    const declared = await business(), stored = await business(), email = address()
    declared.app.allowlist = [{ email, roleId: 'manager', company: 'Only this business' }]
    await database.db.update(database.apps).set({ published: declared.app }).where(eq(database.apps.id, declared.app.id))
    const knownId = newId('appUser')
    await database.db.insert(database.appUsers).values({ id: knownId, appId: stored.app.id, email, roleId: 'master', joinedVia: 'invite' })
    await signIn(email)
    expect((await question.beginGeneralQuestionAction(declared.app.slug)).ok).toBe(false)
    expect(await known(email, declared.app.id)).toEqual([])
    expect((await question.beginGeneralQuestionAction(stored.app.slug)).ok).toBe(false)
    expect(await known(email, stored.app.id)).toEqual([expect.objectContaining({ id: knownId, roleId: 'master', joinedVia: 'invite' })])
    state.jar.clear()
    expect((await auth.requestAppLoginAction(stored.app.slug, email, 'question')).ok).toBe(true)
    expect((await auth.consumeAppCodeAction(stored.app.slug, state.lastCode)).ok).toBe(false)
    expect(await known(email, stored.app.id)).toEqual([expect.objectContaining({ roleId: 'master', joinedVia: 'invite' })])
    expect(await profiles(email)).toEqual([])
  })
})
