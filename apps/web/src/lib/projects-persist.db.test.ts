import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { newId } from '@tableapp/schema'
import type { AppV2Json } from '@tableapp/schema/app-v2'
import { buildTemplate } from './templates/build'
import { findTemplate } from './templates/catalog'
import { buildProjectsV2App } from './templates/projects-v2'
import { builderV2Revision } from './builder-v2-revision'

const identity = vi.hoisted(() => ({ email: 'owner@example.invalid' }))
vi.mock('@/lib/app-session', () => ({ currentStaffEmail: async () => identity.email }))
vi.mock('@/lib/session', () => ({ currentAccount: async () => null }))
vi.mock('@/lib/live', () => ({ publishTable: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

describe.skipIf(!process.env.DATABASE_URL)('published project rows', () => {
  const userId = newId('user'), workspaceId = newId('workspace')
  const built = buildTemplate({ template: findTemplate('proekty')!, workspaceId })
  const app = buildProjectsV2App(built, { id: newId('app'), workspaceId, name: 'Проекты', slug: `proekty-${workspaceId.replace(/[^a-z0-9]/gi, '').slice(-8).toLowerCase()}`, email: 'owner@example.invalid' })
  app.authentication.members.push({ email: 'anna@example.invalid', roleIds: ['staff'], company: '' })
  const kit = app.projects!
  const task = built.rows.find(row => row.tableId === kit.tasksTableId && row.data[kit.task.assigneeEmail] === 'anna@example.invalid' && row.data[kit.task.title] === 'Макет главной страницы')!
  let db: typeof import('@tableapp/db'), action: typeof import('@/app/projects-actions')
  const revision = () => builderV2Revision(app)
  const read = async (id: string) => {
    const [row] = await db.db.select().from(db.rows).where(eq(db.rows.id, id))
    return row!.data as Record<string, AppV2Json>
  }

  beforeAll(async () => {
    db = await import('@tableapp/db')
    action = await import('@/app/projects-actions')
    await db.db.insert(db.users).values({ id: userId, email: `${userId}@example.invalid` })
    await db.db.insert(db.workspaces).values({ id: workspaceId, name: 'Projects persist', slug: workspaceId, ownerId: userId, plan: 'business' })
    await db.db.insert(db.tables).values(built.tables)
    await db.db.insert(db.fields).values(built.fields)
    await db.db.insert(db.views).values(built.views)
    await db.db.insert(db.rows).values(built.rows.map(row => ({ ...row, createdBy: userId, updatedBy: userId })))
    await db.db.insert(db.apps).values({ id: app.id, workspaceId, name: app.name, slug: app.slug, draft: app, published: app, theme: app.theme, accessMode: 'allowlist', homeScreenId: app.homeScreenId })
  })
  afterAll(async () => { if (db) { await db.db.delete(db.workspaces).where(eq(db.workspaces.id, workspaceId)); await db.db.delete(db.users).where(eq(db.users.id, userId)) } })

  it('persists a drag, a checklist and a comment for the assignee', async () => {
    identity.email = 'anna@example.invalid'
    const moved = await action.savePublishedProjectsAction(app.slug, { kind: 'move', revision: revision(), screenId: kit.taskScreenId, recordId: task.id, statusId: kit.statuses.doing, orderedIds: [task.id] })
    expect(moved, JSON.stringify(moved)).toEqual({ ok: true, message: 'Задача сохранена.' })
    expect(await read(task.id)).toMatchObject({ [kit.task.status]: kit.statuses.doing })
    const edited = await action.savePublishedProjectsAction(app.slug, {
      kind: 'task', revision: revision(), screenId: kit.taskScreenId, recordId: task.id,
      title: 'Макет главной страницы', projectId: String((task.data[kit.task.project] as string[])[0]), assigneeId: String((task.data[kit.task.assignee] as string[])[0]),
      assigneeEmail: 'anna@example.invalid', due: '2026-11-17', priorityId: String(task.data[kit.task.priority]), statusId: kit.statuses.doing,
      description: 'Три колонки тарифов.', checklist: '[{"label":"Тарифы","done":true}]',
    })
    expect(edited.ok, JSON.stringify(edited)).toBe(true)
    expect((await read(task.id))[kit.task.checklist]).toBe('[{"label":"Тарифы","done":true}]')
    const comment = await action.savePublishedProjectsAction(app.slug, { kind: 'comment', revision: revision(), screenId: kit.taskScreenId, recordId: task.id, text: 'Тарифы поправила.' })
    expect(comment, JSON.stringify(comment)).toEqual({ ok: true, message: 'Комментарий добавлен.' })
    const notes = await db.db.select().from(db.rows).where(eq(db.rows.tableId, kit.commentsTableId))
    expect(notes.some(row => (row.data as Record<string, AppV2Json>)[kit.comment.text] === 'Тарифы поправила.')).toBe(true)
    identity.email = 'igor@example.invalid'
    expect((await action.savePublishedProjectsAction(app.slug, { kind: 'move', revision: revision(), screenId: kit.taskScreenId, recordId: task.id, statusId: kit.statuses.done, orderedIds: [task.id] })).ok).toBe(false)
  })

  it('persists a one-level subtask and a comment mention', async () => {
    identity.email = 'owner@example.invalid'
    const igor = built.rows.find(row => row.tableId === kit.peopleTableId && row.data[kit.person.email] === 'igor@example.invalid')!
    const created = await action.savePublishedProjectsAction(app.slug, {
      kind: 'create-subtask', revision: revision(), screenId: kit.taskScreenId, recordId: task.id,
      title: 'Проверка подвала', assigneeId: igor.id, assigneeEmail: 'igor@example.invalid', due: '2026-11-19', priorityId: kit.priorities.medium,
    })
    expect(created, JSON.stringify(created)).toEqual({ ok: true, message: 'Подзадача создана.' })
    const stored = await db.db.select().from(db.rows).where(eq(db.rows.tableId, kit.tasksTableId))
    const child = stored.find(row => (row.data as Record<string, AppV2Json>)[kit.task.title] === 'Проверка подвала')
    expect(child && (child.data as Record<string, AppV2Json>)[kit.task.parent]).toEqual([task.id])
    const nested = await action.savePublishedProjectsAction(app.slug, {
      kind: 'create-subtask', revision: revision(), screenId: kit.taskScreenId, recordId: child!.id,
      title: 'Ещё глубже', assigneeId: igor.id, assigneeEmail: 'igor@example.invalid', due: null, priorityId: kit.priorities.low,
    })
    expect(nested.ok).toBe(false)
    const mention = await action.savePublishedProjectsAction(app.slug, {
      kind: 'comment', revision: revision(), screenId: kit.taskScreenId, recordId: task.id, text: '@Игорь Белов, глянь шапку', mentionIds: [igor.id],
    })
    expect(mention, JSON.stringify(mention)).toEqual({ ok: true, message: 'Комментарий добавлен.' })
    const notes = await db.db.select().from(db.rows).where(eq(db.rows.tableId, kit.commentsTableId))
    const note = notes.find(row => (row.data as Record<string, AppV2Json>)[kit.comment.text] === '@Игорь Белов, глянь шапку')
    expect(note && (note.data as Record<string, AppV2Json>)[kit.comment.mentions]).toEqual([igor.id])
  })
})
