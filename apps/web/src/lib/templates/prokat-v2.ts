import { newId } from '@tableapp/schema'
import type { AppV2, AppV2Audience, AppV2Grant, AppV2Node } from '@tableapp/schema/app-v2'
import type { BuiltTemplate } from './build'

export const isProkatTemplate = (id: string) => id === 'prokat'

const writable = new Set(['text', 'long_text', 'number', 'email', 'phone', 'url', 'date', 'datetime', 'checkbox', 'single_select', 'multi_select', 'relation', 'image', 'attachment'])
const owner: AppV2Audience = { kind: 'roles', roleIds: ['owner'] }
const staff: AppV2Audience = { kind: 'roles', roleIds: ['staff'] }
const desk: AppV2Audience = { kind: 'roles', roleIds: ['owner', 'staff'] }
const clientRole: AppV2Audience = { kind: 'roles', roleIds: ['client'] }

/** Equipment rental cabinet and Переписка on the App V2 kit. */
export function buildProkatV2App(built: BuiltTemplate, meta: { id: string; workspaceId: string; name: string; slug: string; email: string }): AppV2 {
  const table = (name: string) => {
    const found = built.tables.find(item => item.name === name)
    if (!found) throw new Error(`В шаблоне проката нет таблицы «${name}»`)
    return found
  }
  const column = (tableName: string, fieldName: string) => {
    const found = built.fields.find(item => item.tableId === table(tableName).id && item.name === fieldName)
    if (!found) throw new Error(`В шаблоне проката нет поля «${tableName} · ${fieldName}»`)
    return found
  }
  const choice = (tableName: string, fieldName: string, name: string) => {
    const match = (column(tableName, fieldName).options as { choices?: { id: string; name: string }[] }).choices?.find(item => item.name === name)
    if (!match) throw new Error(`В поле «${fieldName}» нет варианта «${name}»`)
    return match.id
  }
  const bookings = table('Брони'), clients = table('Клиенты'), staffTable = table('Сотрудники'), items = table('Предметы')
  const booking = {
    number: column('Брони', 'Номер').id,
    title: column('Брони', 'Состав').id,
    client: column('Брони', 'Клиент').id,
    clientName: column('Брони', 'Имя клиента').id,
    clientEmail: column('Брони', 'Почта клиента').id,
    items: column('Брони', 'Предметы').id,
    from: column('Брони', 'С').id,
    to: column('Брони', 'По').id,
    price: column('Брони', 'Стоимость').id,
    deposit: column('Брони', 'Залог').id,
    lateFee: column('Брони', 'Штраф за просрочку').id,
    status: column('Брони', 'Статус').id,
    staff: column('Брони', 'Сотрудник').id,
    staffEmail: column('Брони', 'Почта сотрудника').id,
    issueCondition: column('Брони', 'Состояние при выдаче').id,
    issueDamages: column('Брони', 'Повреждения при выдаче').id,
    issuePhotos: column('Брони', 'Фото при выдаче').id,
    issueAt: column('Брони', 'Выдано в').id,
    returnCondition: column('Брони', 'Состояние при возврате').id,
    returnDamages: column('Брони', 'Повреждения при возврате').id,
    returnPhotos: column('Брони', 'Фото при возврате').id,
    returnAt: column('Брони', 'Возвращено в').id,
    depositReturned: column('Брони', 'Залог возвращён').id,
    depositWithheld: column('Брони', 'Залог удержан').id,
    depositReason: column('Брони', 'Причина удержания').id,
    createdAt: column('Брони', 'Создано').id,
    updatedAt: column('Брони', 'Обновлено').id,
  }
  const client = {
    name: column('Клиенты', 'Клиент').id,
    email: column('Клиенты', 'Почта').id,
    phone: column('Клиенты', 'Телефон').id,
    note: column('Клиенты', 'Заметка').id,
  }
  const person = {
    name: column('Сотрудники', 'Сотрудник').id,
    email: column('Сотрудники', 'Почта').id,
    phone: column('Сотрудники', 'Телефон').id,
    photo: column('Сотрудники', 'Фото').id,
    active: column('Сотрудники', 'Статус').id,
  }
  const item = {
    name: column('Предметы', 'Предмет').id,
    photo: column('Предметы', 'Фото').id,
    category: column('Предметы', 'Категория').id,
    serial: column('Предметы', 'Инв. номер').id,
    tariff: column('Предметы', 'Тариф').id,
    rate: column('Предметы', 'Ставка').id,
    deposit: column('Предметы', 'Залог').id,
    condition: column('Предметы', 'Состояние').id,
    status: column('Предметы', 'Статус').id,
  }
  const statuses = {
    request: choice('Брони', 'Статус', 'Заявка'),
    confirmed: choice('Брони', 'Статус', 'Подтверждена'),
    issued: choice('Брони', 'Статус', 'Выдано'),
    returned: choice('Брони', 'Статус', 'Возвращено'),
    overdue: choice('Брони', 'Статус', 'Просрочен возврат'),
    cancelled: choice('Брони', 'Статус', 'Отменена'),
  }
  const itemStatuses = {
    free: choice('Предметы', 'Статус', 'Свободен'),
    rented: choice('Предметы', 'Статус', 'В прокате'),
    service: choice('Предметы', 'Статус', 'На обслуживании'),
    writtenOff: choice('Предметы', 'Статус', 'Списан'),
  }
  const ids = {
    dashboardScreenId: newId('screen'),
    bookingsScreenId: newId('screen'),
    bookingScreenId: newId('screen'),
    itemsScreenId: newId('screen'),
    itemScreenId: newId('screen'),
    timelineScreenId: newId('screen'),
    clientsScreenId: newId('screen'),
    clientScreenId: newId('screen'),
    catalogScreenId: newId('screen'),
    clientListScreenId: newId('screen'),
    clientBookingScreenId: newId('screen'),
    createFormId: newId('component'),
    issueFormId: newId('component'),
    returnFormId: newId('component'),
    clientRequestFormId: newId('component'),
  }
  const nodes: AppV2Node[] = []
  const sources: AppV2['sources'] = []
  const workflows: AppV2['workflows'] = []
  const rules: AppV2['policy']['workflows'] = []
  const input = (fieldId: string, label: string, required = false, initialValue: Extract<AppV2Node, { type: 'input' }>['initialValue'] = null) => {
    const id = newId('component')
    nodes.push({ id, name: label, type: 'input', fieldId, label, required, readOnly: false, initialValue, visibleTo: null, visibleWhen: null })
    return id
  }
  const flow = (name: string, formId: string | null, rowTableId: string | null, screenTableId: string | null, steps: AppV2['workflows'][number]['steps'], allowed: AppV2Audience) => {
    const id = newId('action')
    workflows.push({ id, name, input: { rowTableId, formId, screenTableId }, steps })
    rules.push({ workflowId: id, audience: allowed })
    return id
  }
  const bind = (formId: string, fieldId: string) => ({ kind: 'form' as const, formId, fieldId })
  const literal = (value: string) => ({ kind: 'literal' as const, value })
  const user = (property: 'email' | 'name') => ({ kind: 'user' as const, property })

  const createInputs = [
    input(booking.client, 'Клиент', true),
    input(booking.items, 'Предметы', true),
    input(booking.from, 'С', true),
    input(booking.to, 'По', true),
    input(booking.price, 'Стоимость'),
    input(booking.deposit, 'Залог'),
  ]
  const issueInputs = [
    input(booking.issueCondition, 'Состояние при выдаче', true),
    input(booking.issueDamages, 'Повреждения при выдаче'),
    input(booking.issuePhotos, 'Фото при выдаче'),
  ]
  const returnInputs = [
    input(booking.returnCondition, 'Состояние при возврате', true),
    input(booking.returnDamages, 'Повреждения при возврате'),
    input(booking.returnPhotos, 'Фото при возврате'),
    input(booking.lateFee, 'Штраф за просрочку'),
    input(booking.depositReturned, 'Залог возвращён'),
    input(booking.depositWithheld, 'Залог удержан'),
    input(booking.depositReason, 'Причина удержания'),
  ]
  const clientRequestInputs = [
    input(booking.items, 'Предметы', true),
    input(booking.from, 'С', true),
    input(booking.to, 'По', true),
  ]

  nodes.push({
    id: ids.createFormId, name: 'Новая бронь', type: 'form', tableId: bookings.id, mode: 'create', childIds: createInputs,
    submitLabel: 'Создать бронь', visibleTo: desk, visibleWhen: null,
    events: { submit: flow('Создать бронь', ids.createFormId, null, null, [{
      id: newId('action'), type: 'create_row', tableId: bookings.id, values: {
        [booking.client]: bind(ids.createFormId, booking.client),
        [booking.items]: bind(ids.createFormId, booking.items),
        [booking.from]: bind(ids.createFormId, booking.from),
        [booking.to]: bind(ids.createFormId, booking.to),
        [booking.price]: bind(ids.createFormId, booking.price),
        [booking.deposit]: bind(ids.createFormId, booking.deposit),
        [booking.status]: literal(statuses.confirmed),
      },
    }], desk) },
  })
  nodes.push({
    id: ids.issueFormId, name: 'Акт выдачи', type: 'form', tableId: bookings.id, mode: 'edit', childIds: issueInputs,
    submitLabel: 'Выдать', visibleTo: desk, visibleWhen: null,
    events: { submit: flow('Акт выдачи', ids.issueFormId, bookings.id, bookings.id, [{
      id: newId('action'), type: 'update_row', tableId: bookings.id, target: { kind: 'current' }, values: {
        [booking.issueCondition]: bind(ids.issueFormId, booking.issueCondition),
        [booking.issueDamages]: bind(ids.issueFormId, booking.issueDamages),
        [booking.issuePhotos]: bind(ids.issueFormId, booking.issuePhotos),
        [booking.status]: literal(statuses.issued),
      },
    }], desk) },
  })
  nodes.push({
    id: ids.returnFormId, name: 'Акт возврата', type: 'form', tableId: bookings.id, mode: 'edit', childIds: returnInputs,
    submitLabel: 'Принять возврат', visibleTo: desk, visibleWhen: null,
    events: { submit: flow('Акт возврата', ids.returnFormId, bookings.id, bookings.id, [{
      id: newId('action'), type: 'update_row', tableId: bookings.id, target: { kind: 'current' }, values: {
        [booking.returnCondition]: bind(ids.returnFormId, booking.returnCondition),
        [booking.returnDamages]: bind(ids.returnFormId, booking.returnDamages),
        [booking.returnPhotos]: bind(ids.returnFormId, booking.returnPhotos),
        [booking.lateFee]: bind(ids.returnFormId, booking.lateFee),
        [booking.depositReturned]: bind(ids.returnFormId, booking.depositReturned),
        [booking.depositWithheld]: bind(ids.returnFormId, booking.depositWithheld),
        [booking.depositReason]: bind(ids.returnFormId, booking.depositReason),
        [booking.status]: literal(statuses.returned),
      },
    }], desk) },
  })
  nodes.push({
    id: ids.clientRequestFormId, name: 'Заявка на прокат', type: 'form', tableId: bookings.id, mode: 'create', childIds: clientRequestInputs,
    submitLabel: 'Отправить заявку', visibleTo: clientRole, visibleWhen: null,
    events: { submit: flow('Заявка клиента', ids.clientRequestFormId, null, null, [{
      id: newId('action'), type: 'create_row', tableId: bookings.id, values: {
        [booking.items]: bind(ids.clientRequestFormId, booking.items),
        [booking.from]: bind(ids.clientRequestFormId, booking.from),
        [booking.to]: bind(ids.clientRequestFormId, booking.to),
        [booking.clientName]: user('name'),
        [booking.clientEmail]: user('email'),
        [booking.status]: literal(statuses.request),
      },
    }], clientRole) },
  })

  const openBooking = flow('Открыть бронь', null, bookings.id, null, [{ id: newId('action'), type: 'open_screen', screenId: ids.bookingScreenId, record: { kind: 'current' } }], desk)
  const openClientBooking = flow('Открыть свою бронь', null, bookings.id, null, [{ id: newId('action'), type: 'open_screen', screenId: ids.clientBookingScreenId, record: { kind: 'current' } }], clientRole)
  const openItem = flow('Открыть предмет', null, items.id, null, [{ id: newId('action'), type: 'open_screen', screenId: ids.itemScreenId, record: { kind: 'current' } }], desk)
  const openClient = flow('Открыть клиента', null, clients.id, null, [{ id: newId('action'), type: 'open_screen', screenId: ids.clientScreenId, record: { kind: 'current' } }], desk)
  const openCatalogItem = flow('Открыть из каталога', null, items.id, null, [{ id: newId('action'), type: 'open_screen', screenId: ids.itemScreenId, record: { kind: 'current' } }], { kind: 'roles', roleIds: ['owner', 'staff', 'client'] })

  const collection = (name: string, tableId: string, titleFieldId: string, itemPress: string | null, sortFieldId: string | null, filter: AppV2['sources'][number]['filter'] = null, screenTableId: string | null = null) => {
    const id = newId('component'), sourceId = newId('component')
    sources.push({ id: sourceId, tableId, screenTableId, viewId: null, filter, sorts: sortFieldId ? [{ fieldId: sortFieldId, direction: 'desc' }] : [], searchFieldIds: [titleFieldId], pageSize: 100 })
    nodes.push({ id, name, type: 'collection', sourceId, layout: 'list', titleFieldId, subtitleFieldId: null, itemIds: [], visibleTo: null, visibleWhen: null, events: { itemPress } })
    return id
  }

  const listBookings = collection('Брони', bookings.id, booking.title, openBooking, booking.updatedAt)
  const listItems = collection('Предметы', items.id, item.name, openItem, item.name)
  const listClients = collection('Клиенты', clients.id, client.name, openClient, client.name)
  const timelineBookings = collection('Лента броней', bookings.id, booking.title, openBooking, booking.from)
  const dashBookings = collection('Брони главной', bookings.id, booking.title, openBooking, booking.updatedAt)
  const dashItems = collection('Предметы главной', items.id, item.name, openItem, item.name)
  const bookingItems = collection('Предметы брони', items.id, item.name, null, item.name)
  const bookingStaff = collection('Сотрудники брони', staffTable.id, person.name, null, person.name)
  const bookingClients = collection('Клиенты брони', clients.id, client.name, null, client.name)
  const itemBookings = collection('Брони предмета', bookings.id, booking.title, openBooking, booking.updatedAt)
  const clientBookings = collection('Брони клиента', bookings.id, booking.title, openBooking, booking.updatedAt)
  const catalogItems = collection('Каталог', items.id, item.name, openCatalogItem, item.name)
  const myBookings = collection('Мои брони', bookings.id, booking.title, openClientBooking, booking.updatedAt)
  const clientBookingItems = collection('Предметы моей брони', items.id, item.name, null, item.name)

  const screen = (id: string, name: string, menuLabel: string | undefined, icon: string, audience: AppV2Audience, contextTableId: string | null, rootIds: string[], navigation: boolean) =>
    ({ id, name, ...(menuLabel ? { menuLabel } : {}), icon, audience, contextTableId, rootIds, navigation, events: { enter: null } })

  const columnsOf = (tableId: string) => built.fields.filter(item => item.tableId === tableId).map(item => item.id)
  const editable = (tableId: string) => built.fields.filter(item => item.tableId === tableId && writable.has(item.type)).map(item => item.id)
  const grant = (audience: AppV2Audience, value: Omit<AppV2Grant, 'audience'>): AppV2Grant => ({ audience, ...value })
  const owned = (fieldId: string) => ({ kind: 'owned' as const, fieldId, property: 'email' as const })
  const all = { kind: 'all' as const }

  const clientBookingRead = [
    booking.number, booking.title, booking.client, booking.clientName, booking.clientEmail, booking.items,
    booking.from, booking.to, booking.price, booking.deposit, booking.lateFee, booking.status,
    booking.issueCondition, booking.issueDamages, booking.issuePhotos, booking.issueAt,
    booking.returnCondition, booking.returnDamages, booking.returnPhotos, booking.returnAt,
    booking.depositReturned, booking.depositWithheld, booking.depositReason,
    booking.createdAt, booking.updatedAt,
  ]
  const clientItemRead = [
    item.name, item.photo, item.category, item.serial, item.tariff, item.rate, item.deposit, item.condition, item.status,
  ]
  const deskBookingUpdate = [
    booking.title, booking.client, booking.clientName, booking.clientEmail, booking.items,
    booking.from, booking.to, booking.price, booking.deposit, booking.lateFee, booking.status,
    booking.staff, booking.staffEmail,
    booking.issueCondition, booking.issueDamages, booking.issuePhotos, booking.issueAt,
    booking.returnCondition, booking.returnDamages, booking.returnPhotos, booking.returnAt,
    booking.depositReturned, booking.depositWithheld, booking.depositReason, booking.updatedAt,
  ]

  return {
    formatVersion: 2, id: meta.id, workspaceId: meta.workspaceId, name: meta.name, slug: meta.slug, purpose: 'business',
    communications: { enabled: true },
    appearance: { navigation: 'tabs', icon: 'box', density: 'regular', corners: 'rounded' },
    theme: { accent: 'green', scheme: 'light', logoKey: null, iconKey: null },
    roles: [{ id: 'owner', name: 'Руководитель' }, { id: 'staff', name: 'Сотрудник' }, { id: 'client', name: 'Клиент' }],
    authentication: { mode: 'verified_email', defaultRoleId: 'client', members: [{ email: meta.email.trim().toLowerCase(), roleIds: ['owner'], company: '' }] },
    homeScreenId: ids.dashboardScreenId,
    prokat: {
      bookingsTableId: bookings.id, clientsTableId: clients.id, staffTableId: staffTable.id, itemsTableId: items.id,
      ...ids, booking, client, staff: person, item, statuses, itemStatuses,
      activeChoiceId: choice('Сотрудники', 'Статус', 'Активен'),
      inactiveChoiceId: choice('Сотрудники', 'Статус', 'Неактивен'),
    },
    screens: [
      screen(ids.dashboardScreenId, 'Главная', 'Главная', 'home', desk, null, [dashBookings, dashItems], true),
      screen(ids.bookingsScreenId, 'Брони', 'Брони', 'calendar', desk, null, [listBookings, ids.createFormId], true),
      screen(ids.bookingScreenId, 'Бронь', undefined, 'calendar', desk, bookings.id, [bookingItems, bookingStaff, bookingClients, ids.issueFormId, ids.returnFormId], false),
      screen(ids.itemsScreenId, 'Предметы', 'Предметы', 'box', desk, null, [listItems], true),
      screen(ids.itemScreenId, 'Предмет', undefined, 'box', { kind: 'roles', roleIds: ['owner', 'staff', 'client'] }, items.id, [itemBookings], false),
      screen(ids.timelineScreenId, 'Лента', 'Лента', 'list', desk, null, [timelineBookings], true),
      screen(ids.clientsScreenId, 'Клиенты', 'Клиенты', 'users', desk, null, [listClients], true),
      screen(ids.clientScreenId, 'Клиент', undefined, 'users', desk, clients.id, [clientBookings], false),
      screen(ids.catalogScreenId, 'Каталог', 'Каталог', 'tag', { kind: 'roles', roleIds: ['owner', 'staff', 'client'] }, null, [catalogItems, ids.clientRequestFormId], true),
      screen(ids.clientListScreenId, 'Мои брони', 'Кабинет', 'clipboard', { kind: 'roles', roleIds: ['owner', 'staff', 'client'] }, null, [myBookings], true),
      screen(ids.clientBookingScreenId, 'Моя бронь', undefined, 'calendar', clientRole, bookings.id, [clientBookingItems], false),
    ],
    nodes, sources, workflows,
    policy: {
      workflows: rules,
      tables: [
        { tableId: bookings.id, grants: [
          grant(owner, { read: { fieldIds: columnsOf(bookings.id), rows: all }, create: { fieldIds: editable(bookings.id) }, update: { fieldIds: editable(bookings.id), rows: all } }),
          grant(staff, { read: { fieldIds: columnsOf(bookings.id), rows: all }, create: { fieldIds: editable(bookings.id) }, update: { fieldIds: deskBookingUpdate, rows: all } }),
          grant(clientRole, {
            read: { fieldIds: clientBookingRead, rows: owned(booking.clientEmail) },
            create: {
              fieldIds: [
                booking.number, booking.title, booking.client, booking.clientName, booking.items,
                booking.from, booking.to, booking.price, booking.deposit, booking.lateFee, booking.status,
                booking.issuePhotos, booking.returnPhotos, booking.createdAt, booking.updatedAt,
              ],
              owner: { fieldId: booking.clientEmail, property: 'email' },
            },
            update: { fieldIds: [booking.status, booking.updatedAt], rows: owned(booking.clientEmail) },
          }),
        ] },
        { tableId: items.id, grants: [
          grant(owner, { read: { fieldIds: columnsOf(items.id), rows: all }, create: { fieldIds: editable(items.id) }, update: { fieldIds: editable(items.id), rows: all } }),
          grant(staff, { read: { fieldIds: columnsOf(items.id), rows: all }, update: { fieldIds: editable(items.id), rows: all } }),
          grant(clientRole, { read: { fieldIds: clientItemRead, rows: all } }),
        ] },
        { tableId: clients.id, grants: [
          grant(owner, { read: { fieldIds: columnsOf(clients.id), rows: all }, create: { fieldIds: editable(clients.id) }, update: { fieldIds: editable(clients.id), rows: all } }),
          grant(staff, { read: { fieldIds: columnsOf(clients.id), rows: all }, update: { fieldIds: [client.note], rows: all } }),
          grant(clientRole, {
            read: { fieldIds: [client.name, client.phone, client.email], rows: owned(client.email) },
            create: { fieldIds: [client.name, client.phone], owner: { fieldId: client.email, property: 'email' } },
          }),
        ] },
        { tableId: staffTable.id, grants: [
          grant(owner, { read: { fieldIds: columnsOf(staffTable.id), rows: all }, create: { fieldIds: editable(staffTable.id) }, update: { fieldIds: editable(staffTable.id), rows: all } }),
          grant(staff, { read: { fieldIds: columnsOf(staffTable.id), rows: all } }),
          grant(clientRole, { read: { fieldIds: [person.name, person.photo], rows: all } }),
        ] },
      ],
    },
  }
}
