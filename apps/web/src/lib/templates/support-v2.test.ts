import { describe, expect, it } from 'vitest'
import type { FieldType } from '@tableapp/schema'
import { authorizeAppV2Write, canOpenAppV2Screen, projectAppV2Row, validateAppV2, type AppV2Actor, type AppV2Catalog, type AppV2Record } from '@tableapp/schema/app-v2'
import { configureBuilderV2ScreenAccess } from '../builder-v2-read-access'
import { filterTickets, isOverdue, nextTicketNumber, operatorTransitions, statusAfterClientReply, supportAuthorKind, supportAuthorLabel, supportDeadlineInstant, supportDeadlineParts, supportSummary } from '../support-logic'
import { isSupportClient, isSupportDesk, projectSupportRows } from '../support-persist'
import { buildTemplate } from './build'
import { findTemplate } from './catalog'
import { buildSupportV2App, isSupportTemplate } from './support-v2'

const actor = (roleIds: string[], email: string, name = 'Учебный'): AppV2Actor => ({ authenticated: true, id: 'user', roleIds, email, name, company: '' })

function fixture() {
  const built = buildTemplate({ template: findTemplate('podderzhka')!, workspaceId: 'wsp_support' })
  const app = buildSupportV2App(built, { id: 'app_support', workspaceId: 'wsp_support', name: 'Обращения', slug: 'podderzhka', email: 'owner@example.invalid' })
  const catalog: AppV2Catalog = {
    workspaceId: 'wsp_support',
    tables: new Map(built.tables.map(table => [table.id, { workspaceId: 'wsp_support' }])),
    fields: new Map(built.fields.map(field => [field.id, {
      tableId: field.tableId, type: field.type as FieldType,
      ...(field.type === 'relation' && typeof (field.options as { tableId?: unknown }).tableId === 'string' ? { relationTableId: (field.options as { tableId: string }).tableId } : {}),
      ...(field.type === 'single_select' && Array.isArray((field.options as { choices?: { id?: string }[] }).choices) ? { choiceIds: ((field.options as { choices: { id?: string }[] }).choices).map(choice => choice.id).filter((id): id is string => typeof id === 'string') } : {}),
    }])),
    views: new Map(built.views.map(view => [view.id, { tableId: view.tableId }])),
  }
  return { built, app, catalog, support: app.support! }
}

describe('support template', () => {
  it('publishes a desk whose notes are invisible to the client and whose statuses stay consistent', () => {
    expect(isSupportTemplate('podderzhka')).toBe(true)
    expect(isSupportTemplate('zayavki')).toBe(false)
    const { built, app, catalog, support } = fixture()
    expect(validateAppV2(app, catalog)).toEqual([])
    expect(validateAppV2(app, catalog, { mode: 'publish' })).toEqual([])
    expect(app.homeScreenId).toBe(support.dashboardScreenId)
    expect(app.screens.find(screen => screen.id === support.clientListScreenId)?.audience).toMatchObject({ kind: 'roles', roleIds: ['owner', 'staff', 'client'] })
    expect(app.screens.find(screen => screen.id === support.dashboardScreenId)?.audience).toMatchObject({ kind: 'roles', roleIds: ['owner', 'staff'] })
    expect(app.roles.map(role => role.name)).toEqual(['Руководитель', 'Оператор', 'Клиент'])
    expect(app.authentication.mode).toBe('verified_email')
    expect(app.authentication.defaultRoleId).toBe('client')
    const themed = configureBuilderV2ScreenAccess({ ...app, theme: { ...app.theme, scheme: 'dark' } }, support.queueScreenId, 'client', false)
    expect(themed.support).toEqual(app.support)
    expect(themed.theme.scheme).toBe('dark')
    expect(themed.screens.find(screen => screen.id === support.queueScreenId)?.audience).toEqual({ kind: 'roles', roleIds: ['owner', 'staff'] })

    const client = actor(['client'], 'i.petrova@mail.ru', 'Ирина Петрова')
    const other = actor(['client'], 'p.orlov@yandex.ru', 'Пётр Орлов')
    const operator = actor(['staff'], 'anna@example.invalid', 'Анна Волкова')
    const forged = actor(['client'], 'i.petrova@mail.ru')
    expect(isSupportDesk(operator)).toBe(true)
    expect(isSupportClient(client)).toBe(true)
    expect(isSupportDesk(forged)).toBe(false)

    const ticket = (number: string) => built.rows.find(row => row.tableId === support.ticketsTableId && row.data[support.ticket.number] === number)!
    const own = ticket('ОБР-1028')
    const foreign = ticket('ОБР-1042')
    const record = (row: typeof own): AppV2Record => ({ id: row.id, tableId: row.tableId, values: row.data as AppV2Record['values'] })
    expect(projectAppV2Row(app, client, record(own))).toMatchObject({ [support.ticket.subject]: 'Где посмотреть свои обращения' })
    expect(projectAppV2Row(app, client, record(own))).not.toHaveProperty(support.ticket.assigneeEmail)
    expect(projectAppV2Row(app, other, record(own))).toEqual({})
    expect(projectAppV2Row(app, operator, record(foreign))).toHaveProperty(support.ticket.assigneeEmail)

    const notes = built.rows.filter(row => row.tableId === support.notesTableId)
    expect(notes.length).toBeGreaterThan(0)
    for (const note of notes) {
      expect(projectAppV2Row(app, client, record(note))).toEqual({})
      expect(projectAppV2Row(app, other, record(note))).toEqual({})
      expect(String(projectAppV2Row(app, operator, record(note))[support.note.text] ?? '')).not.toBe('')
    }
    const projected = projectSupportRows(app, client, built.rows.map(record))
    expect(JSON.stringify(projected)).not.toContain('в ответ клиенту это не писать')
    expect(JSON.stringify(projected)).not.toContain('Роль коллеги снята вручную')
    expect(projected.some(row => row.tableId === support.notesTableId)).toBe(false)
    expect(projected.filter(row => row.tableId === support.ticketsTableId).every(row => row.values[support.ticket.clientEmail] === undefined || row.values[support.ticket.clientEmail] === 'i.petrova@mail.ru')).toBe(true)
    const visibleToClient = app.screens.filter(screen => canOpenAppV2Screen(app, client, screen.id))
    const clientHome = visibleToClient.find(screen => screen.id === app.homeScreenId) ?? visibleToClient.find(screen => !screen.contextTableId)
    expect(clientHome?.id).toBe(support.clientListScreenId)
    expect(canOpenAppV2Screen(app, client, support.dashboardScreenId!)).toBe(false)
    expect(support.boardScreenId).toBeUndefined()
    expect(app.screens.some(screen => screen.menuLabel === 'Доска' || screen.name === 'Доска')).toBe(false)
    expect(app.screens.find(screen => screen.id === support.queueScreenId)?.menuLabel).toBe('Тикеты')
    expect(canOpenAppV2Screen(app, client, support.queueScreenId)).toBe(false)
    expect(canOpenAppV2Screen(app, operator, support.dashboardScreenId!)).toBe(true)
    const events = built.rows.filter(row => row.tableId === support.eventsTableId)
    const norms = built.rows.filter(row => row.tableId === support.slaTableId)
    expect(events.length).toBeGreaterThan(0)
    expect(norms).toHaveLength(1)
    for (const row of [...events, ...norms]) expect(projectAppV2Row(app, client, record(row))).toEqual({})
    expect(projectAppV2Row(app, operator, record(events[0]!))).not.toEqual({})
    expect(authorizeAppV2Write(app, client, { operation: 'create', tableId: support.eventsTableId!, values: {} }).ok).toBe(false)
    expect(authorizeAppV2Write(app, client, { operation: 'update', row: record(norms[0]!), values: {} }).ok).toBe(false)

    expect(authorizeAppV2Write(app, client, { operation: 'create', tableId: support.notesTableId, values: { [support.note.text]: 'тайком' } }).ok).toBe(false)
    expect(authorizeAppV2Write(app, operator, { operation: 'create', tableId: support.notesTableId, values: { [support.note.text]: 'заметка', [support.note.ticket]: [own.id], [support.note.at]: '2026-11-22T09:00:00.000Z', [support.note.author]: 'Анна', [support.note.authorEmail]: 'anna@example.invalid' } }).ok).toBe(true)
    const spoofedStatus = authorizeAppV2Write(app, client, { operation: 'update', row: record(own), values: { [support.ticket.status]: support.statuses.closed, [support.ticket.assigneeEmail]: 'anna@example.invalid' } })
    expect(spoofedStatus.ok).toBe(false)
    expect(authorizeAppV2Write(app, client, { operation: 'create', tableId: support.ticketsTableId, values: { [support.ticket.subject]: 'Тема', [support.ticket.description]: 'Текст', [support.ticket.category]: ['x'], [support.ticket.clientName]: 'Ирина', [support.ticket.status]: support.statuses.fresh, [support.ticket.priority]: support.priorities.normal, [support.ticket.createdAt]: '2026-11-22T09:00:00.000Z', [support.ticket.updatedAt]: '2026-11-22T09:00:00.000Z', [support.ticket.clientEmail]: 'p.orlov@yandex.ru' } }).ok).toBe(false)
    const created = authorizeAppV2Write(app, client, { operation: 'create', tableId: support.ticketsTableId, values: { [support.ticket.subject]: 'Тема', [support.ticket.description]: 'Текст', [support.ticket.category]: ['x'], [support.ticket.clientName]: 'Ирина', [support.ticket.status]: support.statuses.fresh, [support.ticket.priority]: support.priorities.normal, [support.ticket.createdAt]: '2026-11-22T09:00:00.000Z', [support.ticket.updatedAt]: '2026-11-22T09:00:00.000Z' } })
    expect(created.ok && created.ownerValues[support.ticket.clientEmail]).toBe('i.petrova@mail.ru')
  })

  it('filters overdue and mine tickets and keeps reply transitions narrow', () => {
    const now = Date.parse('2026-11-22T09:00:00.000Z')
    const items = [
      { id: '1', number: 'ОБР-1', subject: 'Кабинет', description: '', clientName: 'Ирина', status: 'Новое', priority: 'Срочный', category: 'Доступ', assigneeEmail: '', assigneeName: '', deadline: '2026-11-21T06:00:00.000Z' },
      { id: '2', number: 'ОБР-2', subject: 'Отчёт', description: 'демо', clientName: 'Пётр', status: 'В работе', priority: 'Высокий', category: 'Ошибка', assigneeEmail: 'anna@example.invalid', assigneeName: 'Анна', deadline: '2026-11-23T13:00:00.000Z' },
      { id: '3', number: 'ОБР-3', subject: 'Список', description: '', clientName: 'Ирина', status: 'Решено', priority: 'Низкий', category: 'Вопрос', assigneeEmail: 'anna@example.invalid', assigneeName: 'Анна', deadline: '2026-11-20T12:00:00.000Z' },
      { id: '4', number: 'ОБР-4', subject: 'Документы', description: '', clientName: 'Ольга', status: 'Ждём клиента', priority: 'Обычный', category: 'Документы', assigneeEmail: 'igor@example.invalid', assigneeName: 'Игорь', deadline: '2026-11-25T09:00:00.000Z' },
    ]
    expect(isOverdue('Новое', items[0]!.deadline, now)).toBe(true)
    expect(isOverdue('Решено', items[2]!.deadline, now)).toBe(false)
    expect(supportSummary(items, now)).toEqual({ open: 3, overdue: 1, waiting: 1 })
    expect(filterTickets(items, { search: '', statuses: [], priorities: [], mine: true, scope: 'all' }, 'anna@example.invalid', now).map(item => item.id)).toEqual(['2', '3'])
    expect(filterTickets(items, { search: 'отчёт', statuses: [], priorities: [], mine: false, scope: 'all' }, 'anna@example.invalid', now).map(item => item.id)).toEqual(['2'])
    expect(filterTickets(items, { search: '', statuses: ['Ждём клиента'], priorities: [], mine: false, scope: 'overdue' }, '', now)).toEqual([])
    expect(filterTickets(items, { search: '', statuses: [], priorities: [], mine: false, scope: 'open' }, '', now).map(item => item.id)).toEqual(['1', '2', '4'])
    expect(filterTickets(items, { search: '', statuses: [], priorities: [], mine: false, scope: 'hot' }, '', now).map(item => item.id)).toEqual(['1'])
    expect(filterTickets(items, { search: '', statuses: [], priorities: [], mine: false, scope: 'closed' }, '', now).map(item => item.id)).toEqual(['3'])
    expect(filterTickets(items, { search: '', statuses: [], priorities: [], mine: false, scope: 'open', assigneeEmail: '__none__' }, '', now).map(item => item.id)).toEqual(['1'])
    expect(operatorTransitions('Новое')).toEqual(['В работе', 'Закрыто'])
    expect(operatorTransitions('В работе')).not.toContain('Новое')
    expect(statusAfterClientReply('Ждём клиента')).toBe('В работе')
    expect(statusAfterClientReply('Закрыто')).toBe('В работе')
    expect(statusAfterClientReply('Новое')).toBe('Новое')
    expect(nextTicketNumber(['ОБР-1048', 'черновик', 'ОБР-1033'])).toBe('ОБР-1049')
    const byEmail = supportAuthorKind({ author: 'Кто угодно', authorEmail: 'p.orlov@yandex.ru', clientName: 'Пётр Орлов', clientEmail: 'p.orlov@yandex.ru' })
    const byName = supportAuthorKind({ author: 'Пётр Орлов', clientName: 'Пётр Орлов' })
    const desk = supportAuthorKind({ author: 'Анна Волкова', authorEmail: 'anna@example.invalid', clientName: 'Пётр Орлов', clientEmail: 'p.orlov@yandex.ru' })
    expect(supportAuthorLabel(byEmail)).toBe('Клиент')
    expect(supportAuthorLabel(byName)).toBe('Клиент')
    expect(supportAuthorLabel(desk)).toBe('Ответ клиенту')
    expect(byName).toBe(byEmail)
    const moscowAfternoon = supportDeadlineInstant('2026-11-23', '16:00')
    const moscowNight = supportDeadlineInstant('2026-11-23', '01:30')
    expect(moscowAfternoon).toBe('2026-11-23T13:00:00.000Z')
    expect(moscowNight).toBe('2026-11-22T22:30:00.000Z')
    expect(supportDeadlineParts(moscowAfternoon)).toEqual({ date: '2026-11-23', time: '16:00' })
    expect(supportDeadlineParts(moscowNight)).toEqual({ date: '2026-11-23', time: '01:30' })
    expect(supportDeadlineInstant('2026-11-23', '00:00')).toBe('2026-11-22T21:00:00.000Z')
    const again = supportDeadlineParts(moscowAfternoon)
    expect(supportDeadlineInstant(again.date, again.time)).toBe(moscowAfternoon)
    expect(supportDeadlineInstant(supportDeadlineParts(supportDeadlineInstant(again.date, again.time)!).date, again.time)).toBe(moscowAfternoon)
    expect(supportDeadlineInstant('', '16:00')).toBeNull()
    expect(supportDeadlineParts('')).toEqual({ date: '', time: '' })
    expect(supportDeadlineInstant('2026-11-23', '')).toBe('2026-11-23T15:00:00.000Z')
  })
})
