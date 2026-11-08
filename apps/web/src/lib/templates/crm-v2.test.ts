import { describe, expect, it } from 'vitest'
import type { FieldType } from '@tableapp/schema'
import { canInvokeAppV2Workflow, canOpenAppV2Screen, projectAppV2Row, validateAppV2, type AppV2Actor, type AppV2Catalog } from '@tableapp/schema/app-v2'
import { buildTemplate } from './build'
import { findTemplate } from './catalog'
import { buildCrmV2App, isCrmTemplate } from './crm-v2'
import { isShopTemplate } from './shop-v2'

const workspaceId = 'wsp_crm'
const actor = (roleIds: string[], email: string | null, authenticated = true): AppV2Actor => ({
  authenticated, roleIds, id: authenticated ? 'usr_crm' : null, email, company: '',
})

function installed() {
  const built = buildTemplate({ template: findTemplate('crm')!, workspaceId })
  const app = buildCrmV2App(built, { id: 'app_crm', workspaceId, name: built.appName, slug: 'sdelki', email: 'owner@example.invalid' })
  const catalog: AppV2Catalog = {
    workspaceId,
    tables: new Map(built.tables.map(table => [table.id, { workspaceId }])),
    fields: new Map(built.fields.map(field => [field.id, {
      tableId: field.tableId, type: field.type as FieldType,
      ...(field.type === 'relation' && typeof (field.options as { tableId?: unknown }).tableId === 'string' ? { relationTableId: (field.options as { tableId: string }).tableId } : {}),
    }])),
    views: new Map(built.views.map(view => [view.id, { tableId: view.tableId }])),
  }
  return { built, app, catalog }
}

describe('crm template v2 installation', () => {
  it('builds a publishable internal crm app and leaves shop detection unchanged', () => {
    expect(isCrmTemplate('crm')).toBe(true)
    expect(isCrmTemplate('zakazy')).toBe(false)
    expect(isShopTemplate('crm')).toBe(false)
    const { app, catalog } = installed()
    expect(validateAppV2(app, catalog)).toEqual([])
    expect(validateAppV2(app, catalog, { mode: 'publish' })).toEqual([])
    expect(app.formatVersion).toBe(2)
    expect(app.shop).toBeUndefined()
    expect(app.crm).toMatchObject({ dealsTableId: expect.any(String), clientsTableId: expect.any(String) })
    expect(app.authentication).toMatchObject({ mode: 'invite_only', defaultRoleId: null })
    expect(app.roles.map(role => role.id)).toEqual(['owner', 'staff'])
    expect(app.homeScreenId).toBe(app.crm!.boardScreenId)
    const boardScreen = app.screens.find(screen => screen.id === app.crm!.boardScreenId)!
    expect(boardScreen.rootIds).toHaveLength(2)
    expect(app.nodes.find(node => node.id === boardScreen.rootIds[0])).toMatchObject({ type: 'button', label: 'Новая сделка' })
    const board = app.nodes.find(node => node.id === boardScreen.rootIds[1])
    expect(board).toMatchObject({ type: 'collection', layout: 'kanban', groupFieldId: app.crm!.stageFieldId })
    expect(app.crm!.createDealScreenId).toBeTruthy()
    expect(app.crm!.contactsTableId).toBeTruthy()
    expect(app.screens.some(screen => screen.id === app.crm!.createDealScreenId && screen.rootIds.includes(app.crm!.createDealFormId))).toBe(true)
    const related = app.sources.find(source => source.tableId === app.crm!.dealsTableId && source.screenTableId === app.crm!.clientsTableId)!
    expect(related.filter).toMatchObject({ op: 'includes', right: { kind: 'screen_row_id' } })
    const dealContacts = app.sources.find(source => source.tableId === app.crm!.contactsTableId && source.screenTableId === app.crm!.dealsTableId)!
    expect(dealContacts.filter).toMatchObject({ op: 'includes', left: { fieldId: app.crm!.contactDealFieldId }, right: { kind: 'screen_row_id' } })
    const contact = app.nodes.find(node => node.type === 'form' && node.id === app.crm!.contactFormId)
    expect(contact).toMatchObject({ type: 'form', mode: 'edit' })
    const save = app.workflows.find(flow => flow.id === (contact && contact.type === 'form' ? contact.events.submit : null))!
    expect(save.steps.some(step => step.type === 'create_row' && step.tableId === app.crm!.contactsTableId)).toBe(true)
    expect(save.steps.some(step => step.type === 'update_row' && step.tableId === app.crm!.dealsTableId)).toBe(true)
    expect(app.screens.find(screen => screen.id === app.crm!.clientScreenId)!.rootIds.some(id => {
      const node = app.nodes.find(item => item.id === id)
      return node?.type === 'collection' && node.name === 'Сделки'
    })).toBe(true)
  })

  it('keeps crm private and isolates staff deals by assignment', () => {
    const { app, built } = installed(), crm = app.crm!
    const guest = actor([], null, false)
    const owner = actor(['owner'], 'owner@example.invalid')
    const staff = actor(['staff'], 'worker@example.invalid')
    const stranger = actor(['staff'], 'other@example.invalid')
    expect(canOpenAppV2Screen(app, guest, crm.boardScreenId)).toBe(false)
    expect(canOpenAppV2Screen(app, guest, crm.clientScreenId)).toBe(false)
    expect(canOpenAppV2Screen(app, owner, crm.boardScreenId)).toBe(true)
    expect(canOpenAppV2Screen(app, staff, crm.clientsScreenId)).toBe(true)
    expect(app.roles.some(role => role.id === 'client')).toBe(false)
    const deal = built.rows.find(row => row.tableId === crm.dealsTableId && row.data[crm.assignmentFieldId] === 'worker@example.invalid')!
    const record = { id: deal.id, tableId: deal.tableId, values: deal.data as Record<string, string | number | boolean | null> }
    const other = { id: 'row_foreign_deal', tableId: crm.dealsTableId, values: { ...record.values, [crm.assignmentFieldId]: 'other@example.invalid' } }
    expect(projectAppV2Row(app, staff, record)).toHaveProperty(crm.titleFieldId)
    expect(projectAppV2Row(app, staff, other)).toEqual({})
    expect(projectAppV2Row(app, stranger, record)).toEqual({})
    expect(projectAppV2Row(app, owner, record)).toHaveProperty(crm.assignmentFieldId)
    expect(projectAppV2Row(app, owner, other)).toHaveProperty(crm.titleFieldId)
    const contact = app.nodes.find(node => node.type === 'form' && node.id === crm.contactFormId)
    if (contact?.type !== 'form' || !contact.events.submit) throw new Error('missing contact form')
    expect(canInvokeAppV2Workflow(app, staff, contact.events.submit)).toBe(true)
    expect(canInvokeAppV2Workflow(app, guest, contact.events.submit)).toBe(false)
    const save = app.workflows.find(flow => flow.id === contact.events.submit)!
    const log = save.steps.find(step => step.type === 'create_row' && step.tableId === crm.contactsTableId)
    if (!log || log.type !== 'create_row') throw new Error('missing contact log step')
    expect(log.values[crm.contactSummaryFieldId!]).toMatchObject({ kind: 'form', fieldId: crm.noteFieldId })
    expect(Object.keys(log.values)).not.toContain(crm.noteFieldId)
  })
})
