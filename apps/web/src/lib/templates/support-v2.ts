import { newId } from '@tableapp/schema'
import type { AppV2, AppV2Audience, AppV2Grant, AppV2Node } from '@tableapp/schema/app-v2'
import type { BuiltTemplate } from './build'

export const isSupportTemplate = (id: string) => id === 'podderzhka'

const writable = new Set(['text', 'long_text', 'number', 'email', 'phone', 'url', 'date', 'datetime', 'checkbox', 'single_select', 'multi_select', 'relation', 'image', 'attachment'])
const owner: AppV2Audience = { kind: 'roles', roleIds: ['owner'] }
const staff: AppV2Audience = { kind: 'roles', roleIds: ['staff'] }
const desk: AppV2Audience = { kind: 'roles', roleIds: ['owner', 'staff'] }
const clientRole: AppV2Audience = { kind: 'roles', roleIds: ['client'] }

/** Client cabinet and operator queue on the same App V2 kit as projects and field visits. */
export function buildSupportV2App(built: BuiltTemplate, meta: { id: string; workspaceId: string; name: string; slug: string; email: string }): AppV2 {
  const table = (name: string) => {
    const found = built.tables.find(item => item.name === name)
    if (!found) throw new Error(`В шаблоне обращений нет таблицы «${name}»`)
    return found
  }
  const column = (tableName: string, fieldName: string) => {
    const found = built.fields.find(item => item.tableId === table(tableName).id && item.name === fieldName)
    if (!found) throw new Error(`В шаблоне обращений нет поля «${tableName} · ${fieldName}»`)
    return found
  }
  const choice = (tableName: string, fieldName: string, name: string) => {
    const match = (column(tableName, fieldName).options as { choices?: { id: string; name: string }[] }).choices?.find(item => item.name === name)
    if (!match) throw new Error(`В поле «${fieldName}» нет варианта «${name}»`)
    return match.id
  }
  const tickets = table('Обращения'), clients = table('Клиенты'), operators = table('Операторы')
  const categories = table('Категории'), replies = table('Ответы'), notes = table('Заметки')
  const ticket = {
    number: column('Обращения', 'Номер').id,
    subject: column('Обращения', 'Тема').id,
    description: column('Обращения', 'Описание').id,
    client: column('Обращения', 'Клиент').id,
    clientName: column('Обращения', 'Имя клиента').id,
    clientEmail: column('Обращения', 'Почта клиента').id,
    assignee: column('Обращения', 'Ответственный').id,
    assigneeEmail: column('Обращения', 'Почта ответственного').id,
    priority: column('Обращения', 'Приоритет').id,
    category: column('Обращения', 'Категория').id,
    status: column('Обращения', 'Статус').id,
    deadline: column('Обращения', 'Срок').id,
    createdAt: column('Обращения', 'Создано').id,
    updatedAt: column('Обращения', 'Обновлено').id,
  }
  const client = {
    name: column('Клиенты', 'Клиент').id,
    email: column('Клиенты', 'Почта').id,
    phone: column('Клиенты', 'Телефон').id,
    company: column('Клиенты', 'Организация').id,
    note: column('Клиенты', 'Заметка').id,
  }
  const operator = {
    name: column('Операторы', 'Оператор').id,
    email: column('Операторы', 'Почта').id,
    phone: column('Операторы', 'Телефон').id,
    role: column('Операторы', 'Роль в службе').id,
    active: column('Операторы', 'Статус').id,
  }
  const category = {
    name: column('Категории', 'Категория').id,
    description: column('Категории', 'Пояснение').id,
    active: column('Категории', 'Доступна').id,
  }
  const reply = {
    text: column('Ответы', 'Ответ').id,
    ticket: column('Ответы', 'Обращение').id,
    at: column('Ответы', 'Когда').id,
    author: column('Ответы', 'Автор').id,
    authorEmail: column('Ответы', 'Почта автора').id,
    clientEmail: column('Ответы', 'Почта клиента').id,
  }
  const note = {
    text: column('Заметки', 'Заметка').id,
    ticket: column('Заметки', 'Обращение').id,
    at: column('Заметки', 'Когда').id,
    author: column('Заметки', 'Автор').id,
    authorEmail: column('Заметки', 'Почта автора').id,
  }
  const statuses = {
    fresh: choice('Обращения', 'Статус', 'Новое'),
    progress: choice('Обращения', 'Статус', 'В работе'),
    waiting: choice('Обращения', 'Статус', 'Ждём клиента'),
    resolved: choice('Обращения', 'Статус', 'Решено'),
    closed: choice('Обращения', 'Статус', 'Закрыто'),
  }
  const priorities = {
    low: choice('Обращения', 'Приоритет', 'Низкий'),
    normal: choice('Обращения', 'Приоритет', 'Обычный'),
    high: choice('Обращения', 'Приоритет', 'Высокий'),
    urgent: choice('Обращения', 'Приоритет', 'Срочный'),
  }
  const ids = {
    queueScreenId: newId('screen'), ticketScreenId: newId('screen'), clientListScreenId: newId('screen'),
    clientTicketScreenId: newId('screen'), clientsScreenId: newId('screen'), settingsScreenId: newId('screen'),
    createFormId: newId('component'), operatorCreateFormId: newId('component'), replyFormId: newId('component'),
    noteFormId: newId('component'), assignFormId: newId('component'), categoryFormId: newId('component'),
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
  const byTicket = (fieldId: string) => ({ op: 'includes' as const, left: { kind: 'row' as const, fieldId }, right: { kind: 'screen_row_id' as const } })
  const createInputs = [input(ticket.subject, 'Тема', true), input(ticket.description, 'Описание', true), input(ticket.category, 'Категория', true)]
  const operatorInputs = [input(ticket.client, 'Клиент', true), input(ticket.subject, 'Тема', true), input(ticket.description, 'Описание', true), input(ticket.category, 'Категория', true), input(ticket.priority, 'Приоритет', false, { kind: 'literal', value: priorities.normal })]
  const replyInputs = [input(reply.text, 'Ответ', true)]
  const noteInputs = [input(note.text, 'Заметка', true)]
  const assignInputs = [input(ticket.assignee, 'Ответственный'), input(ticket.priority, 'Приоритет'), input(ticket.category, 'Категория'), input(ticket.deadline, 'Срок')]
  const categoryInputs = [input(category.name, 'Категория', true), input(category.description, 'Пояснение'), input(category.active, 'Доступна')]
  nodes.push({
    id: ids.createFormId, name: 'Новое обращение', type: 'form', tableId: tickets.id, mode: 'create', childIds: createInputs,
    submitLabel: 'Отправить обращение', visibleTo: clientRole, visibleWhen: null,
    events: { submit: flow('Создать обращение', ids.createFormId, null, null, [{
      id: newId('action'), type: 'create_row', tableId: tickets.id, values: {
        [ticket.subject]: bind(ids.createFormId, ticket.subject),
        [ticket.description]: bind(ids.createFormId, ticket.description),
        [ticket.category]: bind(ids.createFormId, ticket.category),
        [ticket.clientName]: user('name'),
        [ticket.status]: literal(statuses.fresh),
        [ticket.priority]: literal(priorities.normal),
      },
    }], clientRole) },
  })
  nodes.push({
    id: ids.operatorCreateFormId, name: 'Обращение от оператора', type: 'form', tableId: tickets.id, mode: 'create', childIds: operatorInputs,
    submitLabel: 'Создать обращение', visibleTo: desk, visibleWhen: null,
    events: { submit: flow('Создать обращение оператором', ids.operatorCreateFormId, null, null, [{
      id: newId('action'), type: 'create_row', tableId: tickets.id, values: {
        [ticket.client]: bind(ids.operatorCreateFormId, ticket.client),
        [ticket.subject]: bind(ids.operatorCreateFormId, ticket.subject),
        [ticket.description]: bind(ids.operatorCreateFormId, ticket.description),
        [ticket.category]: bind(ids.operatorCreateFormId, ticket.category),
        [ticket.priority]: bind(ids.operatorCreateFormId, ticket.priority),
        [ticket.status]: literal(statuses.fresh),
      },
    }], desk) },
  })
  nodes.push({
    id: ids.replyFormId, name: 'Ответ', type: 'form', tableId: replies.id, mode: 'create', childIds: replyInputs,
    submitLabel: 'Ответить', visibleTo: desk, visibleWhen: null,
    events: { submit: flow('Ответить клиенту', ids.replyFormId, tickets.id, tickets.id, [{
      id: newId('action'), type: 'create_row', tableId: replies.id, values: {
        [reply.text]: bind(ids.replyFormId, reply.text),
        [reply.ticket]: { kind: 'record_ids', tableId: tickets.id, record: { kind: 'screen' } },
        [reply.author]: user('name'),
        [reply.authorEmail]: user('email'),
      },
    }], desk) },
  })
  nodes.push({
    id: ids.noteFormId, name: 'Внутренняя заметка', type: 'form', tableId: notes.id, mode: 'create', childIds: noteInputs,
    submitLabel: 'Сохранить заметку', visibleTo: desk, visibleWhen: null,
    events: { submit: flow('Внутренняя заметка', ids.noteFormId, tickets.id, tickets.id, [{
      id: newId('action'), type: 'create_row', tableId: notes.id, values: {
        [note.text]: bind(ids.noteFormId, note.text),
        [note.ticket]: { kind: 'record_ids', tableId: tickets.id, record: { kind: 'screen' } },
        [note.author]: user('name'),
        [note.authorEmail]: user('email'),
      },
    }], desk) },
  })
  nodes.push({
    id: ids.assignFormId, name: 'Назначение', type: 'form', tableId: tickets.id, mode: 'edit', childIds: assignInputs,
    submitLabel: 'Сохранить', visibleTo: desk, visibleWhen: null,
    events: { submit: flow('Назначить обращение', ids.assignFormId, tickets.id, tickets.id, [{
      id: newId('action'), type: 'update_row', tableId: tickets.id, target: { kind: 'current' }, values: {
        [ticket.assignee]: bind(ids.assignFormId, ticket.assignee),
        [ticket.priority]: bind(ids.assignFormId, ticket.priority),
        [ticket.category]: bind(ids.assignFormId, ticket.category),
        [ticket.deadline]: bind(ids.assignFormId, ticket.deadline),
      },
    }], desk) },
  })
  nodes.push({
    id: ids.categoryFormId, name: 'Категория', type: 'form', tableId: categories.id, mode: 'create', childIds: categoryInputs,
    submitLabel: 'Добавить категорию', visibleTo: owner, visibleWhen: null,
    events: { submit: flow('Добавить категорию', ids.categoryFormId, null, null, [{
      id: newId('action'), type: 'create_row', tableId: categories.id, values: {
        [category.name]: bind(ids.categoryFormId, category.name),
        [category.description]: bind(ids.categoryFormId, category.description),
        [category.active]: bind(ids.categoryFormId, category.active),
      },
    }], owner) },
  })
  const openTicket = flow('Открыть обращение', null, tickets.id, null, [{ id: newId('action'), type: 'open_screen', screenId: ids.ticketScreenId, record: { kind: 'current' } }], desk)
  const openClientTicket = flow('Открыть своё обращение', null, tickets.id, null, [{ id: newId('action'), type: 'open_screen', screenId: ids.clientTicketScreenId, record: { kind: 'current' } }], clientRole)
  const collection = (name: string, tableId: string, titleFieldId: string, itemPress: string | null, sortFieldId: string | null, filter: AppV2['sources'][number]['filter'] = null, screenTableId: string | null = null) => {
    const id = newId('component'), sourceId = newId('component')
    sources.push({ id: sourceId, tableId, screenTableId, viewId: null, filter, sorts: sortFieldId ? [{ fieldId: sortFieldId, direction: 'desc' }] : [], searchFieldIds: [titleFieldId], pageSize: 100 })
    nodes.push({ id, name, type: 'collection', sourceId, layout: 'list', titleFieldId, subtitleFieldId: null, itemIds: [], visibleTo: null, visibleWhen: null, events: { itemPress } })
    return id
  }
  const queueTickets = collection('Очередь', tickets.id, ticket.subject, openTicket, ticket.updatedAt)
  const queueClients = collection('Клиенты очереди', clients.id, client.name, null, client.name)
  const queueOperators = collection('Операторы очереди', operators.id, operator.name, null, operator.name)
  const queueCategories = collection('Категории очереди', categories.id, category.name, null, category.name)
  const ticketReplies = collection('Ответы обращения', replies.id, reply.text, null, reply.at, byTicket(reply.ticket), tickets.id)
  const ticketNotes = collection('Заметки обращения', notes.id, note.text, null, note.at, byTicket(note.ticket), tickets.id)
  const ticketOperators = collection('Операторы карточки', operators.id, operator.name, null, operator.name)
  const ticketCategories = collection('Категории карточки', categories.id, category.name, null, category.name)
  const ticketClients = collection('Клиенты карточки', clients.id, client.name, null, client.name)
  const clientTickets = collection('Мои обращения', tickets.id, ticket.subject, openClientTicket, ticket.updatedAt)
  const clientReplies = collection('Ответы клиента', replies.id, reply.text, null, reply.at, byTicket(reply.ticket), tickets.id)
  const clientOperators = collection('Имена операторов', operators.id, operator.name, null, operator.name)
  const clientCategories = collection('Категории клиента', categories.id, category.name, null, category.name)
  const clientTicketCategories = collection('Категории карточки клиента', categories.id, category.name, null, category.name)
  const directory = collection('Справочник клиентов', clients.id, client.name, null, client.name)
  const settingsCategories = collection('Категории настроек', categories.id, category.name, null, category.name)
  const settingsOperators = collection('Операторы настроек', operators.id, operator.name, null, operator.name)
  const screen = (id: string, name: string, menuLabel: string | undefined, icon: string, audience: AppV2Audience, contextTableId: string | null, rootIds: string[], navigation: boolean) =>
    ({ id, name, ...(menuLabel ? { menuLabel } : {}), icon, audience, contextTableId, rootIds, navigation, events: { enter: null } })
  const columnsOf = (tableId: string) => built.fields.filter(item => item.tableId === tableId).map(item => item.id)
  const editable = (tableId: string) => built.fields.filter(item => item.tableId === tableId && writable.has(item.type)).map(item => item.id)
  const grant = (audience: AppV2Audience, value: Omit<AppV2Grant, 'audience'>): AppV2Grant => ({ audience, ...value })
  const owned = (fieldId: string) => ({ kind: 'owned' as const, fieldId, property: 'email' as const })
  const all = { kind: 'all' as const }
  const clientTicketRead = [ticket.number, ticket.subject, ticket.description, ticket.client, ticket.clientName, ticket.clientEmail, ticket.status, ticket.priority, ticket.category, ticket.assignee, ticket.deadline, ticket.createdAt, ticket.updatedAt]
  const clientTicketCreate = [ticket.number, ticket.subject, ticket.description, ticket.category, ticket.clientName, ticket.status, ticket.priority, ticket.createdAt, ticket.updatedAt]
  const clientTicketUpdate = [ticket.status, ticket.updatedAt]
  const deskTicketUpdate = [ticket.assignee, ticket.assigneeEmail, ticket.priority, ticket.category, ticket.status, ticket.deadline, ticket.updatedAt, ticket.subject, ticket.description, ticket.client, ticket.clientName, ticket.clientEmail]
  return {
    formatVersion: 2, id: meta.id, workspaceId: meta.workspaceId, name: meta.name, slug: meta.slug, purpose: 'business',
    appearance: { navigation: 'tabs', icon: 'clipboard', density: 'regular', corners: 'rounded' },
    theme: { accent: 'green', scheme: 'light', logoKey: null, iconKey: null },
    roles: [{ id: 'owner', name: 'Руководитель' }, { id: 'staff', name: 'Оператор' }, { id: 'client', name: 'Клиент' }],
    authentication: { mode: 'verified_email', defaultRoleId: 'client', members: [{ email: meta.email.trim().toLowerCase(), roleIds: ['owner'], company: '' }] },
    homeScreenId: ids.queueScreenId,
    support: {
      ticketsTableId: tickets.id, clientsTableId: clients.id, operatorsTableId: operators.id, categoriesTableId: categories.id,
      repliesTableId: replies.id, notesTableId: notes.id, ...ids, ticket, client, operator, category, reply, note,
      statuses, priorities,
      activeChoiceId: choice('Операторы', 'Статус', 'Активен'),
      inactiveChoiceId: choice('Операторы', 'Статус', 'Неактивен'),
    },
    screens: [
      screen(ids.queueScreenId, 'Очередь', 'Очередь', 'clipboard', desk, null, [queueTickets, queueClients, queueOperators, queueCategories, ids.operatorCreateFormId], true),
      screen(ids.ticketScreenId, 'Обращение', undefined, 'clipboard', desk, tickets.id, [ticketReplies, ticketNotes, ticketOperators, ticketCategories, ticketClients, ids.replyFormId, ids.noteFormId, ids.assignFormId], false),
      screen(ids.clientsScreenId, 'Клиенты', 'Клиенты', 'users', desk, null, [directory], true),
      screen(ids.settingsScreenId, 'Настройки', 'Настройки', 'settings', owner, null, [settingsCategories, settingsOperators, ids.categoryFormId], true),
      screen(ids.clientListScreenId, 'Мои обращения', 'Обращения', 'clipboard', clientRole, null, [clientTickets, clientCategories, ids.createFormId], true),
      screen(ids.clientTicketScreenId, 'Моё обращение', undefined, 'clipboard', clientRole, tickets.id, [clientReplies, clientOperators, clientTicketCategories], false),
    ],
    nodes, sources, workflows,
    policy: {
      workflows: rules,
      tables: [
        { tableId: tickets.id, grants: [
          grant(owner, { read: { fieldIds: columnsOf(tickets.id), rows: all }, create: { fieldIds: editable(tickets.id) }, update: { fieldIds: editable(tickets.id), rows: all } }),
          grant(staff, { read: { fieldIds: columnsOf(tickets.id), rows: all }, create: { fieldIds: editable(tickets.id) }, update: { fieldIds: deskTicketUpdate, rows: all } }),
          grant(clientRole, { read: { fieldIds: clientTicketRead, rows: owned(ticket.clientEmail) }, create: { fieldIds: clientTicketCreate, owner: { fieldId: ticket.clientEmail, property: 'email' } }, update: { fieldIds: clientTicketUpdate, rows: owned(ticket.clientEmail) } }),
        ] },
        { tableId: replies.id, grants: [
          grant(owner, { read: { fieldIds: columnsOf(replies.id), rows: all }, create: { fieldIds: editable(replies.id) } }),
          grant(staff, { read: { fieldIds: columnsOf(replies.id), rows: all }, create: { fieldIds: [reply.text, reply.ticket, reply.at, reply.author, reply.authorEmail, reply.clientEmail] } }),
          grant(clientRole, { read: { fieldIds: [reply.text, reply.ticket, reply.at, reply.author], rows: owned(reply.clientEmail) }, create: { fieldIds: [reply.text, reply.ticket, reply.at, reply.author, reply.authorEmail], owner: { fieldId: reply.clientEmail, property: 'email' } } }),
        ] },
        { tableId: notes.id, grants: [
          grant(owner, { read: { fieldIds: columnsOf(notes.id), rows: all }, create: { fieldIds: editable(notes.id) } }),
          grant(staff, { read: { fieldIds: columnsOf(notes.id), rows: all }, create: { fieldIds: [note.text, note.ticket, note.at, note.author, note.authorEmail] } }),
        ] },
        { tableId: clients.id, grants: [
          grant(owner, { read: { fieldIds: columnsOf(clients.id), rows: all }, create: { fieldIds: editable(clients.id) }, update: { fieldIds: editable(clients.id), rows: all } }),
          grant(staff, { read: { fieldIds: columnsOf(clients.id), rows: all } }),
          grant(clientRole, { read: { fieldIds: [client.name, client.company], rows: owned(client.email) } }),
        ] },
        { tableId: operators.id, grants: [
          grant(owner, { read: { fieldIds: columnsOf(operators.id), rows: all }, create: { fieldIds: editable(operators.id) }, update: { fieldIds: editable(operators.id), rows: all } }),
          grant(staff, { read: { fieldIds: columnsOf(operators.id), rows: all } }),
          grant(clientRole, { read: { fieldIds: [operator.name, operator.role], rows: all } }),
        ] },
        { tableId: categories.id, grants: [
          grant(owner, { read: { fieldIds: columnsOf(categories.id), rows: all }, create: { fieldIds: editable(categories.id) }, update: { fieldIds: editable(categories.id), rows: all } }),
          grant(staff, { read: { fieldIds: columnsOf(categories.id), rows: all } }),
          grant(clientRole, { read: { fieldIds: [category.name, category.description, category.active], rows: all } }),
        ] },
      ],
    },
  }
}
