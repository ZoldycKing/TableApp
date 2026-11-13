import { newId, type BookingConfig } from '@tableapp/schema'
import type { AppV2, AppV2Audience, AppV2Binding, AppV2Grant, AppV2Node } from '@tableapp/schema/app-v2'
import type { BuiltTemplate } from './build'
import { salon } from './defs/salon'

export const isBookingTemplate = (id: string) => id === 'salon'
const audience = (...roleIds: string[]): AppV2Audience => ({ kind: 'roles', roleIds })
const owner = audience('owner'), team = audience('owner', 'staff'), clients = audience('client', 'owner')
const everyone: AppV2Audience = { kind: 'public' }
const all = { kind: 'all' as const }
const own = (fieldId: string) => ({ kind: 'owned' as const, fieldId, property: 'email' as const })

export function buildBookingV2App(built: BuiltTemplate, meta: { id: string; workspaceId: string; name: string; slug: string; email: string }): AppV2 {
  const table = (key: string) => built.tables[salon.tables.findIndex(item => item.key === key)]!
  const field = (key: string, name: string) => {
    const index = salon.tables.find(item => item.key === key)!.fields.findIndex(item => item.key === name)
    const column = built.fields.filter(item => item.tableId === table(key).id)[index]
    if (index < 0 || !column) throw new Error(`Нет поля записи ${key}.${name}`)
    return column.id
  }
  const group = <T extends Record<string, string>>(key: string, names: T): T => Object.fromEntries(Object.entries(names).map(([name, value]) => [name, field(key, value)])) as T
  const choices = (key: string, name: string) => built.fields.find(item => item.id === field(key, name))!.options.choices as { id: string; name: string }[]
  const screenIds = Object.fromEntries(['catalogScreenId', 'serviceScreenId', 'mastersScreenId', 'masterScreenId', 'visitScreenId', 'clientScreenId', 'listScreenId', 'formScreenId', 'rescheduleScreenId', 'setupScreenId'].map(key => [key, newId('screen')])) as Record<'catalogScreenId'|'serviceScreenId'|'mastersScreenId'|'masterScreenId'|'visitScreenId'|'clientScreenId'|'listScreenId'|'formScreenId'|'rescheduleScreenId'|'setupScreenId', string>
  const booking: NonNullable<AppV2['booking']> = {
    ...screenIds,
    tables: { services: table('services').id, masters: table('masters').id, schedule: table('schedule').id, visits: table('visits').id },
    service: group('services', { name: 'name', price: 'price', minutes: 'minutes', active: 'active' }),
    master: group('masters', { name: 'name', email: 'email', services: 'services', active: 'active' }),
    schedule: group('schedule', { name: 'name', master: 'master', weekday: 'weekday', start: 'start', end: 'end', date: 'date', closed: 'closed' }),
    visit: group('visits', { client: 'client', phone: 'phone', email: 'email', service: 'service', master: 'master', masterEmail: 'masterEmail', price: 'price', minutes: 'minutes', start: 'when', status: 'status', note: 'note' }),
    statuses: Object.fromEntries(Object.entries({ booked: 'Записан', arrived: 'Пришёл', noShow: 'Не пришёл', cancelled: 'Отменил', completed: 'Завершено' }).map(([key, name]) => [key, choices('visits', 'status').find(item => item.name === name)!.id])) as BookingConfig['statuses'],
    weekdays: choices('schedule', 'weekday').map(item => item.id), stepMinutes: 15, leadMinutes: 60, horizonDays: 60,
    createFormId: newId('component'), rescheduleFormId: newId('component'), statusFormId: newId('component'), cancelButtonId: newId('component'),
    servicePhotoFieldId: field('services', 'photo'), serviceDescriptionFieldId: field('services', 'description'),
    masterPhotoFieldId: field('masters', 'photo'), masterDescriptionFieldId: field('masters', 'description'),
    periodScreenId: newId('screen'),
    ownerCreateFormId: newId('component'),
    clients: { tableId: table('clients').id, ...group('clients', { name: 'name', phone: 'phone', email: 'email', note: 'note' }), linkFieldId: field('visits', 'profile') },
    customersScreenId: newId('screen'), customerScreenId: newId('screen'), customerCreateFormId: newId('component'), customerEditFormId: newId('component'),
  }
  const nodes: AppV2Node[] = [], sources: AppV2['sources'] = [], workflows: AppV2['workflows'] = [], screens: AppV2['screens'] = [], rules: AppV2['policy']['workflows'] = []
  const flow = (name: string, input: AppV2['workflows'][number]['input'], steps: AppV2['workflows'][number]['steps'], allowed: AppV2Audience) => {
    const id = newId('action'); workflows.push({ id, name, input, steps }); rules.push({ workflowId: id, audience: allowed }); return id
  }
  const screen = (id: string, name: string, icon: string, allowed: AppV2Audience, contextTableId: string | null, rootIds: string[], navigation = true) => {
    screens.push({ id, name, icon, audience: allowed, contextTableId, rootIds, navigation, events: { enter: null } })
  }
  const collection = (screenId: string, name: string, tableId: string, titleFieldId: string, detailId: string | null, allowed: AppV2Audience, layout: 'catalog'|'calendar'|'list' = 'list', subtitleFieldId: string | null = null) => {
    const id = newId('component'), sourceId = newId('component')
    const open = detailId ? flow(`Открыть: ${name}`, { rowTableId: tableId, formId: null }, [{ id: newId('action'), type: 'open_screen', screenId: detailId, record: { kind: 'current' } }], allowed) : null
    sources.push({ id: sourceId, tableId, viewId: null, filter: tableId === booking.tables.services ? { op: 'eq', left: { kind: 'row', fieldId: booking.service.active }, right: { kind: 'literal', value: true } } : null, sorts: tableId === booking.tables.visits ? [{ fieldId: booking.visit.start, direction: 'asc' }] : [], searchFieldIds: [titleFieldId], pageSize: 100 })
    nodes.push({ id, name, type: 'collection', sourceId, layout, titleFieldId, subtitleFieldId, itemIds: [], visibleTo: null, visibleWhen: null, events: { itemPress: open }, ...(layout === 'calendar' ? { dateFieldId: booking.visit.start } : {}), ...(layout === 'catalog' ? { cardImageFieldId: booking.servicePhotoFieldId, cardDetailFieldId: booking.service.price } : {}) })
    return id
  }
  const form = (id: string, name: string, screenId: string, tableId: string, mode: 'create'|'edit', fields: { fieldId: string; label: string; required?: boolean; initialValue?: AppV2Binding; readOnly?: boolean }[], allowed: AppV2Audience, contextTableId: string | null) => {
    const inputs = fields.map(item => ({ id: newId('component'), name: item.label, type: 'input' as const, fieldId: item.fieldId, label: item.label, required: Boolean(item.required), readOnly: Boolean(item.readOnly), initialValue: item.initialValue ?? null, visibleTo: null, visibleWhen: null }))
    nodes.push(...inputs)
    const saveId = newId('action')
    const values = Object.fromEntries(inputs.filter(item => mode === 'create' || !item.readOnly).map(item => [item.fieldId, { kind: 'form' as const, formId: id, fieldId: item.fieldId }]))
    const save = flow(name, { rowTableId: contextTableId, formId: id, screenTableId: contextTableId }, [
      mode === 'create' ? { id: saveId, type: 'create_row', tableId, values } : { id: saveId, type: 'update_row', tableId, target: { kind: 'current' }, values },
      { id: newId('action'), type: 'notify', message: { kind: 'literal', value: mode === 'create' && tableId === booking.tables.visits ? 'Вы записаны. Дата и время сохранены в разделе «Мои записи».' : 'Изменения сохранены.' } },
      ...(tableId === booking.tables.visits ? [{ id: newId('action'), type: 'open_screen' as const, screenId: booking.visitScreenId, record: mode === 'create' ? { kind: 'result' as const, stepId: saveId } : { kind: 'current' as const } }] : []),
    ], allowed)
    nodes.push({ id, name, type: 'form', tableId, mode, childIds: inputs.map(item => item.id), events: { submit: save }, submitLabel: mode === 'create' && tableId === booking.tables.visits ? 'Подтвердить запись' : 'Сохранить', visibleTo: allowed, visibleWhen: null })
    return id
  }
  const visit = booking.visit, service = booking.service
  const publicServiceFields = Object.values(service).concat(booking.servicePhotoFieldId, booking.serviceDescriptionFieldId)
  const publicMasterFields = [booking.master.name, booking.master.services, booking.master.active, booking.masterPhotoFieldId!, booking.masterDescriptionFieldId!]
  screen(booking.catalogScreenId, 'Услуги', 'tag', everyone, null, [collection(booking.catalogScreenId, 'Услуги', booking.tables.services, service.name, booking.serviceScreenId, everyone, 'catalog', service.minutes)])
  screen(booking.serviceScreenId, 'Услуга', 'tag', everyone, booking.tables.services, [], false)
  screens.at(-1)!.catalog = { titleFieldId: service.name, priceFieldId: service.price, imageFieldId: booking.servicePhotoFieldId, descriptionFieldId: booking.serviceDescriptionFieldId }
  screen(booking.mastersScreenId, 'Мастера', 'users', everyone, null, [collection(booking.mastersScreenId, 'Мастера', booking.tables.masters, booking.master.name, booking.masterScreenId, everyone)])
  screen(booking.masterScreenId, 'Мастер', 'user', everyone, booking.tables.masters, [], false)
  screen(booking.listScreenId!, 'Расписание', 'calendar', team, null, [collection(booking.listScreenId!, 'Расписание', booking.tables.visits, visit.client, booking.visitScreenId, team, 'calendar', visit.service)])
  screens.at(-1)!.menuLabel = 'Расписание'
  screen(booking.clientScreenId, 'Мои записи', 'calendar', audience('client'), null, [collection(booking.clientScreenId, 'Мои записи', booking.tables.visits, visit.service, booking.visitScreenId, audience('client'), 'list', visit.start)])
  screen(booking.formScreenId, 'Записаться', 'calendar', everyone, booking.tables.services, [form(booking.createFormId, 'Записаться на услугу', booking.formScreenId, booking.tables.visits, 'create', [
    { fieldId: visit.service, label: 'Услуга', required: true, readOnly: true, initialValue: { kind: 'record_ids', tableId: booking.tables.services, record: { kind: 'row' } } },
    { fieldId: visit.master, label: 'Мастер', required: true }, { fieldId: visit.start, label: 'Дата и время', required: true },
    { fieldId: visit.client, label: 'Ваше имя', required: true }, { fieldId: visit.phone, label: 'Телефон', required: true },
    { fieldId: visit.status, label: 'Статус', readOnly: true, initialValue: { kind: 'literal', value: booking.statuses.booked } },
  ], audience('client'), booking.tables.services)], false)
  screens.find(item => item.id === booking.formScreenId)!.rootIds.push(form(booking.ownerCreateFormId!, 'Новая запись клиента', booking.formScreenId, booking.tables.visits, 'create', [
    { fieldId: visit.service, label: 'Услуга', required: true, readOnly: true, initialValue: { kind: 'record_ids', tableId: booking.tables.services, record: { kind: 'row' } } },
    { fieldId: visit.master, label: 'Мастер', required: true }, { fieldId: visit.start, label: 'Дата и время', required: true },
    { fieldId: booking.clients!.linkFieldId, label: 'Клиент' },
    { fieldId: visit.client, label: 'Имя клиента', required: true }, { fieldId: visit.phone, label: 'Телефон клиента', required: true }, { fieldId: visit.email, label: 'Почта клиента для личного кабинета' },
    { fieldId: visit.status, label: 'Статус', readOnly: true, initialValue: { kind: 'literal', value: booking.statuses.booked } },
  ], owner, booking.tables.services))
  screen(booking.rescheduleScreenId, 'Перенести запись', 'calendar', clients, booking.tables.visits, [form(booking.rescheduleFormId, 'Выберите новое время', booking.rescheduleScreenId, booking.tables.visits, 'edit', [
    { fieldId: visit.service, label: 'Услуга', readOnly: true }, { fieldId: visit.master, label: 'Мастер', required: true }, { fieldId: visit.start, label: 'Дата и время', required: true },
  ], clients, booking.tables.visits)], false)
  const statusForm = form(booking.statusFormId, 'Статус посещения', booking.visitScreenId, booking.tables.visits, 'edit', [{ fieldId: visit.status, label: 'Статус', required: true }, { fieldId: visit.note, label: 'Заметки для команды' }], team, booking.tables.visits)
  const cancelFlow = flow('Отменить запись', { rowTableId: booking.tables.visits, formId: null, screenTableId: booking.tables.visits }, [{ id: newId('action'), type: 'update_row', tableId: booking.tables.visits, target: { kind: 'current' }, values: { [visit.status]: { kind: 'literal', value: booking.statuses.cancelled } } }, { id: newId('action'), type: 'notify', message: { kind: 'literal', value: 'Запись отменена. Это время снова доступно.' } }], clients)
  nodes.push({ id: booking.cancelButtonId, name: 'Отменить запись', type: 'button', label: 'Отменить запись', variant: 'danger', events: { press: cancelFlow }, visibleTo: clients, visibleWhen: { op: 'eq', left: { kind: 'row', fieldId: visit.status }, right: { kind: 'literal', value: booking.statuses.booked } } })
  const facts = Object.entries(visit).filter(([key]) => !['email', 'masterEmail', 'note'].includes(key)).map(([, fieldId]) => {
    const id = newId('component'); nodes.push({ id, name: built.fields.find(item => item.id === fieldId)!.name, type: 'field', label: built.fields.find(item => item.id === fieldId)!.name, value: { kind: 'row', fieldId }, visibleTo: null, visibleWhen: null }); return id
  })
  screen(booking.visitScreenId, 'Запись', 'calendar', audience('owner', 'staff', 'client'), booking.tables.visits, [...facts, statusForm, booking.cancelButtonId], false)
  const scheduleForm = form(newId('component'), 'Рабочее время мастера', booking.setupScreenId, booking.tables.schedule, 'create', Object.values(booking.schedule).map(fieldId => ({ fieldId, label: built.fields.find(item => item.id === fieldId)!.name, required: [booking.schedule.name, booking.schedule.master].includes(fieldId) })), owner, null)
  screen(booking.setupScreenId, 'Рабочие часы', 'clock', owner, null, [collection(booking.setupScreenId, 'Рабочее время', booking.tables.schedule, booking.schedule.name, null, owner), scheduleForm], false)
  const manageFields = (tableId: string, creating: boolean) => built.fields.filter(item => item.tableId === tableId).map(item => ({ fieldId: item.id, label: item.name, required: ['text', 'email'].includes(item.type) && item.type !== 'long_text' || item.id === service.price || item.id === service.minutes || item.id === booking.master.services, ...(creating && [service.active, booking.master.active].includes(item.id) ? { initialValue: { kind: 'literal' as const, value: true } } : {}) }))
  for (const [listId, detailId, tableId, name] of [[booking.catalogScreenId, booking.serviceScreenId, booking.tables.services, 'Услуга'], [booking.mastersScreenId, booking.masterScreenId, booking.tables.masters, 'Мастер']] as const) {
    screens.find(item => item.id === listId)!.rootIds.push(form(newId('component'), name === 'Услуга' ? 'Добавить услугу' : 'Добавить мастера', listId!, tableId!, 'create', manageFields(tableId!, true), owner, null))
    screens.find(item => item.id === detailId)!.rootIds.push(form(newId('component'), name === 'Услуга' ? 'Изменить услугу' : 'Изменить мастера', detailId!, tableId!, 'edit', manageFields(tableId!, false), owner, tableId!))
  }
  screen(booking.periodScreenId!, 'Рабочий период', 'clock', owner, booking.tables.schedule, [form(newId('component'), 'Изменить рабочее время', booking.periodScreenId!, booking.tables.schedule, 'edit', Object.values(booking.schedule).map(fieldId => ({ fieldId, label: built.fields.find(item => item.id === fieldId)!.name, required: [booking.schedule.name, booking.schedule.master].includes(fieldId) })), owner, booking.tables.schedule)], false)
  const clientFields = [
    { fieldId: booking.clients!.name, label: 'Имя клиента', required: true },
    { fieldId: booking.clients!.phone, label: 'Телефон', required: true },
    { fieldId: booking.clients!.email, label: 'Почта' },
    { fieldId: booking.clients!.note, label: 'Заметки о клиенте' },
  ]
  screen(booking.customersScreenId!, 'Клиенты', 'users', owner, null, [collection(booking.customersScreenId!, 'Клиенты', booking.clients!.tableId, booking.clients!.name, booking.customerScreenId!, owner), form(booking.customerCreateFormId!, 'Добавить клиента', booking.customersScreenId!, booking.clients!.tableId, 'create', clientFields, owner, null)])
  screen(booking.customerScreenId!, 'Клиент', 'user', owner, booking.clients!.tableId, [form(booking.customerEditFormId!, 'Изменить клиента', booking.customerScreenId!, booking.clients!.tableId, 'edit', clientFields, owner, booking.clients!.tableId)], false)
  const clientCard = screens.at(-1)!, c = booking.clients!, profileId = newId('component'), historyId = newId('component'), layoutId = newId('component'), sideId = newId('component')
  const clientSource = (extra?: AppV2['sources'][number]['filter']) => {
    const sourceId = newId('component')
    const related = { op: 'includes' as const, left: { kind: 'row' as const, fieldId: c.linkFieldId }, right: { kind: 'screen_row_id' as const } }
    sources.push({ id: sourceId, tableId: booking.tables.visits, screenTableId: c.tableId, viewId: null, filter: extra ? { op: 'and', conditions: [related,extra] } : related, sorts: [{ fieldId: visit.start, direction: 'desc' }], searchFieldIds: [], pageSize: 30 })
    return sourceId
  }
  const done = { op: 'eq' as const, left: { kind: 'row' as const, fieldId: visit.status }, right: { kind: 'literal' as const, value: booking.statuses.completed! } }
  const metricIds = ['Завершённых визитов','За завершённые визиты'].map((name,index) => {
    const id = newId('component'); nodes.push({ id, name, type: 'metric', sourceId: clientSource(done), operation: index ? 'sum' : 'count', fieldId: index ? visit.price : null, format: index ? 'currency' : 'number', visibleTo: null, visibleWhen: null }); return id
  })
  const metricsId = newId('component'), notesId = newId('component'), notesHeadingId = newId('component')
  const historyOpen = flow('Открыть визит из истории', { rowTableId: booking.tables.visits, screenTableId: c.tableId, formId: null }, [{ id: newId('action'), type: 'open_screen', screenId: booking.visitScreenId, record: { kind: 'current' } }], owner)
  nodes.push(
    { id: profileId, name: 'Профиль клиента', type: 'profile', title: { kind: 'row', fieldId: c.name }, subtitle: null, image: null, contacts: [{ label: 'Телефон', kind: 'phone', value: { kind: 'row', fieldId: c.phone } },{ label: 'Почта', kind: 'email', value: { kind: 'row', fieldId: c.email } }], childIds: [metricsId], visibleTo: null, visibleWhen: null },
    { id: metricsId, name: 'Посещения клиента', type: 'columns', columns: 2, childIds: metricIds, visibleTo: null, visibleWhen: null },
    { id: historyId, name: 'История посещений', type: 'collection', sourceId: clientSource(), layout: 'history', historyNoteFieldId: visit.note, titleFieldId: visit.service, subtitleFieldId: visit.master, dateFieldId: visit.start, statusFieldId: visit.status, cardDetailFieldId: visit.price, itemIds: [], events: { itemPress: historyOpen }, visibleTo: null, visibleWhen: null },
    { id: notesHeadingId, name: 'Заметки о клиенте', type: 'heading', size: 's', value: { kind: 'literal', value: 'Заметки о клиенте' }, visibleTo: null, visibleWhen: { op: 'not_empty', value: { kind: 'row', fieldId: c.note } } },
    { id: notesId, name: 'Заметки', type: 'text', value: { kind: 'row', fieldId: c.note }, visibleTo: null, visibleWhen: { op: 'not_empty', value: { kind: 'row', fieldId: c.note } } },
    { id: sideId, name: 'История и заметки', type: 'group', appearance: 'plain', childIds: [historyId,notesHeadingId,notesId], visibleTo: null, visibleWhen: null },
    { id: layoutId, name: 'Профиль и история', type: 'columns', columns: 2, childIds: [profileId,sideId], visibleTo: null, visibleWhen: null },
  )
  clientCard.recordTitleFieldId = c.name
  clientCard.rootIds.unshift(layoutId)
  const grant = (allowed: AppV2Audience, value: Omit<AppV2Grant, 'audience'>): AppV2Grant => ({ audience: allowed, ...value })
  const columns = (tableId: string) => built.fields.filter(item => item.tableId === tableId).map(item => item.id)
  return {
    formatVersion: 2, id: meta.id, workspaceId: meta.workspaceId, name: meta.name, slug: meta.slug, purpose: 'business', appearance: { navigation: 'tabs', icon: 'calendar', density: 'regular', corners: 'rounded' }, theme: { accent: 'green', scheme: 'light', logoKey: null, iconKey: null },
    roles: [{ id: 'owner', name: 'Администратор' }, { id: 'staff', name: 'Мастер' }, { id: 'client', name: 'Клиент' }],
    authentication: { mode: 'verified_email', defaultRoleId: 'client', members: [{ email: meta.email.trim().toLowerCase(), roleIds: ['owner'], company: '' }] },
    homeScreenId: booking.catalogScreenId, booking, screens, nodes, sources, workflows,
    policy: { workflows: rules, tables: [
      { tableId: booking.clients!.tableId, grants: [grant(owner, { read: { fieldIds: columns(booking.clients!.tableId), rows: all }, create: { fieldIds: columns(booking.clients!.tableId) }, update: { fieldIds: columns(booking.clients!.tableId), rows: all } })] },
      { tableId: booking.tables.services, grants: [grant(everyone, { read: { fieldIds: publicServiceFields, rows: all } }), grant(owner, { create: { fieldIds: columns(booking.tables.services) }, update: { fieldIds: columns(booking.tables.services), rows: all } })] },
      { tableId: booking.tables.masters, grants: [grant(everyone, { read: { fieldIds: publicMasterFields, rows: all } }), grant(owner, { read: { fieldIds: columns(booking.tables.masters), rows: all }, create: { fieldIds: columns(booking.tables.masters) }, update: { fieldIds: columns(booking.tables.masters), rows: all } })] },
      { tableId: booking.tables.schedule, grants: [grant(owner, { read: { fieldIds: columns(booking.tables.schedule), rows: all }, create: { fieldIds: columns(booking.tables.schedule) }, update: { fieldIds: columns(booking.tables.schedule), rows: all } })] },
      { tableId: booking.tables.visits, grants: [
        grant(owner, { read: { fieldIds: columns(booking.tables.visits), rows: all }, create: { fieldIds: columns(booking.tables.visits) }, update: { fieldIds: [visit.master, visit.start, visit.status, visit.note], rows: all } }),
        grant(audience('staff'), { read: { fieldIds: columns(booking.tables.visits), rows: own(visit.masterEmail) }, update: { fieldIds: [visit.status, visit.note], rows: own(visit.masterEmail) } }),
        grant(audience('client'), { read: { fieldIds: columns(booking.tables.visits).filter(id => ![visit.note, visit.masterEmail].includes(id)), rows: own(visit.email) }, create: { fieldIds: [visit.service, visit.master, visit.start, visit.client, visit.phone, visit.status], owner: { fieldId: visit.email, property: 'email' } }, update: { fieldIds: [visit.master, visit.start, visit.status], rows: own(visit.email) } }),
      ] },
    ] },
  }
}
