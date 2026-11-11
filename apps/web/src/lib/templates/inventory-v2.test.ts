import { describe, expect, it } from 'vitest'
import type { FieldType } from '@tableapp/schema'
import { authorizeAppV2Write, canInvokeAppV2Workflow, canOpenAppV2Screen, projectAppV2Row, validateAppV2, type AppV2Actor, type AppV2Catalog } from '@tableapp/schema/app-v2'
import { buildTemplate } from './build'
import { findTemplate } from './catalog'
import { buildInventoryV2App, isInventoryTemplate } from './inventory-v2'
import { isCrmTemplate } from './crm-v2'
import { isShopTemplate } from './shop-v2'
import { inventoryGuardNegativeStock, inventoryStockFromMovements } from '../inventory-stock'

const workspaceId = 'wsp_inventory'
const actor = (roleIds: string[], email: string | null, authenticated = true): AppV2Actor => ({
  authenticated, roleIds, id: authenticated ? 'usr_inv' : null, email, company: '',
})

function installed() {
  const built = buildTemplate({ template: findTemplate('sklad')!, workspaceId })
  const app = buildInventoryV2App(built, { id: 'app_inv', workspaceId, name: built.appName, slug: 'sklad', email: 'owner@example.invalid' })
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

describe('inventory template v2 installation', () => {
  it('builds a publishable warehouse app on the shared kit', () => {
    expect(isInventoryTemplate('sklad')).toBe(true)
    expect(isInventoryTemplate('crm')).toBe(false)
    expect(isCrmTemplate('sklad')).toBe(false)
    expect(isShopTemplate('sklad')).toBe(false)
    const { app, catalog, built } = installed()
    expect(validateAppV2(app, catalog)).toEqual([])
    expect(validateAppV2(app, catalog, { mode: 'publish' })).toEqual([])
    expect(app.formatVersion).toBe(2)
    expect(app.shop).toBeUndefined()
    expect(app.crm).toBeUndefined()
    expect(app.inventory).toMatchObject({
      itemsTableId: expect.any(String),
      movementsTableId: expect.any(String),
      warehousesTableId: expect.any(String),
      itemPhotoFieldId: expect.any(String),
    })
    const itemsCollection = app.nodes.find(node => node.type === 'collection' && node.layout === 'list' && node.cardDetailFieldId === app.inventory!.itemStockFieldId)
    expect(itemsCollection).toMatchObject({ cardImageFieldId: app.inventory!.itemPhotoFieldId })
    expect(app.nodes.some(node => node.type === 'input' && 'fieldId' in node && node.fieldId === app.inventory!.itemPhotoFieldId)).toBe(true)
    expect(app.roles.map(role => role.id)).toEqual(['owner', 'staff'])
    expect(app.roles.find(role => role.id === 'staff')?.name).toBe('Кладовщик')
    expect(app.homeScreenId).toBe(app.inventory!.itemsScreenId)
    expect(app.authentication).toMatchObject({ mode: 'invite_only', defaultRoleId: null })
    const inv = app.inventory!
    expect(app.screens.some(screen => screen.id === inv.movementsScreenId && screen.navigation)).toBe(true)
    expect(app.nodes.find(node => node.id === inv.receiptFormId)).toMatchObject({ type: 'form', mode: 'create' })
    expect(app.nodes.find(node => node.id === inv.itemEditFormId)).toMatchObject({ type: 'form', mode: 'edit' })
    const receipt = app.workflows.find(flow => flow.id === (app.nodes.find(node => node.id === inv.receiptFormId) as { events: { submit: string } }).events.submit)!
    expect(receipt.steps.some(step => step.type === 'record_inventory_movement' && step.operation === 'receipt')).toBe(true)
    const writeOff = app.workflows.find(flow => flow.id === (app.nodes.find(node => node.id === inv.writeOffFormId) as { events: { submit: string } }).events.submit)!
    expect(writeOff.steps.some(step => step.type === 'record_inventory_movement' && step.operation === 'write_off')).toBe(true)
    expect(app.nodes.some(node => node.type === 'collection' && node.layout === 'timeline')).toBe(true)
    expect(built.tables.some(table => table.name === 'Склады')).toBe(true)
    expect(built.rows.filter(row => row.tableId === inv.warehousesTableId).length).toBe(2)
    const lowItems = built.rows.filter(row => {
      if (row.tableId !== inv.itemsTableId) return false
      const min = Number(row.data[inv.itemMinFieldId] ?? 0)
      const opening = Number(row.data[inv.itemOpeningFieldId] ?? 0)
      const links = Array.isArray(row.data[inv.itemMovementsFieldId]) ? row.data[inv.itemMovementsFieldId] as string[] : []
      const qty = opening + inventoryStockFromMovements(built.rows.filter(movement => links.includes(movement.id)).map(movement => ({
        qty: Number(movement.data[inv.movementQtyFieldId] ?? 0),
        warehouseId: null,
      })))
      return qty < min
    })
    expect(lowItems.length).toBeGreaterThan(0)
  })

  it('enforces owner-only write-off and product edits; staff can receive/issue/transfer; guests are read-only', () => {
    const { app, built } = installed(), inv = app.inventory!
    const guest = actor([], null, false)
    const owner = actor(['owner'], 'owner@example.invalid')
    const staff = actor(['staff'], 'worker@example.invalid')
    expect(canOpenAppV2Screen(app, guest, inv.itemsScreenId)).toBe(false)
    expect(canOpenAppV2Screen(app, owner, inv.itemsScreenId)).toBe(true)
    expect(canOpenAppV2Screen(app, staff, inv.itemScreenId)).toBe(true)
    const receipt = app.nodes.find(node => node.id === inv.receiptFormId)
    const writeOff = app.nodes.find(node => node.id === inv.writeOffFormId)
    const edit = app.nodes.find(node => node.id === inv.itemEditFormId)
    if (receipt?.type !== 'form' || writeOff?.type !== 'form' || edit?.type !== 'form') throw new Error('missing forms')
    expect(canInvokeAppV2Workflow(app, staff, receipt.events.submit!)).toBe(true)
    expect(canInvokeAppV2Workflow(app, staff, writeOff.events.submit!)).toBe(false)
    expect(canInvokeAppV2Workflow(app, owner, writeOff.events.submit!)).toBe(true)
    expect(canInvokeAppV2Workflow(app, staff, edit.events.submit!)).toBe(false)
    expect(canInvokeAppV2Workflow(app, owner, edit.events.submit!)).toBe(true)
    expect(canInvokeAppV2Workflow(app, guest, receipt.events.submit!)).toBe(false)
    const product = built.rows.find(row => row.tableId === inv.itemsTableId)!
    const record = { id: product.id, tableId: product.tableId, values: product.data as Record<string, string | number | boolean | null> }
    const patch = { [inv.itemMinFieldId]: 5, [inv.itemNameFieldId]: 'Фильтр' }
    expect(authorizeAppV2Write(app, owner, { operation: 'update', row: record, values: patch }).ok).toBe(true)
    expect(authorizeAppV2Write(app, staff, { operation: 'update', row: record, values: patch }).ok).toBe(false)
    expect(authorizeAppV2Write(app, guest, { operation: 'update', row: record, values: patch }).ok).toBe(false)
    expect(projectAppV2Row(app, staff, record)).not.toHaveProperty(inv.itemCostFieldId)
    expect(projectAppV2Row(app, owner, record)).toHaveProperty(inv.itemCostFieldId)
    expect(inventoryGuardNegativeStock(2, -3, 3)).toMatchObject({ ok: false })
  })
})
