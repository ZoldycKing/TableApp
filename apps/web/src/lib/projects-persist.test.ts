import { describe, expect, it } from 'vitest'
import type { AppV2Actor, AppV2Record } from '@tableapp/schema/app-v2'
import { buildTemplate } from './templates/build'
import { findTemplate } from './templates/catalog'
import { buildProjectsV2App } from './templates/projects-v2'
import { commentWrite, guardProjectsCreate, guardProjectsUpdate, moveUpdates, progressValue, taskWrite } from './projects-persist'

const actor = (roleIds: string[], email: string): AppV2Actor => ({ authenticated: true, roleIds, id: 'usr', email, company: '', name: 'Анна' })

function installed() {
  const built = buildTemplate({ template: findTemplate('proekty')!, workspaceId: 'wsp_projects' })
  const app = buildProjectsV2App(built, { id: 'app_projects', workspaceId: 'wsp_projects', name: 'Проекты', slug: 'proekty', email: 'owner@example.invalid' })
  return { app, kit: app.projects! }
}

describe('published project writes', () => {
  it('lets the assignee store status, checklist and a comment, and refuses the budget', () => {
    const { app, kit } = installed()
    const row: AppV2Record = { id: 'task', tableId: kit.tasksTableId, values: { [kit.task.assigneeEmail]: 'anna@example.invalid', [kit.task.title]: 'Макет' } }
    const anna = actor(['staff'], 'anna@example.invalid')
    const values = taskWrite(kit.task, { statusId: kit.statuses.review, checklist: '[{"label":"Тарифы","done":true}]' })
    expect(guardProjectsUpdate(app, anna, row, values).ok).toBe(true)
    expect(guardProjectsUpdate(app, actor(['staff'], 'igor@example.invalid'), row, values).ok).toBe(false)
    const withOwner = taskWrite(kit.task, { title: 'Макет', projectId: 'project', assigneeId: 'anna', assigneeEmail: 'anna@example.invalid', statusId: kit.statuses.review, priorityId: kit.priorities.high, description: '', checklist: '[]' })
    expect(guardProjectsUpdate(app, anna, row, withOwner).ok).toBe(false)
    delete withOwner[kit.task.assigneeEmail]
    expect(guardProjectsUpdate(app, anna, row, withOwner).ok).toBe(true)
    const project: AppV2Record = { id: 'project', tableId: kit.projectsTableId, values: { [kit.project.title]: 'Сайт' } }
    expect(guardProjectsUpdate(app, anna, project, { [kit.project.budget]: 1 }).ok).toBe(false)
    expect(guardProjectsUpdate(app, anna, project, { [kit.project.progress]: progressValue(['Готово', 'К работе']) }).ok).toBe(true)
    const comment = commentWrite(kit.comment, { text: '@Игорь Белов, три колонки', taskId: row.id, projectId: 'project', at: '2026-11-17T08:00:00.000Z', author: 'Анна', authorEmail: 'anna@example.invalid', assigneeEmail: 'anna@example.invalid', mentionIds: ['igor'] })
    expect(comment[kit.comment.mentions]).toEqual(['igor'])
    expect(guardProjectsCreate(app, anna, kit.commentsTableId, comment).ok).toBe(true)
    const subtask = taskWrite(kit.task, { title: 'Подвал', projectId: 'project', parentId: row.id, assigneeId: 'anna', assigneeEmail: 'anna@example.invalid', statusId: kit.statuses.todo, priorityId: kit.priorities.medium, checklist: '[]', sort: 1000 })
    expect(subtask[kit.task.parent]).toEqual([row.id])
    delete subtask[kit.task.assigneeEmail]
    const created = guardProjectsCreate(app, anna, kit.tasksTableId, subtask)
    expect(created.ok && created.ownerValues[kit.task.assigneeEmail]).toBe('anna@example.invalid')
  })

  it('rewrites the column order for the lead and only the moved card for the assignee', () => {
    const { kit } = installed()
    const tasks = [
      { id: 'a', statusName: 'К работе', sort: 10 },
      { id: 'b', statusName: 'К работе', sort: 20 },
      { id: 'c', statusName: 'В работе', sort: 10 },
    ]
    const lead = moveUpdates({ tasks, movedId: 'c', nextStatusName: 'К работе', nextStatusId: 'todo', beforeId: 'b', statusField: kit.task.status, sortField: kit.task.sort, rewriteColumn: true })
    expect(lead.map(item => item.id)).toEqual(['a', 'c', 'b'])
    expect(lead.find(item => item.id === 'c')?.values[kit.task.status]).toBe('todo')
    const own = moveUpdates({ tasks, movedId: 'c', nextStatusName: 'К работе', nextStatusId: 'todo', beforeId: null, statusField: kit.task.status, sortField: kit.task.sort, rewriteColumn: false })
    expect(own).toEqual([{ id: 'c', values: { [kit.task.status]: 'todo', [kit.task.sort]: 30 } }])
  })
})
