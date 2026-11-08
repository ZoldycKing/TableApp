import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { appSchema, newId, type App } from '@tableapp/schema'

const envFile = resolve(import.meta.dirname, '../../../../.env')
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile)
const state = vi.hoisted(() => ({ member: null as import('./session').Member | null }))
vi.mock('@/lib/session', async original => ({ ...await original<typeof import('./session')>(), currentMember: async () => state.member }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

describe.skipIf(!process.env.DATABASE_URL)('publication snapshot and permanent application address', () => {
  let database: typeof import('@tableapp/db'), actions: typeof import('@/app/app-actions')
  const owner = newId('user'), workspaceId = newId('workspace')
  const member = { userId: owner, email: `${owner}@example.invalid`, workspaceId, workspaceName: 'Synthetic publication', name: 'Test', role: 'owner' as const }
  beforeAll(async () => {
    database = await import('@tableapp/db'); actions = await import('@/app/app-actions')
    await database.db.insert(database.users).values({ id: owner, email: member.email })
    await database.db.insert(database.workspaces).values({ id: workspaceId, ownerId: owner, slug: workspaceId, name: member.workspaceName, plan: 'business' })
    await database.db.insert(database.workspaceMembers).values({ workspaceId, userId: owner, role: 'owner' })
    state.member = member
  })
  afterAll(async () => {
    if (!database) return
    await database.db.delete(database.workspaces).where(eq(database.workspaces.id, workspaceId))
    await database.db.delete(database.users).where(eq(database.users.id, owner))
    await database.sql.end()
  })
  async function fixture() {
    state.member = member
    const id = newId('app')
    const app = appSchema.parse({ id, workspaceId, name: 'Publication test', slug: id.replace('_', '-'), theme: {}, screens: [{ id: newId('screen'), appId: id, name: 'Initial', position: 'a0', type: 'dashboard', tab: null, access: { public: true, roles: [], publicFields: [], allowDelete: false }, blocks: [] }] })
    await database.db.insert(database.apps).values({ id, workspaceId, name: app.name, slug: app.slug, draft: app })
    return app
  }
  async function record(id: string) { const [app] = await database.db.select().from(database.apps).where(eq(database.apps.id, id)); return app! }
  it('rejects a snapshot mismatch instead of silently publishing an older draft', async () => {
    const app = await fixture()
    const newest: App = { ...app, screens: app.screens.map(screen => ({ ...screen, name: 'Latest' })) }
    expect(await actions.publishAppAction(app.id, newest)).toMatchObject({ ok: false })
    expect((await record(app.id)).published).toBeNull()
    expect(await actions.updateAppDraftAction(app.id, newest)).toEqual({ ok: true })
    expect(await actions.publishAppAction(app.id, newest)).toMatchObject({ ok: true })
    expect(appSchema.parse((await record(app.id)).published).screens[0]!.name).toBe('Latest')
  })
  it('changes an unpublished address only through the explicit operation and rejects stale edits', async () => {
    const app = await fixture(), slug = `${app.slug}-new`
    expect(await actions.updateAppDraftAction(app.id, { ...app, slug })).toMatchObject({ ok: false })
    expect((await record(app.id)).slug).toBe(app.slug)
    expect(await actions.changeAppSlugAction(app.id, slug, app.slug)).toEqual({ ok: true })
    expect((await record(app.id)).slug).toBe(slug)
    expect(appSchema.parse((await record(app.id)).draft).slug).toBe(slug)
    expect(await actions.changeAppSlugAction(app.id, `${app.slug}-other`, app.slug)).toMatchObject({ ok: false })
  })
  it('keeps the address locked after publication is removed', async () => {
    const app = await fixture()
    expect(await actions.publishAppAction(app.id, app)).toMatchObject({ ok: true })
    expect(await actions.changeAppSlugAction(app.id, `${app.slug}-new`, app.slug)).toMatchObject({ ok: false })
    expect(await actions.unpublishAppAction(app.id)).toEqual({ ok: true })
    expect(await actions.changeAppSlugAction(app.id, `${app.slug}-new`, app.slug)).toMatchObject({ ok: false })
    expect((await record(app.id)).slug).toBe(app.slug)
  })
  it('records the address lock when an older application without version history is unpublished', async () => {
    const app = await fixture()
    await database.db.update(database.apps).set({ published: app, publishedAt: new Date() }).where(eq(database.apps.id, app.id))
    expect(await actions.unpublishAppAction(app.id)).toEqual({ ok: true })
    expect(await actions.changeAppSlugAction(app.id, `${app.slug}-new`, app.slug)).toMatchObject({ ok: false })
  })
  it('rejects an occupied address instead of silently appending a different suffix', async () => {
    const first = await fixture(), second = await fixture()
    expect(await actions.changeAppSlugAction(second.id, first.slug, second.slug)).toMatchObject({ ok: false, error: 'Этот адрес уже занят. Выберите другой.' })
    expect((await record(second.id)).slug).toBe(second.slug)
  })
  it('uses the database canonical address when a legacy published snapshot has an old address', async () => {
    const app = await fixture()
    await database.db.update(database.apps).set({ published: { ...app, slug: 'obsolete-snapshot-address' }, publishedAt: new Date() }).where(eq(database.apps.id, app.id))
    const { loadAppMeta, loadPublishedApp } = await import('./app-runtime')
    const { ANONYMOUS } = await import('./app-roles')
    expect((await loadAppMeta(app.slug))?.app.slug).toBe(app.slug)
    expect((await loadPublishedApp(app.slug, ANONYMOUS))?.app.slug).toBe(app.slug)
  })
  it('keeps server denial for viewer publication, address and draft changes', async () => {
    const app = await fixture()
    state.member = { ...member, role: 'viewer' }
    expect(await actions.publishAppAction(app.id, app)).toMatchObject({ ok: false, error: 'У вас права только на просмотр' })
    expect(await actions.changeAppSlugAction(app.id, `${app.slug}-new`, app.slug)).toMatchObject({ ok: false })
    expect(await actions.updateAppDraftAction(app.id, { ...app, name: 'Denied' })).toMatchObject({ ok: false })
    expect((await record(app.id)).name).toBe(app.name)
  })
})
