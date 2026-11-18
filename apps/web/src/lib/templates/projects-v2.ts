import { newId } from '@tableapp/schema'
import type { AppV2, AppV2Audience, AppV2Grant, AppV2Node } from '@tableapp/schema/app-v2'
import type { BuiltTemplate } from './build'

export const isProjectsTemplate = (id: string) => id === 'proekty'

const writable = new Set(['text', 'long_text', 'number', 'email', 'phone', 'url', 'date', 'datetime', 'checkbox', 'single_select', 'multi_select', 'relation', 'image', 'attachment'])
const owner: AppV2Audience = { kind: 'roles', roleIds: ['owner'] }
const staff: AppV2Audience = { kind: 'roles', roleIds: ['staff'] }
const both: AppV2Audience = { kind: 'roles', roleIds: ['owner', 'staff'] }
const clientRole: AppV2Audience = { kind: 'roles', roleIds: ['client'] }
const teamAndClient: AppV2Audience = { kind: 'roles', roleIds: ['owner', 'staff', 'client'] }

/** Team project board on the same kit as the field-service starter. */
export function buildProjectsV2App(built: BuiltTemplate, meta: { id: string; workspaceId: string; name: string; slug: string; email: string }): AppV2 {
  const table = (name: string) => {
    const found = built.tables.find(item => item.name === name)
    if (!found) throw new Error(`В шаблоне проектов нет таблицы «${name}»`)
    return found
  }
  const column = (tableName: string, fieldName: string) => {
    const found = built.fields.find(item => item.tableId === table(tableName).id && item.name === fieldName)
    if (!found) throw new Error(`В шаблоне проектов нет поля «${tableName} · ${fieldName}»`)
    return found
  }
  const choice = (tableName: string, fieldName: string, name: string) => {
    const match = (column(tableName, fieldName).options as { choices?: { id: string; name: string }[] }).choices?.find(item => item.name === name)
    if (!match) throw new Error(`В поле «${fieldName}» нет варианта «${name}»`)
    return match.id
  }
  const projects = table('Проекты'), tasks = table('Задачи'), people = table('Сотрудники'), clients = table('Клиенты')
  const comments = table('Комментарии'), events = table('Лента'), stages = table('Этапы')
  const time = table('Время'), links = table('Зависимости'), templates = table('Шаблоны проектов'), shares = table('Ссылки клиента')
  const project = {
    title: column('Проекты', 'Название').id,
    client: column('Проекты', 'Клиент').id,
    owner: column('Проекты', 'Ответственный').id,
    start: column('Проекты', 'Начало').id,
    due: column('Проекты', 'Срок').id,
    budget: column('Проекты', 'Бюджет').id,
    status: column('Проекты', 'Статус').id,
    progress: column('Проекты', 'Прогресс').id,
  }
  const task = {
    title: column('Задачи', 'Задача').id,
    project: column('Задачи', 'Проект').id,
    assignee: column('Задачи', 'Исполнитель').id,
    assigneeEmail: column('Задачи', 'Почта исполнителя').id,
    start: column('Задачи', 'Начало').id,
    due: column('Задачи', 'Срок').id,
    estimate: column('Задачи', 'Оценка, мин').id,
    author: column('Задачи', 'Постановщик').id,
    authorEmail: column('Задачи', 'Почта постановщика').id,
    observers: column('Задачи', 'Наблюдатели').id,
    priority: column('Задачи', 'Приоритет').id,
    status: column('Задачи', 'Статус').id,
    description: column('Задачи', 'Описание').id,
    checklist: column('Задачи', 'Чек-лист').id,
    files: column('Задачи', 'Файлы').id,
    sort: column('Задачи', 'Порядок').id,
    parent: column('Задачи', 'Родительская задача').id,
    stage: column('Задачи', 'Этап').id,
    seriesId: column('Задачи', 'Серия').id,
    repeat: column('Задачи', 'Повтор').id,
    repeatUntil: column('Задачи', 'Повторять до').id,
    repeatEvery: column('Задачи', 'Интервал, дн.').id,
  }
  const stage = {
    title: column('Этапы', 'Название').id,
    project: column('Этапы', 'Проект').id,
    start: column('Этапы', 'Начало').id,
    end: column('Этапы', 'Окончание').id,
    goal: column('Этапы', 'Цель').id,
    status: column('Этапы', 'Статус').id,
  }
  const person = {
    name: column('Сотрудники', 'Сотрудник').id,
    email: column('Сотрудники', 'Почта').id,
    phone: column('Сотрудники', 'Телефон').id,
    photo: column('Сотрудники', 'Фото').id,
    role: column('Сотрудники', 'Роль в команде').id,
    active: column('Сотрудники', 'Статус').id,
  }
  const client = {
    name: column('Клиенты', 'Клиент').id,
    phone: column('Клиенты', 'Телефон').id,
    email: column('Клиенты', 'Почта').id,
    note: column('Клиенты', 'Заметки').id,
  }
  const comment = {
    text: column('Комментарии', 'Комментарий').id,
    task: column('Комментарии', 'Задача').id,
    project: column('Комментарии', 'Проект').id,
    at: column('Комментарии', 'Когда').id,
    author: column('Комментарии', 'Автор').id,
    authorEmail: column('Комментарии', 'Почта автора').id,
    assigneeEmail: column('Комментарии', 'Почта исполнителя').id,
    mentions: column('Комментарии', 'Упоминания').id,
    replyTo: column('Комментарии', 'Ответ на').id,
    editedAt: column('Комментарии', 'Изменён').id,
    internal: column('Комментарии', 'Внутренний').id,
  }
  const event = {
    text: column('Лента', 'Событие').id,
    project: column('Лента', 'Проект').id,
    task: column('Лента', 'Задача').id,
    at: column('Лента', 'Когда').id,
    kind: column('Лента', 'Вид').id,
    author: column('Лента', 'Автор').id,
    authorEmail: column('Лента', 'Почта автора').id,
    assigneeEmail: column('Лента', 'Почта исполнителя').id,
  }
  const timeFields = {
    task: column('Время', 'Задача').id,
    project: column('Время', 'Проект').id,
    person: column('Время', 'Сотрудник').id,
    email: column('Время', 'Почта').id,
    startedAt: column('Время', 'Начало').id,
    endedAt: column('Время', 'Конец').id,
    minutes: column('Время', 'Минуты').id,
    note: column('Время', 'Заметка').id,
  }
  const linkFields = {
    title: column('Зависимости', 'Связь').id,
    project: column('Зависимости', 'Проект').id,
    from: column('Зависимости', 'Предшественник').id,
    to: column('Зависимости', 'Последователь').id,
  }
  const templateFields = {
    name: column('Шаблоны проектов', 'Название').id,
    payload: column('Шаблоны проектов', 'Снимок').id,
    createdAt: column('Шаблоны проектов', 'Создан').id,
    author: column('Шаблоны проектов', 'Автор').id,
  }
  const shareFields = {
    token: column('Ссылки клиента', 'Токен').id,
    project: column('Ссылки клиента', 'Проект').id,
    label: column('Ссылки клиента', 'Подпись').id,
    createdAt: column('Ссылки клиента', 'Создана').id,
  }
  const statuses = {
    todo: choice('Задачи', 'Статус', 'К работе'),
    doing: choice('Задачи', 'Статус', 'В работе'),
    review: choice('Задачи', 'Статус', 'На проверке'),
    done: choice('Задачи', 'Статус', 'Готово'),
  }
  const priorities = {
    low: choice('Задачи', 'Приоритет', 'Низкий'),
    medium: choice('Задачи', 'Приоритет', 'Средний'),
    high: choice('Задачи', 'Приоритет', 'Высокий'),
    urgent: choice('Задачи', 'Приоритет', 'Срочный'),
  }
  const projectStatuses = {
    draft: choice('Проекты', 'Статус', 'Черновик'),
    active: choice('Проекты', 'Статус', 'В работе'),
    paused: choice('Проекты', 'Статус', 'На паузе'),
    done: choice('Проекты', 'Статус', 'Сдан'),
    cancelled: choice('Проекты', 'Статус', 'Отменён'),
  }
  const stageStatuses = {
    planned: choice('Этапы', 'Статус', 'Запланирован'),
    current: choice('Этапы', 'Статус', 'Текущий'),
    done: choice('Этапы', 'Статус', 'Завершён'),
  }
  const eventKinds = {
    created: choice('Лента', 'Вид', 'Задача создана'),
    status: choice('Лента', 'Вид', 'Статус изменён'),
    comment: choice('Лента', 'Вид', 'Комментарий'),
  }
  const repeats = {
    none: choice('Задачи', 'Повтор', 'Не повторять'),
    daily: choice('Задачи', 'Повтор', 'Ежедневно'),
    weekly: choice('Задачи', 'Повтор', 'Еженедельно'),
    monthly: choice('Задачи', 'Повтор', 'Ежемесячно'),
    custom: choice('Задачи', 'Повтор', 'Свой интервал'),
  }
  const ids = {
    mineScreenId: newId('screen'), boardScreenId: newId('screen'), projectsScreenId: newId('screen'),
    projectScreenId: newId('screen'), taskScreenId: newId('screen'), peopleScreenId: newId('screen'), clientsScreenId: newId('screen'),
    ganttScreenId: newId('screen'), workloadScreenId: newId('screen'), templatesScreenId: newId('screen'), clientScreenId: newId('screen'),
    createTaskFormId: newId('component'), editTaskFormId: newId('component'), createProjectFormId: newId('component'),
    editProjectFormId: newId('component'), commentFormId: newId('component'),
  }
  const nodes: AppV2Node[] = []
  const sources: AppV2['sources'] = []
  const workflows: AppV2['workflows'] = []
  const rules: AppV2['policy']['workflows'] = []
  const input = (fieldId: string, label: string, required = false) => {
    const id = newId('component')
    nodes.push({ id, name: label, type: 'input', fieldId, label, required, readOnly: false, initialValue: null, visibleTo: null, visibleWhen: null })
    return id
  }
  const flow = (name: string, formId: string | null, rowTableId: string | null, screenTableId: string | null, steps: AppV2['workflows'][number]['steps'], allowed: AppV2Audience) => {
    const id = newId('action')
    workflows.push({ id, name, input: { rowTableId, formId, screenTableId }, steps })
    rules.push({ workflowId: id, audience: allowed })
    return id
  }
  const bind = (formId: string, fieldId: string) => ({ kind: 'form' as const, formId, fieldId })
  const formOf = (id: string, name: string, tableId: string, mode: 'create' | 'edit', childIds: string[], submitLabel: string, allowed: AppV2Audience, rowTableId: string | null, screenTableId: string | null) => {
    nodes.push({
      id, name, type: 'form', tableId, mode, childIds, submitLabel, visibleTo: allowed, visibleWhen: null,
      events: { submit: flow(name, id, rowTableId, screenTableId, [
        mode === 'create'
          ? { id: newId('action'), type: 'create_row', tableId, values: Object.fromEntries(childIds.map(childId => {
            const node = nodes.find(item => item.id === childId)
            const fieldId = node && node.type === 'input' ? node.fieldId : childIds[0]!
            return [fieldId, bind(id, fieldId)]
          })) }
          : { id: newId('action'), type: 'update_row', tableId, target: { kind: 'current' }, values: Object.fromEntries(childIds.map(childId => {
            const node = nodes.find(item => item.id === childId)
            const fieldId = node && node.type === 'input' ? node.fieldId : childIds[0]!
            return [fieldId, bind(id, fieldId)]
          })) },
      ], allowed) },
    })
  }
  formOf(ids.createTaskFormId, 'Новая задача', tasks.id, 'create', [
    input(task.title, 'Задача', true), input(task.project, 'Проект', true), input(task.assignee, 'Исполнитель', true),
    input(task.due, 'Срок', true), input(task.priority, 'Приоритет'), input(task.status, 'Статус'), input(task.description, 'Описание'),
  ], 'Создать задачу', owner, null, null)
  formOf(ids.editTaskFormId, 'Задача', tasks.id, 'edit', [
    input(task.title, 'Задача', true), input(task.project, 'Проект'), input(task.assignee, 'Исполнитель'),
    input(task.start, 'Начало'), input(task.due, 'Срок'), input(task.estimate, 'Оценка, мин'),
    input(task.priority, 'Приоритет'), input(task.status, 'Статус'),
    input(task.description, 'Описание'), input(task.checklist, 'Чек-лист'), input(task.files, 'Файлы'),
    input(task.observers, 'Наблюдатели'),
  ], 'Сохранить', both, tasks.id, tasks.id)
  formOf(ids.createProjectFormId, 'Новый проект', projects.id, 'create', [
    input(project.title, 'Название', true), input(project.client, 'Клиент'), input(project.owner, 'Ответственный'),
    input(project.start, 'Начало'), input(project.due, 'Срок'), input(project.budget, 'Бюджет'), input(project.status, 'Статус'),
  ], 'Создать проект', owner, null, null)
  formOf(ids.editProjectFormId, 'Проект', projects.id, 'edit', [
    input(project.title, 'Название', true), input(project.client, 'Клиент'), input(project.owner, 'Ответственный'),
    input(project.start, 'Начало'), input(project.due, 'Срок'), input(project.budget, 'Бюджет'), input(project.status, 'Статус'),
  ], 'Сохранить', owner, projects.id, projects.id)
  formOf(ids.commentFormId, 'Комментарий', comments.id, 'create', [input(comment.text, 'Комментарий', true), input(comment.task, 'Задача', true)], 'Добавить комментарий', both, tasks.id, tasks.id)
  const facts = (names: { id: string; name: string }[]) => names.map(item => {
    const id = newId('component')
    nodes.push({ id, name: item.name, type: 'field', label: item.name, value: { kind: 'row', fieldId: item.id }, visibleTo: null, visibleWhen: null })
    return id
  })
  const collection = (name: string, tableId: string, titleFieldId: string, detailId: string | null, allowed: AppV2Audience, sortFieldId: string | null, filter: AppV2['sources'][number]['filter'] = null, screenTableId: string | null = null) => {
    const id = newId('component'), sourceId = newId('component')
    const open = detailId ? flow(`Открыть: ${name}`, null, tableId, screenTableId, [{ id: newId('action'), type: 'open_screen', screenId: detailId, record: { kind: 'current' } }], allowed) : null
    sources.push({ id: sourceId, tableId, screenTableId, viewId: null, filter, sorts: sortFieldId ? [{ fieldId: sortFieldId, direction: 'asc' }] : [], searchFieldIds: [titleFieldId], pageSize: 100 })
    nodes.push({ id, name, type: 'collection', sourceId, layout: 'list', titleFieldId, subtitleFieldId: null, itemIds: [], visibleTo: null, visibleWhen: null, events: { itemPress: open } })
    return id
  }
  const taskFacts = facts([
    { id: task.title, name: 'Задача' }, { id: task.project, name: 'Проект' }, { id: task.assignee, name: 'Исполнитель' },
    { id: task.assigneeEmail, name: 'Почта исполнителя' }, { id: task.start, name: 'Начало' }, { id: task.due, name: 'Срок' },
    { id: task.estimate, name: 'Оценка' }, { id: task.author, name: 'Постановщик' }, { id: task.observers, name: 'Наблюдатели' },
    { id: task.priority, name: 'Приоритет' }, { id: task.status, name: 'Статус' }, { id: task.description, name: 'Описание' },
    { id: task.checklist, name: 'Чек-лист' }, { id: task.files, name: 'Файлы' }, { id: task.sort, name: 'Порядок' },
    { id: task.parent, name: 'Родитель' }, { id: task.stage, name: 'Этап' }, { id: task.repeat, name: 'Повтор' },
  ])
  const projectFacts = facts([
    { id: project.title, name: 'Название' }, { id: project.client, name: 'Клиент' }, { id: project.owner, name: 'Ответственный' },
    { id: project.start, name: 'Начало' }, { id: project.due, name: 'Срок' }, { id: project.budget, name: 'Бюджет' },
    { id: project.status, name: 'Статус' }, { id: project.progress, name: 'Прогресс' },
  ])
  const clientProjectFacts = facts([
    { id: project.title, name: 'Название' }, { id: project.start, name: 'Начало' }, { id: project.due, name: 'Срок' },
    { id: project.status, name: 'Статус' }, { id: project.progress, name: 'Прогресс' },
  ])
  const byTask = { op: 'includes' as const, left: { kind: 'row' as const, fieldId: comment.task }, right: { kind: 'screen_row_id' as const } }
  const tasksByProject = { op: 'includes' as const, left: { kind: 'row' as const, fieldId: task.project }, right: { kind: 'screen_row_id' as const } }
  const eventsByProject = { op: 'includes' as const, left: { kind: 'row' as const, fieldId: event.project }, right: { kind: 'screen_row_id' as const } }
  const linksByProject = { op: 'includes' as const, left: { kind: 'row' as const, fieldId: linkFields.project }, right: { kind: 'screen_row_id' as const } }
  const timeByProject = { op: 'includes' as const, left: { kind: 'row' as const, fieldId: timeFields.project }, right: { kind: 'screen_row_id' as const } }
  const mineComments = collection('Комментарии для упоминаний', comments.id, comment.text, null, both, comment.at)
  const boardStages = collection('Этапы доски', stages.id, stage.title, null, both, stage.title)
  const projectStages = collection('Этапы проекта', stages.id, stage.title, null, both, stage.start, { op: 'includes', left: { kind: 'row', fieldId: stage.project }, right: { kind: 'screen_row_id' } }, projects.id)
  const mineTasks = collection('Мои задачи', tasks.id, task.title, ids.taskScreenId, both, task.sort)
  const minePeople = collection('Сотрудники списка', people.id, person.name, null, both, person.name)
  const mineProjects = collection('Проекты списка', projects.id, project.title, ids.projectScreenId, both, project.due)
  const boardTasks = collection('Задачи на доске', tasks.id, task.title, ids.taskScreenId, both, task.sort)
  const boardPeople = collection('Сотрудники доски', people.id, person.name, null, both, person.name)
  const boardProjects = collection('Проекты доски', projects.id, project.title, ids.projectScreenId, both, project.due)
  const projectTasks = collection('Задачи проекта', tasks.id, task.title, ids.taskScreenId, both, task.sort, tasksByProject, projects.id)
  const projectPeople = collection('Сотрудники проекта', people.id, person.name, null, both, person.name)
  const projectClients = collection('Клиенты проекта', clients.id, client.name, null, owner, client.name)
  const projectLinks = collection('Зависимости проекта', links.id, linkFields.title, null, both, linkFields.title, linksByProject, projects.id)
  const projectTime = collection('Время проекта', time.id, timeFields.note, null, both, timeFields.startedAt, timeByProject, projects.id)
  const projectShares = collection('Ссылки проекта', shares.id, shareFields.label, null, owner, shareFields.createdAt, { op: 'includes', left: { kind: 'row', fieldId: shareFields.project }, right: { kind: 'screen_row_id' } }, projects.id)
  const allProjects = collection('Проекты', projects.id, project.title, ids.projectScreenId, owner, project.due)
  const allPeople = collection('Сотрудники', people.id, person.name, null, owner, person.name)
  const allClients = collection('Клиенты', clients.id, client.name, null, owner, client.name)
  const allTemplates = collection('Шаблоны', templates.id, templateFields.name, null, owner, templateFields.createdAt)
  const taskFamily = collection('Задачи карточки', tasks.id, task.title, null, both, task.sort)
  const taskComments = collection('Комментарии задачи', comments.id, comment.text, null, both, comment.at, byTask, tasks.id)
  const taskPeople = collection('Сотрудники задачи', people.id, person.name, null, both, person.name)
  const taskProjects = collection('Проекты задачи', projects.id, project.title, ids.projectScreenId, both, project.due)
  const taskTime = collection('Время задачи', time.id, timeFields.note, null, both, timeFields.startedAt, { op: 'includes', left: { kind: 'row', fieldId: timeFields.task }, right: { kind: 'screen_row_id' } }, tasks.id)
  const projectEvents = collection('Лента проекта', events.id, event.text, null, both, event.at, eventsByProject, projects.id)
  const ganttTasks = collection('Задачи Ганта', tasks.id, task.title, ids.taskScreenId, teamAndClient, task.sort)
  const ganttStages = collection('Этапы Ганта', stages.id, stage.title, null, teamAndClient, stage.start)
  const ganttLinks = collection('Связи Ганта', links.id, linkFields.title, null, teamAndClient, linkFields.title)
  const ganttProjects = collection('Проекты Ганта', projects.id, project.title, ids.projectScreenId, teamAndClient, project.due)
  const ganttPeople = collection('Сотрудники Ганта', people.id, person.name, null, teamAndClient, person.name)
  const workloadTasks = collection('Задачи нагрузки', tasks.id, task.title, ids.taskScreenId, both, task.due)
  const workloadPeople = collection('Сотрудники нагрузки', people.id, person.name, null, both, person.name)
  const workloadTime = collection('Время нагрузки', time.id, timeFields.note, null, both, timeFields.startedAt)
  const clientTasks = collection('Задачи клиента', tasks.id, task.title, null, clientRole, task.sort, tasksByProject, projects.id)
  const clientStages = collection('Этапы клиента', stages.id, stage.title, null, clientRole, stage.start, { op: 'includes', left: { kind: 'row', fieldId: stage.project }, right: { kind: 'screen_row_id' } }, projects.id)
  const clientLinks = collection('Связи клиента', links.id, linkFields.title, null, clientRole, linkFields.title, linksByProject, projects.id)
  const clientPeople = collection('Команда клиента', people.id, person.name, null, clientRole, person.name)
  const screen = (id: string, name: string, menuLabel: string | undefined, icon: string, audience: AppV2Audience, contextTableId: string | null, rootIds: string[], navigation: boolean) =>
    ({ id, name, ...(menuLabel ? { menuLabel } : {}), icon, audience, contextTableId, rootIds, navigation, events: { enter: null } })
  const columnsOf = (tableId: string) => built.fields.filter(item => item.tableId === tableId).map(item => item.id)
  const editable = (tableId: string) => built.fields.filter(item => item.tableId === tableId && writable.has(item.type)).map(item => item.id)
  const grant = (audience: AppV2Audience, value: Omit<AppV2Grant, 'audience'>): AppV2Grant => ({ audience, ...value })
  const owned = (fieldId: string) => ({ kind: 'owned' as const, fieldId, property: 'email' as const })
  const all = { kind: 'all' as const }
  const staffTaskUpdate = [
    task.title, task.project, task.assignee, task.start, task.due, task.estimate, task.observers, task.priority, task.status,
    task.description, task.checklist, task.files, task.sort, task.stage, task.parent,
  ]
  const clientTaskRead = [
    task.title, task.project, task.assignee, task.start, task.due, task.priority, task.status, task.description,
    task.sort, task.parent, task.stage, task.estimate,
  ]
  const clientProjectRead = [project.title, project.start, project.due, project.status, project.progress]
  const clientLinkRead = [linkFields.project, linkFields.from, linkFields.to]
  return {
    formatVersion: 2, id: meta.id, workspaceId: meta.workspaceId, name: meta.name, slug: meta.slug, purpose: 'business',
    appearance: { navigation: 'tabs', icon: 'clipboard', density: 'regular', corners: 'rounded' },
    theme: { accent: 'blue', scheme: 'light', logoKey: null, iconKey: null },
    roles: [{ id: 'owner', name: 'Руководитель' }, { id: 'staff', name: 'Исполнитель' }, { id: 'client', name: 'Клиент' }],
    authentication: { mode: 'invite_only', defaultRoleId: null, members: [{ email: meta.email.trim().toLowerCase(), roleIds: ['owner'], company: '' }] },
    homeScreenId: ids.mineScreenId,
    projects: {
      projectsTableId: projects.id, tasksTableId: tasks.id, peopleTableId: people.id, clientsTableId: clients.id,
      commentsTableId: comments.id, eventsTableId: events.id, stagesTableId: stages.id,
      timeTableId: time.id, linksTableId: links.id, templatesTableId: templates.id, sharesTableId: shares.id,
      ...ids, project, task, stage, person, client, comment, event,
      time: timeFields, link: linkFields, template: templateFields, share: shareFields,
      statuses, priorities, projectStatuses, eventKinds, stageStatuses, repeats,
      activeChoiceId: choice('Сотрудники', 'Статус', 'Активен'),
    },
    screens: [
      screen(ids.mineScreenId, 'Мои задачи', 'Задачи', 'clipboard', both, null, [mineTasks, minePeople, mineProjects, mineComments], true),
      screen(ids.boardScreenId, 'Доска', undefined, 'table', both, null, [boardTasks, boardPeople, boardProjects, boardStages, ids.createTaskFormId], true),
      screen(ids.ganttScreenId, 'Гант', undefined, 'chart', teamAndClient, null, [ganttTasks, ganttStages, ganttLinks, ganttProjects, ganttPeople], true),
      screen(ids.workloadScreenId, 'Нагрузка', undefined, 'users', both, null, [workloadTasks, workloadPeople, workloadTime], true),
      screen(ids.projectsScreenId, 'Проекты', undefined, 'folder', both, null, [allProjects, allClients, allPeople, ids.createProjectFormId], true),
      screen(ids.templatesScreenId, 'Шаблоны', undefined, 'copy', owner, null, [allTemplates], true),
      screen(ids.peopleScreenId, 'Команда', undefined, 'users', both, null, [collection('Карточки сотрудников', people.id, person.name, null, both, person.name)], true),
      screen(ids.clientsScreenId, 'Клиенты', undefined, 'building', both, null, [collection('Карточки клиентов', clients.id, client.name, null, both, client.name)], true),
      screen(ids.projectScreenId, 'Проект', undefined, 'folder', both, projects.id, [...projectFacts, projectTasks, projectStages, projectEvents, projectPeople, projectClients, projectLinks, projectTime, projectShares, ids.editProjectFormId], false),
      screen(ids.clientScreenId, 'Проект для клиента', undefined, 'eye', clientRole, projects.id, [...clientProjectFacts, clientTasks, clientStages, clientLinks, clientPeople], false),
      screen(ids.taskScreenId, 'Задача', undefined, 'clipboard', both, tasks.id, [...taskFacts, taskFamily, taskComments, taskPeople, taskProjects, taskTime, ids.editTaskFormId, ids.commentFormId], false),
    ],
    nodes, sources, workflows,
    policy: {
      workflows: rules,
      tables: [
        { tableId: tasks.id, grants: [
          grant(owner, { read: { fieldIds: columnsOf(tasks.id), rows: all }, create: { fieldIds: editable(tasks.id) }, update: { fieldIds: editable(tasks.id), rows: all } }),
          grant(staff, { read: { fieldIds: columnsOf(tasks.id), rows: all }, update: { fieldIds: staffTaskUpdate, rows: owned(task.assigneeEmail) }, create: { fieldIds: editable(tasks.id).filter(id => id !== task.assigneeEmail && id !== task.authorEmail && id !== task.seriesId), owner: { fieldId: task.assigneeEmail, property: 'email' } } }),
          grant(clientRole, { read: { fieldIds: clientTaskRead, rows: all } }),
        ] },
        { tableId: projects.id, grants: [
          grant(owner, { read: { fieldIds: columnsOf(projects.id), rows: all }, create: { fieldIds: editable(projects.id) }, update: { fieldIds: editable(projects.id), rows: all } }),
          grant(staff, { read: { fieldIds: columnsOf(projects.id), rows: all }, update: { fieldIds: [project.progress], rows: all } }),
          grant(clientRole, { read: { fieldIds: clientProjectRead, rows: all } }),
        ] },
        { tableId: people.id, grants: [
          grant(owner, { read: { fieldIds: columnsOf(people.id), rows: all }, create: { fieldIds: editable(people.id) }, update: { fieldIds: editable(people.id), rows: all } }),
          grant(staff, { read: { fieldIds: [person.name, person.email, person.phone, person.photo, person.role, person.active], rows: all } }),
          grant(clientRole, { read: { fieldIds: [person.name, person.photo, person.role], rows: all } }),
        ] },
        { tableId: clients.id, grants: [
          grant(owner, { read: { fieldIds: columnsOf(clients.id), rows: all }, create: { fieldIds: editable(clients.id) }, update: { fieldIds: editable(clients.id), rows: all } }),
          grant(staff, { read: { fieldIds: columnsOf(clients.id), rows: all } }),
        ] },
        { tableId: stages.id, grants: [
          grant(owner, { read: { fieldIds: columnsOf(stages.id), rows: all }, create: { fieldIds: editable(stages.id) }, update: { fieldIds: editable(stages.id), rows: all } }),
          grant(staff, { read: { fieldIds: columnsOf(stages.id), rows: all } }),
          grant(clientRole, { read: { fieldIds: columnsOf(stages.id), rows: all } }),
        ] },
        { tableId: comments.id, grants: [
          grant(owner, { read: { fieldIds: columnsOf(comments.id), rows: all }, create: { fieldIds: editable(comments.id) }, update: { fieldIds: editable(comments.id), rows: all }, delete: { rows: owned(comment.authorEmail) } }),
          grant(staff, {
            read: { fieldIds: columnsOf(comments.id), rows: all },
            create: { fieldIds: [comment.text, comment.task, comment.project, comment.at, comment.author, comment.authorEmail, comment.assigneeEmail, comment.mentions, comment.replyTo, comment.editedAt, comment.internal] },
            update: { fieldIds: [comment.text, comment.editedAt, comment.mentions, comment.replyTo], rows: owned(comment.authorEmail) },
            delete: { rows: owned(comment.authorEmail) },
          }),
        ] },
        { tableId: events.id, grants: [
          grant(owner, { read: { fieldIds: columnsOf(events.id), rows: all }, create: { fieldIds: editable(events.id) } }),
          grant(staff, { read: { fieldIds: columnsOf(events.id), rows: owned(event.assigneeEmail) }, create: { fieldIds: [event.text, event.project, event.task, event.at, event.kind, event.author, event.authorEmail], owner: { fieldId: event.assigneeEmail, property: 'email' } } }),
        ] },
        { tableId: time.id, grants: [
          grant(owner, { read: { fieldIds: columnsOf(time.id), rows: all }, create: { fieldIds: editable(time.id) }, update: { fieldIds: editable(time.id), rows: all }, delete: { rows: all } }),
          grant(staff, {
            read: { fieldIds: columnsOf(time.id), rows: all },
            create: { fieldIds: editable(time.id).filter(id => id !== timeFields.email), owner: { fieldId: timeFields.email, property: 'email' } },
            update: { fieldIds: [timeFields.startedAt, timeFields.endedAt, timeFields.minutes, timeFields.note, timeFields.task, timeFields.project, timeFields.person], rows: owned(timeFields.email) },
          }),
        ] },
        { tableId: links.id, grants: [
          grant(owner, { read: { fieldIds: columnsOf(links.id), rows: all }, create: { fieldIds: editable(links.id) }, update: { fieldIds: editable(links.id), rows: all }, delete: { rows: all } }),
          grant(staff, { read: { fieldIds: columnsOf(links.id), rows: all } }),
          grant(clientRole, { read: { fieldIds: clientLinkRead, rows: all } }),
        ] },
        { tableId: templates.id, grants: [
          grant(owner, { read: { fieldIds: columnsOf(templates.id), rows: all }, create: { fieldIds: editable(templates.id) }, update: { fieldIds: editable(templates.id), rows: all }, delete: { rows: all } }),
        ] },
        { tableId: shares.id, grants: [
          grant(owner, { read: { fieldIds: columnsOf(shares.id), rows: all }, create: { fieldIds: editable(shares.id) }, update: { fieldIds: editable(shares.id), rows: all }, delete: { rows: all } }),
        ] },
      ],
    },
  }
}
