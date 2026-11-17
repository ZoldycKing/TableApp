import { newId } from '@tableapp/schema'
import type { AppV2, AppV2Audience, AppV2Grant, AppV2Node } from '@tableapp/schema/app-v2'
import type { BuiltTemplate } from './build'

export const isDispatchTemplate = (id: string) => id === 'zayavki'

const writable = new Set(['text', 'long_text', 'number', 'email', 'phone', 'url', 'date', 'datetime', 'checkbox', 'single_select', 'multi_select', 'relation', 'image', 'attachment'])
const owner: AppV2Audience = { kind: 'roles', roleIds: ['owner'] }
const staff: AppV2Audience = { kind: 'roles', roleIds: ['staff'] }
const both: AppV2Audience = { kind: 'roles', roleIds: ['owner', 'staff'] }

/** Dispatcher and technician app on the same kit as the salon starter. */
export function buildDispatchV2App(built: BuiltTemplate, meta: { id: string; workspaceId: string; name: string; slug: string; email: string }): AppV2 {
  const table = (name: string) => {
    const found = built.tables.find(item => item.name === name)
    if (!found) throw new Error(`В шаблоне заявок нет таблицы «${name}»`)
    return found
  }
  const column = (tableName: string, fieldName: string) => {
    const found = built.fields.find(item => item.tableId === table(tableName).id && item.name === fieldName)
    if (!found) throw new Error(`В шаблоне заявок нет поля «${tableName} · ${fieldName}»`)
    return found
  }
  const choice = (tableName: string, fieldName: string, name: string) => {
    const match = (column(tableName, fieldName).options as { choices?: { id: string; name: string }[] }).choices?.find(item => item.name === name)
    if (!match) throw new Error(`В поле «${fieldName}» нет варианта «${name}»`)
    return match.id
  }
  const jobs = table('Заявки'), clients = table('Клиенты'), masters = table('Мастера'), notes = table('Заметки'), types = table('Типы работ')
  const job = {
    what: column('Заявки', 'Что сделать').id,
    client: column('Заявки', 'Клиент').id,
    clientName: column('Заявки', 'Клиент для выезда').id,
    phone: column('Заявки', 'Телефон').id,
    address: column('Заявки', 'Адрес').id,
    status: column('Заявки', 'Статус').id,
    priority: column('Заявки', 'Приоритет').id,
    master: column('Заявки', 'Мастер').id,
    masterEmail: column('Заявки', 'Почта мастера').id,
    technician: column('Заявки', 'Карточка мастера').id,
    date: column('Заявки', 'Дата выезда').id,
    when: column('Заявки', 'Начало выезда').id,
    minutes: column('Заявки', 'Длительность, мин').id,
    price: column('Заявки', 'Стоимость').id,
    paid: column('Заявки', 'Оплачено').id,
    photo: column('Заявки', 'Фото с выезда').id,
    comment: column('Заявки', 'Комментарий').id,
    report: column('Заявки', 'Что сделано').id,
    signature: column('Заявки', 'Подпись клиента').id,
    site: column('Заявки', 'Адрес выезда').id,
    type: column('Заявки', 'Тип работы').id,
    checklist: column('Заявки', 'Чек-лист заявки').id,
    onSiteAt: column('Заявки', 'На месте с').id,
    doneAt: column('Заявки', 'Завершено в').id,
    actualMinutes: column('Заявки', 'Факт, мин').id,
    seriesId: column('Заявки', 'Серия').id,
    repeat: column('Заявки', 'Повторять').id,
    repeatUntil: column('Заявки', 'Повторять до').id,
    repeatCount: column('Заявки', 'Число повторов').id,
    works: column('Заявки', 'Работы').id,
    materials: column('Заявки', 'Материалы').id,
  }
  const jobType = {
    name: column('Типы работ', 'Тип работы').id,
    items: column('Типы работ', 'Чек-лист').id,
  }
  const client = {
    name: column('Клиенты', 'Клиент').id,
    phone: column('Клиенты', 'Телефон').id,
    address: column('Клиенты', 'Адрес').id,
    note: column('Клиенты', 'Заметки').id,
  }
  const master = {
    name: column('Мастера', 'Мастер').id,
    email: column('Мастера', 'Почта').id,
    phone: column('Мастера', 'Телефон').id,
    photo: column('Мастера', 'Фото').id,
    active: column('Мастера', 'Статус мастера').id,
  }
  const note = {
    text: column('Заметки', 'Текст').id,
    job: column('Заметки', 'Заявка').id,
    at: column('Заметки', 'Когда').id,
    author: column('Заметки', 'Автор').id,
    authorEmail: column('Заметки', 'Почта автора').id,
    masterEmail: column('Заметки', 'Почта мастера').id,
  }
  const statuses = {
    fresh: choice('Заявки', 'Статус', 'Новая'),
    assigned: choice('Заявки', 'Статус', 'Назначена'),
    enRoute: choice('Заявки', 'Статус', 'Выехал'),
    onSite: choice('Заявки', 'Статус', 'На месте'),
    done: choice('Заявки', 'Статус', 'Выполнено'),
    cancelled: choice('Заявки', 'Статус', 'Отменена'),
  }
  const priorities = {
    low: choice('Заявки', 'Приоритет', 'Низкий'),
    normal: choice('Заявки', 'Приоритет', 'Обычный'),
    high: choice('Заявки', 'Приоритет', 'Высокий'),
    urgent: choice('Заявки', 'Приоритет', 'Срочный'),
  }
  const ids = {
    overviewScreenId: newId('screen'), boardScreenId: newId('screen'), jobScreenId: newId('screen'),
    clientsScreenId: newId('screen'), clientScreenId: newId('screen'), technicianScreenId: newId('screen'), mastersScreenId: newId('screen'),
    calendarNodeId: newId('component'), createJobFormId: newId('component'), assignFormId: newId('component'),
    noteFormId: newId('component'), completeFormId: newId('component'),
    progressFormId: newId('component'), billingFormId: newId('component'), repeatFormId: newId('component'),
  }
  const nodes: AppV2Node[] = []
  const sources: AppV2['sources'] = []
  const workflows: AppV2['workflows'] = []
  const rules: AppV2['policy']['workflows'] = []
  const input = (fieldId: string, label: string, required = false, initialValue: Extract<AppV2Node, { type: 'input' }>['initialValue'] = null, readOnly = false) => {
    const id = newId('component')
    nodes.push({ id, name: label, type: 'input', fieldId, label, required, readOnly, initialValue, visibleTo: null, visibleWhen: null })
    return id
  }
  const flow = (name: string, formId: string | null, rowTableId: string | null, screenTableId: string | null, steps: AppV2['workflows'][number]['steps'], allowed: AppV2Audience) => {
    const id = newId('action')
    workflows.push({ id, name, input: { rowTableId, formId, screenTableId }, steps })
    rules.push({ workflowId: id, audience: allowed })
    return id
  }
  const bind = (formId: string, fieldId: string) => ({ kind: 'form' as const, formId, fieldId })
  const createInputs = [
    input(job.what, 'Что сделать', true),
    input(job.client, 'Клиент', true, { kind: 'record_ids', tableId: clients.id, record: { kind: 'row' } }, true),
    input(job.priority, 'Приоритет', true, { kind: 'literal', value: priorities.normal }),
    input(job.when, 'Начало выезда', true),
    input(job.minutes, 'Длительность, мин', false, { kind: 'literal', value: 60 }),
    input(job.status, 'Статус', true, { kind: 'literal', value: statuses.fresh }, true),
  ]
  const createStep = newId('action')
  nodes.push({
    id: ids.createJobFormId, name: 'Новая заявка', type: 'form', tableId: jobs.id, mode: 'create', childIds: createInputs,
    submitLabel: 'Создать заявку', visibleTo: owner, visibleWhen: null,
    events: { submit: flow('Создать заявку', ids.createJobFormId, clients.id, clients.id, [
      { id: createStep, type: 'create_row', tableId: jobs.id, values: Object.fromEntries(createInputs.map(id => {
        const node = nodes.find(item => item.id === id)
        const fieldId = node && node.type === 'input' ? node.fieldId : job.what
        return [fieldId, bind(ids.createJobFormId, fieldId)]
      })) },
      { id: newId('action'), type: 'notify', message: { kind: 'literal', value: 'Заявка создана.' } },
      { id: newId('action'), type: 'open_screen', screenId: ids.jobScreenId, record: { kind: 'result', stepId: createStep } },
    ], owner) },
  })
  const assignInputs = [input(job.technician, 'Мастер', true), input(job.when, 'Начало выезда', true), input(job.date, 'Дата выезда', true)]
  nodes.push({
    id: ids.assignFormId, name: 'Назначить мастера', type: 'form', tableId: jobs.id, mode: 'edit', childIds: assignInputs,
    submitLabel: 'Назначить', visibleTo: owner, visibleWhen: null,
    events: { submit: flow('Назначить мастера', ids.assignFormId, jobs.id, jobs.id, [
      { id: newId('action'), type: 'update_row', tableId: jobs.id, target: { kind: 'current' }, values: Object.fromEntries(assignInputs.map(id => {
        const node = nodes.find(item => item.id === id)
        const fieldId = node && node.type === 'input' ? node.fieldId : job.technician
        return [fieldId, bind(ids.assignFormId, fieldId)]
      })) },
      { id: newId('action'), type: 'notify', message: { kind: 'literal', value: 'Мастер назначен.' } },
    ], owner) },
  })
  const noteInputs = [
    input(note.text, 'Заметка', true),
    input(note.job, 'Заявка', true, { kind: 'record_ids', tableId: jobs.id, record: { kind: 'row' } }, true),
  ]
  const noteStep = newId('action')
  nodes.push({
    id: ids.noteFormId, name: 'Добавить заметку', type: 'form', tableId: notes.id, mode: 'create', childIds: noteInputs,
    submitLabel: 'Добавить заметку', visibleTo: both, visibleWhen: null,
    events: { submit: flow('Добавить заметку', ids.noteFormId, jobs.id, jobs.id, [
      { id: noteStep, type: 'create_row', tableId: notes.id, values: {
        [note.text]: bind(ids.noteFormId, note.text),
        [note.job]: bind(ids.noteFormId, note.job),
        [note.author]: { kind: 'literal', value: 'Сотрудник' },
        [note.authorEmail]: { kind: 'literal', value: 'staff@example.invalid' },
        [note.masterEmail]: { kind: 'row', fieldId: job.masterEmail },
        [note.at]: { kind: 'literal', value: '2026-01-01T09:00:00.000Z' },
      } },
      { id: newId('action'), type: 'notify', message: { kind: 'literal', value: 'Заметка добавлена.' } },
    ], owner) },
  })
  const progressInputs = [input(job.status, 'Статус', true), input(job.onSiteAt, 'На месте с', false), input(job.doneAt, 'Завершено в', false), input(job.actualMinutes, 'Факт, мин', false), input(job.checklist, 'Чек-лист заявки', false)]
  nodes.push({
    id: ids.progressFormId, name: 'Ход заявки', type: 'form', tableId: jobs.id, mode: 'edit', childIds: progressInputs,
    submitLabel: 'Сохранить', visibleTo: both, visibleWhen: null,
    events: { submit: flow('Сохранить ход заявки', ids.progressFormId, jobs.id, jobs.id, [
      { id: newId('action'), type: 'update_row', tableId: jobs.id, target: { kind: 'current' }, values: Object.fromEntries(progressInputs.map(id => {
        const node = nodes.find(item => item.id === id)
        const fieldId = node && node.type === 'input' ? node.fieldId : job.status
        return [fieldId, bind(ids.progressFormId, fieldId)]
      })) },
    ], both) },
  })
  const billingInputs = [input(job.works, 'Работы', false), input(job.materials, 'Материалы', false), input(job.price, 'Стоимость', false)]
  nodes.push({
    id: ids.billingFormId, name: 'Работы и материалы', type: 'form', tableId: jobs.id, mode: 'edit', childIds: billingInputs,
    submitLabel: 'Сохранить сумму', visibleTo: owner, visibleWhen: null,
    events: { submit: flow('Сохранить сумму', ids.billingFormId, jobs.id, jobs.id, [
      { id: newId('action'), type: 'update_row', tableId: jobs.id, target: { kind: 'current' }, values: Object.fromEntries(billingInputs.map(id => {
        const node = nodes.find(item => item.id === id)
        const fieldId = node && node.type === 'input' ? node.fieldId : job.price
        return [fieldId, bind(ids.billingFormId, fieldId)]
      })) },
    ], owner) },
  })
  const repeatInputs = [input(job.repeat, 'Повторять', false), input(job.repeatUntil, 'Повторять до', false), input(job.repeatCount, 'Число повторов', false), input(job.seriesId, 'Серия', false)]
  nodes.push({
    id: ids.repeatFormId, name: 'Повтор заявки', type: 'form', tableId: jobs.id, mode: 'edit', childIds: repeatInputs,
    submitLabel: 'Сохранить серию', visibleTo: owner, visibleWhen: null,
    events: { submit: flow('Сохранить серию', ids.repeatFormId, jobs.id, jobs.id, [
      { id: newId('action'), type: 'update_row', tableId: jobs.id, target: { kind: 'current' }, values: Object.fromEntries(repeatInputs.map(id => {
        const node = nodes.find(item => item.id === id)
        const fieldId = node && node.type === 'input' ? node.fieldId : job.seriesId
        return [fieldId, bind(ids.repeatFormId, fieldId)]
      })) },
    ], owner) },
  })
  const completeInputs = [input(job.report, 'Что сделано', true), input(job.photo, 'Фото с выезда', false), input(job.signature, 'Подпись клиента', true), input(job.status, 'Статус', true, { kind: 'literal', value: statuses.done }, true)]
  nodes.push({
    id: ids.completeFormId, name: 'Отчёт о выполнении', type: 'form', tableId: jobs.id, mode: 'edit', childIds: completeInputs,
    submitLabel: 'Завершить заявку', visibleTo: both, visibleWhen: null,
    events: { submit: flow('Завершить заявку', ids.completeFormId, jobs.id, jobs.id, [
      { id: newId('action'), type: 'update_row', tableId: jobs.id, target: { kind: 'current' }, values: Object.fromEntries(completeInputs.map(id => {
        const node = nodes.find(item => item.id === id)
        const fieldId = node && node.type === 'input' ? node.fieldId : job.report
        return [fieldId, bind(ids.completeFormId, fieldId)]
      })) },
      { id: newId('action'), type: 'notify', message: { kind: 'literal', value: 'Заявка выполнена.' } },
    ], both) },
  })
  const facts = (names: { id: string; name: string }[]) => names.map(item => {
    const id = newId('component')
    nodes.push({ id, name: item.name, type: 'field', label: item.name, value: { kind: 'row', fieldId: item.id }, visibleTo: null, visibleWhen: null })
    return id
  })
  const jobFacts = () => facts([
    ['Что сделать', job.what], ['Клиент', job.clientName], ['Телефон', job.phone], ['Адрес', job.address],
    ['Статус', job.status], ['Приоритет', job.priority], ['Начало', job.when], ['Мастер', job.master],
    ['Карточка мастера', job.technician], ['Почта мастера', job.masterEmail], ['Длительность', job.minutes],
    ['Что сделано', job.report], ['Подпись', job.signature], ['Фото', job.photo], ['Комментарий', job.comment],
    ['Чек-лист', job.checklist], ['На месте с', job.onSiteAt], ['Завершено в', job.doneAt], ['Факт', job.actualMinutes],
    ['Серия', job.seriesId], ['Повторять', job.repeat], ['Адрес выезда', job.site], ['Работы', job.works], ['Материалы', job.materials],
  ].map(([name, id]) => ({ name: name!, id: id! })))
  const collection = (name: string, tableId: string, titleFieldId: string, detailId: string | null, allowed: AppV2Audience, extra: Partial<Extract<AppV2Node, { type: 'collection' }>> = {}, filter: AppV2['sources'][number]['filter'] = null, screenTableId: string | null = null) => {
    const id = newId('component'), sourceId = newId('component')
    const open = detailId ? flow(`Открыть: ${name}`, null, tableId, screenTableId, [{ id: newId('action'), type: 'open_screen', screenId: detailId, record: { kind: 'current' } }], allowed) : null
    sources.push({ id: sourceId, tableId, screenTableId, viewId: null, filter, sorts: tableId === jobs.id ? [{ fieldId: job.when, direction: 'asc' }] : tableId === notes.id ? [{ fieldId: note.at, direction: 'asc' }] : [], searchFieldIds: [titleFieldId], pageSize: 100 })
    nodes.push({
      id, name, type: 'collection', sourceId, layout: 'list', titleFieldId, subtitleFieldId: null, itemIds: [],
      visibleTo: null, visibleWhen: null, events: { itemPress: open }, ...extra,
    })
    return id
  }
  const openJob = ids.jobScreenId
  const jobsList = collection('Заявки', jobs.id, job.what, openJob, owner, { subtitleFieldId: job.clientName, statusFieldId: job.status, dateFieldId: job.when, cardDetailFieldId: job.priority, itemIds: jobFacts() })
  const boardJobs = collection('Заявки на доске', jobs.id, job.what, openJob, owner, { subtitleFieldId: job.address, statusFieldId: job.status, dateFieldId: job.when, cardDetailFieldId: job.priority, itemIds: jobFacts() })
  const technicianJobs = collection('Мои выезды', jobs.id, job.what, openJob, staff, { subtitleFieldId: job.address, statusFieldId: job.status, dateFieldId: job.when, cardDetailFieldId: job.priority, itemIds: jobFacts() })
  const clientJobs = collection('Заявки клиента', jobs.id, job.what, openJob, owner, { subtitleFieldId: job.status, statusFieldId: job.status, dateFieldId: job.when, itemIds: jobFacts() }, { op: 'includes', left: { kind: 'row', fieldId: job.client }, right: { kind: 'screen_row_id' } }, clients.id)
  const clientsList = collection('Клиенты', clients.id, client.name, ids.clientScreenId, owner, { subtitleFieldId: client.address, cardDetailFieldId: client.phone })
  const mastersList = collection('Мастера', masters.id, master.name, null, owner, { subtitleFieldId: master.phone, statusFieldId: master.active, cardImageFieldId: master.photo, itemIds: facts([{ id: master.email, name: 'Почта' }, { id: master.active, name: 'Статус' }, { id: master.photo, name: 'Фото' }]) })
  const boardMasters = collection('Мастера доски', masters.id, master.name, null, owner, { cardImageFieldId: master.photo, statusFieldId: master.active, itemIds: facts([{ id: master.email, name: 'Почта' }, { id: master.photo, name: 'Фото' }, { id: master.active, name: 'Статус' }]) })
  const jobMasters = collection('Мастера заявки', masters.id, master.name, null, both, { cardImageFieldId: master.photo, itemIds: facts([{ id: master.email, name: 'Почта' }, { id: master.photo, name: 'Фото' }]) })
  const jobNotes = collection('Заметки заявки', notes.id, note.text, null, both, { subtitleFieldId: note.author, dateFieldId: note.at, itemIds: facts([{ id: note.text, name: 'Текст' }, { id: note.author, name: 'Автор' }, { id: note.authorEmail, name: 'Почта автора' }, { id: note.at, name: 'Когда' }]) }, { op: 'includes', left: { kind: 'row', fieldId: note.job }, right: { kind: 'screen_row_id' } }, jobs.id)
  const typesCollection = (name: string) => collection(name, types.id, jobType.name, null, owner, { subtitleFieldId: jobType.items, itemIds: facts([{ id: jobType.items, name: 'Чек-лист' }]) })
  nodes.push({
    id: ids.calendarNodeId, name: 'Доска дня', type: 'team_calendar', visibleTo: owner, visibleWhen: null,
    resourceLabel: 'Мастер', resourcesLabel: 'Мастера', showMetrics: false, defaultView: 'day',
    data: {
      tableId: jobs.id, viewId: null, titleFieldId: job.what, subtitleFieldId: job.clientName,
      startFieldId: job.when, durationFieldId: job.minutes, endFieldId: null, resourceFieldId: job.technician,
      statusFieldId: job.status, amountFieldId: job.price,
      statusValues: { booked: statuses.assigned, arrived: statuses.onSite, completed: statuses.done, cancelled: statuses.cancelled },
      resources: { tableId: masters.id, viewId: null, titleFieldId: master.name, photoFieldId: master.photo, ownerEmailFieldId: master.email },
      hours: null,
    },
    actions: { itemScreenId: ids.jobScreenId, createScreenId: null, configureScreenId: null, periodScreenId: null, manageRoleIds: ['owner'], allowMove: true },
  })
  const cardFields = facts([
    { id: job.what, name: 'Что сделать' }, { id: job.clientName, name: 'Клиент' }, { id: job.phone, name: 'Телефон' },
    { id: job.address, name: 'Адрес' }, { id: job.status, name: 'Статус' }, { id: job.priority, name: 'Приоритет' },
    { id: job.when, name: 'Начало выезда' }, { id: job.master, name: 'Мастер' }, { id: job.report, name: 'Что сделано' },
    { id: job.signature, name: 'Подпись клиента' }, { id: job.photo, name: 'Фото с выезда' }, { id: job.comment, name: 'Комментарий' },
    { id: job.price, name: 'Стоимость' }, { id: job.paid, name: 'Оплачено' },
    { id: job.checklist, name: 'Чек-лист' }, { id: job.onSiteAt, name: 'На месте с' }, { id: job.doneAt, name: 'Завершено в' },
    { id: job.actualMinutes, name: 'Факт, мин' }, { id: job.works, name: 'Работы' }, { id: job.materials, name: 'Материалы' },
    { id: job.seriesId, name: 'Серия' }, { id: job.site, name: 'Адрес выезда' },
  ])
  const clientFields = facts([{ id: client.name, name: 'Клиент' }, { id: client.phone, name: 'Телефон' }, { id: client.address, name: 'Адрес' }, { id: client.note, name: 'Заметки' }])
  const screen = (id: string, name: string, icon: string, audience: AppV2Audience, contextTableId: string | null, rootIds: string[], navigation: boolean) =>
    ({ id, name, icon, audience, contextTableId, rootIds, navigation, events: { enter: null } })
  const columnsOf = (tableId: string) => built.fields.filter(item => item.tableId === tableId).map(item => item.id)
  const editable = (tableId: string) => built.fields.filter(item => item.tableId === tableId && writable.has(item.type)).map(item => item.id)
  const grant = (audience: AppV2Audience, value: Omit<AppV2Grant, 'audience'>): AppV2Grant => ({ audience, ...value })
  const owned = (fieldId: string) => ({ kind: 'owned' as const, fieldId, property: 'email' as const })
  const all = { kind: 'all' as const }
  const staffJobRead = [job.what, job.clientName, job.phone, job.address, job.site, job.status, job.priority, job.master, job.technician, job.date, job.when, job.minutes, job.photo, job.comment, job.report, job.signature, job.checklist, job.onSiteAt, job.doneAt, job.actualMinutes, job.seriesId, job.type]
  const staffJobUpdate = [job.status, job.photo, job.comment, job.report, job.signature, job.checklist, job.onSiteAt, job.doneAt, job.actualMinutes]
  return {
    formatVersion: 2, id: meta.id, workspaceId: meta.workspaceId, name: meta.name, slug: meta.slug, purpose: 'business',
    appearance: { navigation: 'tabs', icon: 'clipboard', density: 'regular', corners: 'rounded' },
    theme: { accent: 'blue', scheme: 'light', logoKey: null, iconKey: null },
    roles: [{ id: 'owner', name: 'Диспетчер' }, { id: 'staff', name: 'Мастер' }],
    authentication: { mode: 'invite_only', defaultRoleId: null, members: [{ email: meta.email.trim().toLowerCase(), roleIds: ['owner'], company: '' }] },
    homeScreenId: ids.overviewScreenId,
    dispatch: {
      jobsTableId: jobs.id, clientsTableId: clients.id, mastersTableId: masters.id, notesTableId: notes.id,
      ...ids, job, client, master, note, statuses, priorities,
      activeChoiceId: choice('Мастера', 'Статус мастера', 'Активен'),
      inactiveChoiceId: choice('Мастера', 'Статус мастера', 'Неактивен'),
      typesTableId: types.id, progressFormId: ids.progressFormId, billingFormId: ids.billingFormId, repeatFormId: ids.repeatFormId,
    },
    screens: [
      screen(ids.overviewScreenId, 'Заявки', 'clipboard', owner, null, [jobsList, typesCollection('Типы работ')], true),
      screen(ids.boardScreenId, 'Доска дня', 'calendar', owner, null, [ids.calendarNodeId, boardJobs, boardMasters], true),
      screen(ids.technicianScreenId, 'Мои выезды', 'list', staff, null, [technicianJobs], true),
      screen(ids.clientsScreenId, 'Клиенты', 'users', owner, null, [clientsList], true),
      screen(ids.mastersScreenId, 'Мастера', 'user', owner, null, [mastersList], true),
      screen(ids.jobScreenId, 'Заявка', 'clipboard', both, jobs.id, [...cardFields, jobNotes, jobMasters, ids.assignFormId, ids.noteFormId, ids.completeFormId, ids.progressFormId, ids.billingFormId, ids.repeatFormId], false),
      screen(ids.clientScreenId, 'Клиент', 'user', owner, clients.id, [...clientFields, clientJobs, typesCollection('Типы работ клиента'), ids.createJobFormId], false),
    ],
    nodes, sources, workflows,
    policy: {
      workflows: rules,
      tables: [
        { tableId: jobs.id, grants: [
          grant(owner, { read: { fieldIds: columnsOf(jobs.id), rows: all }, create: { fieldIds: editable(jobs.id) }, update: { fieldIds: editable(jobs.id), rows: all } }),
          grant(staff, { read: { fieldIds: staffJobRead, rows: owned(job.masterEmail) }, update: { fieldIds: staffJobUpdate, rows: owned(job.masterEmail) } }),
        ] },
        { tableId: clients.id, grants: [grant(owner, { read: { fieldIds: columnsOf(clients.id), rows: all }, create: { fieldIds: editable(clients.id) }, update: { fieldIds: editable(clients.id), rows: all } })] },
        { tableId: masters.id, grants: [
          grant(owner, { read: { fieldIds: columnsOf(masters.id), rows: all }, create: { fieldIds: editable(masters.id) }, update: { fieldIds: editable(masters.id), rows: all } }),
          grant(both, { read: { fieldIds: [master.name, master.email, master.photo, master.active], rows: all } }),
        ] },
        { tableId: types.id, grants: [grant(owner, { read: { fieldIds: columnsOf(types.id), rows: all }, create: { fieldIds: editable(types.id) }, update: { fieldIds: editable(types.id), rows: all } })] },
        { tableId: notes.id, grants: [
          grant(owner, { read: { fieldIds: columnsOf(notes.id), rows: all }, create: { fieldIds: editable(notes.id) }, update: { fieldIds: [note.masterEmail], rows: all } }),
          grant(staff, { read: { fieldIds: [note.text, note.job, note.at, note.author, note.authorEmail, note.masterEmail], rows: owned(note.masterEmail) }, create: { fieldIds: [note.text, note.job, note.at, note.author, note.authorEmail], owner: { fieldId: note.masterEmail, property: 'email' } } }),
        ] },
      ],
    },
  }
}
