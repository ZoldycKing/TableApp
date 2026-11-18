import { describe, expect, it } from 'vitest'
import type { FieldType } from '@tableapp/schema'
import { validateAppV2, type AppV2Catalog } from '@tableapp/schema/app-v2'
import { buildTemplate } from './build'
import { findTemplate } from './catalog'
import { buildProjectsV2App, isProjectsTemplate } from './projects-v2'
import { progressPercent } from '../projects-logic'

describe('projects template', () => {
  it('publishes a team board whose home is my tasks and whose progress matches closed tasks', () => {
    expect(isProjectsTemplate('proekty')).toBe(true)
    expect(isProjectsTemplate('zayavki')).toBe(false)
    const built = buildTemplate({ template: findTemplate('proekty')!, workspaceId: 'wsp_projects' })
    const app = buildProjectsV2App(built, { id: 'app_projects', workspaceId: 'wsp_projects', name: 'Проекты', slug: 'proekty', email: 'owner@example.invalid' })
    const catalog: AppV2Catalog = {
      workspaceId: 'wsp_projects',
      tables: new Map(built.tables.map(table => [table.id, { workspaceId: 'wsp_projects' }])),
      fields: new Map(built.fields.map(field => [field.id, {
        tableId: field.tableId, type: field.type as FieldType,
        ...(field.type === 'relation' && typeof (field.options as { tableId?: unknown }).tableId === 'string' ? { relationTableId: (field.options as { tableId: string }).tableId } : {}),
        ...(field.type === 'single_select' && Array.isArray((field.options as { choices?: { id?: string }[] }).choices) ? { choiceIds: ((field.options as { choices: { id?: string }[] }).choices).map(choice => choice.id).filter((id): id is string => typeof id === 'string') } : {}),
      }])),
      views: new Map(built.views.map(view => [view.id, { tableId: view.tableId }])),
    }
    expect(validateAppV2(app, catalog)).toEqual([])
    expect(validateAppV2(app, catalog, { mode: 'publish' })).toEqual([])
    const kit = app.projects!
    expect(app.homeScreenId).toBe(kit.mineScreenId)
    expect(app.roles.map(role => role.name)).toEqual(['Руководитель', 'Исполнитель', 'Клиент'])
    expect(kit.ganttScreenId).toBeTruthy()
    expect(kit.timeTableId).toBeTruthy()
    expect(kit.task.start).toBeTruthy()
    expect(kit.repeats?.weekly).toBeTruthy()
    const tasks = built.rows.filter(row => row.tableId === kit.tasksTableId)
    const projects = built.rows.filter(row => row.tableId === kit.projectsTableId)
    for (const project of projects) {
      const statuses = tasks.filter(row => {
        const link = row.data[kit.task.project]
        const parent = row.data[kit.task.parent]
        return Array.isArray(link) && link[0] === project.id && !(Array.isArray(parent) && parent[0])
      }).map(row => {
        const field = built.fields.find(item => item.id === kit.task.status)
        const id = row.data[kit.task.status]
        const choices = field && 'choices' in (field.options as object) ? (field.options as { choices?: { id: string; name: string }[] }).choices ?? [] : []
        return typeof id === 'string' ? choices.find(choice => choice.id === id)?.name ?? '' : ''
      })
      expect(project.data[kit.project.progress], String(project.data[kit.project.title])).toBe(progressPercent(statuses))
    }
    const byTitle = (title: string) => tasks.find(row => row.data[kit.task.title] === title)
    const tariffs = byTitle('Блок тарифов')
    const footer = byTitle('Подвал макета')
    expect(tariffs).toBeTruthy()
    expect(footer).toBeTruthy()
    const comments = built.rows.filter(row => row.tableId === kit.commentsTableId)
    const linked = (taskId: string) => comments.filter(row => {
      const link = row.data[kit.comment.task]
      return Array.isArray(link) && link[0] === taskId
    })
    expect(linked(tariffs!.id)).toHaveLength(2)
    expect(linked(footer!.id)).toHaveLength(1)
  })
})
