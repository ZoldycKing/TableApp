import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { newId } from '@tableapp/schema'
import type { AppV2 } from '@tableapp/schema/app-v2'
import { newBuilderV2App } from './builder-v2'
import { builderV2Revision } from './builder-v2-revision'

const envFile = resolve(import.meta.dirname, '../../../../.env')
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile)

const identity = vi.hoisted(() => ({ email: 'owner@example.com', member: null as import('./session').Member | null }))
vi.mock('@/lib/app-session', () => ({ currentStaffEmail: async () => identity.email }))
vi.mock('@/lib/session', () => ({ currentAccount: async () => null, currentMember: async () => identity.member }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

describe.skipIf(!process.env.DATABASE_URL)('generic team calendar without a salon', () => {
  const userId = newId('user')
  const workspaceId = newId('workspace')
  const people = newId('table')
  const events = newId('table')
  const shifts = newId('table')
  const name = newId('field')
  const email = newId('field')
  const title = newId('field')
  const start = newId('field')
  const end = newId('field')
  const who = newId('field')
  const shiftWho = newId('field')
  const weekday = newId('field')
  const date = newId('field')
  const from = newId('field')
  const to = newId('field')
  const closed = newId('field')
  const monday = newId('choice')
  const days = [0, 1, 2, 3, 4, 5, 6].map(() => newId('choice'))
  days[1] = monday
  const anna = newId('row')
  const boris = newId('row')
  const weeklyAnna = newId('row')
  const weeklyBoris = newId('row')
  const exception = newId('row')
  const dayOff = newId('row')
  const meeting = newId('row')
  const broken = newId('row')
  const home = newId('screen')
  const nodeId = newId('component')
  const appId = newId('app')
  const slug = `generic-${workspaceId.replaceAll('_', '-')}`
  const zone = 'Asia/Yekaterinburg'
  const ownerEmail = 'owner@example.com'
  const limitedEmail = 'limited@example.com'
  const member = { userId, workspaceId, email: ownerEmail, name: 'Владелец', workspaceName: 'Общий календарь', role: 'owner' as const }
  let database: typeof import('@tableapp/db')
  let actions: typeof import('@/app/team-calendar-actions')
  let app: AppV2

  const request = (day: string, week = false) => ({ screenId: home, nodeId, day, week, revision: builderV2Revision(app) })

  beforeAll(async () => {
    database = await import('@tableapp/db')
    actions = await import('@/app/team-calendar-actions')
    const base = newBuilderV2App({ id: appId, workspaceId, name: 'Смены цеха', slug, email: ownerEmail })
    app = {
      ...base,
      roles: [...base.roles, { id: 'limited', name: 'Сотрудник' }],
      authentication: { ...base.authentication, members: [...base.authentication.members, { email: limitedEmail, roleIds: ['limited'], company: '' }] },
      homeScreenId: home,
      screens: [{ id: home, name: 'Смены', icon: 'calendar', navigation: true, audience: { kind: 'roles', roleIds: ['owner', 'limited'] }, contextTableId: null, rootIds: [nodeId], events: { enter: null } }],
      nodes: [{
        id: nodeId, name: 'Смены', type: 'team_calendar', visibleTo: { kind: 'roles', roleIds: ['owner', 'limited'] }, visibleWhen: null,
        resourceLabel: 'Сотрудник', resourcesLabel: 'Сотрудники', showMetrics: true,
        data: {
          tableId: events, viewId: null, titleFieldId: title, subtitleFieldId: null, startFieldId: start, endFieldId: end, durationFieldId: null,
          resourceFieldId: who, statusFieldId: null, amountFieldId: null, statusValues: {},
          resources: { tableId: people, viewId: null, titleFieldId: name, photoFieldId: null, ownerEmailFieldId: email },
          hours: {
            tableId: shifts, viewId: null, resourceFieldId: shiftWho, weekdayFieldId: weekday, weekdays: days,
            dateFieldId: date, startFieldId: from, endFieldId: to, closedFieldId: closed,
          },
        },
        actions: { itemScreenId: null, createScreenId: null, configureScreenId: null, periodScreenId: null, manageRoleIds: ['owner'] },
      }],
      policy: {
        workflows: [],
        tables: [
          { tableId: people, grants: [
            { audience: { kind: 'roles', roleIds: ['owner'] }, read: { fieldIds: [name, email], rows: { kind: 'all' } } },
            { audience: { kind: 'roles', roleIds: ['limited'] }, read: { fieldIds: [name], rows: { kind: 'all' } } },
          ] },
          { tableId: events, grants: [
            { audience: { kind: 'roles', roleIds: ['owner', 'limited'] }, read: { fieldIds: [title, start, end, who], rows: { kind: 'all' } } },
          ] },
          { tableId: shifts, grants: [
            { audience: { kind: 'roles', roleIds: ['owner'] }, read: { fieldIds: [shiftWho, weekday, date, from, to, closed], rows: { kind: 'all' } } },
          ] },
        ],
      },
    }
    const { db, users, workspaces, workspaceMembers, tables, fields, rows, apps } = database
    const field = (id: string, tableId: string, fieldName: string, type: string, position: string, options: Record<string, unknown> = {}) =>
      ({ id, tableId, name: fieldName, type, position, options })
    await db.insert(users).values({ id: userId, email: `${userId}@example.invalid` })
    await db.insert(workspaces).values({ id: workspaceId, ownerId: userId, name: 'Generic calendar', slug: workspaceId, plan: 'business' })
    await db.insert(workspaceMembers).values({ userId, workspaceId, role: 'owner' })
    await db.insert(tables).values([
      { id: people, workspaceId, name: 'Сотрудники', position: 'a', primaryFieldId: name },
      { id: events, workspaceId, name: 'Смены', position: 'b', primaryFieldId: title },
      { id: shifts, workspaceId, name: 'График', position: 'c', primaryFieldId: shiftWho },
    ])
    await db.insert(fields).values([
      field(name, people, 'Имя', 'text', 'a'),
      field(email, people, 'Почта', 'email', 'b'),
      field(title, events, 'Задача', 'text', 'a'),
      field(start, events, 'Начало', 'datetime', 'b', { timeZone: zone }),
      field(end, events, 'Окончание', 'datetime', 'c', { timeZone: zone }),
      field(who, events, 'Сотрудник', 'relation', 'd', { tableId: people }),
      field(shiftWho, shifts, 'Сотрудник', 'relation', 'a', { tableId: people }),
      field(weekday, shifts, 'День недели', 'single_select', 'b', { choices: days.map((id, index) => ({ id, name: ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'][index], color: 'blue' })) }),
      field(date, shifts, 'Дата', 'date', 'c'),
      field(from, shifts, 'Начало', 'text', 'd'),
      field(to, shifts, 'Конец', 'text', 'e'),
      field(closed, shifts, 'Выходной', 'checkbox', 'f'),
    ])
    await db.insert(rows).values([
      { id: anna, tableId: people, position: 'a', data: { [name]: 'Анна', [email]: ownerEmail }, createdBy: userId, updatedBy: userId },
      { id: boris, tableId: people, position: 'b', data: { [name]: 'Борис', [email]: limitedEmail }, createdBy: userId, updatedBy: userId },
      { id: weeklyAnna, tableId: shifts, position: 'a', data: { [shiftWho]: [anna], [weekday]: monday, [from]: '09:00', [to]: '18:00' }, createdBy: userId, updatedBy: userId },
      { id: weeklyBoris, tableId: shifts, position: 'b', data: { [shiftWho]: [boris], [weekday]: monday, [from]: '09:00', [to]: '18:00' }, createdBy: userId, updatedBy: userId },
      { id: exception, tableId: shifts, position: 'c', data: { [shiftWho]: [boris], [date]: '2026-11-16', [from]: '12:00', [to]: '16:00' }, createdBy: userId, updatedBy: userId },
      { id: dayOff, tableId: shifts, position: 'd', data: { [shiftWho]: [anna], [date]: '2026-11-17', [closed]: true, [from]: '09:00', [to]: '18:00' }, createdBy: userId, updatedBy: userId },
      { id: meeting, tableId: events, position: 'a', data: { [title]: 'Планёрка', [start]: '2026-11-16T04:00:00.000Z', [end]: '2026-11-16T05:00:00.000Z', [who]: [boris] }, createdBy: userId, updatedBy: userId },
      { id: broken, tableId: events, position: 'b', data: { [title]: 'Без времени', [start]: '2026-11-16T25:99:00.000Z', [end]: '2026-11-16T05:00:00.000Z', [who]: [boris] }, createdBy: userId, updatedBy: userId },
    ])
    await db.insert(apps).values({ id: appId, workspaceId, name: app.name, slug, draft: app, published: app, theme: app.theme, accessMode: 'allowlist', homeScreenId: home })
  })
  beforeEach(() => { identity.email = ownerEmail; identity.member = member })
  afterAll(async () => {
    if (!database) return
    await database.db.delete(database.workspaces).where(eq(database.workspaces.id, workspaceId))
    await database.db.delete(database.users).where(eq(database.users.id, userId))
  })

  it('reads an end time, a weekly shift without a date or a day off, and a dated exception in the field zone', async () => {
    const result = await actions.readPublishedTeamCalendarAction(slug, request('2026-11-16'))
    expect(result.ok, JSON.stringify(result)).toBe(true)
    if (!result.ok) return
    expect(result.data.timeZone).toBe(zone)
    expect(result.data.resources.map(item => item.name).sort()).toEqual(['Анна', 'Борис'])
    const annaShift = result.data.shifts.find(shift => shift.resourceId === anna)
    const borisShift = result.data.shifts.find(shift => shift.resourceId === boris)
    expect(annaShift).toMatchObject({ exception: false, closed: false, windows: [{ id: weeklyAnna, start: 540, end: 1080 }] })
    expect(borisShift).toMatchObject({ exception: true, windows: [{ id: exception, start: 720, end: 960 }] })
    expect(result.data.events).toMatchObject([{ id: meeting, resourceId: boris, start: 540, end: 600, title: 'Планёрка' }])
    expect(result.data.omitted).toBe(1)
    const tuesday = await actions.readPublishedTeamCalendarAction(slug, request('2026-11-17'))
    expect(tuesday.ok && tuesday.data.shifts.find(shift => shift.resourceId === anna)).toMatchObject({ closed: true, exception: true, windows: [] })
  })

  it('hides other people and working hours from a member with a narrower grant', async () => {
    identity.email = limitedEmail
    const result = await actions.readPublishedTeamCalendarAction(slug, request('2026-11-16', true))
    expect(result.ok, JSON.stringify(result)).toBe(true)
    if (!result.ok) return
    expect(result.data.resources.map(item => item.id)).toEqual([boris])
    expect(result.data.events.every(event => event.resourceId === boris)).toBe(true)
    expect(result.data.shifts.every(shift => shift.windows === null)).toBe(true)
    expect(JSON.stringify(result)).not.toContain(ownerEmail)
  })

  it('stops with a clear error when the requested period has too many rows', async () => {
    const { readTeamCalendar } = await import('./team-calendar-read')
    const { builderV2MemberActor } = await import('./builder-v2-actor')
    const node = app.nodes.find(item => item.type === 'team_calendar')
    if (node?.type !== 'team_calendar') throw new Error('calendar')
    await expect(database.db.transaction(tx => readTeamCalendar(
      tx, app, builderV2MemberActor(app, member), node, { screenId: home, nodeId, day: '2026-11-16', week: false }, false, 1,
    ))).rejects.toThrow(/до 1 строк/)
  })
})
