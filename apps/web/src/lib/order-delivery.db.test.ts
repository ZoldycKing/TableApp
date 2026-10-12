import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { and, eq, inArray } from 'drizzle-orm'
import { newId, type App } from '@tableapp/schema'
import { templateExample } from './templates/presentation'
import { composeModules } from './module-composition'
import { orderDeliveryPair } from './order-delivery-config'
import { STAFF_SESSION_COOKIE } from './auth'

const state = vi.hoisted(() => ({ member: null as import('./session').Member | null, jar: new Map<string, string>() }))
vi.mock('@/lib/session', async original => ({ ...await original<typeof import('./session')>(), currentMember: async () => state.member }))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: (name: string) => state.jar.has(name) ? { value: state.jar.get(name) } : undefined }), headers: async () => new Headers() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
const envFile = resolve(import.meta.dirname, '../../../../.env')
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile)

describe.skipIf(!process.env.DATABASE_URL)('order delivery integration in PostgreSQL', () => {
  let database: typeof import('@tableapp/db'), mutations: typeof import('./row-mutations'), deliveryApi: typeof import('./order-delivery'), runtimeActions: typeof import('@/app/runtime-actions'), decisions: typeof import('@/app/customer-actions')
  let app: App, foreign: App
  const ownerId = newId('user'), ownerEmail = `${ownerId}@example.invalid`, customer = `${newId('appUser')}@example.invalid`, manager = `${newId('appUser')}@example.invalid`, courier = `${newId('appUser')}@example.invalid`, other = `${newId('appUser')}@example.invalid`
  const spaces: string[] = [], sessionIds: string[] = []
  beforeAll(async () => {
    database = await import('@tableapp/db'); mutations = await import('./row-mutations'); deliveryApi = await import('./order-delivery'); runtimeActions = await import('@/app/runtime-actions'); decisions = await import('@/app/customer-actions')
    await database.db.insert(database.users).values({ id: ownerId, email: ownerEmail })
    app = await business(); foreign = await business()
  })
  afterAll(async () => {
    if (!database) return
    await database.db.delete(database.workspaces).where(inArray(database.workspaces.id, spaces))
    await database.db.delete(database.users).where(eq(database.users.id, ownerId))
    await database.db.delete(database.staffSessions).where(inArray(database.staffSessions.id, sessionIds))
    await database.sql.end()
  })
  async function business() {
    const workspaceId = newId('workspace'); spaces.push(workspaceId)
    const sales = templateExample('zakazy'), shipping = templateExample('dostavka')
    sales.app.workspaceId = workspaceId; shipping.app.workspaceId = workspaceId
    const combined = composeModules(sales.app, shipping.app, new Map([...sales.views, ...shipping.views].map(view => [view.id, view])))
    combined.slug = `delivery-test-${combined.id}`
    combined.moduleAccess!.grants = combined.modules!.flatMap(module => [{ email: manager, moduleId: module.id, roleId: module.roles!.manager! }, ...(module.kind === 'delivery' ? [{ email: courier, moduleId: module.id, roleId: module.roles!.staff! }] : [])])
    await database.db.insert(database.workspaces).values({ id: workspaceId, ownerId, name: 'Synthetic delivery business', slug: workspaceId, plan: 'business' })
    await database.db.insert(database.workspaceMembers).values({ workspaceId, userId: ownerId, role: 'owner' })
    for (const example of [sales, shipping]) {
      await database.db.insert(database.tables).values(example.built.tables.map(table => ({ ...table, workspaceId })))
      await database.db.insert(database.fields).values(example.built.fields)
      await database.db.insert(database.views).values(example.built.views)
    }
    await database.db.insert(database.apps).values({ id: combined.id, workspaceId, name: combined.name, slug: combined.slug, draft: combined, published: combined })
    return combined
  }
  function asOwner(target = app) {
    state.member = { userId: ownerId, email: ownerEmail, workspaceId: target.workspaceId, workspaceName: 'Synthetic', role: 'owner', name: 'Owner' }
  }
  async function signIn(email: string) {
    const id = newId('session'); sessionIds.push(id)
    await database.db.insert(database.staffSessions).values({ id, email, expiresAt: new Date(Date.now() + 3_600_000) })
    state.jar.set(STAFF_SESSION_COOKIE, id)
  }
  const pair = () => orderDeliveryPair(app)!
  async function stored(id: string) { return (await database.db.select().from(database.rows).where(eq(database.rows.id, id)))[0]! }
  async function change(tableId: string, rowId: string, data: Record<string, unknown>) { return mutations.writeRows(app.workspaceId, context => mutations.updateRow(context, tableId, rowId, data, { id: ownerId, kind: 'member' })) }
  async function order(target = app) {
    const config = orderDeliveryPair(target)!.order, cart = config.cart!
    return mutations.writeRows(target.workspaceId, async context => {
      const item = await mutations.createRow(context, cart.itemsTableId, { [cart.nameFieldId]: 'Маска для волос', [cart.quantityFieldId]: 2, [cart.itemPriceFieldId]: 490, [cart.itemEmailFieldId]: customer }, { id: ownerId, kind: 'member' })
      const record = await mutations.createRow(context, config.tableId, { [config.statusFieldId]: config.initialStatus, [config.emailFieldId]: customer, [config.profile!.nameFieldId]: 'Ирина', [config.profile!.phoneFieldId]: '+7 900 000-00-00', [config.logistics!.addressFieldId]: 'Тестовая улица, дом 7', [cart.positionsFieldId]: [item.id] }, { id: ownerId, kind: 'member' })
      return { row: await context.tx.select().from(database.rows).where(eq(database.rows.id, record.id)).then(records => records[0]!), itemId: item.id }
    })
  }
  async function handoff(id: string, version: number) { asOwner(); return deliveryApi.handoffOrderDelivery(pair().order.tableId, id, version, undefined, true) }

  it('requires explicit management of both modules and ignores the other authentication circuit', async () => {
    const input = await order(), { order: source, delivery } = pair()
    asOwner(); await signIn(customer)
    await expect(deliveryApi.handoffOrderDelivery(source.tableId, input.row.id, input.row.version, app.slug)).rejects.toThrow('недоступны')
    await signIn(courier)
    await expect(deliveryApi.handoffOrderDelivery(source.tableId, input.row.id, input.row.version, app.slug)).rejects.toThrow('недоступны')
    const restricted = structuredClone(app); restricted.moduleAccess!.grants = restricted.moduleAccess!.grants.filter(grant => !(grant.email === manager && restricted.modules!.find(module => module.id === grant.moduleId)?.kind === 'delivery'))
    await database.db.update(database.apps).set({ draft: restricted, published: restricted }).where(eq(database.apps.id, app.id))
    await signIn(manager)
    await expect(deliveryApi.handoffOrderDelivery(source.tableId, input.row.id, input.row.version, app.slug)).rejects.toThrow('недоступны')
    await database.db.update(database.apps).set({ draft: app, published: app }).where(eq(database.apps.id, app.id))
    const result = await deliveryApi.handoffOrderDelivery(source.tableId, input.row.id, input.row.version, app.slug)
    const data = (await stored(result.id)).data as Record<string, unknown>
    expect(data[delivery.emailFieldId]).toBe(customer); expect(data[delivery.profile!.nameFieldId]).toBe('Ирина')
    expect(data[delivery.logistics!.addressFieldId]).toBe('Тестовая улица, дом 7')
    expect(data[delivery.logistics!.kind === 'delivery' ? delivery.logistics!.contentsFieldId : '']).toBe('Маска для волос × 2')
    expect(data[delivery.assignmentFieldId!]).toBeUndefined()
    await database.db.update(database.apps).set({ draft: restricted, published: restricted }).where(eq(database.apps.id, app.id))
    const restrictedState = await deliveryApi.readOrderDelivery(source.tableId, input.row.id, app.slug)
    expect(restrictedState?.linked?.target).toBeUndefined(); expect(restrictedState?.linked?.stage).toBe('restricted')
    await database.db.update(database.apps).set({ draft: app, published: app }).where(eq(database.apps.id, app.id))
  })
  it('commits one delivery on concurrent retries and retains a fixed composition and contacts', async () => {
    const input = await order(), { order: config, delivery } = pair()
    const results = await Promise.all([handoff(input.row.id, input.row.version), handoff(input.row.id, input.row.version)])
    expect(results[0]!.id).toBe(results[1]!.id); expect(results.map(result => result.duplicate).sort()).toEqual([false, true])
    expect(await database.db.select().from(database.orderDeliveries).where(eq(database.orderDeliveries.orderRowId, input.row.id))).toHaveLength(1)
    await expect(change(config.tableId, input.row.id, { [config.logistics!.addressFieldId]: 'Другой адрес' })).rejects.toThrow('зафиксированы')
    await expect(change(config.cart!.itemsTableId, input.itemId, { [config.cart!.quantityFieldId]: 5 })).rejects.toThrow('зафиксированы')
    await expect(change(delivery.tableId, results[0]!.id, { [delivery.emailFieldId]: other })).rejects.toThrow('зафиксированы')
    await expect(mutations.writeRows(app.workspaceId, context => mutations.deleteRow(context, config.cart!.itemsTableId, input.itemId, { id: ownerId, kind: 'member' }))).rejects.toThrow('зафиксированы')
    await expect(mutations.writeRows(app.workspaceId, context => mutations.deleteRow(context, config.tableId, input.row.id, { id: ownerId, kind: 'member' }))).rejects.toThrow('Используйте отмену')
  })
  it('updates order stages through an assigned courier and preserves explicit role isolation', async () => {
    const input = await order(), { order: source, delivery } = pair(), sales = source.logistics!, shipping = delivery.logistics!
    const result = await handoff(input.row.id, input.row.version)
    await expect(change(source.tableId, input.row.id, { [source.statusFieldId]: sales.deliveredStatus })).rejects.toThrow('через доставку')
    await expect(change(delivery.tableId, result.id, { [delivery.statusFieldId]: shipping.shippedStatus })).rejects.toThrow('Назначьте курьера')
    await change(delivery.tableId, result.id, { [delivery.assignmentFieldId!]: courier })
    await signIn(other)
    expect((await runtimeActions.appUpdateRowAction(app.slug, delivery.tableId, result.id, { [delivery.statusFieldId]: shipping.shippedStatus }, (await stored(result.id)).version)).ok).toBe(false)
    await signIn(courier)
    expect(await runtimeActions.appUpdateRowAction(app.slug, delivery.tableId, result.id, { [delivery.statusFieldId]: shipping.shippedStatus }, (await stored(result.id)).version)).toEqual({ ok: true })
    expect(((await stored(input.row.id)).data as Record<string, unknown>)[source.statusFieldId]).toBe(sales.shippedStatus)
    const courierState = await deliveryApi.readOrderDelivery(delivery.tableId, result.id, app.slug)
    expect(courierState?.linked?.target).toBeUndefined()
    await signIn(customer)
    expect((await decisions.customerDecisionAction(app.slug, input.row.id, (await stored(input.row.id)).version, 'cancel', source.tableId)).ok).toBe(false)
    await signIn(courier)
    expect(await runtimeActions.appUpdateRowAction(app.slug, delivery.tableId, result.id, { [delivery.statusFieldId]: shipping.deliveredStatus }, (await stored(result.id)).version)).toEqual({ ok: true })
    expect(((await stored(input.row.id)).data as Record<string, unknown>)[source.statusFieldId]).toBe(sales.deliveredStatus)
    await expect(change(delivery.tableId, result.id, { [delivery.statusFieldId]: delivery.initialStatus })).rejects.toThrow('Закрытую доставку')
  })
  it.each(['order', 'delivery'] as const)('cancels both halves from the client %s and does not create a replacement on retry', async side => {
    const input = await order(), { order: source, delivery } = pair(), result = await handoff(input.row.id, input.row.version)
    await signIn(customer)
    const target = side === 'order' ? source : delivery, id = side === 'order' ? input.row.id : result.id
    expect(await decisions.customerDecisionAction(app.slug, id, (await stored(id)).version, 'cancel', target.tableId)).toEqual({ ok: true })
    expect(((await stored(input.row.id)).data as Record<string, unknown>)[source.statusFieldId]).toBe(source.cancelStatus)
    expect(((await stored(result.id)).data as Record<string, unknown>)[delivery.statusFieldId]).toBe(delivery.cancelStatus)
    expect((await handoff(input.row.id, input.row.version)).id).toBe(result.id)
  })
  it('keeps a missed recipient and return distinct from successful completion', async () => {
    const input = await order(), { order: source, delivery } = pair(), shipping = delivery.logistics!
    if (shipping.kind !== 'delivery') throw new Error('shipping')
    const result = await handoff(input.row.id, input.row.version)
    await change(delivery.tableId, result.id, { [delivery.assignmentFieldId!]: courier, [delivery.statusFieldId]: shipping.shippedStatus })
    await change(delivery.tableId, result.id, { [delivery.statusFieldId]: shipping.missedStatus })
    expect(((await stored(input.row.id)).data as Record<string, unknown>)[source.statusFieldId]).toBe(source.logistics!.shippedStatus)
    await change(delivery.tableId, result.id, { [delivery.statusFieldId]: shipping.shippedStatus })
    await change(delivery.tableId, result.id, { [delivery.statusFieldId]: shipping.returnedStatus })
    expect(((await stored(input.row.id)).data as Record<string, unknown>)[source.statusFieldId]).toBe(source.initialStatus)
    asOwner(); expect((await deliveryApi.readOrderDelivery(source.tableId, input.row.id, undefined, true))?.linked?.stage).toBe('returned')
    await change(source.tableId, input.row.id, { [source.statusFieldId]: source.cancelStatus })
    expect(((await stored(result.id)).data as Record<string, unknown>)[delivery.statusFieldId]).toBe(shipping.returnedStatus)
  })
  it('rejects stale input, missing contacts, paused intake and foreign business or customer references', async () => {
    const input = await order(), { order: source, delivery } = pair()
    await change(source.tableId, input.row.id, { [source.profile!.phoneFieldId]: '+7 900 111-00-00' })
    await expect(handoff(input.row.id, input.row.version)).rejects.toThrow('изменилась')
    await change(source.tableId, input.row.id, { [source.logistics!.addressFieldId]: '' })
    await expect(handoff(input.row.id, (await stored(input.row.id)).version)).rejects.toThrow('адрес, имя и телефон')
    await change(source.tableId, input.row.id, { [source.logistics!.addressFieldId]: 'Тестовый адрес' })
    const paused = structuredClone(app); paused.modules!.find(module => module.kind === 'delivery')!.intakeEnabled = false
    await database.db.update(database.apps).set({ draft: paused, published: paused }).where(eq(database.apps.id, app.id))
    await expect(handoff(input.row.id, (await stored(input.row.id)).version)).rejects.toThrow('приостановлены')
    await database.db.update(database.apps).set({ draft: app, published: app }).where(eq(database.apps.id, app.id))
    expect(await database.db.select().from(database.orderDeliveries).where(eq(database.orderDeliveries.orderRowId, input.row.id))).toHaveLength(0)
    const чужой = await order(foreign)
    asOwner(app); await expect(deliveryApi.handoffOrderDelivery(orderDeliveryPair(foreign)!.order.tableId, чужой.row.id, чужой.row.version, undefined, true)).rejects.toThrow('недоступны')
    await handoff(input.row.id, (await stored(input.row.id)).version)
    await signIn(other)
    await expect(deliveryApi.readOrderDelivery(source.tableId, input.row.id, app.slug)).rejects.toThrow('недоступны')
    await signIn(customer)
    const own = await deliveryApi.readOrderDelivery(source.tableId, input.row.id, app.slug)
    expect(own?.linked?.target?.tableId).toBe(delivery.tableId)
  })
  it('retains the handoff contract when the original application is deleted', async () => {
    const input = await order(), { order: source, delivery } = pair(), result = await handoff(input.row.id, input.row.version)
    await database.db.delete(database.apps).where(eq(database.apps.id, app.id))
    const guard = (await import('./module-resource-guard')).modularFieldChangeError
    const error = await database.db.transaction(tx => guard(tx, app.workspaceId, source.cart!.quantityFieldId, null))
    expect(error).toContain('зафиксированном заказе')
    const columns = await mutations.writeRows(app.workspaceId, context => mutations.mutationFields(context, delivery.tableId))
    const status = columns.find(field => field.id === delivery.statusFieldId)!
    if (status.type !== 'single_select') throw new Error('status')
    const changed = { ...status, options: { ...status.options, choices: status.options.choices.filter(choice => choice.id !== delivery.logistics!.shippedStatus) } }
    expect(await database.db.transaction(tx => guard(tx, app.workspaceId, status.id, changed))).toContain('статус используется')
    await change(delivery.tableId, result.id, { [delivery.assignmentFieldId!]: courier, [delivery.statusFieldId]: delivery.logistics!.shippedStatus })
    expect(((await stored(input.row.id)).data as Record<string, unknown>)[source.statusFieldId]).toBe(source.logistics!.shippedStatus)
  })
})
