import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { newId } from '@tableapp/schema'

const identity = vi.hoisted(() => ({ member: null as import('./session').Member | null }))
const storage = vi.hoisted(() => ({
  putFile: vi.fn(async () => ({ ok: true })),
  deleteFile: vi.fn(async () => {}),
  getFile: vi.fn(async () => ({ body: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), mime: 'image/png' })),
  fileKey: (workspaceId: string) => `${workspaceId}/unexpected.png`,
}))
vi.mock('./session', async original => ({ ...await original<typeof import('./session')>(), currentMember: async () => identity.member }))
vi.mock('./storage', () => storage)
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
const env = resolve(import.meta.dirname, '../../../../.env')
if (!process.env.DATABASE_URL && existsSync(env)) process.loadEnvFile(env)

describe.skipIf(!process.env.DATABASE_URL)('builder logo lifecycle', () => {
  let data: typeof import('@tableapp/db')
  const userId = newId('user'), workspaceId = newId('workspace')
  const member = { userId, workspaceId, email: `${userId}@example.invalid`, name: 'Проверка логотипа', workspaceName: 'Builder logo regression', role: 'owner' as const }

  beforeAll(async () => {
    data = await import('@tableapp/db')
    await data.db.insert(data.users).values({ id: userId, email: member.email })
    await data.db.insert(data.workspaces).values({ id: workspaceId, ownerId: userId, slug: workspaceId, name: member.workspaceName, plan: 'business' })
    await data.db.insert(data.workspaceMembers).values({ workspaceId, userId, role: 'owner' })
  })

  afterAll(async () => {
    if (!data) return
    await data.db.delete(data.workspaces).where(eq(data.workspaces.id, workspaceId))
    await data.db.delete(data.users).where(eq(data.users.id, userId))
    await data.sql.end()
  })

  it('delivers only the published logo to visitors and retains files referenced by versions', async () => {
    const { newBuilderV2App, builderV2Revision } = await import('./builder-v2')
    const { uploadBuilderV2LogoAction } = await import('@/app/builder-v2-logo-actions')
    const { saveBuilderV2DraftAction } = await import('@/app/builder-v2-actions')
    const { publishBuilderV2Action } = await import('@/app/builder-v2-publish-actions')
    const { GET } = await import('@/app/api/builder-v2/logo/[appId]/route')
    const { cleanupFiles } = await import('./file-cleanup')
    const makeApp = () => {
      const id = newId('app')
      const app = newBuilderV2App({ id, workspaceId, name: 'Мастерская', slug: id.replace('_', '-'), email: member.email })
      app.nodes.push({ id: 'greeting', type: 'text', name: 'Приветствие', value: { kind: 'literal', value: 'Здравствуйте' }, visibleWhen: null, visibleTo: null })
      app.screens[0]!.rootIds.push('greeting')
      return app
    }
    const app = makeApp(), other = makeApp()
    await data.db.insert(data.apps).values([app, other].map(draft => ({ id: draft.id, workspaceId, name: draft.name, slug: draft.slug, draft, theme: draft.theme })))
    const makeForm = (valid: boolean) => {
      const form = new FormData()
      form.set('file', new File([new Uint8Array(valid ? [137, 80, 78, 71, 13, 10, 26, 10] : [1, 2, 3])], 'mark.png', { type: 'image/png' }))
      return form
    }
    identity.member = member
    expect(await uploadBuilderV2LogoAction(app.id, makeForm(false))).toMatchObject({ ok: false })
    expect(storage.putFile).not.toHaveBeenCalled()
    const first = await uploadBuilderV2LogoAction(app.id, makeForm(true)), replacement = await uploadBuilderV2LogoAction(app.id, makeForm(true))
    if (!first.ok || !replacement.ok) throw new Error('Logo fixtures were not staged')
    const read = (key: string, draft = false, appId = app.id) => {
      const url = new URL(`http://localhost/api/builder-v2/logo/${appId}`)
      url.searchParams.set('key', key)
      if (draft) url.searchParams.set('draft', '1')
      return GET(new Request(url), { params: Promise.resolve({ appId }) })
    }
    expect((await read(first.key, true)).status).toBe(200)
    expect((await read(first.key, true, other.id)).status).toBe(404)
    expect((await read(first.key)).status).toBe(404)
    expect(await saveBuilderV2DraftAction(other.id, { ...other, theme: { ...other.theme, logoKey: first.key } }, builderV2Revision(other))).toMatchObject({ ok: false })

    const branded = { ...app, theme: { ...app.theme, logoKey: first.key } }
    const saved = await saveBuilderV2DraftAction(app.id, branded, builderV2Revision(app))
    if (!saved.ok) throw new Error(saved.error)
    expect(await publishBuilderV2Action(app.id, saved.revision)).toMatchObject({ ok: true })
    identity.member = null
    expect((await read(first.key)).headers.get('content-type')).toBe('image/png')
    expect((await read(first.key, true)).status).toBe(404)
    expect((await read(replacement.key)).status).toBe(404)

    identity.member = member
    const removed = await saveBuilderV2DraftAction(app.id, app, saved.revision)
    if (!removed.ok) throw new Error(removed.error)
    expect((await read(first.key)).status).toBe(200)
    expect(await publishBuilderV2Action(app.id, removed.revision)).toMatchObject({ ok: true })
    expect((await read(first.key)).status).toBe(404)
    const now = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)
    expect(await cleanupFiles({ run: true, workspaceId, now })).toMatchObject({ deleted: 1, failed: 0 })
    expect(storage.deleteFile).toHaveBeenCalledWith(replacement.key)
    expect(storage.deleteFile).not.toHaveBeenCalledWith(first.key)
    await data.db.delete(data.apps).where(eq(data.apps.id, app.id))
    expect(await cleanupFiles({ run: true, workspaceId, now })).toMatchObject({ deleted: 1, failed: 0 })
    expect(storage.deleteFile).toHaveBeenCalledWith(first.key)
  }, 15000)
})
