'use server'
import { rows } from '@tableapp/db'
import { newId } from '@tableapp/schema'
import type { AppV2Json, AppV2Record } from '@tableapp/schema/app-v2'
import { and, eq, isNull } from 'drizzle-orm'
import { publishedV2Context, publishedV2Definition, publishedV2Screen } from '@/lib/builder-v2-published'
import { canParent, civilDay, eventText, progressPercent, type EventKind } from '@/lib/projects-logic'
import {
  commentWrite, eventWrite, guardProjectsCreate, guardProjectsDelete, guardProjectsUpdate, linkWrite, moveUpdates,
  projectWrite, shareWrite, taskWrite, templateWrite, timeWrite,
} from '@/lib/projects-persist'
import {
  addDays, canLinkTasks, canStartTimer, captureProjectTemplate, dayIndex, materializeTemplate,
  nextOccurrenceDay, parseTemplatePayload, repeatRuleFromName, serializeTemplatePayload, shouldSpawnOnComplete,
  startTimerStamp, stopTimerValues, validateManualMinutes, type DependencyLink, type TimeEntry,
} from '@/lib/projects-stage2'
import { RowWriteError, createRow, deleteRow, mutationFields, updateRow, writeRows } from '@/lib/row-mutations'

type MoveRequest = { kind: 'move'; revision: string; screenId: string; recordId: string; statusId: string; orderedIds: string[] }
type TaskRequest = { kind: 'task'; revision: string; screenId: string; recordId: string; title: string; projectId: string; parentId?: string; assigneeId: string; assigneeEmail: string; due: string | null; priorityId: string; statusId: string; description: string; checklist: string; files?: unknown }
type CommentRequest = { kind: 'comment'; revision: string; screenId: string; recordId: string; text: string; mentionIds: string[]; replyToId?: string | null }
type CommentEditRequest = { kind: 'comment-edit'; revision: string; screenId: string; recordId: string; text: string; mentionIds: string[] }
type CommentDeleteRequest = { kind: 'comment-delete'; revision: string; screenId: string; recordId: string }
type SubtaskRequest = { kind: 'create-subtask'; revision: string; screenId: string; recordId: string; title: string; assigneeId: string; assigneeEmail: string; due: string | null; priorityId: string }
type ProjectRequest = { kind: 'project'; revision: string; screenId: string; recordId: string; title: string; clientId: string; ownerId: string; start: string | null; due: string | null; budget: number | null; statusId: string }
type CreateTaskRequest = { kind: 'create-task'; revision: string; screenId: string; title: string; projectId: string; assigneeId: string; assigneeEmail: string; due: string | null; priorityId: string; description: string }
type CreateProjectRequest = { kind: 'create-project'; revision: string; screenId: string; title: string; clientId: string; ownerId: string; start: string | null; due: string | null; budget: number | null; statusId: string }
type TimeStartRequest = { kind: 'time-start'; revision: string; screenId: string; recordId: string; note?: string }
type TimeStopRequest = { kind: 'time-stop'; revision: string; screenId: string; recordId: string }
type TimeManualRequest = { kind: 'time-manual'; revision: string; screenId: string; recordId: string; minutes: number; note: string }
type GanttDatesRequest = { kind: 'gantt-dates'; revision: string; screenId: string; recordId: string; start: string; due: string }
type LinkCreateRequest = { kind: 'link-create'; revision: string; screenId: string; projectId: string; fromId: string; toId: string }
type LinkDeleteRequest = { kind: 'link-delete'; revision: string; screenId: string; recordId: string }
type TemplateSaveRequest = { kind: 'template-save'; revision: string; screenId: string; projectId: string; name: string }
type TemplateCreateRequest = { kind: 'template-create'; revision: string; screenId: string; templateId: string; title: string; start: string }
type ShareCreateRequest = { kind: 'share-create'; revision: string; screenId: string; projectId: string; label: string; token: string }
type Request =
  | MoveRequest | TaskRequest | CommentRequest | CommentEditRequest | CommentDeleteRequest | ProjectRequest
  | CreateTaskRequest | CreateProjectRequest | SubtaskRequest
  | TimeStartRequest | TimeStopRequest | TimeManualRequest | GanttDatesRequest
  | LinkCreateRequest | LinkDeleteRequest | TemplateSaveRequest | TemplateCreateRequest | ShareCreateRequest

const text = (value: unknown, max: number) => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max ? value.trim() : null
const maybe = (value: unknown) => value == null || value === '' ? null : typeof value === 'string' && value.length <= 40 ? value : undefined
const idList = (value: unknown) => Array.isArray(value) && value.every(item => typeof item === 'string' && item.length > 0 && item.length <= 80) ? value : null
const day = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null
const noteText = (value: unknown, max = 500) => value == null ? '' : typeof value === 'string' && value.length <= max ? value.trim() : undefined

function readRequest(input: unknown): Request | null {
  if (!input || typeof input !== 'object') return null
  const value = input as Record<string, unknown>
  if (typeof value.revision !== 'string' || value.revision.length < 8 || typeof value.screenId !== 'string') return null
  const revision = value.revision, screenId = value.screenId
  const recordId = typeof value.recordId === 'string' ? value.recordId : ''
  if (value.kind === 'move' && typeof value.statusId === 'string' && idList(value.orderedIds) && recordId) {
    return { kind: 'move', revision, screenId, recordId, statusId: value.statusId, orderedIds: value.orderedIds as string[] }
  }
  if (value.kind === 'task' && recordId && text(value.title, 200) && typeof value.projectId === 'string' && typeof value.assigneeId === 'string' && typeof value.assigneeEmail === 'string' && typeof value.priorityId === 'string' && typeof value.statusId === 'string' && typeof value.description === 'string' && value.description.length <= 4000 && typeof value.checklist === 'string' && value.checklist.length <= 8000 && maybe(value.due) !== undefined && (value.parentId == null || typeof value.parentId === 'string')) {
    return { kind: 'task', revision, screenId, recordId, title: text(value.title, 200)!, projectId: value.projectId, parentId: typeof value.parentId === 'string' ? value.parentId : undefined, assigneeId: value.assigneeId, assigneeEmail: value.assigneeEmail.trim().toLowerCase(), due: maybe(value.due) ?? null, priorityId: value.priorityId, statusId: value.statusId, description: value.description, checklist: value.checklist, files: value.files }
  }
  const mentionIds = value.mentionIds == null ? [] : idList(value.mentionIds)
  if (value.kind === 'comment' && recordId && text(value.text, 2000) && mentionIds && (value.replyToId == null || typeof value.replyToId === 'string')) {
    return { kind: 'comment', revision, screenId, recordId, text: text(value.text, 2000)!, mentionIds, replyToId: typeof value.replyToId === 'string' && value.replyToId ? value.replyToId : null }
  }
  if (value.kind === 'comment-edit' && recordId && text(value.text, 2000) && mentionIds) {
    return { kind: 'comment-edit', revision, screenId, recordId, text: text(value.text, 2000)!, mentionIds }
  }
  if (value.kind === 'comment-delete' && recordId) return { kind: 'comment-delete', revision, screenId, recordId }
  if (value.kind === 'create-subtask' && recordId && text(value.title, 200) && typeof value.assigneeId === 'string' && typeof value.assigneeEmail === 'string' && typeof value.priorityId === 'string' && maybe(value.due) !== undefined) {
    return { kind: 'create-subtask', revision, screenId, recordId, title: text(value.title, 200)!, assigneeId: value.assigneeId, assigneeEmail: value.assigneeEmail.trim().toLowerCase(), due: maybe(value.due) ?? null, priorityId: value.priorityId }
  }
  if (value.kind === 'project' && recordId && text(value.title, 200) && typeof value.clientId === 'string' && typeof value.ownerId === 'string' && typeof value.statusId === 'string' && maybe(value.start) !== undefined && maybe(value.due) !== undefined && (value.budget == null || typeof value.budget === 'number')) {
    return { kind: 'project', revision, screenId, recordId, title: text(value.title, 200)!, clientId: value.clientId, ownerId: value.ownerId, start: maybe(value.start) ?? null, due: maybe(value.due) ?? null, budget: typeof value.budget === 'number' ? value.budget : null, statusId: value.statusId }
  }
  if (value.kind === 'create-task' && text(value.title, 200) && typeof value.projectId === 'string' && typeof value.assigneeId === 'string' && typeof value.assigneeEmail === 'string' && typeof value.priorityId === 'string' && typeof value.description === 'string' && maybe(value.due) !== undefined) {
    return { kind: 'create-task', revision, screenId, title: text(value.title, 200)!, projectId: value.projectId, assigneeId: value.assigneeId, assigneeEmail: value.assigneeEmail.trim().toLowerCase(), due: maybe(value.due) ?? null, priorityId: value.priorityId, description: value.description }
  }
  if (value.kind === 'create-project' && text(value.title, 200) && typeof value.clientId === 'string' && typeof value.ownerId === 'string' && typeof value.statusId === 'string' && maybe(value.start) !== undefined && maybe(value.due) !== undefined && (value.budget == null || typeof value.budget === 'number')) {
    return { kind: 'create-project', revision, screenId, title: text(value.title, 200)!, clientId: value.clientId, ownerId: value.ownerId, start: maybe(value.start) ?? null, due: maybe(value.due) ?? null, budget: typeof value.budget === 'number' ? value.budget : null, statusId: value.statusId }
  }
  const note = noteText(value.note)
  if (value.kind === 'time-start' && recordId && note !== undefined) return { kind: 'time-start', revision, screenId, recordId, note }
  if (value.kind === 'time-stop' && recordId) return { kind: 'time-stop', revision, screenId, recordId }
  if (value.kind === 'time-manual' && recordId && typeof value.minutes === 'number' && note !== undefined) {
    return { kind: 'time-manual', revision, screenId, recordId, minutes: value.minutes, note }
  }
  if (value.kind === 'gantt-dates' && recordId && day(value.start) && day(value.due)) {
    return { kind: 'gantt-dates', revision, screenId, recordId, start: day(value.start)!, due: day(value.due)! }
  }
  if (value.kind === 'link-create' && typeof value.projectId === 'string' && typeof value.fromId === 'string' && typeof value.toId === 'string' && value.projectId && value.fromId && value.toId) {
    return { kind: 'link-create', revision, screenId, projectId: value.projectId, fromId: value.fromId, toId: value.toId }
  }
  if (value.kind === 'link-delete' && recordId) return { kind: 'link-delete', revision, screenId, recordId }
  if (value.kind === 'template-save' && typeof value.projectId === 'string' && value.projectId && text(value.name, 200)) {
    return { kind: 'template-save', revision, screenId, projectId: value.projectId, name: text(value.name, 200)! }
  }
  if (value.kind === 'template-create' && typeof value.templateId === 'string' && value.templateId && text(value.title, 200) && day(value.start)) {
    return { kind: 'template-create', revision, screenId, templateId: value.templateId, title: text(value.title, 200)!, start: day(value.start)! }
  }
  if (value.kind === 'share-create' && typeof value.projectId === 'string' && value.projectId && text(value.label, 120) && typeof value.token === 'string' && value.token.length >= 16 && value.token.length <= 80) {
    return { kind: 'share-create', revision, screenId, projectId: value.projectId, label: text(value.label, 120)!, token: value.token }
  }
  return null
}

const firstId = (value: unknown) => Array.isArray(value) ? value.find((item): item is string => typeof item === 'string') ?? '' : ''

export async function savePublishedProjectsAction(slug: string, input: unknown): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const parsed = readRequest(input)
  if (!parsed) return { ok: false, error: 'Проверьте данные задачи.' }
  try {
    const definition = await publishedV2Definition(slug)
    if (!definition) throw new RowWriteError('missing', 'Приложение недоступно')
    return await writeRows(definition.app.workspaceId, async context => {
      const { app, actor, revision } = await publishedV2Context(slug, context.tx, true)
      if (revision !== parsed.revision) throw new RowWriteError('conflict', 'Приложение обновлено. Обновите страницу.')
      const kit = app.projects
      if (!kit) throw new RowWriteError('denied', 'Это не приложение проектов.')
      if (!actor.authenticated || !actor.id || !actor.email) throw new RowWriteError('denied', 'Для сохранения нужно войти')
      const clientOnly = actor.roleIds.includes('client') && !actor.roleIds.includes('owner') && !actor.roleIds.includes('staff')
      if (clientOnly) throw new RowWriteError('denied', 'Клиент не может менять данные.')
      publishedV2Screen(app, actor, parsed.screenId)
      const actorRef = { id: actor.id, kind: 'app_user' as const }
      const leader = actor.roleIds.includes('owner')
      const email = actor.email.trim().toLowerCase()
      const fields = await mutationFields(context, kit.tasksTableId)
      const statusField = fields.find(field => field.id === kit.task.status)
      const priorityField = fields.find(field => field.id === kit.task.priority)
      const repeatField = kit.task.repeat ? fields.find(field => field.id === kit.task.repeat) : undefined
      const statusName = (value: unknown) => statusField?.type === 'single_select' && typeof value === 'string' ? statusField.options.choices.find(choice => choice.id === value)?.name ?? '' : ''
      const priorityName = (value: unknown) => priorityField?.type === 'single_select' && typeof value === 'string' ? priorityField.options.choices.find(choice => choice.id === value)?.name ?? '' : ''
      const priorityIdOf = (name: string) => priorityField?.type === 'single_select' ? priorityField.options.choices.find(choice => choice.name === name)?.id ?? kit.priorities.medium : kit.priorities.medium
      const repeatNameOf = (value: unknown) => repeatField?.type === 'single_select' && typeof value === 'string' ? repeatField.options.choices.find(choice => choice.id === value)?.name ?? '' : ''
      const kindId = (kind: EventKind) => kind === 'created' ? kit.eventKinds.created : kind === 'status' ? kit.eventKinds.status : kit.eventKinds.comment
      const author = actor.name?.trim() || (leader ? 'Руководитель' : 'Исполнитель')
      const stamp = new Date().toISOString()
      const now = Date.now()
      const loadTasks = async () => context.tx.select().from(rows).where(and(eq(rows.tableId, kit.tasksTableId), isNull(rows.deletedAt)))
      const loadPeople = async () => context.tx.select().from(rows).where(and(eq(rows.tableId, kit.peopleTableId), isNull(rows.deletedAt)))
      const writeEvent = async (kind: EventKind, projectId: string, taskId: string, title: string, assigneeEmail: string, from = '', to = '') => {
        const values = eventWrite(kit.event, { text: eventText(kind, title, from, to), projectId, taskId, at: stamp, kind, kindId: kindId(kind), author, authorEmail: email, assigneeEmail })
        const payload = { ...values }
        if (!leader) delete payload[kit.event.assigneeEmail]
        const decision = guardProjectsCreate(app, actor, kit.eventsTableId, payload)
        if (!decision.ok) throw new RowWriteError('denied', decision.error)
        await createRow(context, kit.eventsTableId, { ...payload, ...decision.ownerValues }, actorRef, { origin: 'manual' })
      }
      const writeProgress = async (projectId: string, taskRows: { id: string; data: Record<string, unknown> }[], override?: { id: string; projectId: string; status: string }) => {
        const statuses = taskRows.flatMap(row => {
          if (firstId(row.data[kit.task.parent])) return []
          const project = row.id === override?.id ? override.projectId : firstId(row.data[kit.task.project])
          if (project !== projectId) return []
          return [row.id === override?.id ? override.status : statusName(row.data[kit.task.status])]
        })
        const values = { [kit.project.progress]: progressPercent(statuses) }
        const [stored] = await context.tx.select().from(rows).where(and(eq(rows.id, projectId), eq(rows.tableId, kit.projectsTableId), isNull(rows.deletedAt))).limit(1)
        if (!stored) return
        const decision = guardProjectsUpdate(app, actor, { id: stored.id, tableId: stored.tableId, values: stored.data as Record<string, AppV2Json> }, values)
        if (!decision.ok) throw new RowWriteError('denied', decision.error)
        await updateRow(context, kit.projectsTableId, projectId, values, actorRef)
      }
      const spawnIfNeeded = async (taskRow: AppV2Record, previousStatus: string, nextStatus: string) => {
        if (!kit.task.repeat || !kit.repeats) return
        const rule = repeatRuleFromName(repeatNameOf(taskRow.values[kit.task.repeat]))
        if (!shouldSpawnOnComplete(previousStatus, nextStatus, rule) || !rule) return
        const dueRaw = taskRow.values[kit.task.due]
        const dueDay = civilDay(dueRaw)
        if (!dueDay) return
        const every = kit.task.repeatEvery && typeof taskRow.values[kit.task.repeatEvery] === 'number' ? Number(taskRow.values[kit.task.repeatEvery]) : null
        const nextDue = nextOccurrenceDay({ due: dueDay, rule, everyDays: every })
        if (!nextDue) return
        const untilDay = kit.task.repeatUntil ? civilDay(taskRow.values[kit.task.repeatUntil]) : null
        if (untilDay && nextDue > untilDay) return
        const startDay = kit.task.start ? civilDay(taskRow.values[kit.task.start]) : null
        const nextStart = startDay && dueDay ? addDays(startDay, dayIndex(dueDay, nextDue)) : null
        const series = kit.task.seriesId ? String(taskRow.values[kit.task.seriesId] || '') : ''
        const seriesId = series || `series_${newId('row').slice(-10)}`
        const values = taskWrite(kit.task, {
          title: String(taskRow.values[kit.task.title] ?? ''),
          projectId: firstId(taskRow.values[kit.task.project]),
          parentId: firstId(taskRow.values[kit.task.parent]) || undefined,
          stageId: firstId(taskRow.values[kit.task.stage]) || null,
          assigneeId: firstId(taskRow.values[kit.task.assignee]),
          assigneeEmail: String(taskRow.values[kit.task.assigneeEmail] ?? '').trim().toLowerCase(),
          authorId: kit.task.author ? firstId(taskRow.values[kit.task.author]) || undefined : undefined,
          authorEmail: kit.task.authorEmail ? String(taskRow.values[kit.task.authorEmail] ?? '') : undefined,
          observerIds: kit.task.observers && Array.isArray(taskRow.values[kit.task.observers]) ? taskRow.values[kit.task.observers] as string[] : undefined,
          due: nextDue,
          start: nextStart,
          estimate: kit.task.estimate && typeof taskRow.values[kit.task.estimate] === 'number' ? Number(taskRow.values[kit.task.estimate]) : null,
          priorityId: String(taskRow.values[kit.task.priority] ?? kit.priorities.medium),
          statusId: kit.statuses.todo,
          description: String(taskRow.values[kit.task.description] ?? ''),
          checklist: String(taskRow.values[kit.task.checklist] ?? '[]'),
          sort: Number(taskRow.values[kit.task.sort] ?? 1000) || 1000,
          seriesId,
          repeatId: String(taskRow.values[kit.task.repeat] ?? ''),
          repeatUntil: kit.task.repeatUntil ? (typeof taskRow.values[kit.task.repeatUntil] === 'string' ? taskRow.values[kit.task.repeatUntil] as string : null) : null,
          repeatEvery: every,
        })
        if (!leader) {
          delete values[kit.task.assigneeEmail]
          if (kit.task.seriesId) delete values[kit.task.seriesId]
          if (kit.task.authorEmail) delete values[kit.task.authorEmail]
          if (kit.task.author) delete values[kit.task.author]
        }
        if (kit.task.seriesId && !series && leader) {
          const seed = taskWrite(kit.task, { seriesId })
          const seedDecision = guardProjectsUpdate(app, actor, taskRow, seed)
          if (seedDecision.ok) await updateRow(context, kit.tasksTableId, taskRow.id, seed, actorRef)
        }
        const decision = guardProjectsCreate(app, actor, kit.tasksTableId, values)
        if (!decision.ok) throw new RowWriteError('denied', decision.error)
        const created = await createRow(context, kit.tasksTableId, { ...values, ...decision.ownerValues }, actorRef, { origin: 'manual' })
        await writeEvent('created', firstId(taskRow.values[kit.task.project]), created.id, String(taskRow.values[kit.task.title] ?? ''), String(values[kit.task.assigneeEmail] ?? decision.ownerValues[kit.task.assigneeEmail] ?? ''))
      }

      if (parsed.kind === 'create-project' || parsed.kind === 'project') {
        if (!leader) throw new RowWriteError('denied', 'Проект меняет руководитель.')
        const values = projectWrite(kit.project, parsed.kind === 'project' ? parsed : { ...parsed, progress: 0 })
        if (parsed.kind === 'create-project') {
          const decision = guardProjectsCreate(app, actor, kit.projectsTableId, values)
          if (!decision.ok) throw new RowWriteError('denied', decision.error)
          await createRow(context, kit.projectsTableId, values, actorRef, { origin: 'manual' })
          return { ok: true as const, message: 'Проект создан.' }
        }
        const [stored] = await context.tx.select().from(rows).where(and(eq(rows.id, parsed.recordId), eq(rows.tableId, kit.projectsTableId), isNull(rows.deletedAt))).limit(1)
        if (!stored) throw new RowWriteError('missing', 'Проект не найден.')
        const decision = guardProjectsUpdate(app, actor, { id: stored.id, tableId: stored.tableId, values: stored.data as Record<string, AppV2Json> }, values)
        if (!decision.ok) throw new RowWriteError('denied', decision.error)
        await updateRow(context, kit.projectsTableId, stored.id, values, actorRef)
        return { ok: true as const, message: 'Проект сохранён.' }
      }
      if (parsed.kind === 'create-task') {
        if (!leader) throw new RowWriteError('denied', 'Новую задачу создаёт руководитель.')
        const values = taskWrite(kit.task, { ...parsed, statusId: kit.statuses.todo, checklist: '[]', sort: 1000 })
        const decision = guardProjectsCreate(app, actor, kit.tasksTableId, values)
        if (!decision.ok) throw new RowWriteError('denied', decision.error)
        const created = await createRow(context, kit.tasksTableId, values, actorRef, { origin: 'manual' })
        await writeEvent('created', parsed.projectId, created.id, parsed.title, parsed.assigneeEmail)
        const taskRows = await loadTasks()
        await writeProgress(parsed.projectId, taskRows.map(row => ({ id: row.id, data: row.data as Record<string, unknown> })))
        return { ok: true as const, message: 'Задача создана.' }
      }

      if (parsed.kind === 'template-save') {
        if (!leader) throw new RowWriteError('denied', 'Шаблон сохраняет руководитель.')
        if (!kit.template || !kit.templatesTableId) throw new RowWriteError('denied', 'Шаблоны недоступны в этом приложении.')
        const [project] = await context.tx.select().from(rows).where(and(eq(rows.id, parsed.projectId), eq(rows.tableId, kit.projectsTableId), isNull(rows.deletedAt))).limit(1)
        if (!project) throw new RowWriteError('missing', 'Проект не найден.')
        const stageRows = await context.tx.select().from(rows).where(and(eq(rows.tableId, kit.stagesTableId), isNull(rows.deletedAt)))
        const taskRows = await loadTasks()
        const peopleRows = await loadPeople()
        const personRole = (id: string) => {
          const person = peopleRows.find(item => item.id === id)
          return person ? String((person.data as Record<string, unknown>)[kit.person.role] ?? 'Исполнитель') : 'Исполнитель'
        }
        const stages = stageRows.filter(row => firstId((row.data as Record<string, unknown>)[kit.stage.project]) === parsed.projectId).map(row => {
          const data = row.data as Record<string, unknown>
          return { id: row.id, title: String(data[kit.stage.title] ?? ''), goal: String(data[kit.stage.goal] ?? ''), start: data[kit.stage.start], end: data[kit.stage.end] }
        })
        const tasks = taskRows.filter(row => firstId((row.data as Record<string, unknown>)[kit.task.project]) === parsed.projectId).map(row => {
          const data = row.data as Record<string, unknown>
          return {
            id: row.id,
            title: String(data[kit.task.title] ?? ''),
            description: String(data[kit.task.description] ?? ''),
            checklist: String(data[kit.task.checklist] ?? '[]'),
            priority: priorityName(data[kit.task.priority]) || 'Средний',
            stageId: firstId(data[kit.task.stage]),
            parentId: firstId(data[kit.task.parent]),
            start: kit.task.start ? data[kit.task.start] : null,
            due: data[kit.task.due],
            estimate: kit.task.estimate && typeof data[kit.task.estimate] === 'number' ? Number(data[kit.task.estimate]) : null,
            assigneeRole: personRole(firstId(data[kit.task.assignee])),
          }
        })
        const anchor = civilDay((project.data as Record<string, unknown>)[kit.project.start]) || day(String((project.data as Record<string, unknown>)[kit.project.start] ?? '')) || tasks.map(task => civilDay(task.start) || civilDay(task.due)).find(Boolean) || new Date().toISOString().slice(0, 10)
        const payload = captureProjectTemplate({ stages, tasks, anchor })
        const values = templateWrite(kit.template, { name: parsed.name, payload: serializeTemplatePayload(payload), createdAt: stamp, author })
        const decision = guardProjectsCreate(app, actor, kit.templatesTableId, values)
        if (!decision.ok) throw new RowWriteError('denied', decision.error)
        await createRow(context, kit.templatesTableId, values, actorRef, { origin: 'manual' })
        return { ok: true as const, message: 'Шаблон сохранён.' }
      }

      if (parsed.kind === 'template-create') {
        if (!leader) throw new RowWriteError('denied', 'Проект из шаблона создаёт руководитель.')
        if (!kit.template || !kit.templatesTableId) throw new RowWriteError('denied', 'Шаблоны недоступны в этом приложении.')
        const [template] = await context.tx.select().from(rows).where(and(eq(rows.id, parsed.templateId), eq(rows.tableId, kit.templatesTableId), isNull(rows.deletedAt))).limit(1)
        if (!template) throw new RowWriteError('missing', 'Шаблон не найден.')
        const payload = parseTemplatePayload((template.data as Record<string, unknown>)[kit.template.payload])
        if (!payload) throw new RowWriteError('invalid', 'Шаблон повреждён.')
        const made = materializeTemplate(payload, parsed.start)
        if (!made.ok) throw new RowWriteError('invalid', made.error)
        const projectPayload = projectWrite(kit.project, { title: parsed.title, start: parsed.start, statusId: kit.projectStatuses.active, progress: 0 })
        const projectDecision = guardProjectsCreate(app, actor, kit.projectsTableId, projectPayload)
        if (!projectDecision.ok) throw new RowWriteError('denied', projectDecision.error)
        const project = await createRow(context, kit.projectsTableId, projectPayload, actorRef, { origin: 'manual' })
        const stageIds = new Map<string, string>()
        for (const stage of made.stages) {
          const values: Record<string, AppV2Json> = {
            [kit.stage.title]: stage.title,
            [kit.stage.project]: [project.id],
            [kit.stage.goal]: stage.goal,
            [kit.stage.start]: stage.start,
            [kit.stage.end]: stage.end,
            [kit.stage.status]: kit.stageStatuses.planned,
          }
          const decision = guardProjectsCreate(app, actor, kit.stagesTableId, values)
          if (!decision.ok) throw new RowWriteError('denied', decision.error)
          const created = await createRow(context, kit.stagesTableId, values, actorRef, { origin: 'manual' })
          stageIds.set(stage.key, created.id)
        }
        const peopleRows = await loadPeople()
        const activePeople = peopleRows.filter(row => (row.data as Record<string, unknown>)[kit.person.active] === kit.activeChoiceId)
        const pickPerson = (role: string) => activePeople.find(row => String((row.data as Record<string, unknown>)[kit.person.role] ?? '') === role) || activePeople[0]
        const taskIds = new Map<string, string>()
        const ordered = [...made.tasks].sort((a, b) => Number(Boolean(a.parentKey)) - Number(Boolean(b.parentKey)))
        for (const task of ordered) {
          const person = pickPerson(task.assigneeRole)
          const values = taskWrite(kit.task, {
            title: task.title,
            projectId: project.id,
            description: task.description,
            checklist: task.checklist || '[]',
            statusId: kit.statuses.todo,
            priorityId: priorityIdOf(task.priority),
            start: task.start,
            due: task.due,
            estimate: task.estimate,
            stageId: task.stageKey && stageIds.get(task.stageKey) ? stageIds.get(task.stageKey)! : null,
            parentId: task.parentKey && taskIds.get(task.parentKey) ? taskIds.get(task.parentKey)! : undefined,
            assigneeId: person?.id ?? '',
            assigneeEmail: person ? String((person.data as Record<string, unknown>)[kit.person.email] ?? '').trim().toLowerCase() : '',
            sort: 10,
          })
          const decision = guardProjectsCreate(app, actor, kit.tasksTableId, values)
          if (!decision.ok) throw new RowWriteError('denied', decision.error)
          const created = await createRow(context, kit.tasksTableId, values, actorRef, { origin: 'manual' })
          taskIds.set(task.key, created.id)
        }
        return { ok: true as const, message: 'Проект создан из шаблона.' }
      }

      if (parsed.kind === 'share-create') {
        if (!leader) throw new RowWriteError('denied', 'Ссылку создаёт руководитель.')
        if (!kit.share || !kit.sharesTableId) throw new RowWriteError('denied', 'Ссылки клиента недоступны в этом приложении.')
        const [project] = await context.tx.select().from(rows).where(and(eq(rows.id, parsed.projectId), eq(rows.tableId, kit.projectsTableId), isNull(rows.deletedAt))).limit(1)
        if (!project) throw new RowWriteError('missing', 'Проект не найден.')
        const values = shareWrite(kit.share, { token: parsed.token, projectId: parsed.projectId, label: parsed.label, createdAt: stamp })
        const decision = guardProjectsCreate(app, actor, kit.sharesTableId, values)
        if (!decision.ok) throw new RowWriteError('denied', decision.error)
        await createRow(context, kit.sharesTableId, values, actorRef, { origin: 'manual' })
        return { ok: true as const, message: 'Ссылка сохранена.' }
      }

      if (parsed.kind === 'link-create') {
        if (!kit.link || !kit.linksTableId) throw new RowWriteError('denied', 'Зависимости недоступны в этом приложении.')
        const linkRows = await context.tx.select().from(rows).where(and(eq(rows.tableId, kit.linksTableId), isNull(rows.deletedAt)))
        const existing: DependencyLink[] = linkRows.flatMap(row => {
          const data = row.data as Record<string, unknown>
          if (firstId(data[kit.link!.project]) !== parsed.projectId) return []
          return [{ id: row.id, fromId: firstId(data[kit.link!.from]), toId: firstId(data[kit.link!.to]) }]
        })
        const check = canLinkTasks(existing, parsed.fromId, parsed.toId)
        if (!check.ok) throw new RowWriteError('invalid', check.error)
        const taskRows = await loadTasks()
        const titleOf = (id: string) => {
          const row = taskRows.find(item => item.id === id)
          return row ? String((row.data as Record<string, unknown>)[kit.task.title] ?? '') : ''
        }
        const fromTask = taskRows.find(item => item.id === parsed.fromId)
        const toTask = taskRows.find(item => item.id === parsed.toId)
        if (!fromTask || !toTask) throw new RowWriteError('missing', 'Задача не найдена.')
        if (firstId((fromTask.data as Record<string, unknown>)[kit.task.project]) !== parsed.projectId || firstId((toTask.data as Record<string, unknown>)[kit.task.project]) !== parsed.projectId) {
          throw new RowWriteError('invalid', 'Связь должна быть внутри одного проекта.')
        }
        const values = linkWrite(kit.link, { title: `${titleOf(parsed.fromId)} → ${titleOf(parsed.toId)}`.slice(0, 120), projectId: parsed.projectId, fromId: parsed.fromId, toId: parsed.toId })
        const decision = guardProjectsCreate(app, actor, kit.linksTableId, values)
        if (!decision.ok) throw new RowWriteError('denied', decision.error)
        await createRow(context, kit.linksTableId, values, actorRef, { origin: 'manual' })
        return { ok: true as const, message: 'Связь добавлена.' }
      }

      if (parsed.kind === 'link-delete') {
        if (!kit.link || !kit.linksTableId) throw new RowWriteError('denied', 'Зависимости недоступны в этом приложении.')
        const [stored] = await context.tx.select().from(rows).where(and(eq(rows.id, parsed.recordId), eq(rows.tableId, kit.linksTableId), isNull(rows.deletedAt))).limit(1)
        if (!stored) throw new RowWriteError('missing', 'Связь не найдена.')
        const row: AppV2Record = { id: stored.id, tableId: stored.tableId, values: stored.data as Record<string, AppV2Json> }
        const decision = guardProjectsDelete(app, actor, row)
        if (!decision.ok) throw new RowWriteError('denied', decision.error)
        await deleteRow(context, kit.linksTableId, stored.id, actorRef)
        return { ok: true as const, message: 'Связь удалена.' }
      }

      if (parsed.kind === 'comment-edit' || parsed.kind === 'comment-delete') {
        const [stored] = await context.tx.select().from(rows).where(and(eq(rows.id, parsed.recordId), eq(rows.tableId, kit.commentsTableId), isNull(rows.deletedAt))).limit(1)
        if (!stored) throw new RowWriteError('missing', 'Комментарий не найден.')
        const row: AppV2Record = { id: stored.id, tableId: stored.tableId, values: stored.data as Record<string, AppV2Json> }
        const authorEmail = String(row.values[kit.comment.authorEmail] ?? '').trim().toLowerCase()
        if (authorEmail !== email) throw new RowWriteError('denied', 'Можно менять только свой комментарий.')
        if (parsed.kind === 'comment-delete') {
          const decision = guardProjectsDelete(app, actor, row)
          if (!decision.ok) throw new RowWriteError('denied', decision.error)
          await deleteRow(context, kit.commentsTableId, stored.id, actorRef)
          return { ok: true as const, message: 'Комментарий удалён.' }
        }
        const values: Record<string, AppV2Json> = {
          [kit.comment.text]: parsed.text,
          ...(kit.comment.editedAt ? { [kit.comment.editedAt]: stamp } : {}),
          [kit.comment.mentions]: parsed.mentionIds,
        }
        const decision = guardProjectsUpdate(app, actor, row, values)
        if (!decision.ok) throw new RowWriteError('denied', decision.error)
        await updateRow(context, kit.commentsTableId, stored.id, values, actorRef)
        return { ok: true as const, message: 'Комментарий сохранён.' }
      }

      if (parsed.kind === 'time-stop') {
        if (!kit.time || !kit.timeTableId) throw new RowWriteError('denied', 'Учёт времени недоступен в этом приложении.')
        const [stored] = await context.tx.select().from(rows).where(and(eq(rows.id, parsed.recordId), eq(rows.tableId, kit.timeTableId), isNull(rows.deletedAt))).limit(1)
        if (!stored) throw new RowWriteError('missing', 'Запись времени не найдена.')
        const row: AppV2Record = { id: stored.id, tableId: stored.tableId, values: stored.data as Record<string, AppV2Json> }
        const ownerEmail = String(row.values[kit.time.email] ?? '').trim().toLowerCase()
        if (ownerEmail !== email && !leader) throw new RowWriteError('denied', 'Можно остановить только свой таймер.')
        if (row.values[kit.time.endedAt]) throw new RowWriteError('invalid', 'Таймер уже остановлен.')
        const stopped = stopTimerValues(String(row.values[kit.time.startedAt] ?? ''), now)
        const values = { [kit.time.endedAt]: stopped.endedAt, [kit.time.minutes]: stopped.minutes }
        const decision = guardProjectsUpdate(app, actor, row, values)
        if (!decision.ok) throw new RowWriteError('denied', decision.error)
        await updateRow(context, kit.timeTableId, stored.id, values, actorRef)
        return { ok: true as const, message: 'Таймер остановлен.' }
      }

      const [stored] = await context.tx.select().from(rows).where(and(eq(rows.id, parsed.recordId), eq(rows.tableId, kit.tasksTableId), isNull(rows.deletedAt))).limit(1)
      if (!stored) throw new RowWriteError('missing', 'Задача не найдена.')
      const row: AppV2Record = { id: stored.id, tableId: stored.tableId, values: stored.data as Record<string, AppV2Json> }
      const currentProject = firstId(row.values[kit.task.project])
      const currentStatus = statusName(row.values[kit.task.status])
      const currentTitle = String(row.values[kit.task.title] ?? '')
      const currentAssignee = String(row.values[kit.task.assigneeEmail] ?? '')

      if (parsed.kind === 'time-start' || parsed.kind === 'time-manual') {
        if (!kit.time || !kit.timeTableId) throw new RowWriteError('denied', 'Учёт времени недоступен в этом приложении.')
        const peopleRows = await loadPeople()
        const person = peopleRows.find(item => String((item.data as Record<string, unknown>)[kit.person.email] ?? '').trim().toLowerCase() === email)
        if (!person) throw new RowWriteError('missing', 'Не найден сотрудник.')
        const timeRows = await context.tx.select().from(rows).where(and(eq(rows.tableId, kit.timeTableId), isNull(rows.deletedAt)))
        const entries: TimeEntry[] = timeRows.map(item => {
          const data = item.data as Record<string, unknown>
          return {
            id: item.id,
            taskId: firstId(data[kit.time!.task]),
            email: String(data[kit.time!.email] ?? '').trim().toLowerCase(),
            startedAt: String(data[kit.time!.startedAt] ?? ''),
            endedAt: data[kit.time!.endedAt] ? String(data[kit.time!.endedAt]) : null,
            minutes: typeof data[kit.time!.minutes] === 'number' ? Number(data[kit.time!.minutes]) : null,
            note: String(data[kit.time!.note] ?? ''),
          }
        })
        if (parsed.kind === 'time-start') {
          const check = canStartTimer(entries, email, row.id)
          if (!check.ok) throw new RowWriteError('invalid', check.error)
          const values = timeWrite(kit.time, {
            taskId: row.id, projectId: currentProject, personId: person.id, email,
            startedAt: startTimerStamp(now), endedAt: null, minutes: null, note: parsed.note ?? '',
          })
          const payload = { ...values }
          if (!leader) delete payload[kit.time.email]
          const decision = guardProjectsCreate(app, actor, kit.timeTableId, payload)
          if (!decision.ok) throw new RowWriteError('denied', decision.error)
          await createRow(context, kit.timeTableId, { ...payload, ...decision.ownerValues }, actorRef, { origin: 'manual' })
          return { ok: true as const, message: 'Таймер запущен.' }
        }
        const check = validateManualMinutes(parsed.minutes)
        if (!check.ok) throw new RowWriteError('invalid', check.error)
        const endedAt = new Date(now).toISOString()
        const startedAt = new Date(now - check.minutes * 60_000).toISOString()
        const values = timeWrite(kit.time, {
          taskId: row.id, projectId: currentProject, personId: person.id, email,
          startedAt, endedAt, minutes: check.minutes, note: parsed.note || 'Ручная запись',
        })
        const payload = { ...values }
        if (!leader) delete payload[kit.time.email]
        const decision = guardProjectsCreate(app, actor, kit.timeTableId, payload)
        if (!decision.ok) throw new RowWriteError('denied', decision.error)
        await createRow(context, kit.timeTableId, { ...payload, ...decision.ownerValues }, actorRef, { origin: 'manual' })
        return { ok: true as const, message: 'Время добавлено.' }
      }

      if (parsed.kind === 'gantt-dates') {
        if (!kit.task.start) throw new RowWriteError('denied', 'Даты Ганта недоступны в этом приложении.')
        const values = taskWrite(kit.task, { start: parsed.start, due: parsed.due })
        const decision = guardProjectsUpdate(app, actor, row, values)
        if (!decision.ok) throw new RowWriteError('denied', decision.error)
        await updateRow(context, kit.tasksTableId, row.id, values, actorRef)
        return { ok: true as const, message: 'Даты сохранены.' }
      }

      if (parsed.kind === 'comment') {
        const values = commentWrite(kit.comment, {
          text: parsed.text, taskId: row.id, projectId: currentProject, at: stamp, author, authorEmail: email,
          assigneeEmail: currentAssignee, mentionIds: parsed.mentionIds, replyToId: parsed.replyToId ?? null, internal: true,
        })
        const decision = guardProjectsCreate(app, actor, kit.commentsTableId, values)
        if (!decision.ok) throw new RowWriteError('denied', decision.error)
        await createRow(context, kit.commentsTableId, { ...values, ...decision.ownerValues }, actorRef, { origin: 'manual' })
        await writeEvent('comment', currentProject, row.id, currentTitle, currentAssignee)
        return { ok: true as const, message: 'Комментарий добавлен.' }
      }
      if (parsed.kind === 'create-subtask') {
        if (firstId(row.values[kit.task.parent])) throw new RowWriteError('invalid', 'Подзадача не делится дальше.')
        const values = taskWrite(kit.task, { title: parsed.title, projectId: currentProject, parentId: row.id, assigneeId: parsed.assigneeId, assigneeEmail: parsed.assigneeEmail, due: parsed.due, priorityId: parsed.priorityId, statusId: kit.statuses.todo, checklist: '[]', description: '', sort: 1000 })
        const payload = { ...values }
        if (!leader) delete payload[kit.task.assigneeEmail]
        const decision = guardProjectsCreate(app, actor, kit.tasksTableId, payload)
        if (!decision.ok) throw new RowWriteError('denied', decision.error)
        const created = await createRow(context, kit.tasksTableId, { ...payload, ...decision.ownerValues }, actorRef, { origin: 'manual' })
        await writeEvent('created', currentProject, created.id, parsed.title, parsed.assigneeEmail)
        const taskRows = await loadTasks()
        await writeProgress(currentProject, taskRows.map(item => ({ id: item.id, data: item.data as Record<string, unknown> })))
        return { ok: true as const, message: 'Подзадача создана.' }
      }
      const taskRows = (await loadTasks()).map(item => ({ id: item.id, data: item.data as Record<string, unknown>, statusName: statusName((item.data as Record<string, unknown>)[kit.task.status]), sort: Number((item.data as Record<string, unknown>)[kit.task.sort] ?? 0) || 0 }))
      if (parsed.kind === 'move') {
        const nextStatus = statusName(parsed.statusId)
        if (!nextStatus) throw new RowWriteError('invalid', 'Не найден статус задачи.')
        const index = parsed.orderedIds.indexOf(row.id)
        const beforeId = index >= 0 ? parsed.orderedIds[index + 1] ?? null : null
        const updates = moveUpdates({
          tasks: taskRows.map(item => ({ id: item.id, statusName: item.statusName, sort: item.sort })),
          movedId: row.id, nextStatusName: nextStatus, nextStatusId: parsed.statusId, beforeId,
          statusField: kit.task.status, sortField: kit.task.sort, rewriteColumn: leader,
        })
        for (const update of updates) {
          const current = taskRows.find(item => item.id === update.id)
          const target: AppV2Record = current ? { id: current.id, tableId: kit.tasksTableId, values: current.data as Record<string, AppV2Json> } : row
          const decision = guardProjectsUpdate(app, actor, target, update.values)
          if (!decision.ok) {
            if (update.id === row.id) throw new RowWriteError('denied', decision.error)
            continue
          }
          await updateRow(context, kit.tasksTableId, update.id, update.values, actorRef)
        }
        if (nextStatus !== currentStatus) {
          await writeEvent('status', currentProject, row.id, currentTitle, currentAssignee, currentStatus, nextStatus)
          await writeProgress(currentProject, taskRows.map(item => ({ id: item.id, data: item.data })), { id: row.id, projectId: currentProject, status: nextStatus })
          await spawnIfNeeded(row, currentStatus, nextStatus)
        }
        return { ok: true as const, message: 'Задача сохранена.' }
      }
      if (parsed.parentId) {
        const relationId = (data: Record<string, unknown>, fieldId: string) => {
          const value = data[fieldId]
          return Array.isArray(value) ? String(value[0] ?? '') : ''
        }
        const parents = taskRows.map(item => ({ id: item.id, parentId: relationId(item.data as Record<string, unknown>, kit.task.parent) }))
        const parentRow = taskRows.find(item => item.id === parsed.parentId)
        const parentProject = parentRow ? relationId(parentRow.data as Record<string, unknown>, kit.task.project) : ''
        if (!canParent(parsed.parentId, parents) || parentProject !== parsed.projectId || parsed.parentId === row.id) {
          throw new RowWriteError('invalid', 'Родительская задача должна быть задачей того же проекта без своего родителя.')
        }
      }
      const values = taskWrite(kit.task, { ...parsed, files: Array.isArray(parsed.files) ? parsed.files as AppV2Json : undefined })
      if (!leader) delete values[kit.task.assigneeEmail]
      const decision = guardProjectsUpdate(app, actor, row, values)
      if (!decision.ok) throw new RowWriteError('denied', decision.error)
      await updateRow(context, kit.tasksTableId, row.id, values, actorRef)
      const nextStatus = statusName(parsed.statusId)
      if (nextStatus && nextStatus !== currentStatus) {
        await writeEvent('status', parsed.projectId || currentProject, row.id, parsed.title, parsed.assigneeEmail, currentStatus, nextStatus)
        await spawnIfNeeded(row, currentStatus, nextStatus)
      }
      const affected = new Set([currentProject, parsed.projectId].filter(Boolean))
      for (const projectId of affected) await writeProgress(projectId, taskRows.map(item => ({ id: item.id, data: item.data })), { id: row.id, projectId: parsed.projectId, status: nextStatus || currentStatus })
      return { ok: true as const, message: 'Задача сохранена.' }
    })
  } catch (error) {
    return { ok: false, error: error instanceof RowWriteError ? error.message : 'Не удалось сохранить задачу.' }
  }
}
