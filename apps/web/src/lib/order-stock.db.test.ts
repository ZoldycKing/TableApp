import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { and, eq, inArray } from 'drizzle-orm'
import { newId, normalizeFieldOptions, type Field } from '@tableapp/schema'
import { templateExample } from './templates/presentation'
import { connectSalesInventory } from './sales-inventory-connection'
import { orderStockPair } from './order-stock-config'
import { STAFF_SESSION_COOKIE } from './auth'
import { composeModules } from './module-composition'

const identity = vi.hoisted(() => ({ cookie: '', member: null as import('./session').Member | null }))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: (name: string) => name === STAFF_SESSION_COOKIE && identity.cookie ? { value: identity.cookie } : undefined }) }))
vi.mock('@/lib/session', async original => ({ ...await original<typeof import('./session')>(), currentMember: async () => identity.member }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
const envFile = resolve(import.meta.dirname, '../../../../.env')
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile)

describe.skipIf(!process.env.DATABASE_URL)('orders and stock reservations in PostgreSQL', () => {
  let database: typeof import('@tableapp/db'), service: typeof import('./order-stock'), writes: typeof import('./row-mutations')
  const ownerId = newId('user'), ownerEmail = `${ownerId}@example.invalid`, manager = `${newId('user')}@example.invalid`, client = `${newId('user')}@example.invalid`
  const spaces: string[] = [], sessions: string[] = []
  beforeAll(async () => { database = await import('@tableapp/db'); service = await import('./order-stock'); writes = await import('./row-mutations'); await database.db.insert(database.users).values({ id: ownerId, email: ownerEmail }) })
  beforeEach(() => { identity.cookie = ''; identity.member = null })
  afterAll(async () => {
    if (!database) return
    await database.db.delete(database.workspaces).where(inArray(database.workspaces.id, spaces))
    await database.db.delete(database.staffSessions).where(inArray(database.staffSessions.id, sessions))
    await database.db.delete(database.users).where(eq(database.users.id, ownerId)); await database.sql.end()
  })
  async function business(quantity = 3, shipping = false) {
    const workspaceId = newId('workspace'); spaces.push(workspaceId)
    const sales = templateExample('zakazy'); sales.app.workspaceId = workspaceId; sales.app.slug = `stock-${workspaceId}`; sales.app.allowlist = [{ email: manager, roleId: 'manager', company: '' }]
    const addition = connectSalesInventory(sales.app, manager, new Map(sales.fields.map(field => [field.id, field])), new Map(sales.views.map(view => [view.id, view])))
    const delivery = shipping ? templateExample('dostavka') : null
    if (delivery) { delivery.app.workspaceId = workspaceId; delivery.app.allowlist = [{ email: manager, roleId: 'manager', company: '' }, { email: 'courier-stock@example.invalid', roleId: 'staff', company: '' }] }
    const app = delivery ? composeModules(addition.app, delivery.app, new Map([...sales.views, ...addition.views, ...delivery.views].map(view => [view.id, view]))) : addition.app
    const pair = orderStockPair(app)!, product = sales.built.rows.find(row => row.tableId === pair.inventory.tables.items)!
    product.data[pair.inventory.item.opening] = quantity
    await database.db.insert(database.workspaces).values({ id: workspaceId, ownerId, name: 'Synthetic stock shop', slug: workspaceId, plan: 'business' })
    await database.db.insert(database.workspaceMembers).values({ workspaceId, userId: ownerId, role: 'owner' })
    await database.db.insert(database.tables).values([...sales.built.tables.map(table => ({ ...table, workspaceId })), ...addition.tables, ...(delivery?.built.tables.map(table => ({ ...table, workspaceId })) ?? [])])
    await database.db.insert(database.fields).values([...sales.built.fields, ...addition.fields, ...(delivery?.built.fields ?? [])])
    await database.db.insert(database.views).values([...sales.built.views, ...addition.views, ...(delivery?.built.views ?? [])])
    await database.db.insert(database.rows).values([...sales.built.rows, ...(delivery?.built.rows ?? [])])
    await database.db.insert(database.apps).values({ id: app.id, workspaceId, name: app.name, slug: app.slug, draft: app, published: app })
    expect(await (await import('./app-references')).validateAppReferences(app)).toBeNull()
    return { app, pair, productId: product.id, workspaceId }
  }
  type Business = Awaited<ReturnType<typeof business>>
  async function signIn(email: string) { const id = newId('session'); sessions.push(id); await database.db.insert(database.staffSessions).values({ id, email, expiresAt: new Date(Date.now() + 3_600_000) }); identity.cookie = id }
  async function order(space: Business, quantity = 1, email = client) {
    await signIn(email)
    const author = { ...await (await import('./app-session')).currentAppAccess(space.app), ip: null }, config = space.pair.order
    const token = randomUUID()
    const value = await writes.writeRows(space.workspaceId, context => (async () => (await import('./customer-create')).createCustomerRecord(context, space.app, config, {
      [config.cart!.fieldId]: JSON.stringify({ requestId: token, items: [{ id: space.productId, qty: quantity }] }), [config.submissionFieldId!]: token,
      [config.profile!.nameFieldId]: 'Ирина', [config.profile!.phoneFieldId]: '+7 900 000-00-00', [config.logistics!.addressFieldId]: 'Адрес для проверки',
    }, author))())
    return value.id
  }
  async function row(tableId: string, id: string) { return (await database.db.select().from(database.rows).where(and(eq(database.rows.tableId, tableId), eq(database.rows.id, id))))[0]! }
  async function confirm(space: Business, id: string) { return service.confirmOrderStock(space.pair.order.tableId, id, (await row(space.pair.order.tableId, id)).version, space.app.slug) }
  async function balance(space: Business) { return (await import('./inventory-balance')).readInventoryBalance(space.pair.inventory.tables.items, space.productId, space.app.slug) }
  function owner(space: Business) { identity.member = { userId: ownerId, email: ownerEmail, workspaceId: space.workspaceId, workspaceName: '', role: 'owner', name: 'Owner' } }
  async function pickup(space: Business, quantity = 1) {
    const id = await order(space, quantity); await signIn(manager); await confirm(space, id)
    await service.issueOrderStock(space.pair.order.tableId, id, (await row(space.pair.order.tableId, id)).version, space.app.slug)
    return id
  }
  const returnPickup = async (space: Business, id: string, version?: number, business = false) => service.returnOrderStock(space.pair.order.tableId, id,
    version ?? (await row(space.pair.order.tableId, id)).version, business ? undefined : space.app.slug, business)

  it('links checkout positions to exact product IDs, reserves only on confirmation and issues once on pickup', async () => {
    const space = await business(), id = await order(space, 2), config = space.pair.order
    const initial = await row(config.tableId, id), positionId = (initial.data as Record<string, unknown>)[config.cart!.positionsFieldId] as string[]
    expect((await row(config.cart!.itemsTableId, positionId[0]!)).data).toMatchObject({ [config.cart!.productFieldId!]: [space.productId] })
    await signIn(manager)
    expect(await balance(space)).toEqual({ stock: 3, reserved: 0, available: 3 })
    expect(await confirm(space, id)).toMatchObject({ state: 'reserved', repeated: false })
    expect(await balance(space)).toEqual({ stock: 3, reserved: 2, available: 1 })
    const version = (await row(config.tableId, id)).version
    await service.issueOrderStock(config.tableId, id, version, space.app.slug)
    await service.issueOrderStock(config.tableId, id, version, space.app.slug)
    expect(await balance(space)).toEqual({ stock: 1, reserved: 0, available: 1 })
    expect((await database.db.select().from(database.rows).where(eq(database.rows.tableId, space.pair.inventory.tables.movements)))).toHaveLength(1)
  })
  it('serializes competing confirmations for the last item and makes retry idempotent', async () => {
    const space = await business(1), first = await order(space), second = await order(space)
    await signIn(manager)
    const results = await Promise.allSettled([confirm(space, first), confirm(space, second)])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(await balance(space)).toEqual({ stock: 1, reserved: 1, available: 0 })
    const winner = results[0]!.status === 'fulfilled' ? first : second
    const retry = await service.confirmOrderStock(space.pair.order.tableId, winner, 0, space.app.slug)
    expect(retry.repeated).toBe(true)
    expect(await balance(space)).toEqual({ stock: 1, reserved: 1, available: 0 })
  })
  it('releases on cancellation, prevents changing accepted quantities and blocks ordinary stock issue below held goods', async () => {
    const space = await business(), id = await order(space, 2); await signIn(manager); await confirm(space, id)
    expect(await writes.writeRows(space.workspaceId, context => import('./module-lifecycle').then(module => module.moduleOwnershipError(space.app, context.tx)))).toBeNull()
    const config = space.pair.order, source = await row(config.tableId, id), positionId = ((source.data as Record<string, unknown>)[config.cart!.positionsFieldId] as string[])[0]!
    await expect(writes.writeRows(space.workspaceId, context => writes.updateRow(context, config.cart!.itemsTableId, positionId, { [config.cart!.quantityFieldId]: 1 }, { id: ownerId, kind: 'member' }))).rejects.toThrow('зафиксированы')
    const operation = await (await import('@/app/inventory-actions')).saveStockOperationAction(space.app.slug, 'issue', { id: `row_${newId('row')}`, itemId: space.productId, quantity: 2, note: '' })
    expect(operation.ok).toBe(false)
    expect(await balance(space)).toEqual({ stock: 3, reserved: 2, available: 1 })
    await signIn(client)
    await writes.writeRows(space.workspaceId, context => writes.updateRow(context, config.tableId, id, { [config.statusFieldId]: config.cancelStatus }, { id: null, kind: 'app_user' }))
    await signIn(manager)
    expect(await balance(space)).toEqual({ stock: 3, reserved: 0, available: 3 })
    expect(await service.confirmOrderStock(config.tableId, id, 0, space.app.slug)).toMatchObject({ state: 'released', repeated: true })
  })
  it('requires both work assignments and never borrows the platform owner circuit for a client', async () => {
    const space = await business(), foreign = await business(), id = await order(space), foreignId = await order(foreign)
    await signIn(client); owner(space)
    await expect(confirm(space, id)).rejects.toThrow('недоступны')
    expect(await balance(space)).toBeNull()
    await expect(service.confirmOrderStock(foreign.pair.order.tableId, foreignId, 0, undefined, true)).rejects.toThrow('недоступны')
    expect(await service.confirmOrderStock(space.pair.order.tableId, id, (await row(space.pair.order.tableId, id)).version, undefined, true)).toMatchObject({ state: 'reserved' })
    identity.member = null; await signIn(manager)
    const limited = structuredClone(space.app); limited.moduleAccess!.grants = limited.moduleAccess!.grants.filter(grant => limited.modules!.find(module => module.id === grant.moduleId)?.kind !== 'inventory')
    await database.db.update(database.apps).set({ draft: limited, published: limited }).where(eq(database.apps.id, limited.id))
    await expect(confirm(space, id)).rejects.toThrow('недоступны')
    expect(await balance(space)).toBeNull()
  })
  it('rejects direct status bypass, insufficient stock and stale versions without partial allocations', async () => {
    const space = await business(1), id = await order(space, 2); await signIn(manager)
    await expect(confirm(space, id)).rejects.toThrow('Недостаточно')
    expect(await balance(space)).toEqual({ stock: 1, reserved: 0, available: 1 })
    await expect(service.confirmOrderStock(space.pair.order.tableId, id, 99, space.app.slug)).rejects.toThrow('изменилась')
    await expect(writes.writeRows(space.workspaceId, context => writes.updateRow(context, space.pair.order.tableId, id, { [space.pair.order.statusFieldId]: space.pair.order.stock!.confirmedStatus }, { id: ownerId, kind: 'member' }))).rejects.toThrow('Сначала подтвердите')
    expect((await database.db.select().from(database.orderStockReservations).where(eq(database.orderStockReservations.workspaceId, space.workspaceId)))).toEqual([])
  })
  it('issues from an authorized courier transition and records an actual returned package once', async () => {
    const space = await business(3, true), id = await order(space, 2); await signIn(manager); await confirm(space, id)
    const shipping = await (await import('./order-delivery')).handoffOrderDelivery(space.pair.order.tableId, id, (await row(space.pair.order.tableId, id)).version, space.app.slug)
    expect(await service.readOrderStock(space.pair.order.tableId, id, space.app.slug)).toMatchObject({ state: 'reserved', reason: 'Товар спишется со склада при передаче курьеру.' })
    const delivery = (await import('@tableapp/schema')).customerWorkflows(space.app).find(config => config.logistics?.kind === 'delivery')!
    await writes.writeRows(space.workspaceId, context => writes.updateRow(context, delivery.tableId, shipping.id, { [delivery.assignmentFieldId!]: 'courier-stock@example.invalid' }, { id: ownerId, kind: 'member' }))
    await signIn('courier-stock@example.invalid')
    const runtime = await import('@/app/runtime-actions')
    expect(await runtime.appUpdateRowAction(space.app.slug, delivery.tableId, shipping.id, { [delivery.statusFieldId]: delivery.logistics!.shippedStatus }, (await row(delivery.tableId, shipping.id)).version)).toMatchObject({ ok: true })
    await signIn(manager); expect(await balance(space)).toEqual({ stock: 1, reserved: 0, available: 1 })
    expect((await service.readOrderStock(space.pair.order.tableId, id, space.app.slug))!.reason).toBeUndefined()
    await signIn('courier-stock@example.invalid')
    const logistics = delivery.logistics!; if (logistics.kind !== 'delivery') throw new Error('Wrong fixture')
    expect(await runtime.appUpdateRowAction(space.app.slug, delivery.tableId, shipping.id, { [delivery.statusFieldId]: logistics.returnedStatus }, (await row(delivery.tableId, shipping.id)).version)).toMatchObject({ ok: true })
    await signIn(manager); expect(await balance(space)).toEqual({ stock: 3, reserved: 0, available: 3 })
    const movements = await database.db.select().from(database.rows).where(eq(database.rows.tableId, space.pair.inventory.tables.movements))
    expect(movements).toHaveLength(2)
    expect(movements.every(movement => (movement.data as Record<string, unknown>)[space.pair.inventory.movement.author] === 'courier-stock@example.invalid')).toBe(true)
    expect((await service.readOrderStock(space.pair.order.tableId, id, space.app.slug))!.state).toBe('returned')
    expect((await service.readOrderStock(space.pair.order.tableId, id, space.app.slug))!.reason).toBeUndefined()
  })
  it('keeps one stock issue through delivery retries and completion, then releases a separately cancelled delivery', async () => {
    const space = await business(10, true), id = await order(space, 2), cancelled = await order(space, 1)
    await signIn(manager); await confirm(space, id); await confirm(space, cancelled)
    const serviceDelivery = await import('./order-delivery'), decisions = await import('@/app/customer-actions'), runtime = await import('@/app/runtime-actions')
    const source = space.pair.order, config = (await import('@tableapp/schema')).customerWorkflows(space.app).find(config => config.logistics?.kind === 'delivery')!, logistics = config.logistics!
    if (logistics.kind !== 'delivery') throw new Error('Wrong fixture')
    const first = await serviceDelivery.handoffOrderDelivery(source.tableId, id, (await row(source.tableId, id)).version, space.app.slug)
    const second = await serviceDelivery.handoffOrderDelivery(source.tableId, cancelled, (await row(source.tableId, cancelled)).version, space.app.slug)
    expect(await balance(space)).toEqual({ stock: 10, reserved: 3, available: 7 })
    await writes.writeRows(space.workspaceId, context => writes.updateRow(context, config.tableId, first.id, { [config.assignmentFieldId!]: 'courier-stock@example.invalid' }, { id: ownerId, kind: 'member' }))
    await signIn('courier-stock@example.invalid')
    const version = (await row(config.tableId, first.id)).version
    const retries = await Promise.all([1, 2].map(() => runtime.appUpdateRowAction(space.app.slug, config.tableId, first.id, { [config.statusFieldId]: logistics.shippedStatus }, version)))
    expect(retries.filter(result => result.ok)).toHaveLength(1)
    for (const status of [logistics.missedStatus, logistics.shippedStatus, logistics.deliveredStatus]) {
      expect(await runtime.appUpdateRowAction(space.app.slug, config.tableId, first.id, { [config.statusFieldId]: status }, (await row(config.tableId, first.id)).version)).toEqual({ ok: true })
    }
    await signIn(manager)
    expect(await balance(space)).toEqual({ stock: 8, reserved: 1, available: 7 })
    expect(((await row(source.tableId, id)).data as Record<string, unknown>)[source.statusFieldId]).toBe(source.logistics!.deliveredStatus)
    await signIn(client)
    expect(await decisions.customerDecisionAction(space.app.slug, second.id, (await row(config.tableId, second.id)).version, 'cancel', config.tableId)).toEqual({ ok: true })
    expect(((await row(source.tableId, cancelled)).data as Record<string, unknown>)[source.statusFieldId]).toBe(source.cancelStatus)
    await signIn(manager)
    expect(await balance(space)).toEqual({ stock: 8, reserved: 0, available: 8 })
    expect(await database.db.select().from(database.rows).where(eq(database.rows.tableId, space.pair.inventory.tables.movements))).toHaveLength(1)
  })
  it('preserves accepted allocation rules after app deletion and prevents changing initial balances below a live reserve', async () => {
    const space = await business(3), id = await order(space, 2); await signIn(manager); await confirm(space, id)
    await database.db.delete(database.apps).where(eq(database.apps.id, space.app.id))
    const actor = { id: ownerId, kind: 'member' }
    await expect(writes.writeRows(space.workspaceId, context => writes.updateRow(context, space.pair.inventory.tables.items, space.productId, { [space.pair.inventory.item.opening]: 1 }, actor))).rejects.toThrow('зарезервирован')
    await writes.writeRows(space.workspaceId, context => writes.updateRow(context, space.pair.order.tableId, id, { [space.pair.order.statusFieldId]: space.pair.order.cancelStatus }, actor))
    expect((await database.db.select().from(database.orderStockReservations).where(eq(database.orderStockReservations.workspaceId, space.workspaceId)))[0]!.state).toBe('released')
    await expect(writes.writeRows(space.workspaceId, context => writes.deleteRow(context, space.pair.inventory.tables.items, space.productId, actor))).rejects.toThrow('подтверждённым')
  })
  it('requires the current editable status and readable position quantities, and disallows unconfirmed delivery', async () => {
    const space = await business(3, true), id = await order(space, 2); await signIn(manager)
    await expect((await import('./order-delivery')).handoffOrderDelivery(space.pair.order.tableId, id, (await row(space.pair.order.tableId, id)).version, space.app.slug)).rejects.toThrow('Сначала подтвердите')
    const limited = structuredClone(space.app)
    for (const screen of limited.screens) if (screen.type === 'form' && screen.tableId === space.pair.order.tableId && screen.mode === 'edit') screen.components = screen.components.filter(component => !('fieldId' in component) || component.fieldId !== space.pair.order.statusFieldId)
    await database.db.update(database.apps).set({ published: limited }).where(eq(database.apps.id, limited.id))
    await expect(confirm(space, id)).rejects.toThrow('недоступны')
    expect((await service.readOrderStock(space.pair.order.tableId, id, space.app.slug))?.canConfirm).toBe(false)
    const hidden = structuredClone(space.app), qty = space.pair.order.cart!.quantityFieldId
    for (const screen of hidden.screens) {
      if ('components' in screen) screen.components = screen.components.filter(component => !('fieldId' in component) || component.fieldId !== qty)
      if ((screen.type === 'list' || screen.type === 'tiles') && screen.metaFieldId === qty) screen.metaFieldId = null
    }
    await database.db.update(database.apps).set({ published: hidden }).where(eq(database.apps.id, hidden.id))
    await expect(confirm(space, id)).rejects.toThrow('Каждая позиция')
    expect((await database.db.select().from(database.orderStockReservations).where(eq(database.orderStockReservations.workspaceId, space.workspaceId)))).toHaveLength(0)
  })
  it('rolls back all product allocations when one line is foreign or short', async () => {
    const space = await business(3), foreign = await business(), id = await order(space, 2), cart = space.pair.order.cart!
    const source = await row(space.pair.order.tableId, id), lineId = ((source.data as Record<string, unknown>)[cart.positionsFieldId] as string[])[0]!
    await database.db.update(database.rows).set({ data: { ...(await row(cart.itemsTableId, lineId)).data as Record<string, unknown>, [cart.productFieldId!]: [foreign.productId] } }).where(eq(database.rows.id, lineId))
    await signIn(manager); await expect(confirm(space, id)).rejects.toThrow()
    expect(await balance(space)).toEqual({ stock: 3, reserved: 0, available: 3 })
    await database.db.update(database.rows).set({ data: { ...(await row(cart.itemsTableId, lineId)).data as Record<string, unknown>, [cart.productFieldId!]: [space.productId] } }).where(eq(database.rows.id, lineId))
    const secondId = newId('row')
    await writes.writeRows(space.workspaceId, async context => {
      await writes.createRow(context, cart.itemsTableId, { ...(await row(cart.itemsTableId, lineId)).data as Record<string, unknown>, [cart.quantityFieldId]: 2 }, { id: ownerId, kind: 'member' }, { id: secondId })
      await writes.updateRow(context, space.pair.order.tableId, id, { [cart.positionsFieldId]: [lineId, secondId] }, { id: ownerId, kind: 'member' })
    })
    await expect(confirm(space, id)).rejects.toThrow('Недостаточно')
    expect(await balance(space)).toEqual({ stock: 3, reserved: 0, available: 3 })
    expect((await database.db.select().from(database.orderStockItems).where(eq(database.orderStockItems.workspaceId, space.workspaceId)))).toHaveLength(0)
  })
  it('keeps journal linkage immutable and historical field bindings protected even without the app', async () => {
    const space = await business(), id = await order(space, 2); await signIn(manager); await confirm(space, id)
    await service.issueOrderStock(space.pair.order.tableId, id, (await row(space.pair.order.tableId, id)).version, space.app.slug)
    const changed = structuredClone(space.app); changed.inventory!.movement.qty = newId('field')
    expect(await writes.writeRows(space.workspaceId, context => import('./module-lifecycle').then(module => module.moduleOwnershipError(changed, context.tx)))).toContain('журнал')
    await database.db.delete(database.apps).where(eq(database.apps.id, space.app.id))
    await expect(writes.writeRows(space.workspaceId, context => writes.updateRow(context, space.pair.inventory.tables.items, space.productId, { [space.pair.inventory.item.movements]: [] }, { id: ownerId, kind: 'member' }))).rejects.toThrow('Не удаляйте')
    const [record] = await database.db.select().from(database.fields).where(eq(database.fields.id, space.pair.order.cart!.productFieldId!))
    const field = { ...record, options: normalizeFieldOptions(record!.type as Field['type'], record!.options) } as unknown as Field
    const guard = (await import('./module-resource-guard')).modularFieldChangeError
    expect(await writes.writeRows(space.workspaceId, context => guard(context.tx, space.workspaceId, field.id, null))).toContain('Сохраните')
    const changedField = { ...field, options: { tableId: newId('table'), allowMultiple: false } } as Field
    expect(await writes.writeRows(space.workspaceId, context => guard(context.tx, space.workspaceId, field.id, changedField))).toContain('нельзя перенастроить')
    const sumRecord = (await database.db.select().from(database.fields).where(eq(database.fields.tableId, space.pair.inventory.tables.items))).find(record => record.type === 'rollup')!
    const sum = { ...sumRecord, options: normalizeFieldOptions('rollup', sumRecord.options) } as unknown as Field
    expect(await writes.writeRows(space.workspaceId, context => guard(context.tx, space.workspaceId, sum.id, { ...sum, options: { ...sum.options, fn: 'avg' } } as Field))).toContain('суммирование')
  })
  it('installs via the owner actions into a draft, keeps existing products and publishes only explicitly', async () => {
    const workspaceId = newId('workspace'); spaces.push(workspaceId)
    const sales = templateExample('zakazy'); sales.app.workspaceId = workspaceId; sales.app.slug = `stock-install-${workspaceId}`
    await database.db.insert(database.workspaces).values({ id: workspaceId, ownerId, name: 'Review store', slug: workspaceId, plan: 'business', businessProfile: { name: 'Review store', location: '', phone: '' } })
    await database.db.insert(database.workspaceMembers).values({ workspaceId, userId: ownerId, role: 'owner' })
    await database.db.insert(database.tables).values(sales.built.tables.map(table => ({ ...table, workspaceId })))
    await database.db.insert(database.fields).values(sales.built.fields); await database.db.insert(database.views).values(sales.built.views); await database.db.insert(database.rows).values(sales.built.rows)
    await database.db.insert(database.apps).values({ id: sales.app.id, workspaceId, name: sales.app.name, slug: sales.app.slug, draft: sales.app, published: sales.app })
    identity.member = { userId: ownerId, email: ownerEmail, workspaceId, workspaceName: '', role: 'owner', name: 'Owner' }
    const actions = await import('@/app/module-actions'), preview = await actions.previewModuleConnectionAction(sales.app.id, 'sklad')
    expect(preview).toMatchObject({ ok: true, newTables: 2 })
    if (!preview.ok) throw new Error(preview.error)
    expect(await actions.connectModuleAction(sales.app.id, 'sklad', preview.expectedHash)).toMatchObject({ ok: true, already: false })
    const [record] = await database.db.select().from(database.apps).where(eq(database.apps.id, sales.app.id))
    expect(record!.published).toMatchObject({ inventory: null })
    const app = (await import('@tableapp/schema')).appSchema.parse(record!.draft)
    expect(orderStockPair(app)!.inventory.tables.items).toBe(sales.app.customer!.catalog!.tableId)
    expect((await database.db.select().from(database.rows).where(eq(database.rows.tableId, sales.app.customer!.catalog!.tableId)))).toHaveLength(sales.built.rows.filter(row => row.tableId === sales.app.customer!.catalog!.tableId).length)
    expect(await (await import('@/app/app-actions')).publishAppAction(app.id)).toMatchObject({ ok: true })
    expect(await actions.connectModuleAction(sales.app.id, 'sklad', preview.expectedHash)).toMatchObject({ ok: true, already: true })
  })
  it('does not fabricate reservations for pre-connection history or prevent harmless history edits', async () => {
    const space = await business(), id = await order(space)
    const delivered = { ...(await row(space.pair.order.tableId, id)).data as Record<string, unknown>, [space.pair.order.statusFieldId]: space.pair.order.logistics!.deliveredStatus }
    // Simulates an old completed order before the warehouse was connected.
    await database.db.update(database.rows).set({ data: delivered }).where(eq(database.rows.id, id))
    await signIn(manager)
    expect(await service.readOrderStock(space.pair.order.tableId, id, space.app.slug)).toBeNull()
    await writes.writeRows(space.workspaceId, context => writes.updateRow(context, space.pair.order.tableId, id, { [space.pair.order.profile!.phoneFieldId]: '+7 900 111-00-00' }, { id: ownerId, kind: 'member' }))
    expect(await balance(space)).toEqual({ stock: 3, reserved: 0, available: 3 })
  })
  it('refuses to attach a new warehouse to an already accepted live delivery', async () => {
    const space = await business(3, true), base = structuredClone(space.app), stock = base.modules!.find(module => module.kind === 'inventory')!
    base.inventory = null
    base.modules = base.modules!.filter(module => module.id !== stock.id)
    base.screens = base.screens.filter(screen => !stock.screenIds!.includes(screen.id))
    const roles = new Set(Object.values(stock.roles!))
    base.roles = base.roles.filter(role => !roles.has(role.id))
    base.moduleAccess!.grants = base.moduleAccess!.grants.filter(grant => grant.moduleId !== stock.id)
    base.rowAccessRules = base.rowAccessRules.map(rule => ({ ...rule, appliesTo: rule.appliesTo.filter(role => !roles.has(role)) })).filter(rule => rule.appliesTo.length)
    await database.db.update(database.apps).set({ draft: base, published: base }).where(eq(database.apps.id, base.id))
    expect(await (await import('./app-references')).validateAppReferences(base)).toBeNull()
    const id = await order(space); await signIn(manager)
    await (await import('./order-delivery')).handoffOrderDelivery(space.pair.order.tableId, id, (await row(space.pair.order.tableId, id)).version, space.app.slug)
    owner(space)
    expect(await (await import('@/app/module-actions')).previewModuleConnectionAction(base.id, 'sklad')).toMatchObject({ ok: false, error: expect.stringContaining('Сначала завершите') })
  })

  it('returns a complete pickup once under concurrent retries and preserves other orders reservations', async () => {
    const space = await business(10), id = await pickup(space, 2), otherId = await order(space, 3)
    await signIn(manager); await confirm(space, otherId)
    const config = space.pair.order, before = await row(config.tableId, id)
    expect(await balance(space)).toEqual({ stock: 8, reserved: 3, available: 5 })
    expect(await service.readOrderStock(config.tableId, id, space.app.slug)).toMatchObject({ state: 'issued', canReturn: true })
    const results = await Promise.all([returnPickup(space, id, before.version), returnPickup(space, id, before.version)])
    expect(results.filter(result => result.repeated)).toHaveLength(1)
    expect(results.filter(result => !result.repeated)).toHaveLength(1)
    expect(await returnPickup(space, id, 0)).toEqual({ state: 'returned', repeated: true })
    expect(await balance(space)).toEqual({ stock: 10, reserved: 3, available: 7 })
    const returned = await row(config.tableId, id)
    expect(returned.version).toBe(before.version + 1)
    expect((returned.data as Record<string, unknown>)[config.statusFieldId]).toBe(config.stock!.returnedStatus)
    expect(await service.readOrderStock(config.tableId, id, space.app.slug)).toMatchObject({ state: 'returned', canConfirm: false, canIssue: false, canReturn: false })
    const records = await database.db.select().from(database.orderStockItems).where(and(eq(database.orderStockItems.workspaceId, space.workspaceId), eq(database.orderStockItems.orderRowId, id)))
    expect(records[0]!.issueMovementId).toBeTruthy(); expect(records[0]!.returnMovementId).toBeTruthy()
    const movements = await database.db.select().from(database.rows).where(eq(database.rows.tableId, space.pair.inventory.tables.movements))
    expect(movements).toHaveLength(2)
    expect(movements.map(movement => (movement.data as Record<string, unknown>)[space.pair.inventory.movement.qty]).sort()).toEqual([-2, 2])
  })

  it('rejects a stale pickup return version without moving stock, then lets the platform owner return it', async () => {
    const space = await business(3), id = await pickup(space, 2), config = space.pair.order
    const source = await row(config.tableId, id)
    await expect(returnPickup(space, id, source.version - 1)).rejects.toThrow('изменилась')
    expect(await balance(space)).toEqual({ stock: 1, reserved: 0, available: 1 })
    expect((await row(config.tableId, id)).version).toBe(source.version)
    expect(await database.db.select().from(database.rows).where(eq(database.rows.tableId, space.pair.inventory.tables.movements))).toHaveLength(1)
    owner(space)
    expect(await returnPickup(space, id, source.version, true)).toEqual({ state: 'returned', repeated: false })
    await signIn(manager)
    expect(await balance(space)).toEqual({ stock: 3, reserved: 0, available: 3 })
  })

  it('shows the returned pickup in its clients history, without active actions or another clients order', async () => {
    const space = await business(10), id = await pickup(space, 2), config = space.pair.order
    await returnPickup(space, id)
    const otherClient = `${newId('user')}@example.invalid`, otherId = await order(space, 1, otherClient)
    await signIn(manager); await confirm(space, otherId)
    await service.issueOrderStock(config.tableId, otherId, (await row(config.tableId, otherId)).version, space.app.slug)
    await returnPickup(space, otherId)
    await signIn(client)
    const { visitor } = await (await import('./app-session')).currentAppAccess(space.app)
    const read = (await import('./runtime-collection-pages')).readRuntimeCollection
    const history = await read(space.app, visitor, config.listScreenId, { customerSection: 'history' })
    expect(history.screens[config.listScreenId]!.rowIds).toEqual([id])
    expect(history.tables[config.tableId]!.rows.find(row => row.id === id)?.data[config.statusFieldId]).toBe(config.stock!.returnedStatus)
    expect(JSON.stringify(history.tables)).not.toContain(otherId)
    const active = await read(space.app, visitor, config.listScreenId, { customerSection: 'active' })
    expect(active.screens[config.listScreenId]!.rowIds).toEqual([])
    expect(await service.readOrderStock(config.tableId, id, space.app.slug)).toBeNull()
  })

  it('does not return an unissued order, a client order through the wrong identity circuit, or an order from another business', async () => {
    const space = await business(), other = await business(), pending = await order(space)
    await signIn(manager)
    expect((await service.readOrderStock(space.pair.order.tableId, pending, space.app.slug))!.canReturn).toBe(false)
    await expect(returnPickup(space, pending)).rejects.toThrow('настроен')
    await confirm(space, pending)
    await expect(returnPickup(space, pending)).rejects.toThrow('только после выдачи')
    const id = await pickup(space), foreignId = await pickup(other)
    await signIn(client); owner(space)
    await expect(returnPickup(space, id)).rejects.toThrow('недоступны')
    await expect(returnPickup(other, foreignId, undefined, true)).rejects.toThrow('недоступны')
    await signIn(manager)
    const limited = structuredClone(space.app)
    limited.moduleAccess!.grants = limited.moduleAccess!.grants.filter(grant => limited.modules!.find(module => module.id === grant.moduleId)?.kind !== 'inventory')
    await database.db.update(database.apps).set({ draft: limited, published: limited }).where(eq(database.apps.id, limited.id))
    await expect(returnPickup(space, id)).rejects.toThrow('недоступны')
    expect(await service.readOrderStock(space.pair.order.tableId, id, space.app.slug)).toBeNull()
    const readonly = structuredClone(space.app)
    for (const screen of readonly.screens) if (screen.type === 'form' && screen.mode === 'edit' && screen.tableId === space.pair.order.tableId) screen.components = screen.components.filter(component => !('fieldId' in component) || component.fieldId !== space.pair.order.statusFieldId)
    await database.db.update(database.apps).set({ draft: readonly, published: readonly }).where(eq(database.apps.id, readonly.id))
    await expect(returnPickup(space, id)).rejects.toThrow('недоступны')
    expect((await service.readOrderStock(space.pair.order.tableId, id, space.app.slug))!.canReturn).toBe(false)
  })

  it('requires the explicit matching return status in both the live app and accepted contract', async () => {
    const space = await business(), id = await pickup(space), legacy = structuredClone(space.app)
    delete orderStockPair(legacy)!.order.stock!.returnedStatus
    await database.db.update(database.apps).set({ draft: legacy, published: legacy }).where(eq(database.apps.id, legacy.id))
    expect((await service.readOrderStock(space.pair.order.tableId, id, space.app.slug))!.canReturn).toBe(false)
    await expect(returnPickup(space, id)).rejects.toThrow('не настроен')
    await database.db.update(database.apps).set({ draft: space.app, published: space.app }).where(eq(database.apps.id, space.app.id))
    const [accepted] = await database.db.select().from(database.orderStockReservations).where(and(eq(database.orderStockReservations.workspaceId, space.workspaceId), eq(database.orderStockReservations.orderRowId, id)))
    const oldContract = structuredClone(accepted!.contract); delete oldContract.order.stock!.returnedStatus
    await database.db.update(database.orderStockReservations).set({ contract: oldContract }).where(and(eq(database.orderStockReservations.workspaceId, space.workspaceId), eq(database.orderStockReservations.orderRowId, id)))
    expect((await service.readOrderStock(space.pair.order.tableId, id, space.app.slug))!.canReturn).toBe(false)
    await expect(returnPickup(space, id)).rejects.toThrow('не настроен')
    expect(await balance(space)).toEqual({ stock: 2, reserved: 0, available: 2 })
  })

  it('never uses pickup return for an order with any linked delivery, including completed returns', async () => {
    const space = await business(3, true), id = await order(space, 2); await signIn(manager); await confirm(space, id)
    const shipping = await (await import('./order-delivery')).handoffOrderDelivery(space.pair.order.tableId, id, (await row(space.pair.order.tableId, id)).version, space.app.slug)
    const config = (await import('@tableapp/schema')).customerWorkflows(space.app).find(config => config.logistics?.kind === 'delivery')!, logistics = config.logistics!
    if (logistics.kind !== 'delivery') throw new Error('Wrong fixture')
    const actor = { id: ownerId, kind: 'member' }
    await writes.writeRows(space.workspaceId, context => writes.updateRow(context, config.tableId, shipping.id, { [config.assignmentFieldId!]: 'courier-stock@example.invalid' }, actor))
    for (const status of [logistics.shippedStatus, logistics.returnedStatus]) {
      await writes.writeRows(space.workspaceId, context => writes.updateRow(context, config.tableId, shipping.id, { [config.statusFieldId]: status }, actor))
      expect((await service.readOrderStock(space.pair.order.tableId, id, space.app.slug))!.canReturn).toBe(false)
      await expect(returnPickup(space, id)).rejects.toThrow('связан с доставкой')
    }
    expect(await balance(space)).toEqual({ stock: 3, reserved: 0, available: 3 })
  })

  it('rejects manual return status changes, preserves the returned order composition and protects both journal movements', async () => {
    const space = await business(), id = await pickup(space, 2), config = space.pair.order, actor = { id: ownerId, kind: 'member' }
    await expect(writes.writeRows(space.workspaceId, context => writes.updateRow(context, config.tableId, id, { [config.statusFieldId]: config.stock!.returnedStatus }, actor))).rejects.toThrow('Оформите возврат')
    await returnPickup(space, id)
    await expect(writes.writeRows(space.workspaceId, context => writes.updateRow(context, config.tableId, id, { [config.statusFieldId]: config.cancelStatus }, actor))).rejects.toThrow('уже возвращён')
    const positions = (await row(config.tableId, id)).data as Record<string, unknown>, line = (positions[config.cart!.positionsFieldId] as string[])[0]!
    await expect(writes.writeRows(space.workspaceId, context => writes.updateRow(context, config.cart!.itemsTableId, line, { [config.cart!.quantityFieldId]: 1 }, actor))).rejects.toThrow('зафиксированы')
    const [item] = await database.db.select().from(database.orderStockItems).where(and(eq(database.orderStockItems.workspaceId, space.workspaceId), eq(database.orderStockItems.orderRowId, id)))
    for (const movement of [item!.issueMovementId!, item!.returnMovementId!]) {
      await expect(writes.writeRows(space.workspaceId, context => writes.updateRow(context, space.pair.inventory.tables.movements, movement, { [space.pair.inventory.movement.qty]: 99 }, actor))).rejects.toThrow('связано с заказом')
      await expect(writes.writeRows(space.workspaceId, context => writes.deleteRow(context, space.pair.inventory.tables.movements, movement, actor))).rejects.toThrow('подтверждённым')
    }
    await expect(writes.writeRows(space.workspaceId, context => writes.updateRow(context, space.pair.inventory.tables.items, space.productId, { [space.pair.inventory.item.movements]: [item!.issueMovementId!] }, actor))).rejects.toThrow('Не удаляйте')
    expect(await balance(space)).toEqual({ stock: 3, reserved: 0, available: 3 })
  })

  it('rolls back every compensating movement and the status if one accepted product is unavailable', async () => {
    const space = await business(3), id = await order(space, 2), config = space.pair.order, cart = config.cart!, actor = { id: ownerId, kind: 'member' }
    const products = await database.db.select().from(database.rows).where(eq(database.rows.tableId, space.pair.inventory.tables.items)), secondProduct = products.find(product => product.id !== space.productId)!
    const initial = await row(config.tableId, id), firstLine = ((initial.data as Record<string, unknown>)[cart.positionsFieldId] as string[])[0]!, secondLine = newId('row')
    await writes.writeRows(space.workspaceId, async context => {
      await writes.updateRow(context, space.pair.inventory.tables.items, secondProduct.id, { [space.pair.inventory.item.opening]: 3 }, actor)
      await writes.createRow(context, cart.itemsTableId, { ...(await row(cart.itemsTableId, firstLine)).data as Record<string, unknown>, [cart.productFieldId!]: [secondProduct.id], [cart.quantityFieldId]: 1 }, actor, { id: secondLine })
      await writes.updateRow(context, config.tableId, id, { [cart.positionsFieldId]: [firstLine, secondLine] }, actor)
    })
    await signIn(manager); await confirm(space, id)
    await service.issueOrderStock(config.tableId, id, (await row(config.tableId, id)).version, space.app.slug)
    const before = await row(config.tableId, id), historyBefore = await database.db.select({ id: database.rowChanges.id }).from(database.rowChanges).where(inArray(database.rowChanges.tableId, [config.tableId, space.pair.inventory.tables.movements, space.pair.inventory.tables.items]))
    // Controlled corruption models a missing product that ordinary deletion guards would reject.
    await database.db.update(database.rows).set({ deletedAt: new Date() }).where(eq(database.rows.id, secondProduct.id))
    await expect(returnPickup(space, id, before.version)).rejects.toThrow('Строка не найдена')
    expect((await row(config.tableId, id)).version).toBe(before.version)
    expect((await row(config.tableId, id)).data).toEqual(before.data)
    expect(await balance(space)).toEqual({ stock: 1, reserved: 0, available: 1 })
    expect(await database.db.select().from(database.rows).where(eq(database.rows.tableId, space.pair.inventory.tables.movements))).toHaveLength(2)
    const accepted = await database.db.select().from(database.orderStockReservations).where(and(eq(database.orderStockReservations.workspaceId, space.workspaceId), eq(database.orderStockReservations.orderRowId, id)))
    expect(accepted[0]!.state).toBe('issued')
    const items = await database.db.select().from(database.orderStockItems).where(and(eq(database.orderStockItems.workspaceId, space.workspaceId), eq(database.orderStockItems.orderRowId, id)))
    expect(items.every(item => item.returnMovementId === null)).toBe(true)
    expect(await database.db.select({ id: database.rowChanges.id }).from(database.rowChanges).where(inArray(database.rowChanges.tableId, [config.tableId, space.pair.inventory.tables.movements, space.pair.inventory.tables.items]))).toHaveLength(historyBefore.length)
  })
})
