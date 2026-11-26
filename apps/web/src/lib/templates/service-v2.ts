import { newId } from '@tableapp/schema'
import type { AppV2, AppV2Audience, AppV2Grant, AppV2Node } from '@tableapp/schema/app-v2'
import type { BuiltTemplate } from './build'

export const isServiceTemplate = (id: string) => id === 'service'

const writable = new Set(['text', 'long_text', 'number', 'email', 'phone', 'url', 'date', 'datetime', 'checkbox', 'single_select', 'multi_select', 'relation', 'image', 'attachment'])
const owner: AppV2Audience = { kind: 'roles', roleIds: ['owner'] }
const staff: AppV2Audience = { kind: 'roles', roleIds: ['staff'] }
const desk: AppV2Audience = { kind: 'roles', roleIds: ['owner', 'staff'] }
const clientRole: AppV2Audience = { kind: 'roles', roleIds: ['client'] }

/** Repair shop cabinet and Переписка on the same App V2 kit as support. */
export function buildServiceV2App(built: BuiltTemplate, meta: { id: string; workspaceId: string; name: string; slug: string; email: string }): AppV2 {
  const table = (name: string) => {
    const found = built.tables.find(item => item.name === name)
    if (!found) throw new Error(`В шаблоне сервиса нет таблицы «${name}»`)
    return found
  }
  const column = (tableName: string, fieldName: string) => {
    const found = built.fields.find(item => item.tableId === table(tableName).id && item.name === fieldName)
    if (!found) throw new Error(`В шаблоне сервиса нет поля «${tableName} · ${fieldName}»`)
    return found
  }
  const choice = (tableName: string, fieldName: string, name: string) => {
    const match = (column(tableName, fieldName).options as { choices?: { id: string; name: string }[] }).choices?.find(item => item.name === name)
    if (!match) throw new Error(`В поле «${fieldName}» нет варианта «${name}»`)
    return match.id
  }
  const repairs = table('Ремонты'), clients = table('Клиенты'), masters = table('Мастера')
  const replies = table('Ответы'), notes = table('Заметки')
  const optionalColumn = (tableName: string, fieldName: string) => {
    try { return column(tableName, fieldName).id } catch { return undefined }
  }
  const repair = {
    number: column('Ремонты', 'Номер').id,
    device: column('Ремонты', 'Устройство').id,
    serial: column('Ремонты', 'Серийный / IMEI').id,
    problem: column('Ремонты', 'Неисправность со слов клиента').id,
    diagnosis: column('Ремонты', 'Диагноз').id,
    work: column('Ремонты', 'Работа').id,
    parts: column('Ремонты', 'Запчасти').id,
    cost: column('Ремонты', 'Стоимость').id,
    client: column('Ремонты', 'Клиент').id,
    clientName: column('Ремонты', 'Имя клиента').id,
    clientEmail: column('Ремонты', 'Почта клиента').id,
    master: column('Ремонты', 'Мастер').id,
    masterEmail: column('Ремонты', 'Почта мастера').id,
    status: column('Ремонты', 'Статус').id,
    deadline: column('Ремонты', 'Срок').id,
    createdAt: column('Ремонты', 'Создано').id,
    updatedAt: column('Ремонты', 'Обновлено').id,
    acceptedAt: column('Ремонты', 'Принято').id,
    lines: optionalColumn('Ремонты', 'Смета'),
    approval: optionalColumn('Ремонты', 'Согласование'),
    partsEta: optionalColumn('Ремонты', 'ETA запчасти'),
  }
  const client = {
    name: column('Клиенты', 'Клиент').id,
    email: column('Клиенты', 'Почта').id,
    phone: column('Клиенты', 'Телефон').id,
    note: column('Клиенты', 'Заметка').id,
  }
  const master = {
    name: column('Мастера', 'Мастер').id,
    email: column('Мастера', 'Почта').id,
    phone: column('Мастера', 'Телефон').id,
    photo: column('Мастера', 'Фото').id,
    active: column('Мастера', 'Статус').id,
  }
  const reply = {
    text: column('Ответы', 'Ответ').id,
    repair: column('Ответы', 'Ремонт').id,
    at: column('Ответы', 'Когда').id,
    author: column('Ответы', 'Автор').id,
    authorEmail: column('Ответы', 'Почта автора').id,
    clientEmail: column('Ответы', 'Почта клиента').id,
  }
  const note = {
    text: column('Заметки', 'Заметка').id,
    repair: column('Заметки', 'Ремонт').id,
    at: column('Заметки', 'Когда').id,
    author: column('Заметки', 'Автор').id,
    authorEmail: column('Заметки', 'Почта автора').id,
  }
  const statuses = {
    fresh: choice('Ремонты', 'Статус', 'Новые'),
    progress: choice('Ремонты', 'Статус', 'В работе'),
    waitingParts: choice('Ремонты', 'Статус', 'Ждём запчасти'),
    ready: choice('Ремонты', 'Статус', 'Готово к выдаче'),
    done: choice('Ремонты', 'Статус', 'Выдано'),
    cancelled: choice('Ремонты', 'Статус', 'Отменён'),
  }
  const ids = {
    dashboardScreenId: newId('screen'), repairsScreenId: newId('screen'), repairScreenId: newId('screen'),
    clientsScreenId: newId('screen'), clientScreenId: newId('screen'), mastersScreenId: newId('screen'),
    clientListScreenId: newId('screen'), clientRepairScreenId: newId('screen'),
    createFormId: newId('component'), replyFormId: newId('component'), noteFormId: newId('component'), assignFormId: newId('component'),
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
  const byRepair = (fieldId: string) => ({ op: 'includes' as const, left: { kind: 'row' as const, fieldId }, right: { kind: 'screen_row_id' as const } })
  const createInputs = [
    input(repair.client, 'Клиент', true),
    input(repair.device, 'Устройство', true),
    input(repair.serial, 'Серийный / IMEI'),
    input(repair.problem, 'Неисправность', true),
    input(repair.deadline, 'Срок'),
  ]
  const replyInputs = [input(reply.text, 'Ответ', true)]
  const noteInputs = [input(note.text, 'Заметка', true)]
  const assignInputs = [
    input(repair.master, 'Мастер'),
    input(repair.status, 'Статус'),
    input(repair.deadline, 'Срок'),
    input(repair.diagnosis, 'Диагноз'),
    input(repair.work, 'Работа'),
    input(repair.parts, 'Запчасти'),
    input(repair.cost, 'Стоимость'),
  ]
  nodes.push({
    id: ids.createFormId, name: 'Новый ремонт', type: 'form', tableId: repairs.id, mode: 'create', childIds: createInputs,
    submitLabel: 'Принять в ремонт', visibleTo: desk, visibleWhen: null,
    events: { submit: flow('Создать ремонт', ids.createFormId, null, null, [{
      id: newId('action'), type: 'create_row', tableId: repairs.id, values: {
        [repair.client]: bind(ids.createFormId, repair.client),
        [repair.device]: bind(ids.createFormId, repair.device),
        [repair.serial]: bind(ids.createFormId, repair.serial),
        [repair.problem]: bind(ids.createFormId, repair.problem),
        [repair.deadline]: bind(ids.createFormId, repair.deadline),
        [repair.status]: literal(statuses.fresh),
      },
    }], desk) },
  })
  nodes.push({
    id: ids.replyFormId, name: 'Ответ', type: 'form', tableId: replies.id, mode: 'create', childIds: replyInputs,
    submitLabel: 'Ответить', visibleTo: desk, visibleWhen: null,
    events: { submit: flow('Ответить клиенту', ids.replyFormId, repairs.id, repairs.id, [{
      id: newId('action'), type: 'create_row', tableId: replies.id, values: {
        [reply.text]: bind(ids.replyFormId, reply.text),
        [reply.repair]: { kind: 'record_ids', tableId: repairs.id, record: { kind: 'screen' } },
        [reply.author]: user('name'),
        [reply.authorEmail]: user('email'),
      },
    }], desk) },
  })
  nodes.push({
    id: ids.noteFormId, name: 'Внутренняя заметка', type: 'form', tableId: notes.id, mode: 'create', childIds: noteInputs,
    submitLabel: 'Сохранить заметку', visibleTo: desk, visibleWhen: null,
    events: { submit: flow('Внутренняя заметка', ids.noteFormId, repairs.id, repairs.id, [{
      id: newId('action'), type: 'create_row', tableId: notes.id, values: {
        [note.text]: bind(ids.noteFormId, note.text),
        [note.repair]: { kind: 'record_ids', tableId: repairs.id, record: { kind: 'screen' } },
        [note.author]: user('name'),
        [note.authorEmail]: user('email'),
      },
    }], desk) },
  })
  nodes.push({
    id: ids.assignFormId, name: 'Назначение', type: 'form', tableId: repairs.id, mode: 'edit', childIds: assignInputs,
    submitLabel: 'Сохранить', visibleTo: desk, visibleWhen: null,
    events: { submit: flow('Обновить ремонт', ids.assignFormId, repairs.id, repairs.id, [{
      id: newId('action'), type: 'update_row', tableId: repairs.id, target: { kind: 'current' }, values: {
        [repair.master]: bind(ids.assignFormId, repair.master),
        [repair.status]: bind(ids.assignFormId, repair.status),
        [repair.deadline]: bind(ids.assignFormId, repair.deadline),
        [repair.diagnosis]: bind(ids.assignFormId, repair.diagnosis),
        [repair.work]: bind(ids.assignFormId, repair.work),
        [repair.parts]: bind(ids.assignFormId, repair.parts),
        [repair.cost]: bind(ids.assignFormId, repair.cost),
      },
    }], desk) },
  })
  const openRepair = flow('Открыть ремонт', null, repairs.id, null, [{ id: newId('action'), type: 'open_screen', screenId: ids.repairScreenId, record: { kind: 'current' } }], desk)
  const openClientRepair = flow('Открыть свой ремонт', null, repairs.id, null, [{ id: newId('action'), type: 'open_screen', screenId: ids.clientRepairScreenId, record: { kind: 'current' } }], clientRole)
  const collection = (name: string, tableId: string, titleFieldId: string, itemPress: string | null, sortFieldId: string | null, filter: AppV2['sources'][number]['filter'] = null, screenTableId: string | null = null) => {
    const id = newId('component'), sourceId = newId('component')
    sources.push({ id: sourceId, tableId, screenTableId, viewId: null, filter, sorts: sortFieldId ? [{ fieldId: sortFieldId, direction: 'desc' }] : [], searchFieldIds: [titleFieldId], pageSize: 100 })
    nodes.push({ id, name, type: 'collection', sourceId, layout: 'list', titleFieldId, subtitleFieldId: null, itemIds: [], visibleTo: null, visibleWhen: null, events: { itemPress } })
    return id
  }
  const listRepairs = collection('Ремонты', repairs.id, repair.device, openRepair, repair.updatedAt)
  const listClients = collection('Клиенты ремонтов', clients.id, client.name, null, client.name)
  const listMasters = collection('Мастера ремонтов', masters.id, master.name, null, master.name)
  const repairReplies = collection('Ответы ремонта', replies.id, reply.text, null, reply.at, byRepair(reply.repair), repairs.id)
  const repairNotes = collection('Заметки ремонта', notes.id, note.text, null, note.at, byRepair(note.repair), repairs.id)
  const repairMasters = collection('Мастера карточки', masters.id, master.name, null, master.name)
  const repairClients = collection('Клиенты карточки', clients.id, client.name, null, client.name)
  const clientRepairs = collection('Мои ремонты', repairs.id, repair.device, openClientRepair, repair.updatedAt)
  const clientReplies = collection('Ответы клиента', replies.id, reply.text, null, reply.at, byRepair(reply.repair), repairs.id)
  const clientMasters = collection('Имена мастеров', masters.id, master.name, null, master.name)
  const openClient = flow('Открыть клиента', null, clients.id, null, [{ id: newId('action'), type: 'open_screen', screenId: ids.clientScreenId, record: { kind: 'current' } }], desk)
  const directory = collection('Справочник клиентов', clients.id, client.name, openClient, client.name)
  const directoryRepairs = collection('Ремонты справочника', repairs.id, repair.device, null, repair.updatedAt)
  const clientCardRepairs = collection('Ремонты клиента', repairs.id, repair.device, openRepair, repair.updatedAt)
  const clientCardMasters = collection('Мастера карточки клиента', masters.id, master.name, null, master.name)
  const mastersList = collection('Справочник мастеров', masters.id, master.name, null, master.name)
  const mastersRepairs = collection('Ремонты мастеров', repairs.id, repair.device, null, repair.updatedAt)
  const dashRepairs = collection('Ремонты главной', repairs.id, repair.device, openRepair, repair.updatedAt)
  const dashMasters = collection('Мастера главной', masters.id, master.name, null, master.name)
  const screen = (id: string, name: string, menuLabel: string | undefined, icon: string, audience: AppV2Audience, contextTableId: string | null, rootIds: string[], navigation: boolean) =>
    ({ id, name, ...(menuLabel ? { menuLabel } : {}), icon, audience, contextTableId, rootIds, navigation, events: { enter: null } })
  const columnsOf = (tableId: string) => built.fields.filter(item => item.tableId === tableId).map(item => item.id)
  const editable = (tableId: string) => built.fields.filter(item => item.tableId === tableId && writable.has(item.type)).map(item => item.id)
  const grant = (audience: AppV2Audience, value: Omit<AppV2Grant, 'audience'>): AppV2Grant => ({ audience, ...value })
  const owned = (fieldId: string) => ({ kind: 'owned' as const, fieldId, property: 'email' as const })
  const all = { kind: 'all' as const }
  const clientRepairRead = [
    repair.number, repair.device, repair.serial, repair.problem, repair.diagnosis, repair.work, repair.parts, repair.cost,
    repair.client, repair.clientName, repair.clientEmail, repair.status, repair.deadline, repair.createdAt, repair.updatedAt, repair.acceptedAt,
    ...(repair.lines ? [repair.lines] : []),
    ...(repair.approval ? [repair.approval] : []),
  ]
  const deskRepairUpdate = [
    repair.master, repair.masterEmail, repair.status, repair.deadline, repair.diagnosis, repair.work, repair.parts, repair.cost,
    repair.device, repair.serial, repair.problem, repair.client, repair.clientName, repair.clientEmail, repair.updatedAt, repair.acceptedAt,
    ...(repair.lines ? [repair.lines] : []),
    ...(repair.approval ? [repair.approval] : []),
    ...(repair.partsEta ? [repair.partsEta] : []),
  ]
  return {
    formatVersion: 2, id: meta.id, workspaceId: meta.workspaceId, name: meta.name, slug: meta.slug, purpose: 'business',
    communications: { enabled: true },
    appearance: { navigation: 'sidebar', icon: 'wrench', density: 'regular', corners: 'rounded' },
    theme: { accent: 'green', scheme: 'light', logoKey: null, iconKey: null },
    roles: [{ id: 'owner', name: 'Руководитель' }, { id: 'staff', name: 'Мастер' }, { id: 'client', name: 'Клиент' }],
    authentication: { mode: 'verified_email', defaultRoleId: 'client', members: [{ email: meta.email.trim().toLowerCase(), roleIds: ['owner'], company: '' }] },
    homeScreenId: ids.dashboardScreenId,
    service: {
      repairsTableId: repairs.id, clientsTableId: clients.id, mastersTableId: masters.id,
      repliesTableId: replies.id, notesTableId: notes.id,
      ...ids, repair, client, master, reply, note, statuses,
      activeChoiceId: choice('Мастера', 'Статус', 'Активен'),
      inactiveChoiceId: choice('Мастера', 'Статус', 'Неактивен'),
    },
    screens: [
      screen(ids.dashboardScreenId, 'Главная', 'Главная', 'home', desk, null, [dashRepairs, dashMasters], true),
      screen(ids.repairsScreenId, 'Ремонты', 'Ремонты', 'wrench', desk, null, [listRepairs, listClients, listMasters, ids.createFormId], true),
      screen(ids.repairScreenId, 'Ремонт', undefined, 'wrench', desk, repairs.id, [repairReplies, repairNotes, repairMasters, repairClients, ids.replyFormId, ids.noteFormId, ids.assignFormId], false),
      screen(ids.clientsScreenId, 'Клиенты', 'Клиенты', 'users', desk, null, [directory, directoryRepairs], true),
      screen(ids.clientScreenId, 'Клиент', undefined, 'users', desk, clients.id, [clientCardRepairs, clientCardMasters], false),
      screen(ids.mastersScreenId, 'Мастера', 'Мастера', 'user', desk, null, [mastersList, mastersRepairs], true),
      screen(ids.clientListScreenId, 'Мои ремонты', 'Кабинет', 'clipboard', { kind: 'roles', roleIds: ['owner', 'staff', 'client'] }, null, [clientRepairs], true),
      screen(ids.clientRepairScreenId, 'Мой ремонт', undefined, 'wrench', clientRole, repairs.id, [clientReplies, clientMasters], false),
    ],
    nodes, sources, workflows,
    policy: {
      workflows: rules,
      tables: [
        { tableId: repairs.id, grants: [
          grant(owner, { read: { fieldIds: columnsOf(repairs.id), rows: all }, create: { fieldIds: editable(repairs.id) }, update: { fieldIds: editable(repairs.id), rows: all } }),
          grant(staff, { read: { fieldIds: columnsOf(repairs.id), rows: all }, create: { fieldIds: editable(repairs.id) }, update: { fieldIds: deskRepairUpdate, rows: all } }),
          grant(clientRole, { read: { fieldIds: clientRepairRead, rows: owned(repair.clientEmail) } }),
        ] },
        { tableId: replies.id, grants: [
          grant(owner, { read: { fieldIds: columnsOf(replies.id), rows: all }, create: { fieldIds: editable(replies.id) } }),
          grant(staff, { read: { fieldIds: columnsOf(replies.id), rows: all }, create: { fieldIds: [reply.text, reply.repair, reply.at, reply.author, reply.authorEmail, reply.clientEmail] } }),
          grant(clientRole, { read: { fieldIds: [reply.text, reply.repair, reply.at, reply.author], rows: owned(reply.clientEmail) }, create: { fieldIds: [reply.text, reply.repair, reply.at, reply.author, reply.authorEmail], owner: { fieldId: reply.clientEmail, property: 'email' } } }),
        ] },
        { tableId: notes.id, grants: [
          grant(owner, { read: { fieldIds: columnsOf(notes.id), rows: all }, create: { fieldIds: editable(notes.id) } }),
          grant(staff, { read: { fieldIds: columnsOf(notes.id), rows: all }, create: { fieldIds: [note.text, note.repair, note.at, note.author, note.authorEmail] } }),
        ] },
        { tableId: clients.id, grants: [
          grant(owner, { read: { fieldIds: columnsOf(clients.id), rows: all }, create: { fieldIds: editable(clients.id) }, update: { fieldIds: editable(clients.id), rows: all } }),
          grant(staff, { read: { fieldIds: columnsOf(clients.id), rows: all }, update: { fieldIds: [client.note], rows: all } }),
          grant(clientRole, { read: { fieldIds: [client.name, client.phone], rows: owned(client.email) } }),
        ] },
        { tableId: masters.id, grants: [
          grant(owner, { read: { fieldIds: columnsOf(masters.id), rows: all }, create: { fieldIds: editable(masters.id) }, update: { fieldIds: editable(masters.id), rows: all } }),
          grant(staff, { read: { fieldIds: columnsOf(masters.id), rows: all } }),
          grant(clientRole, { read: { fieldIds: [master.name, master.photo], rows: all } }),
        ] },
      ],
    },
  }
}
