import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { newId, planOf, positionSequence } from '@tableapp/schema'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { templateExample } from './templates/presentation'

const identity = vi.hoisted(() => ({ member: null as import('./session').Member | null }))
vi.mock('@/lib/session', async original => ({ ...await original<typeof import('./session')>(), currentMember: async () => identity.member }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const envFile = resolve(import.meta.dirname, '../../../../.env')
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile)

describe.skipIf(!process.env.DATABASE_URL)('scheduled warehouse procurement in PostgreSQL', () => {
  let database: typeof import('@tableapp/db')
  let settings: typeof import('./stock-automation')
  let tick: typeof import('./stock-automation-worker')['tickStockAutomations']
  let actions: typeof import('@/app/stock-automation-actions')
  const fixtures: { userId: string; workspaceId: string }[] = []
  const before = new Date('2024-08-01T01:45:00.000Z')
  const due = new Date('2024-08-01T02:00:00.000Z')
  const after = new Date('2024-08-01T02:01:00.000Z')

  beforeAll(async () => {
    database = await import('@tableapp/db')
    settings = await import('./stock-automation')
    tick = (await import('./stock-automation-worker')).tickStockAutomations
    actions = await import('@/app/stock-automation-actions')
  })
  afterEach(async () => {
    for (const { userId, workspaceId } of fixtures.splice(0)) {
      await database.db.delete(database.workspaces).where(and(eq(database.workspaces.id, workspaceId), eq(database.workspaces.ownerId, userId)))
      await database.db.delete(database.users).where(eq(database.users.id, userId))
    }
    identity.member = null
  })
  afterAll(async () => { if (database) await database.sql.end() })

  async function fixture() {
    const { db, users, workspaces, workspaceMembers, tables, fields, views, rows, apps } = database
    const { app: example, built, field } = templateExample('sklad')
    const workspaceId = newId('workspace'), userId = newId('user'), email = `${userId}@example.invalid`
    const name = 'Synthetic stock automation tests'
    const app = { ...example, workspaceId, slug: example.id.replace('_', '-') }
    const scope = { workspaceId, appId: app.id }
    const inventory = app.inventory!, minimumFieldId = field('items', 'min').id
    const input = { minimumFieldId, localTime: '09:00', timeZone: 'Asia/Novosibirsk' }
    const [edge, low, enough, blank, deleted] = Array.from({ length: 5 }, () => newId('row')) as [string, string, string, string, string]
    const move = newId('row')
    const products = [
      { id: edge, title: 'На пороге после выдачи', opening: 8, minimum: 5, journal: [move] },
      { id: low, title: 'Меньше порога', opening: 2, minimum: 3, journal: [] },
      { id: enough, title: 'Достаточно', opening: 9, minimum: 3, journal: [] },
      { id: blank, title: 'Без порога', opening: 0, minimum: null, journal: [] },
      { id: deleted, title: 'Удалён', opening: 0, minimum: 3, journal: [] },
    ]
    const positions = positionSequence(products.length)
    fixtures.push({ userId, workspaceId })
    await db.transaction(async tx => {
      await tx.insert(users).values({ id: userId, email })
      await tx.insert(workspaces).values({ id: workspaceId, name, slug: workspaceId, ownerId: userId })
      await tx.insert(workspaceMembers).values({ workspaceId, userId, role: 'owner' })
      await tx.insert(tables).values(built.tables.map(table => ({ ...table, workspaceId })))
      await tx.insert(fields).values(built.fields)
      await tx.insert(views).values(built.views)
      await tx.insert(rows).values(products.map((item, index) => ({
        id: item.id, tableId: inventory.tables.items, position: positions[index]!, deletedAt: item.id === deleted ? before : null,
        data: { [inventory.item.name]: item.title, [inventory.item.opening]: item.opening, [inventory.item.movements]: item.journal, [minimumFieldId]: item.minimum },
      })))
      await tx.insert(rows).values({ id: move, tableId: inventory.tables.movements, position: 'a0',
        data: { [inventory.movement.item]: [edge], [inventory.movement.qty]: -3 } })
      await tx.insert(apps).values({ id: app.id, workspaceId, name: app.name, slug: app.slug, draft: app, published: app })
    })
    identity.member = { userId, workspaceId, role: 'owner', email, workspaceName: name, name: 'Владелец' }
    return { app, scope, input, edge, low }
  }

  async function current(scope: Awaited<ReturnType<typeof fixture>>['scope']) {
    const state = await settings.loadStockAutomation(scope)
    if (!state?.automation) throw new Error('Fixture automation was not saved')
    const { db, rows } = database
    const tasks = await db.select().from(rows).where(and(eq(rows.tableId, state.automation.taskTableId), isNull(rows.deletedAt)))
    return { ...state, automation: state.automation, tasks: tasks.map(row => ({ ...row, data: row.data as Record<string, unknown> })) }
  }

  it('checks the real journal balance at the scheduled local time and creates each purchase task once across workers', async () => {
    const { scope, input, edge, low } = await fixture()
    await settings.saveStockAutomation(scope, input, before)
    expect((await current(scope)).automation.nextRunAt).toEqual(due)
    await tick(new Date(due.getTime() - 1))
    expect((await current(scope)).runs).toHaveLength(0)
    await Promise.all([tick(due), tick(due)])
    const result = await current(scope), columns = result.automation.taskFields
    expect(result.runs).toMatchObject([{ scheduledFor: due, trigger: 'schedule', status: 'succeeded', attempts: 1, checked: 3, createdTasks: 2 }])
    expect(result.tasks.map(row => row.data)).toEqual(expect.arrayContaining([
      expect.objectContaining({ [columns.item]: [edge], [columns.stock]: 5, [columns.minimum]: 5, [columns.done]: false }),
      expect.objectContaining({ [columns.item]: [low], [columns.stock]: 2, [columns.minimum]: 3, [columns.done]: false }),
    ]))
    expect(result.tasks).toHaveLength(2)
    expect(result.automation.nextRunAt?.toISOString()).toBe('2024-08-02T02:00:00.000Z')
  })

  it('coalesces manual requests, skips open tasks and only creates another task when the previous one is closed', async () => {
    const { scope, input, edge } = await fixture()
    await settings.saveStockAutomation(scope, input, before)
    await tick(due)
    await settings.setStockAutomationActive(scope, false, after)
    const requestIds = await Promise.all([settings.queueStockCheck(scope, undefined, after), settings.queueStockCheck(scope, undefined, after)])
    expect(new Set(requestIds).size).toBe(1)
    await tick(after)
    const open = await current(scope)
    expect(open.runs.find(run => run.id === requestIds[0])).toMatchObject({ status: 'succeeded', createdTasks: 0 })
    const { item, done } = open.automation.taskFields
    const completed = open.tasks.find(task => (task.data[item] as string[])[0] === edge)!
    const { updateRow, writeRows } = await import('./row-mutations')
    await writeRows(scope.workspaceId, ctx => updateRow(ctx, open.automation.taskTableId, completed.id, { [done]: true }, { id: identity.member!.userId, kind: 'member' }))
    const nextDay = new Date('2024-08-02T02:00:00.000Z')
    const manual = await settings.queueStockCheck(scope, undefined, nextDay)
    await tick(nextDay)
    const result = await current(scope)
    expect(result.automation.nextRunAt).toBeNull()
    expect(result.runs.filter(run => run.trigger === 'schedule')).toHaveLength(1)
    expect(result.runs.find(run => run.id === manual)).toMatchObject({ status: 'succeeded', createdTasks: 1 })
    expect(result.tasks).toHaveLength(3)
    expect(result.tasks.filter(task => (task.data[item] as string[])[0] === edge && task.data[done] === false)).toHaveLength(1)
  })

  it('rolls back partial task creation at the row limit and retries the original failed run after space is freed', async () => {
    const { app, scope, input } = await fixture()
    const { db, rows } = database
    await settings.saveStockAutomation(scope, input, before)
    const fill = Array.from({ length: planOf('free').limits.rows - 6 }, (_, index) => ({ id: newId('row'), tableId: app.inventory!.tables.items, position: `f${index}`, data: {} }))
    await db.insert(rows).values(fill)
    const { recountWorkspace } = await import('./usage')
    expect((await recountWorkspace(scope.workspaceId)).rows).toBe(planOf('free').limits.rows - 1)
    await tick(due)
    const failed = await current(scope)
    expect(failed.tasks).toHaveLength(0)
    const [run] = failed.runs
    expect(run).toMatchObject({ status: 'failed', attempts: 1, createdTasks: 0, error: expect.any(String) })
    await db.delete(rows).where(inArray(rows.id, fill.slice(0, 2).map(row => row.id)))
    expect(await settings.queueStockCheck(scope, run!.id, after)).toBe(run!.id)
    await tick(after)
    const result = await current(scope)
    expect(result.runs).toMatchObject([{ id: run!.id, status: 'succeeded', attempts: 2, createdTasks: 2, error: null }])
    expect(result.tasks).toHaveLength(2)
  })

  it('blocks foreign workspaces and editors, and refuses to run an unpublished inventory', async () => {
    const { app, scope, input } = await fixture()
    const member = identity.member!, form = new FormData()
    for (const [key, value] of Object.entries({ minimum: input.minimumFieldId, time: input.localTime, zone: input.timeZone })) form.set(key, value)
    identity.member = { ...member, role: 'editor' }
    expect(await actions.saveStockScheduleAction(app.id, form)).toMatchObject({ ok: false })
    identity.member = { ...member, workspaceId: newId('workspace') }
    expect(await actions.saveStockScheduleAction(app.id, form)).toMatchObject({ ok: false })
    identity.member = member
    await settings.saveStockAutomation(scope, input, before)
    const { db, apps } = database
    await db.update(apps).set({ published: null }).where(eq(apps.id, app.id))
    expect(await actions.queueStockCheckAction(app.id)).toMatchObject({ ok: false })
    await tick(due)
    const result = await current(scope)
    expect(result.tasks).toHaveLength(0)
    expect(result.runs).toMatchObject([{ trigger: 'schedule', status: 'failed', error: expect.stringContaining('Опубликуйте') }])
  })
})
