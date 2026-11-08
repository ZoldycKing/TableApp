import { describe, expect, it } from 'vitest'
import type { FieldType } from '@tableapp/schema'
import { canOpenAppV2Screen, projectAppV2Row, validateAppV2, type AppV2Actor, type AppV2Catalog } from '@tableapp/schema/app-v2'
import { buildTemplate } from './build'
import { findTemplate } from './catalog'
import { addShopBasketItem, changeShopBasketQty, removeShopBasketItem } from '../shop-basket'
import { buildShopV2App, isShopTemplate, shopCustomerWorkflow } from './shop-v2'

const workspaceId = 'wsp_shop'
const actor = (roleIds: string[], email: string | null, authenticated = true): AppV2Actor => ({ authenticated, roleIds, id: authenticated ? 'usr_client' : null, email, company: '' })

function installed() {
  const built = buildTemplate({ template: findTemplate('zakazy')!, workspaceId })
  const app = buildShopV2App(built, { id: 'app_shop', workspaceId, name: built.appName, slug: 'prodazhi', email: 'owner@example.invalid' })
  const catalog: AppV2Catalog = {
    workspaceId,
    tables: new Map(built.tables.map(table => [table.id, { workspaceId }])),
    fields: new Map(built.fields.map(field => [field.id, { tableId: field.tableId, type: field.type as FieldType, ...(field.type === 'relation' && typeof (field.options as { tableId?: unknown }).tableId === 'string' ? { relationTableId: (field.options as { tableId: string }).tableId } : {}) }])),
    views: new Map(built.views.map(view => [view.id, { tableId: view.tableId }])),
  }
  return { built, app, catalog }
}

describe('shop template v2 installation', () => {
  it('builds a publishable v2 shop and leaves every other template on the legacy installer', () => {
    expect(isShopTemplate('zakazy')).toBe(true)
    expect(isShopTemplate('salon')).toBe(false)
    const { app, catalog, built } = installed()
    expect(validateAppV2(app, catalog)).toEqual([])
    expect(validateAppV2(app, catalog, { mode: 'publish' })).toEqual([])
    const shop = app.shop!
    expect(app.formatVersion).toBe(2)
    expect(app.homeScreenId).toBe(shop.catalogScreenId)
    expect(app.authentication).toMatchObject({ mode: 'verified_email', defaultRoleId: 'client' })
    expect(app.screens.find(screen => screen.id === shop.detailScreenId)?.catalog).toMatchObject({ titleFieldId: shop.productTitleFieldId, priceFieldId: shop.priceFieldId, imageFieldId: shop.imageFieldId })
    const place = app.workflows.find(flow => flow.steps.some(step => step.type === 'place_shop_order'))!
    const step = place.steps.find(item => item.type === 'place_shop_order')
    if (step?.type !== 'place_shop_order') throw new Error('Missing checkout')
    expect(step.values[shop.cartFieldId]).toEqual({ kind: 'form', formId: shop.checkoutFormId, fieldId: shop.cartFieldId })
    expect(step.values[shop.submissionFieldId]?.kind).toBe('form')
    expect(step.values).not.toHaveProperty(shop.emailFieldId)
    expect(step.values).not.toHaveProperty(shop.statusFieldId)
    expect(step.values).not.toHaveProperty(shop.positionsFieldId)
    const workflow = shopCustomerWorkflow(app)!
    expect(workflow.cart).toMatchObject({ fieldId: shop.cartFieldId, priceFieldId: shop.priceFieldId, itemsTableId: shop.itemsTableId, productFieldId: shop.productFieldId })
    expect(workflow.initialStatus).toBe(shop.initialStatus)
    const goods = built.rows.filter(row => row.tableId === shop.catalogTableId)
    const items = built.rows.filter(row => row.tableId === shop.itemsTableId)
    expect(goods.length).toBeGreaterThan(0)
    expect(items.every(row => Array.isArray(row.data[shop.productFieldId]) && goods.some(product => product.id === (row.data[shop.productFieldId] as string[])[0]))).toBe(true)
    expect(built.rows.filter(row => row.tableId === shop.ordersTableId).every(row => Array.isArray(row.data[shop.positionsFieldId]) && (row.data[shop.positionsFieldId] as string[]).every(id => items.some(item => item.id === id)))).toBe(true)
  })

  it('isolates catalogue, own orders and staff-only fields by role', () => {
    const { app, built } = installed(), shop = app.shop!
    const guest = actor([], null, false), client = actor(['client'], 'irina@example.com'), other = actor(['client'], 'other@example.invalid'), staff = actor(['staff'], 'worker@example.invalid')
    expect(canOpenAppV2Screen(app, guest, shop.catalogScreenId)).toBe(true)
    expect(canOpenAppV2Screen(app, guest, shop.detailScreenId)).toBe(true)
    expect(canOpenAppV2Screen(app, guest, shop.ordersScreenId)).toBe(false)
    expect(canOpenAppV2Screen(app, client, shop.ordersScreenId)).toBe(true)
    const order = built.rows.find(row => row.tableId === shop.ordersTableId && row.data[shop.emailFieldId] === 'irina@example.com')!
    const record = { id: order.id, tableId: order.tableId, values: order.data as Record<string, string | number | boolean | null> }
    expect(projectAppV2Row(app, client, record)).toMatchObject({ [shop.orderTitleFieldId]: order.data[shop.orderTitleFieldId] })
    expect(projectAppV2Row(app, client, record)).not.toHaveProperty(shop.assignmentFieldId)
    expect(projectAppV2Row(app, client, record)).not.toHaveProperty(shop.cartFieldId)
    expect(projectAppV2Row(app, other, record)).toEqual({})
    expect(projectAppV2Row(app, staff, record)).toHaveProperty(shop.assignmentFieldId)
    expect(projectAppV2Row(app, guest, { id: 'goods', tableId: shop.catalogTableId, values: { [shop.priceFieldId]: 100, [shop.productTitleFieldId]: 'Лампа' } })).toMatchObject({ [shop.priceFieldId]: 100 })
    const cancel = app.workflows.find(flow => flow.name === 'Отменить заказ')!
    expect(app.policy.workflows.find(grant => grant.workflowId === cancel.id)?.audience).toEqual({ kind: 'roles', roleIds: ['client'] })
    expect(app.nodes.find(node => node.type === 'button' && node.events.press === cancel.id)?.visibleTo).toEqual({ kind: 'roles', roleIds: ['client'] })
  })

  it('keeps basket quantities bounded and distinct before checkout', () => {
    const basket = { requestId: '11111111-1111-4111-8111-111111111111', items: [{ id: 'product', qty: 1000 }] }
    expect(addShopBasketItem(basket, 'product').items).toEqual([{ id: 'product', qty: 1000 }])
    expect(addShopBasketItem(basket, 'other').items.map(item => item.id)).toEqual(['product', 'other'])
    expect(changeShopBasketQty(basket, 'product', 2.9).items[0]).toEqual({ id: 'product', qty: 2 })
    expect(removeShopBasketItem(basket, 'product').items).toEqual([])
  })
})
