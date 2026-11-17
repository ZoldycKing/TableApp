import { describe, expect, it } from 'vitest'
import type { FieldType } from '@tableapp/schema'
import { authorizeAppV2Write, projectAppV2Row, validateAppV2, type AppV2Actor, type AppV2Catalog } from '@tableapp/schema/app-v2'
import { activeTechnicians } from '../dispatch-logic'
import { buildTemplate } from './build'
import { findTemplate } from './catalog'
import { buildDispatchV2App, isDispatchTemplate } from './dispatch-v2'

const workspaceId = 'wsp_dispatch'
const actor = (roleIds: string[], email: string | null): AppV2Actor => ({ authenticated: true, roleIds, id: 'usr_dispatch', email, company: '', name: 'Сергей' })

function installed() {
  const built = buildTemplate({ template: findTemplate('zayavki')!, workspaceId })
  const app = buildDispatchV2App(built, { id: 'app_dispatch', workspaceId, name: built.appName, slug: 'zayavki', email: 'owner@example.invalid' })
  const catalog: AppV2Catalog = {
    workspaceId,
    tables: new Map(built.tables.map(table => [table.id, { workspaceId }])),
    fields: new Map(built.fields.map(field => [field.id, {
      tableId: field.tableId, type: field.type as FieldType,
      ...(field.type === 'relation' && typeof (field.options as { tableId?: unknown }).tableId === 'string' ? { relationTableId: (field.options as { tableId: string }).tableId } : {}),
      ...(field.type === 'single_select' && Array.isArray((field.options as { choices?: { id?: string }[] }).choices) ? { choiceIds: ((field.options as { choices: { id?: string }[] }).choices).map(choice => choice.id).filter((id): id is string => typeof id === 'string') } : {}),
    }])),
    views: new Map(built.views.map(view => [view.id, { tableId: view.tableId }])),
  }
  return { built, app, catalog }
}

describe('field service template v2', () => {
  it('publishes a dispatcher app with a day board, counters screens and technician access by email', () => {
    expect(isDispatchTemplate('zayavki')).toBe(true)
    expect(isDispatchTemplate('salon')).toBe(false)
    const { app, catalog, built } = installed()
    expect(validateAppV2(app, catalog)).toEqual([])
    expect(validateAppV2(app, catalog, { mode: 'publish' })).toEqual([])
    const dispatch = app.dispatch!
    expect(app.homeScreenId).toBe(dispatch.overviewScreenId)
    expect(app.roles.map(role => role.name)).toEqual(['Диспетчер', 'Мастер'])
    expect(app.nodes.find(node => node.id === dispatch.calendarNodeId)).toMatchObject({ type: 'team_calendar', data: { hours: null, resourceFieldId: dispatch.job.technician } })
    expect(app.screens.find(screen => screen.id === dispatch.clientScreenId)?.rootIds).toContain(dispatch.createJobFormId)
    const create = app.nodes.find(node => node.id === dispatch.createJobFormId)
    expect(create?.type === 'form' && create.childIds.some(id => app.nodes.some(node => node.id === id && node.type === 'input' && node.fieldId === dispatch.job.client && node.readOnly))).toBe(true)
    const master = actor(['staff'], 'sergey@example.invalid')
    const own = { id: 'job', tableId: dispatch.jobsTableId, values: { [dispatch.job.what]: 'Насос', [dispatch.job.masterEmail]: 'sergey@example.invalid', [dispatch.job.price]: 100, [dispatch.job.report]: 'Готово', [dispatch.job.signature]: [{ url: 'data:image/png;base64,aa' }] } }
    const foreign = { ...own, id: 'other', values: { ...own.values, [dispatch.job.masterEmail]: 'andrey@example.invalid' } }
    expect(projectAppV2Row(app, master, own)).toMatchObject({ [dispatch.job.report]: 'Готово' })
    expect(projectAppV2Row(app, master, own)).not.toHaveProperty(dispatch.job.price)
    expect(projectAppV2Row(app, master, own)).not.toHaveProperty(dispatch.job.masterEmail)
    expect(projectAppV2Row(app, master, foreign)).toEqual({})
    expect(authorizeAppV2Write(app, master, { operation: 'update', row: own, values: { [dispatch.job.report]: 'Заменили насос', [dispatch.job.signature]: [{ url: 'data:image/png;base64,bb' }], [dispatch.job.status]: dispatch.statuses.done } }).ok).toBe(true)
    expect(authorizeAppV2Write(app, master, { operation: 'update', row: own, values: { [dispatch.job.price]: 1 } }).ok).toBe(false)
    expect(authorizeAppV2Write(app, master, { operation: 'update', row: foreign, values: { [dispatch.job.status]: dispatch.statuses.done } }).ok).toBe(false)
    const masters = built.rows.filter(row => row.tableId === dispatch.mastersTableId)
    const activeId = dispatch.activeChoiceId
    expect(activeTechnicians(masters.map(row => ({ id: row.id, active: row.data[dispatch.master.active] === activeId }))).length).toBe(masters.filter(row => row.data[dispatch.master.active] === activeId).length)
    expect(masters.filter(row => row.data[dispatch.master.active] === dispatch.inactiveChoiceId)).toHaveLength(1)
  })
})
