import { newId } from '@tableapp/schema'
import type { AppV2, AppV2Audience, AppV2Grant, AppV2Node } from '@tableapp/schema/app-v2'
import type { BuiltTemplate } from './build'

export const isProjectsTemplate = (id: string) => id === 'proekty'

const writable = new Set(['text', 'long_text', 'number', 'email', 'phone', 'url', 'date', 'datetime', 'checkbox', 'single_select', 'multi_select', 'relation', 'image', 'attachment'])
const owner: AppV2Audience = { kind: 'roles', roleIds: ['owner'] }
const staff: AppV2Audience = { kind: 'roles', roleIds: ['staff'] }
const both: AppV2Audience = { kind: 'roles', roleIds: ['owner', 'staff'] }

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
  const projects = table('Проекты'), tasks = table('Задачи'), people = table('Сотрудники'), clients = table('Клиенты'), comments = table('Комментарии'), events = table('Лента')
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
    due: column('Задачи', 'Срок').id,
    priority: column('Задачи', 'Приоритет').id,
    status: column('Задачи', 'Статус').id,
    description: column('Задачи', 'Описание').id,
    checklist: column('Задачи', 'Подзадачи').id,
    files: column('Задачи', 'Файлы').id,
    sort: column('Задачи', 'Порядок').id,
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
  const eventKinds = {
    created: choice('Лента', 'Вид', 'Задача создана'),
    status: choice('Лента', 'Вид', 'Статус изменён'),
    comment: choice('Лента', 'Вид', 'Комментарий'),
  }
  const ids = {
    mineScreenId: newId('screen'), boardScreenId: newId('screen'), projectsScreenId: newId('screen'),
    projectScreenId: newId('screen'), taskScreenId: newId('screen'), peopleScreenId: newId('screen'), clientsScreenId: newId('screen'),
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
    input(task.due, 'Срок'), input(task.priority, 'Приоритет'), input(task.status, 'Статус'),
    input(task.description, 'Описание'), input(task.checklist, 'Подзадачи'), input(task.files, 'Файлы'),
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
    { id: task.assigneeEmail, name: 'Почта исполнителя' }, { id: task.due, name: 'Срок' }, { id: task.priority, name: 'Приоритет' },
    { id: task.status, name: 'Статус' }, { id: task.description, name: 'Описание' }, { id: task.checklist, name: 'Подзадачи' },
    { id: task.files, name: 'Файлы' }, { id: task.sort, name: 'Порядок' },
  ])
  const projectFacts = facts([
    { id: project.title, name: 'Название' }, { id: project.client, name: 'Клиент' }, { id: project.owner, name: 'Ответственный' },
    { id: project.start, name: 'Начало' }, { id: project.due, name: 'Срок' }, { id: project.budget, name: 'Бюджет' },
    { id: project.status, name: 'Статус' }, { id: project.progress, name: 'Прогресс' },
  ])
  const byTask = { op: 'includes' as const, left: { kind: 'row' as const, fieldId: comment.task }, right: { kind: 'screen_row_id' as const } }
  const tasksByProject = { op: 'includes' as const, left: { kind: 'row' as const, fieldId: task.project }, right: { kind: 'screen_row_id' as const } }
  const eventsByProject = { op: 'includes' as const, left: { kind: 'row' as const, fieldId: event.project }, right: { kind: 'screen_row_id' as const } }
  const mineTasks = collection('Мои задачи', tasks.id, task.title, ids.taskScreenId, both, task.sort)
  const minePeople = collection('Сотрудники списка', people.id, person.name, null, both, person.name)
  const mineProjects = collection('Проекты списка', projects.id, project.title, ids.projectScreenId, both, project.due)
  const boardTasks = collection('Задачи на доске', tasks.id, task.title, ids.taskScreenId, both, task.sort)
  const boardPeople = collection('Сотрудники доски', people.id, person.name, null, both, person.name)
  const boardProjects = collection('Проекты доски', projects.id, project.title, ids.projectScreenId, both, project.due)
  const projectTasks = collection('Задачи проекта', tasks.id, task.title, ids.taskScreenId, both, task.sort, tasksByProject, projects.id)
  const projectPeople = collection('Сотрудники проекта', people.id, person.name, null, both, person.name)
  const projectClients = collection('Клиенты проекта', clients.id, client.name, null, owner, client.name)
  const allProjects = collection('Проекты', projects.id, project.title, ids.projectScreenId, owner, project.due)
  const allPeople = collection('Сотрудники', people.id, person.name, null, owner, person.name)
  const allClients = collection('Клиенты', clients.id, client.name, null, owner, client.name)
  const taskComments = collection('Комментарии задачи', comments.id, comment.text, null, both, comment.at, byTask, tasks.id)
  const taskPeople = collection('Сотрудники задачи', people.id, person.name, null, both, person.name)
  const taskProjects = collection('Проекты задачи', projects.id, project.title, ids.projectScreenId, both, project.due)
  const projectEvents = collection('Лента проекта', events.id, event.text, null, both, event.at, eventsByProject, projects.id)
  const screen = (id: string, name: string, menuLabel: string | undefined, icon: string, audience: AppV2Audience, contextTableId: string | null, rootIds: string[], navigation: boolean) =>
    ({ id, name, ...(menuLabel ? { menuLabel } : {}), icon, audience, contextTableId, rootIds, navigation, events: { enter: null } })
  const columnsOf = (tableId: string) => built.fields.filter(item => item.tableId === tableId).map(item => item.id)
  const editable = (tableId: string) => built.fields.filter(item => item.tableId === tableId && writable.has(item.type)).map(item => item.id)
  const grant = (audience: AppV2Audience, value: Omit<AppV2Grant, 'audience'>): AppV2Grant => ({ audience, ...value })
  const owned = (fieldId: string) => ({ kind: 'owned' as const, fieldId, property: 'email' as const })
  const all = { kind: 'all' as const }
  const staffTaskUpdate = [task.title, task.project, task.assignee, task.assigneeEmail, task.due, task.priority, task.status, task.description, task.checklist, task.files, task.sort]
  return {
    formatVersion: 2, id: meta.id, workspaceId: meta.workspaceId, name: meta.name, slug: meta.slug, purpose: 'business',
    appearance: { navigation: 'tabs', icon: 'clipboard', density: 'regular', corners: 'rounded' },
    theme: { accent: 'blue', scheme: 'light', logoKey: null, iconKey: null },
    roles: [{ id: 'owner', name: 'Руководитель' }, { id: 'staff', name: 'Исполнитель' }],
    authentication: { mode: 'invite_only', defaultRoleId: null, members: [{ email: meta.email.trim().toLowerCase(), roleIds: ['owner'], company: '' }] },
    homeScreenId: ids.mineScreenId,
    projects: {
      projectsTableId: projects.id, tasksTableId: tasks.id, peopleTableId: people.id, clientsTableId: clients.id,
      commentsTableId: comments.id, eventsTableId: events.id,
      ...ids, project, task, person, client, comment, event, statuses, priorities, projectStatuses, eventKinds,
      activeChoiceId: choice('Сотрудники', 'Статус', 'Активен'),
    },
    screens: [
      screen(ids.mineScreenId, 'Мои задачи', 'Задачи', 'clipboard', both, null, [mineTasks, minePeople, mineProjects], true),
      screen(ids.boardScreenId, 'Доска', undefined, 'table', both, null, [boardTasks, boardPeople, boardProjects, ids.createTaskFormId], true),
      screen(ids.projectsScreenId, 'Проекты', undefined, 'folder', both, null, [allProjects, allClients, allPeople, ids.createProjectFormId], true),
      screen(ids.peopleScreenId, 'Команда', undefined, 'users', both, null, [collection('Карточки сотрудников', people.id, person.name, null, both, person.name)], true),
      screen(ids.clientsScreenId, 'Клиенты', undefined, 'building', both, null, [collection('Карточки клиентов', clients.id, client.name, null, both, client.name)], true),
      screen(ids.projectScreenId, 'Проект', undefined, 'folder', both, projects.id, [...projectFacts, projectTasks, projectEvents, projectPeople, projectClients, ids.editProjectFormId], false),
      screen(ids.taskScreenId, 'Задача', undefined, 'clipboard', both, tasks.id, [...taskFacts, taskComments, taskPeople, taskProjects, ids.editTaskFormId, ids.commentFormId], false),
    ],
    nodes, sources, workflows,
    policy: {
      workflows: rules,
      tables: [
        { tableId: tasks.id, grants: [
          grant(owner, { read: { fieldIds: columnsOf(tasks.id), rows: all }, create: { fieldIds: editable(tasks.id) }, update: { fieldIds: editable(tasks.id), rows: all } }),
          grant(staff, { read: { fieldIds: columnsOf(tasks.id), rows: owned(task.assigneeEmail) }, update: { fieldIds: staffTaskUpdate, rows: owned(task.assigneeEmail) } }),
        ] },
        { tableId: projects.id, grants: [
          grant(owner, { read: { fieldIds: columnsOf(projects.id), rows: all }, create: { fieldIds: editable(projects.id) }, update: { fieldIds: editable(projects.id), rows: all } }),
          grant(staff, { read: { fieldIds: columnsOf(projects.id), rows: all }, update: { fieldIds: [project.progress], rows: all } }),
        ] },
        { tableId: people.id, grants: [
          grant(owner, { read: { fieldIds: columnsOf(people.id), rows: all }, create: { fieldIds: editable(people.id) }, update: { fieldIds: editable(people.id), rows: all } }),
          grant(staff, { read: { fieldIds: [person.name, person.email, person.phone, person.photo, person.role, person.active], rows: all } }),
        ] },
        { tableId: clients.id, grants: [
          grant(owner, { read: { fieldIds: columnsOf(clients.id), rows: all }, create: { fieldIds: editable(clients.id) }, update: { fieldIds: editable(clients.id), rows: all } }),
          grant(staff, { read: { fieldIds: columnsOf(clients.id), rows: all } }),
        ] },
        { tableId: comments.id, grants: [
          grant(owner, { read: { fieldIds: columnsOf(comments.id), rows: all }, create: { fieldIds: editable(comments.id) } }),
          grant(staff, { read: { fieldIds: columnsOf(comments.id), rows: owned(comment.assigneeEmail) }, create: { fieldIds: [comment.text, comment.task, comment.project, comment.at, comment.author, comment.authorEmail], owner: { fieldId: comment.assigneeEmail, property: 'email' } } }),
        ] },
        { tableId: events.id, grants: [
          grant(owner, { read: { fieldIds: columnsOf(events.id), rows: all }, create: { fieldIds: editable(events.id) } }),
          grant(staff, { read: { fieldIds: columnsOf(events.id), rows: owned(event.assigneeEmail) }, create: { fieldIds: [event.text, event.project, event.task, event.at, event.kind, event.author, event.authorEmail], owner: { fieldId: event.assigneeEmail, property: 'email' } } }),
        ] },
      ],
    },
  }
}
