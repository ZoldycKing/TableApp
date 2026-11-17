import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { newId } from '@tableapp/schema'
import type { AppV2Json } from '@tableapp/schema/app-v2'
import { buildTemplate } from './templates/build'
import { findTemplate } from './templates/catalog'
import { buildDispatchV2App } from './templates/dispatch-v2'
import { builderV2Revision } from './builder-v2-revision'

const identity = vi.hoisted(() => ({ email: 'owner@example.invalid' }))
vi.mock('@/lib/app-session', () => ({ currentStaffEmail: async () => identity.email }))
vi.mock('@/lib/session', () => ({ currentAccount: async () => null }))
vi.mock('@/lib/live', () => ({ publishTable: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

describe.skipIf(!process.env.DATABASE_URL)('published field-service rows', () => {
  const userId = newId('user'), workspaceId = newId('workspace')
  const built = buildTemplate({ template: findTemplate('zayavki')!, workspaceId })
  const app = buildDispatchV2App(built, { id: newId('app'), workspaceId, name: 'Заявки', slug: `zayavki-${workspaceId.replace(/[^a-z0-9]/gi, '').slice(-8).toLowerCase()}`, email: 'owner@example.invalid' })
  app.authentication.members.push({ email: 'sergey@example.invalid', roleIds: ['staff'], company: '' })
  const dispatch = app.dispatch!
  const job = built.rows.find(row => row.tableId === dispatch.jobsTableId && row.data[dispatch.job.masterEmail!] === 'sergey@example.invalid')!
  let db: typeof import('@tableapp/db'), action: typeof import('@/app/dispatch-actions')
  const revision = () => builderV2Revision(app)
  const read = async (id: string) => {
    const [row] = await db.db.select().from(db.rows).where(eq(db.rows.id, id))
    return row!.data as Record<string, AppV2Json>
  }

  beforeAll(async () => {
    db = await import('@tableapp/db')
    action = await import('@/app/dispatch-actions')
    await db.db.insert(db.users).values({ id: userId, email: `${userId}@example.invalid` })
    await db.db.insert(db.workspaces).values({ id: workspaceId, name: 'Dispatch persist', slug: workspaceId, ownerId: userId, plan: 'business' })
    await db.db.insert(db.tables).values(built.tables)
    await db.db.insert(db.fields).values(built.fields)
    await db.db.insert(db.views).values(built.views)
    await db.db.insert(db.rows).values(built.rows.map(row => ({ ...row, createdBy: userId, updatedBy: userId })))
    await db.db.insert(db.apps).values({ id: app.id, workspaceId, name: app.name, slug: app.slug, draft: app, published: app, theme: app.theme, accessMode: 'allowlist', homeScreenId: app.homeScreenId })
  })
  afterAll(async () => { if (db) { await db.db.delete(db.workspaces).where(eq(db.workspaces.id, workspaceId)); await db.db.delete(db.users).where(eq(db.users.id, userId)) } })

  it('persists the timer, the checklist and a minute correction for the assigned technician', async () => {
    identity.email = 'sergey@example.invalid'
    const started = await action.savePublishedDispatchAction(app.slug, { kind: 'progress', revision: revision(), screenId: dispatch.jobScreenId, recordId: job.id, status: dispatch.statuses.onSite, onSiteAt: '2026-11-17T07:00:00.000Z', checklist: '[{"label":"Фильтр","done":true}]' })
    expect(started, JSON.stringify(started)).toEqual({ ok: true, message: 'Заявка сохранена.' })
    expect(await read(job.id)).toMatchObject({ [dispatch.job.status]: dispatch.statuses.onSite, [dispatch.job.onSiteAt!]: '2026-11-17T07:00:00.000Z' })
    const corrected = await action.savePublishedDispatchAction(app.slug, { kind: 'progress', revision: revision(), screenId: dispatch.jobScreenId, recordId: job.id, actualMinutes: 38, doneAt: '2026-11-17T07:38:00.000Z', status: dispatch.statuses.done })
    expect(corrected.ok).toBe(true)
    expect((await read(job.id))[dispatch.job.actualMinutes!]).toBe(38)
    identity.email = 'andrey@example.invalid'
    expect((await action.savePublishedDispatchAction(app.slug, { kind: 'progress', revision: revision(), screenId: dispatch.jobScreenId, recordId: job.id, actualMinutes: 1 })).ok).toBe(false)
  })

  it('creates the following visits of a series for the dispatcher', async () => {
    identity.email = 'owner@example.invalid'
    const before = await db.db.select().from(db.rows).where(eq(db.rows.tableId, dispatch.jobsTableId))
    const saved = await action.savePublishedDispatchAction(app.slug, { kind: 'series', revision: revision(), screenId: dispatch.jobScreenId, recordId: job.id, rule: 'weekly', count: 4, scope: 'series' })
    expect(saved, JSON.stringify(saved)).toEqual({ ok: true, message: 'Серия сохранена.' })
    const after = await db.db.select().from(db.rows).where(eq(db.rows.tableId, dispatch.jobsTableId))
    expect(after.length).toBe(before.length + 3)
    const seriesId = (await read(job.id))[dispatch.job.seriesId!]
    expect(typeof seriesId).toBe('string')
    expect(after.filter(row => (row.data as Record<string, AppV2Json>)[dispatch.job.seriesId!] === seriesId)).toHaveLength(4)
    identity.email = 'sergey@example.invalid'
    expect((await action.savePublishedDispatchAction(app.slug, { kind: 'series', revision: revision(), screenId: dispatch.jobScreenId, recordId: job.id, rule: 'weekly', count: 4, scope: 'series' })).ok).toBe(false)
  })
})
