import { appSchema, newId, positionSequence, type App, type BookingConfig, type Component, type Field, type Screen, type View } from '@tableapp/schema'
import { generateApp } from '../app-builder'
import type { BuiltTemplate } from './build'
import { salon } from './defs/salon'

/** A preset supplies complete roles and actions; owners only fill business data. */
export function asSalon(app: App, built: BuiltTemplate): App {
  const table = (key: string) => built.tables[salon.tables.findIndex(item => item.key === key)]!
  const field = (key: string, name: string) => built.fields.filter(item => item.tableId === table(key).id)[salon.tables.find(item => item.key === key)!.fields.findIndex(item => item.key === name)]!.id
  const group = <T extends Record<string, string>>(key: string, values: T): T => Object.fromEntries(Object.entries(values).map(([name, id]) => [name, field(key, id)])) as T
  const access = (roles: string[], publicFields: string[] = [], isPublic = false) => ({ roles, public: isPublic, publicFields, allowDelete: false })
  const formId = newId('screen'), rescheduleId = newId('screen'), setupId = newId('screen')
  const list = app.screens.find(s => s.type === 'list')!, detail = app.screens.find(s => s.type === 'detail')!
  const config: BookingConfig = {
    tables: { services: table('services').id, masters: table('masters').id, schedule: table('schedule').id, visits: table('visits').id },
    service: group('services', { name: 'name', price: 'price', minutes: 'minutes', active: 'active' }),
    master: group('masters', { name: 'name', email: 'email', services: 'services', active: 'active' }),
    schedule: group('schedule', { name: 'name', master: 'master', weekday: 'weekday', start: 'start', end: 'end', date: 'date', closed: 'closed' }),
    visit: group('visits', { client: 'client', phone: 'phone', email: 'email', service: 'service', master: 'master', masterEmail: 'masterEmail', price: 'price', minutes: 'minutes', start: 'when', status: 'status', note: 'note' }),
    statuses: Object.fromEntries(Object.entries({ booked: 'Записан', arrived: 'Пришёл', noShow: 'Не пришёл', cancelled: 'Отменил', completed: 'Завершено' }).map(([name, title]) => [name,
      (built.fields.find(item => item.id === field('visits', 'status'))!.options.choices as { id: string; name: string }[]).find(choice => choice.name === title)!.id])) as BookingConfig['statuses'],
    weekdays: (built.fields.find(item => item.id === field('schedule', 'weekday'))!.options.choices as { id: string }[]).map(choice => choice.id),
    listScreenId: list.id, formScreenId: formId, rescheduleScreenId: rescheduleId, setupScreenId: setupId, stepMinutes: 15, leadMinutes: 60, horizonDays: 60,
  }
  const formFields = (ids: string[], required = true): Component[] => ids.map((fieldId, index) => ({ id: newId('component'), position: positionSequence(ids.length)[index]!,
    type: 'form_field', fieldId, roles: null, visibleWhen: null, label: null, required, placeholder: null }))
  const visitFields = config.visit
  const create: Screen = { id: formId, appId: app.id, name: 'Записаться на услугу', position: 'a', tab: null,
    access: access(['client', 'manager']), type: 'form', tableId: config.tables.visits, mode: 'create',
    submitLabel: 'Подтвердить запись', successScreenId: list.id, successText: 'Вы записаны. Дата и время уже в вашем кабинете.',
    components: [...formFields([visitFields.service, visitFields.master, visitFields.start, visitFields.client, visitFields.phone]),
      { ...formFields([visitFields.email], false)[0]!, roles: ['manager'] }] }
  const reschedule: Screen = { ...create, id: rescheduleId, name: 'Перенести запись', tab: null, mode: 'edit', submitLabel: 'Сохранить новое время',
    access: access(['client', 'manager']), components: formFields([visitFields.master, visitFields.start]) }
  const publicServices = [config.service.name, field('services', 'description'), config.service.price, config.service.minutes, config.service.active]
  const serviceApp = generateApp({ appId: app.id, workspaceId: app.workspaceId, name: app.name, slug: app.slug,
    table: table('services'), fields: built.fields.filter(f => f.tableId === config.tables.services) as unknown as Field[],
    view: built.views.find(v => v.tableId === config.tables.services && (v.name === 'Доступны для записи' || v.name === 'Для записи')) as unknown as View })
  const ownerScreens: Screen[] = []
  for (const key of ['masters', 'schedule']) {
    const generated = generateApp({ appId: app.id, workspaceId: app.workspaceId, name: app.name, slug: app.slug,
      table: table(key), fields: built.fields.filter(f => f.tableId === table(key).id) as unknown as Field[],
      view: built.views.find(v => v.tableId === table(key).id) as unknown as View })
    ownerScreens.push(...generated.screens.filter(s => s.type !== 'dashboard').map(s => ({ ...s, access: access(['manager']),
      ...(s.type === 'form' && s.mode === 'create' ? { name: key === 'masters' ? 'Новый мастер' : 'Особый график', tab: key === 'masters' ? null : { icon: 'plus', label: 'Особый график' } } : {}),
      ...(s.type === 'list' ? { name: table(key).name, tab: { icon: key === 'masters' ? 'users' : 'clock', label: table(key).name },
        ...(key === 'schedule' ? { subtitleFieldId: config.schedule.start, metaFieldId: config.schedule.end } : {}) } : {}) })))
  }
  const setup: Screen = { ...create, id: setupId, name: 'Настроить запись', tab: { icon: 'settings', label: 'Настройка' },
    access: access(['manager']), tableId: config.tables.masters, components: formFields([config.master.name, config.master.email, config.master.services]) }
  const visible = new Set([visitFields.client, visitFields.phone, visitFields.service, visitFields.master, visitFields.price, visitFields.minutes, visitFields.start, visitFields.status])
  const screens: Screen[] = [
    { ...list, name: 'Мои записи', tab: { icon: 'calendar', label: 'Записи' }, access: access(['client']),
      ...(list.type === 'list' ? { titleFieldId: visitFields.service, subtitleFieldId: visitFields.start, metaFieldId: visitFields.price, source: { ...list.source, searchFieldIds: [] } } : {}) },
    { ...list, id: newId('screen'), name: 'Записи', tab: { icon: 'calendar', label: 'Записи' }, access: access(['staff', 'manager']),
      ...(list.type === 'list' ? { subtitleFieldId: visitFields.start, metaFieldId: visitFields.price, source: { ...list.source, searchFieldIds: [visitFields.client] } } : {}) },
    create,
    { ...detail, name: 'Запись', access: access(['client', 'staff', 'manager']),
      ...(detail.type === 'detail' ? { components: detail.components.filter(c => c.type !== 'field' || visible.has(c.fieldId) || c.fieldId === visitFields.note)
        .map(c => c.type === 'button' ? { ...c, roles: ['staff', 'manager'] } : c.type === 'field' && c.fieldId === visitFields.note ? { ...c, roles: ['staff', 'manager'] } : c) } : {}) },
    ...app.screens.filter(s => s.type === 'form' && s.mode === 'edit').map(s => ({ ...s, access: access(['staff', 'manager']),
      ...(s.type === 'form' ? { components: s.components.filter(c => c.type !== 'form_field' || [visitFields.status, visitFields.note].includes(c.fieldId)) } : {}) })),
    reschedule,
    ...serviceApp.screens.filter(s => s.type !== 'dashboard').map(s => ({ ...s,
      access: s.type === 'form' ? access(['manager']) : access(['client', 'staff', 'manager'], publicServices, true),
      ...(s.type === 'list' ? { name: 'Услуги и цены', tab: { icon: 'tag', label: 'Услуги' }, subtitleFieldId: config.service.minutes, metaFieldId: config.service.price } : {}),
      ...(s.type === 'form' && s.mode === 'create' ? { name: 'Добавить услугу', tab: { icon: 'plus', label: 'Добавить услугу' },
        components: s.components.map(c => c.type === 'form_field' && [config.service.name, config.service.price, config.service.minutes].includes(c.fieldId) ? { ...c, required: true } : c) } : {}),
      ...(s.type === 'detail' ? { components: [...s.components.map(c => c.type === 'button' ? { ...c, roles: ['manager'] }
        : c.type === 'field' && c.fieldId === field('services', 'description') ? { id: c.id, position: c.position, visibleWhen: c.visibleWhen, roles: null,
          type: 'text' as const, source: { kind: 'field' as const, fieldId: c.fieldId }, style: 'body' as const }
        : c.type === 'field' && c.fieldId === config.service.active ? { ...c, roles: ['manager'] } : c),
        { id: newId('component'), position: 'zz', type: 'button' as const, label: 'Записаться', style: 'primary' as const, roles: null, visibleWhen: null,
          action: { id: newId('action'), type: 'open_screen' as const, screenId: formId } }] } : {}) })),
    setup, ...ownerScreens,
    ...serviceApp.screens.filter(s => s.type === 'list').map(s => ({ ...s, id: newId('screen'), name: 'Услуги и цены', tab: { icon: 'tag', label: 'Услуги и цены' },
      access: access(['manager']), ...(s.type === 'list' ? { source: { ...s.source, viewId: built.views.find(v => v.tableId === config.tables.services && (v.name === 'Все услуги' || v.name === 'Прайс'))!.id } } : {}) })),
    { id: newId('screen'), appId: app.id, position: 'a', name: 'Имена мастеров', tab: null, type: 'list',
      // Master names are already shown by booking availability. This narrow public
      // source also lets enrolled clients resolve the master of a past visit.
      access: access(['client', 'staff', 'manager'], [config.master.name], true),
      source: { viewId: built.views.find(v => v.tableId === config.tables.masters)!.id, extraFilter: null, searchFieldIds: [config.master.name] },
      titleFieldId: config.master.name, subtitleFieldId: null, metaFieldId: null, imageFieldId: null, statusFieldId: null, onTapScreenId: null, components: [] },
  ]
  return appSchema.parse({ ...app, accessMode: 'public', booking: config, homeScreenId: list.id,
    roles: [{ id: 'client', name: 'Клиент', isDefault: true }, { id: 'staff', name: 'Мастер', isDefault: false }, { id: 'manager', name: 'Администратор', isDefault: false }],
    rowAccessRules: [{ tableId: config.tables.visits, fieldId: visitFields.email, match: 'email', appliesTo: ['guest', 'client'] },
      { tableId: config.tables.visits, fieldId: visitFields.masterEmail, match: 'email', appliesTo: ['staff'] }],
    screens: screens.map((screen, index) => ({ ...screen, position: positionSequence(screens.length)[index] })),
  })
}
