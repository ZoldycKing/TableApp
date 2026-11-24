import { describe, expect, it } from 'vitest'
import type { FieldType } from '@tableapp/schema'
import { authorizeAppV2Write, canOpenAppV2Screen, projectAppV2Row, validateAppV2, type AppV2Actor, type AppV2Catalog, type AppV2Record } from '@tableapp/schema/app-v2'
import { configureBuilderV2ScreenAccess } from '../builder-v2-read-access'
import { filterRepairs, isOverdueRepair, nextRepairNumber, serviceDashboard, staffTransitions } from '../service-logic'
import { applyServiceChange, isServiceClient, isServiceDesk, projectServiceRows } from '../service-persist'
import { buildTemplate } from './build'
import { findTemplate } from './catalog'
import { buildServiceV2App, isServiceTemplate } from './service-v2'

const actor = (roleIds: string[], email: string, name = 'Учебный'): AppV2Actor => ({ authenticated: true, id: 'user', roleIds, email, name, company: '' })

function fixture() {
  const built = buildTemplate({ template: findTemplate('service')!, workspaceId: 'wsp_service' })
  const app = buildServiceV2App(built, { id: 'app_service', workspaceId: 'wsp_service', name: 'Сервисный центр', slug: 'service', email: 'owner@service-demo.ru' })
  const catalog: AppV2Catalog = {
    workspaceId: 'wsp_service',
    tables: new Map(built.tables.map(table => [table.id, { workspaceId: 'wsp_service' }])),
    fields: new Map(built.fields.map(field => [field.id, {
      tableId: field.tableId, type: field.type as FieldType,
      ...(field.type === 'relation' && typeof (field.options as { tableId?: unknown }).tableId === 'string' ? { relationTableId: (field.options as { tableId: string }).tableId } : {}),
      ...(field.type === 'single_select' && Array.isArray((field.options as { choices?: { id?: string }[] }).choices) ? { choiceIds: ((field.options as { choices: { id?: string }[] }).choices).map(choice => choice.id).filter((id): id is string => typeof id === 'string') } : {}),
    }])),
    views: new Map(built.views.map(view => [view.id, { tableId: view.tableId }])),
  }
  return { built, app, catalog, service: app.service! }
}

describe('service template', () => {
  it('publishes a desk whose notes are invisible to the client and whose statuses stay consistent', () => {
    expect(isServiceTemplate('service')).toBe(true)
    expect(isServiceTemplate('podderzhka')).toBe(false)
    const { built, app, catalog, service } = fixture()
    expect(validateAppV2(app, catalog)).toEqual([])
    expect(validateAppV2(app, catalog, { mode: 'publish' })).toEqual([])
    expect(app.homeScreenId).toBe(service.dashboardScreenId)
    expect(app.screens.find(screen => screen.id === service.clientListScreenId)?.audience).toMatchObject({ kind: 'roles', roleIds: ['owner', 'staff', 'client'] })
    expect(app.screens.find(screen => screen.id === service.dashboardScreenId)?.audience).toMatchObject({ kind: 'roles', roleIds: ['owner', 'staff'] })
    expect(app.roles.map(role => role.name)).toEqual(['Руководитель', 'Мастер', 'Клиент'])
    expect(app.authentication.mode).toBe('verified_email')
    expect(app.authentication.defaultRoleId).toBe('client')
    expect(app.screens.find(screen => screen.id === service.repairsScreenId)?.menuLabel).toBe('Ремонты')
    expect(app.screens.find(screen => screen.id === service.clientListScreenId)?.menuLabel).toBe('Кабинет')
    const themed = configureBuilderV2ScreenAccess({ ...app, theme: { ...app.theme, scheme: 'dark' } }, service.repairsScreenId, 'client', false)
    expect(themed.service).toEqual(app.service)
    expect(themed.theme.scheme).toBe('dark')

    const client = actor(['client'], 'm.sidorova@yandex.ru', 'Мария Сидорова')
    const other = actor(['client'], 'a.petrov@mail.ru', 'Алексей Петров')
    const staff = actor(['staff'], 'andrey@service-demo.ru', 'Андрей Морозов')
    expect(isServiceDesk(staff)).toBe(true)
    expect(isServiceClient(client)).toBe(true)

    const repair = (number: string) => built.rows.find(row => row.tableId === service.repairsTableId && row.data[service.repair.number] === number)!
    const own = repair('РМ-1042')
    const foreign = repair('РМ-1041')
    const record = (row: typeof own): AppV2Record => ({ id: row.id, tableId: row.tableId, values: row.data as AppV2Record['values'] })
    expect(projectAppV2Row(app, client, record(own))).toMatchObject({ [service.repair.device]: 'Стиральная машина Bosch WLG' })
    expect(projectAppV2Row(app, client, record(own))).not.toHaveProperty(service.repair.masterEmail)
    expect(projectAppV2Row(app, other, record(own))).toEqual({})
    expect(projectAppV2Row(app, staff, record(foreign))).toHaveProperty(service.repair.masterEmail)

    const notes = built.rows.filter(row => row.tableId === service.notesTableId)
    expect(notes.length).toBeGreaterThan(0)
    for (const note of notes) {
      expect(projectAppV2Row(app, client, record(note))).toEqual({})
      expect(projectAppV2Row(app, other, record(note))).toEqual({})
      expect(String(projectAppV2Row(app, staff, record(note))[service.note.text] ?? '')).not.toBe('')
    }
    const projected = projectServiceRows(app, client, built.rows.map(record))
    expect(JSON.stringify(projected)).not.toContain('не совместимый')
    expect(JSON.stringify(projected)).not.toContain('Поставщик обещал термостат')
    expect(projected.some(row => row.tableId === service.notesTableId)).toBe(false)
    expect(projected.filter(row => row.tableId === service.repairsTableId).every(row => row.values[service.repair.clientEmail] === undefined || row.values[service.repair.clientEmail] === 'm.sidorova@yandex.ru')).toBe(true)

    const visibleToClient = app.screens.filter(screen => canOpenAppV2Screen(app, client, screen.id))
    const clientHome = visibleToClient.find(screen => screen.id === app.homeScreenId) ?? visibleToClient.find(screen => !screen.contextTableId)
    expect(clientHome?.id).toBe(service.clientListScreenId)
    expect(canOpenAppV2Screen(app, client, service.dashboardScreenId)).toBe(false)
    expect(canOpenAppV2Screen(app, client, service.repairsScreenId)).toBe(false)
    expect(canOpenAppV2Screen(app, staff, service.dashboardScreenId)).toBe(true)

    expect(authorizeAppV2Write(app, client, { operation: 'create', tableId: service.notesTableId, values: { [service.note.text]: 'тайком' } }).ok).toBe(false)
    expect(authorizeAppV2Write(app, staff, { operation: 'create', tableId: service.notesTableId, values: { [service.note.text]: 'заметка', [service.note.repair]: [own.id], [service.note.at]: '2026-11-22T09:00:00.000Z', [service.note.author]: 'Андрей', [service.note.authorEmail]: 'andrey@service-demo.ru' } }).ok).toBe(true)
    expect(authorizeAppV2Write(app, client, { operation: 'update', row: record(own), values: { [service.repair.status]: service.statuses.done } }).ok).toBe(false)

    const records = built.rows.map(row => ({ id: row.id, tableId: row.tableId, values: row.data as AppV2Record['values'] }))
    const created = applyServiceChange(app, staff, records, {
      kind: 'create',
      clientId: built.rows.find(row => row.tableId === service.clientsTableId && row.data[service.client.email] === 'm.sidorova@yandex.ru')!.id,
      device: 'Телефон Xiaomi',
      serial: 'XM-1',
      problem: 'Не включается',
      deadline: '2026-11-28T15:00:00.000Z',
    }, '2026-11-24T09:00:00.000Z')
    expect(created.ok, JSON.stringify(created)).toBe(true)
    if (created.ok) {
      const row = created.rows.find(item => item.values[service.repair.device] === 'Телефон Xiaomi')!
      expect(row.values[service.repair.clientEmail]).toBe('m.sidorova@yandex.ru')
      expect(String(row.values[service.repair.number])).toMatch(/^РМ-\d+$/)
    }
  })

  it('filters repairs by status views and keeps transitions narrow', () => {
    const now = Date.parse('2026-11-24T09:00:00.000Z')
    const items = [
      { id: '1', number: 'РМ-1', device: 'Холодильник', serial: '', problem: '', clientName: 'Алексей', masterName: '', masterEmail: '', status: 'Новые', cost: 0, deadline: '2026-11-21T06:00:00.000Z', updatedAt: '2026-11-20T10:00:00.000Z' },
      { id: '2', number: 'РМ-2', device: 'Стиралка', serial: '', problem: 'течёт', clientName: 'Мария', masterName: 'Андрей', masterEmail: 'andrey@service-demo.ru', status: 'В работе', cost: 6200, deadline: '2026-11-25T13:00:00.000Z', updatedAt: '2026-11-24T08:00:00.000Z' },
      { id: '3', number: 'РМ-3', device: 'Кофемашина', serial: '', problem: '', clientName: 'Михаил', masterName: 'Сергей', masterEmail: 'sergey@service-demo.ru', status: 'Готово к выдаче', cost: 11500, deadline: '2026-11-20T12:00:00.000Z', updatedAt: '2026-11-24T07:00:00.000Z' },
      { id: '4', number: 'РМ-4', device: 'Микроволновка', serial: '', problem: '', clientName: 'Антон', masterName: 'Андрей', masterEmail: 'andrey@service-demo.ru', status: 'Выдано', cost: 3200, deadline: '2026-11-10T12:00:00.000Z', updatedAt: '2026-11-10T16:00:00.000Z' },
    ]
    expect(isOverdueRepair('Новые', items[0]!.deadline, now)).toBe(true)
    expect(isOverdueRepair('Готово к выдаче', items[2]!.deadline, now)).toBe(false)
    expect(isOverdueRepair('Выдано', items[3]!.deadline, now)).toBe(false)
    expect(serviceDashboard(items, now)).toMatchObject({ fresh: 1, progress: 1, ready: 1, done: 1, overdue: 1, open: 3 })
    expect(filterRepairs(items, { search: '', view: 'progress' }, now).map(item => item.id)).toEqual(['2'])
    expect(filterRepairs(items, { search: 'кофе', view: 'all' }, now).map(item => item.id)).toEqual(['3'])
    expect(staffTransitions('Новые')).toEqual(['В работе', 'Отменён'])
    expect(staffTransitions('В работе')).toContain('Ждём запчасти')
    expect(staffTransitions('В работе')).not.toContain('Новые')
    expect(nextRepairNumber(['РМ-1048', 'черновик', 'РМ-1033'])).toBe('РМ-1049')
  })
})
