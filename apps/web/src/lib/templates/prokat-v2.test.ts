import { describe, expect, it } from 'vitest'
import type { FieldType } from '@tableapp/schema'
import { authorizeAppV2Write, canOpenAppV2Screen, projectAppV2Row, validateAppV2, type AppV2Actor, type AppV2Catalog, type AppV2Record } from '@tableapp/schema/app-v2'
import { configureBuilderV2ScreenAccess } from '../builder-v2-read-access'
import { findItemBookingConflict, nextBookingNumber, staffTransitions } from '../prokat-logic'
import { applyProkatChange, isProkatClient, isProkatDesk, projectProkatRows } from '../prokat-persist'
import { buildTemplate } from './build'
import { findTemplate } from './catalog'
import { buildProkatV2App, isProkatTemplate } from './prokat-v2'

const actor = (roleIds: string[], email: string, name = 'Учебный'): AppV2Actor => ({ authenticated: true, id: 'user', roleIds, email, name, company: '' })

function fixture() {
  const built = buildTemplate({ template: findTemplate('prokat')!, workspaceId: 'wsp_prokat' })
  const app = buildProkatV2App(built, { id: 'app_prokat', workspaceId: 'wsp_prokat', name: 'Прокат', slug: 'prokat', email: 'owner@prokat-demo.ru' })
  const catalog: AppV2Catalog = {
    workspaceId: 'wsp_prokat',
    tables: new Map(built.tables.map(table => [table.id, { workspaceId: 'wsp_prokat' }])),
    fields: new Map(built.fields.map(field => [field.id, {
      tableId: field.tableId, type: field.type as FieldType,
      ...(field.type === 'relation' && typeof (field.options as { tableId?: unknown }).tableId === 'string' ? { relationTableId: (field.options as { tableId: string }).tableId } : {}),
      ...(field.type === 'single_select' && Array.isArray((field.options as { choices?: { id?: string }[] }).choices) ? { choiceIds: ((field.options as { choices: { id?: string }[] }).choices).map(choice => choice.id).filter((id): id is string => typeof id === 'string') } : {}),
    }])),
    views: new Map(built.views.map(view => [view.id, { tableId: view.tableId }])),
  }
  return { built, app, catalog, prokat: app.prokat! }
}

describe('prokat template', () => {
  it('publishes a desk with client isolation and communications', () => {
    expect(isProkatTemplate('prokat')).toBe(true)
    expect(isProkatTemplate('service')).toBe(false)
    const { built, app, catalog, prokat } = fixture()
    expect(validateAppV2(app, catalog)).toEqual([])
    expect(validateAppV2(app, catalog, { mode: 'publish' })).toEqual([])
    expect(app.homeScreenId).toBe(prokat.dashboardScreenId)
    expect(app.screens.find(screen => screen.id === prokat.clientListScreenId)?.audience).toMatchObject({ kind: 'roles', roleIds: ['owner', 'staff', 'client'] })
    expect(app.screens.find(screen => screen.id === prokat.dashboardScreenId)?.audience).toMatchObject({ kind: 'roles', roleIds: ['owner', 'staff'] })
    expect(app.roles.map(role => role.name)).toEqual(['Руководитель', 'Сотрудник', 'Клиент'])
    expect(app.communications).toEqual({ enabled: true })
    expect(app.authentication.mode).toBe('verified_email')
    expect(app.authentication.defaultRoleId).toBe('client')
    expect(app.screens.find(screen => screen.id === prokat.bookingsScreenId)?.menuLabel).toBe('Брони')
    expect(app.screens.find(screen => screen.id === prokat.clientListScreenId)?.menuLabel).toBe('Кабинет')
    const themed = configureBuilderV2ScreenAccess({ ...app, theme: { ...app.theme, scheme: 'dark' } }, prokat.bookingsScreenId, 'client', false)
    expect(themed.prokat).toEqual(app.prokat)
    expect(themed.theme.scheme).toBe('dark')

    const client = actor(['client'], 'm.petrova@yandex.ru', 'Мария Петрова')
    const other = actor(['client'], 'a.ivanov@mail.ru', 'Алексей Иванов')
    const desk = actor(['staff'], 'anna@prokat-demo.ru', 'Анна Смирнова')
    expect(isProkatDesk(desk)).toBe(true)
    expect(isProkatClient(client)).toBe(true)

    const booking = (number: string) => built.rows.find(row => row.tableId === prokat.bookingsTableId && row.data[prokat.booking.number] === number)!
    const own = booking('ПР-1005')
    const foreign = booking('ПР-1003')
    const record = (row: typeof own): AppV2Record => ({ id: row.id, tableId: row.tableId, values: row.data as AppV2Record['values'] })
    expect(projectAppV2Row(app, client, record(own))).toMatchObject({ [prokat.booking.title]: 'Городской велосипед Electra' })
    expect(projectAppV2Row(app, client, record(own))).not.toHaveProperty(prokat.booking.staffEmail)
    expect(projectAppV2Row(app, other, record(own))).toEqual({})
    expect(projectAppV2Row(app, desk, record(foreign))).toHaveProperty(prokat.booking.staffEmail)

    const projected = projectProkatRows(app, client, built.rows.map(record))
    expect(projected.filter(row => row.tableId === prokat.bookingsTableId).every(row =>
      row.values[prokat.booking.clientEmail] === undefined || row.values[prokat.booking.clientEmail] === 'm.petrova@yandex.ru')).toBe(true)
    expect(JSON.stringify(projected)).not.toContain('anna@prokat-demo.ru')

    const visibleToClient = app.screens.filter(screen => canOpenAppV2Screen(app, client, screen.id))
    const clientHome = visibleToClient.find(screen => screen.id === app.homeScreenId) ?? visibleToClient.find(screen => !screen.contextTableId)
    expect([prokat.clientListScreenId, prokat.catalogScreenId]).toContain(clientHome?.id)
    expect(canOpenAppV2Screen(app, client, prokat.dashboardScreenId)).toBe(false)
    expect(canOpenAppV2Screen(app, client, prokat.bookingsScreenId)).toBe(false)
    expect(canOpenAppV2Screen(app, desk, prokat.dashboardScreenId)).toBe(true)
    expect(canOpenAppV2Screen(app, client, prokat.catalogScreenId)).toBe(true)

    expect(authorizeAppV2Write(app, client, { operation: 'update', row: record(own), values: { [prokat.booking.status]: prokat.statuses.returned } }).ok).toBe(true)
    expect(authorizeAppV2Write(app, client, { operation: 'update', row: record(own), values: { [prokat.booking.staffEmail]: 'hack@x.ru' } }).ok).toBe(false)

    const records = built.rows.map(row => ({ id: row.id, tableId: row.tableId, values: row.data as AppV2Record['values'] }))
    const freeItem = built.rows.find(row => row.tableId === prokat.itemsTableId && row.data[prokat.item.serial] === 'ВЕЛ-1003')!
    const created = applyProkatChange(app, desk, records, {
      kind: 'create',
      clientId: built.rows.find(row => row.tableId === prokat.clientsTableId && row.data[prokat.client.email] === 'm.petrova@yandex.ru')!.id,
      itemIds: [freeItem.id],
      title: 'Шоссейный велосипед Giant Contend',
      from: '2026-12-01T07:00:00.000Z',
      to: '2026-12-02T15:00:00.000Z',
      price: 1800,
      deposit: 7000,
    }, '2026-11-24T09:00:00.000Z')
    expect(created.ok, JSON.stringify(created)).toBe(true)
    if (created.ok) {
      const previousIds = new Set(records.map(row => row.id))
      const row = created.rows.find(item => item.tableId === prokat.bookingsTableId && !previousIds.has(item.id))!
      expect(row.values[prokat.booking.clientEmail]).toBe('m.petrova@yandex.ru')
      expect(row.values[prokat.booking.title]).toBe('Шоссейный велосипед Giant Contend')
      expect(String(row.values[prokat.booking.number])).toMatch(/^ПР-\d+$/)
    }

    const busy = booking('ПР-1005')
    const conflict = applyProkatChange(app, desk, records, {
      kind: 'create',
      clientId: built.rows.find(row => row.tableId === prokat.clientsTableId && row.data[prokat.client.email] === 'a.ivanov@mail.ru')!.id,
      itemIds: (busy.data[prokat.booking.items] as string[]),
      title: 'Конфликт',
      from: String(busy.data[prokat.booking.from]),
      to: String(busy.data[prokat.booking.to]),
      price: 900,
      deposit: 3000,
    }, '2026-11-24T09:00:00.000Z')
    expect(conflict.ok).toBe(false)
  })

  it('keeps transitions and numbering coherent', () => {
    expect(staffTransitions('Заявка')).toEqual(['Подтверждена', 'Отменена'])
    expect(staffTransitions('Выдано')).toEqual(['Возвращено', 'Просрочен возврат'])
    expect(nextBookingNumber(['ПР-1008', 'черновик', 'ПР-1003'])).toBe('ПР-1009')
    expect(findItemBookingConflict([], ['x'], '2026-11-24T07:00:00.000Z', '2026-11-24T15:00:00.000Z')).toBeNull()
  })
})
