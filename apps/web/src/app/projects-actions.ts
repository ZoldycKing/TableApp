'use server'
import { rows } from '@tableapp/db'
import { newId } from '@tableapp/schema'
import type { AppV2Json, AppV2Record } from '@tableapp/schema/app-v2'
import { and, eq, isNull } from 'drizzle-orm'
import { publishedV2Context, publishedV2Definition, publishedV2Screen } from '@/lib/builder-v2-published'
import { eventText, progressPercent, type EventKind } from '@/lib/projects-logic'
import { commentWrite, eventWrite, guardProjectsCreate, guardProjectsUpdate, moveUpdates, projectWrite, taskWrite } from '@/lib/projects-persist'
import { RowWriteError, createRow, mutationFields, updateRow, writeRows } from '@/lib/row-mutations'

type MoveRequest = { kind: 'move'; revision: string; screenId: string; recordId: string; statusId: string; orderedIds: string[] }
type TaskRequest = { kind: 'task'; revision: string; screenId: string; recordId: string; title: string; projectId: string; assigneeId: string; assigneeEmail: string; due: string | null; priorityId: string; statusId: string; description: string; checklist: string; files?: unknown }
type CommentRequest = { kind: 'comment'; revision: string; screenId: string; recordId: string; text: string; mentionIds: string[] }
type SubtaskRequest = { kind: 'create-subtask'; revision: string; screenId: string; recordId: string; title: string; assigneeId: string; assigneeEmail: string; due: string | null; priorityId: string }
type ProjectRequest = { kind: 'project'; revision: string; screenId: string; recordId: string; title: string; clientId: string; ownerId: string; start: string | null; due: string | null; budget: number | null; statusId: string }
type CreateTaskRequest = { kind: 'create-task'; revision: string; screenId: string; title: string; projectId: string; assigneeId: string; assigneeEmail: string; due: string | null; priorityId: string; description: string }
type CreateProjectRequest = { kind: 'create-project'; revision: string; screenId: string; title: string; clientId: string; ownerId: string; start: string | null; due: string | null; budget: number | null; statusId: string }
type Request = MoveRequest | TaskRequest | CommentRequest | ProjectRequest | CreateTaskRequest | CreateProjectRequest | SubtaskRequest

const text = (value: unknown, max: number) => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max ? value.trim() : null
const maybe = (value: unknown) => value == null || value === '' ? null : typeof value === 'string' && value.length <= 40 ? value : undefined
const idList = (value: unknown) => Array.isArray(value) && value.every(item => typeof item === 'string' && item.length > 0 && item.length <= 80) ? value : null

function readRequest(input: unknown): Request | null {
  if (!input || typeof input !== 'object') return null
  const value = input as Record<string, unknown>
  if (typeof value.revision !== 'string' || value.revision.length < 8 || typeof value.screenId !== 'string') return null
  const revision = value.revision, screenId = value.screenId
  const recordId = typeof value.recordId === 'string' ? value.recordId : ''
  if (value.kind === 'move' && typeof value.statusId === 'string' && idList(value.orderedIds) && recordId) {
    return { kind: 'move', revision, screenId, recordId, statusId: value.statusId, orderedIds: value.orderedIds as string[] }
  }
  if (value.kind === 'task' && recordId && text(value.title, 200) && typeof value.projectId === 'string' && typeof value.assigneeId === 'string' && typeof value.assigneeEmail === 'string' && typeof value.priorityId === 'string' && typeof value.statusId === 'string' && typeof value.description === 'string' && value.description.length <= 4000 && typeof value.checklist === 'string' && value.checklist.length <= 8000 && maybe(value.due) !== undefined) {
    return { kind: 'task', revision, screenId, recordId, title: text(value.title, 200)!, projectId: value.projectId, assigneeId: value.assigneeId, assigneeEmail: value.assigneeEmail.trim().toLowerCase(), due: maybe(value.due) ?? null, priorityId: value.priorityId, statusId: value.statusId, description: value.description, checklist: value.checklist, files: value.files }
  }
  const mentionIds = value.mentionIds == null ? [] : idList(value.mentionIds)
  if (value.kind === 'comment' && recordId && text(value.text, 2000) && mentionIds) return { kind: 'comment', revision, screenId, recordId, text: text(value.text, 2000)!, mentionIds }
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
      publishedV2Screen(app, actor, parsed.screenId)
      const actorRef = { id: actor.id, kind: 'app_user' as const }
      const leader = actor.roleIds.includes('owner')
      const fields = await mutationFields(context, kit.tasksTableId)
      const statusField = fields.find(field => field.id === kit.task.status)
      const statusName = (value: unknown) => statusField?.type === 'single_select' && typeof value === 'string' ? statusField.options.choices.find(choice => choice.id === value)?.name ?? '' : ''
      const kindId = (kind: EventKind) => kind === 'created' ? kit.eventKinds.created : kind === 'status' ? kit.eventKinds.status : kit.eventKinds.comment
      const author = actor.name?.trim() || (leader ? 'Руководитель' : 'Исполнитель')
      const stamp = new Date().toISOString()
      const loadTasks = async () => context.tx.select().from(rows).where(and(eq(rows.tableId, kit.tasksTableId), isNull(rows.deletedAt)))
      const writeEvent = async (kind: EventKind, projectId: string, taskId: string, title: string, assigneeEmail: string, from = '', to = '') => {
        const values = eventWrite(kit.event, { text: eventText(kind, title, from, to), projectId, taskId, at: stamp, kind, kindId: kindId(kind), author, authorEmail: actor.email!, assigneeEmail })
        const payload = { ...values }
        if (!leader) delete payload[kit.event.assigneeEmail]
        const decision = guardProjectsCreate(app, actor, kit.eventsTableId, payload)
        if (!decision.ok) throw new RowWriteError('denied', decision.error)
        await createRow(context, kit.eventsTableId, { ...payload, ...decision.ownerValues }, actorRef, { origin: 'manual' })
      }
      const writeProgress = async (projectId: string, taskRows: { id: string; data: Record<string, unknown> }[], override?: { id: string; projectId: string; status: string }) => {
        const statuses = taskRows.flatMap(row => {
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
      const [stored] = await context.tx.select().from(rows).where(and(eq(rows.id, parsed.recordId), eq(rows.tableId, kit.tasksTableId), isNull(rows.deletedAt))).limit(1)
      if (!stored) throw new RowWriteError('missing', 'Задача не найдена.')
      const row: AppV2Record = { id: stored.id, tableId: stored.tableId, values: stored.data as Record<string, AppV2Json> }
      const currentProject = firstId(row.values[kit.task.project])
      const currentStatus = statusName(row.values[kit.task.status])
      const currentTitle = String(row.values[kit.task.title] ?? '')
      const currentAssignee = String(row.values[kit.task.assigneeEmail] ?? '')
      if (parsed.kind === 'comment') {
        const values = commentWrite(kit.comment, { text: parsed.text, taskId: row.id, projectId: currentProject, at: stamp, author, authorEmail: actor.email, assigneeEmail: currentAssignee, mentionIds: parsed.mentionIds })
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
        }
        return { ok: true as const, message: 'Задача сохранена.' }
      }
      const values = taskWrite(kit.task, { ...parsed, files: Array.isArray(parsed.files) ? parsed.files as AppV2Json : undefined })
      const decision = guardProjectsUpdate(app, actor, row, values)
      if (!decision.ok) throw new RowWriteError('denied', decision.error)
      await updateRow(context, kit.tasksTableId, row.id, values, actorRef)
      const nextStatus = statusName(parsed.statusId)
      if (nextStatus && nextStatus !== currentStatus) await writeEvent('status', parsed.projectId || currentProject, row.id, parsed.title, parsed.assigneeEmail, currentStatus, nextStatus)
      const affected = new Set([currentProject, parsed.projectId].filter(Boolean))
      for (const projectId of affected) await writeProgress(projectId, taskRows.map(item => ({ id: item.id, data: item.data })), { id: row.id, projectId: parsed.projectId, status: nextStatus || currentStatus })
      return { ok: true as const, message: 'Задача сохранена.' }
    })
  } catch (error) {
    return { ok: false, error: error instanceof RowWriteError ? error.message : 'Не удалось сохранить задачу.' }
  }
}
