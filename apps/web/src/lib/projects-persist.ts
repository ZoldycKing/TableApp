import type { AppV2, AppV2Actor, AppV2Json, AppV2Record } from '@tableapp/schema/app-v2'
import { authorizeAppV2Write } from '@tableapp/schema/app-v2'
import { progressPercent, reorderColumn, sortsFor, type EventKind } from './projects-logic'

export type ProjectsApp = NonNullable<AppV2['projects']>

export function guardProjectsUpdate(app: AppV2, actor: AppV2Actor, row: AppV2Record, values: Record<string, AppV2Json>) {
  return authorizeAppV2Write(app, actor, { operation: 'update', row, values })
}

export function guardProjectsCreate(app: AppV2, actor: AppV2Actor, tableId: string, values: Record<string, AppV2Json>) {
  return authorizeAppV2Write(app, actor, { operation: 'create', tableId, values })
}

type TaskRow = { id: string; statusName: string; sort: number }

/** New status and order after a drag. The owner rewrites the column; an assignee only moves their own card. */
export function moveUpdates(input: {
  tasks: readonly TaskRow[]
  movedId: string
  nextStatusName: string
  nextStatusId: string
  beforeId: string | null
  statusField: string
  sortField: string
  rewriteColumn: boolean
}): { id: string; values: Record<string, AppV2Json> }[] {
  const moved = input.tasks.find(task => task.id === input.movedId)
  if (!moved) return []
  const column = input.tasks
    .filter(task => task.statusName === input.nextStatusName && task.id !== input.movedId)
    .sort((a, b) => a.sort - b.sort || a.id.localeCompare(b.id))
  const ordered = reorderColumn(column.map(task => task.id), input.movedId, input.beforeId)
  if (input.rewriteColumn) {
    return sortsFor(ordered).map(item => ({
      id: item.id,
      values: {
        [input.sortField]: item.sort,
        ...(item.id === input.movedId ? { [input.statusField]: input.nextStatusId } : {}),
      },
    }))
  }
  const index = ordered.indexOf(input.movedId)
  const prev = index > 0 ? column.find(task => task.id === ordered[index - 1]) : undefined
  const next = ordered[index + 1] ? column.find(task => task.id === ordered[index + 1]) : undefined
  const prevSort = prev?.sort ?? null
  const nextSort = next?.sort ?? null
  const sort = prevSort == null && nextSort == null ? 10 : prevSort == null ? nextSort! - 10 : nextSort == null ? prevSort + 10 : (prevSort + nextSort) / 2
  return [{ id: input.movedId, values: { [input.statusField]: input.nextStatusId, [input.sortField]: sort } }]
}

export function progressValue(statuses: readonly string[]) {
  return progressPercent(statuses)
}

export function taskWrite(task: ProjectsApp['task'], input: {
  title?: string
  projectId?: string
  assigneeId?: string
  assigneeEmail?: string
  due?: string | null
  priorityId?: string
  statusId?: string
  description?: string
  checklist?: string
  files?: AppV2Json
  sort?: number
  parentId?: string
  stageId?: string | null
}): Record<string, AppV2Json> {
  const values: Record<string, AppV2Json> = {}
  const put = (key: string, value: AppV2Json | undefined) => { if (value !== undefined) values[key] = value }
  put(task.title, input.title)
  put(task.project, input.projectId ? [input.projectId] : undefined)
  put(task.assignee, input.assigneeId ? [input.assigneeId] : undefined)
  put(task.assigneeEmail, input.assigneeEmail)
  put(task.due, input.due)
  put(task.priority, input.priorityId)
  put(task.status, input.statusId)
  put(task.description, input.description)
  put(task.checklist, input.checklist)
  put(task.files, input.files)
  put(task.sort, input.sort)
  put(task.parent, input.parentId ? [input.parentId] : undefined)
  put(task.stage, input.stageId === null ? [] : input.stageId ? [input.stageId] : undefined)
  return values
}

export function commentWrite(comment: ProjectsApp['comment'], input: {
  text: string
  taskId: string
  projectId: string
  at: string
  author: string
  authorEmail: string
  assigneeEmail: string
  mentionIds?: string[]
}): Record<string, AppV2Json> {
  return {
    [comment.text]: input.text,
    [comment.task]: [input.taskId],
    [comment.project]: [input.projectId],
    [comment.at]: input.at,
    [comment.author]: input.author,
    [comment.authorEmail]: input.authorEmail,
    [comment.assigneeEmail]: input.assigneeEmail,
    ...(input.mentionIds ? { [comment.mentions]: input.mentionIds } : {}),
  }
}

export function eventWrite(event: ProjectsApp['event'], input: {
  text: string
  projectId: string
  taskId: string
  at: string
  kind: EventKind
  kindId: string
  author: string
  authorEmail: string
  assigneeEmail: string
}): Record<string, AppV2Json> {
  return {
    [event.text]: input.text,
    [event.project]: [input.projectId],
    [event.task]: [input.taskId],
    [event.at]: input.at,
    [event.kind]: input.kindId,
    [event.author]: input.author,
    [event.authorEmail]: input.authorEmail,
    [event.assigneeEmail]: input.assigneeEmail,
  }
}

export function projectWrite(project: ProjectsApp['project'], input: {
  title?: string
  clientId?: string
  ownerId?: string
  start?: string | null
  due?: string | null
  budget?: number | null
  statusId?: string
  progress?: number
}): Record<string, AppV2Json> {
  const values: Record<string, AppV2Json> = {}
  const put = (key: string, value: AppV2Json | undefined) => { if (value !== undefined) values[key] = value }
  put(project.title, input.title)
  put(project.client, input.clientId ? [input.clientId] : undefined)
  put(project.owner, input.ownerId ? [input.ownerId] : undefined)
  put(project.start, input.start)
  put(project.due, input.due)
  put(project.budget, input.budget)
  put(project.status, input.statusId)
  put(project.progress, input.progress)
  return values
}
