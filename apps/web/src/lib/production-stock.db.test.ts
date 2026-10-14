import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { and, asc, eq, inArray } from 'drizzle-orm'
import { graceReserve, newId, planOf, type App, type Field } from '@tableapp/schema'
import type { MovementInput, ProductionInput } from '@/app/production-actions'
import { templateExample } from './templates/presentation'
import { connectSalesInventory } from './sales-inventory-connection'
import { connectProductionInventory } from './production-inventory-connection'
import { orderStockPair } from './order-stock-config'
import { setModuleGrant } from './module-access'
import { permits, visitorFor } from './app-roles'
import { STAFF_SESSION_COOKIE } from './auth'

const identity = vi.hoisted(() => ({ cookie: '', member: null as import('./session').Member | null }))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: (name: string) => name === STAFF_SESSION_COOKIE && identity.cookie ? { value: identity.cookie } : undefined }) }))
vi.mock('@/lib/session', async original => ({ ...await original<typeof import('./session')>(), currentMember: async () => identity.member }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
const envFile = resolve(import.meta.dirname, '../../../../.env')
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile)

describe.skipIf(!process.env.DATABASE_URL)('production receipts and raw-material consumption in PostgreSQL', () => {
  let database: typeof import('@tableapp/db'), actions: typeof import('@/app/production-actions'), writes: typeof import('./row-mutations')
  const ownerId = newId('user'), ownerEmail = `${ownerId}@example.invalid`
  const manager = `${newId('user')}@example.invalid`, foreman = `${newId('user')}@example.invalid`, seller = `${newId('user')}@example.invalid`, client = `${newId('user')}@example.invalid`
  const spaces: string[] = [], sessions: string[] = []
  beforeAll(async () => {
    database = await import('@tableapp/db'); actions = await import('@/app/production-actions'); writes = await import('./row-mutations')
    await database.db.insert(database.users).values({ id: ownerId, email: ownerEmail })
  })
  beforeEach(() => { identity.cookie = ''; identity.member = null })
  afterAll(async () => {
    if (!database) return
    if (spaces.length) await database.db.delete(database.workspaces).where(inArray(database.workspaces.id, spaces))
    if (sessions.length) await database.db.delete(database.staffSessions).where(inArray(database.staffSessions.id, sessions))
    await database.db.delete(database.users).where(eq(database.users.id, ownerId))
    await database.sql.end()
  })

  async function business() {
    const workspaceId = newId('workspace'); spaces.push(workspaceId)
    const sales = templateExample('zakazy')
    sales.app.workspaceId = workspaceId; sales.app.slug = `production-stock-${workspaceId}`
    sales.app.allowlist = [{ email: manager, roleId: 'manager', company: '' }, { email: seller, roleId: 'staff', company: '' }]
    const stock = connectSalesInventory(sales.app, manager, new Map(sales.fields.map(field => [field.id, field])), new Map(sales.views.map(view => [view.id, view])))
    const production = connectProductionInventory(stock.app, manager, new Map([...sales.fields, ...stock.fields as Field[]].map(field => [field.id, field])), new Map([...sales.views, ...stock.views].map(view => [view.id, view])))
    const app = production.app, config = app.production!, pair = orderStockPair(app)!, module = app.modules!.find(module => module.kind === 'production')!
    app.moduleAccess = setModuleGrant(app.moduleAccess!, foreman, module.id, module.roles!.foreman!)
    const product = sales.built.rows.find(row => row.tableId === pair.inventory.tables.items)!
    product.data[pair.inventory.item.opening] = 5
    const materialId = newId('row'), normId = newId('row')
    const unit = production.fields.find(field => field.id === config.material.unit)!
    const unitChoices = (unit.options as { choices: { id: string; name: string }[] }).choices
    const unitId = unitChoices.find(choice => choice.name === 'кг')!.id
    const material = { id: materialId, tableId: config.tables.materials, position: 'a0', data: { [config.material.name]: 'Пластик', [config.material.unit]: unitId, [config.material.opening]: 10, [config.material.movements]: [] } }
    const norm = { id: normId, tableId: config.tables.norms, position: 'a0', data: { [config.norm.product]: [product.id], [config.norm.material]: [materialId], [config.norm.perUnit]: 0.25, [config.norm.active]: true } }
    const allTables = [...sales.built.tables.map(table => ({ ...table, workspaceId })), ...stock.tables, ...production.tables]
    await database.db.insert(database.workspaces).values({ id: workspaceId, ownerId, name: 'Synthetic production stock', slug: workspaceId, plan: 'business' })
    await database.db.insert(database.workspaceMembers).values({ workspaceId, userId: ownerId, role: 'owner' })
    await database.db.insert(database.tables).values(allTables)
    await database.db.insert(database.fields).values([...sales.built.fields, ...stock.fields, ...production.fields])
    await database.db.insert(database.views).values([...sales.built.views, ...stock.views, ...production.views])
    await database.db.insert(database.rows).values([...sales.built.rows, material, norm])
    await database.db.insert(database.apps).values({ id: app.id, workspaceId, name: app.name, slug: app.slug, draft: app, published: app })
    expect(await (await import('./app-references')).validateAppReferences(app)).toBeNull()
    await (await import('./usage')).recountWorkspace(workspaceId)
    return { app, config, pair, module, productId: product.id, materialId, normId, workspaceId, tableIds: allTables.map(table => table.id) }
  }
  type Business = Awaited<ReturnType<typeof business>>
  async function signIn(email: string) {
    const id = newId('session'); sessions.push(id)
    await database.db.insert(database.staffSessions).values({ id, email, expiresAt: new Date(Date.now() + 3_600_000) })
    identity.cookie = id
  }
  async function row(tableId: string, id: string) {
    return (await database.db.select().from(database.rows).where(and(eq(database.rows.tableId, tableId), eq(database.rows.id, id))))[0]!
  }
  const input = (space: Business): ProductionInput => ({ runId: newId('row'), productId: space.productId, quantity: 4, defects: 1, date: '2026-10-14T04:00:00Z', shiftId: null, note: 'Проверочный выпуск' })
  async function ledger(space: Business) {
    return database.db.select().from(database.productionStockRuns).where(eq(database.productionStockRuns.workspaceId, space.workspaceId)).orderBy(asc(database.productionStockRuns.runRowId))
  }
  async function snapshot(space: Business) {
    const [records, changes, history, usage] = await Promise.all([
      database.db.select().from(database.rows).where(inArray(database.rows.tableId, space.tableIds)).orderBy(asc(database.rows.id)),
      database.db.select().from(database.rowChanges).where(inArray(database.rowChanges.tableId, space.tableIds)).orderBy(asc(database.rowChanges.id)),
      ledger(space), database.db.select({ rows: database.workspaceUsage.rows }).from(database.workspaceUsage).where(eq(database.workspaceUsage.workspaceId, space.workspaceId)),
    ])
    return { records, changes, history, usage }
  }
  async function balance(space: Business) {
    return writes.writeRows(space.workspaceId, context => import('./order-stock-store').then(module => module.stockBalance(context, space.pair.inventory, space.productId)))
  }
  async function publish(space: Business, app: App) {
    space.app = app
    await database.db.update(database.apps).set({ draft: app, published: app }).where(eq(database.apps.id, app.id))
    expect(await (await import('./app-references')).validateAppReferences(app)).toBeNull()
  }
  async function reserve(space: Business) {
    await signIn(client)
    const config = space.pair.order, token = randomUUID(), author = { ...await (await import('./app-session')).currentAppAccess(space.app), ip: null }
    const order = await writes.writeRows(space.workspaceId, context => import('./customer-create').then(module => module.createCustomerRecord(context, space.app, config, {
      [config.cart!.fieldId]: JSON.stringify({ requestId: token, items: [{ id: space.productId, qty: 2 }] }), [config.submissionFieldId!]: token,
      [config.profile!.nameFieldId]: 'Ирина', [config.profile!.phoneFieldId]: '+7 900 000-00-00', [config.logistics!.addressFieldId]: 'Адрес для проверки',
    }, author)))
    await signIn(manager)
    await (await import('./order-stock')).confirmOrderStock(config.tableId, order.id, (await row(config.tableId, order.id)).version, space.app.slug)
    return order.id
  }
  const actor = () => ({ id: ownerId, kind: 'member' })

  async function movementInput(space: Business): Promise<MovementInput> {
    const [kind] = await database.db.select().from(database.fields).where(eq(database.fields.id, space.config.movement.kind))
    const choices = (kind!.options as { choices: { id: string; name: string }[] }).choices
    return { movementId: newId('row'), materialId: space.materialId, kindId: choices.find(choice => choice.name === 'Приход')!.id, amount: 0.5, date: '2026-10-14T04:00:00Z', reason: 'Приёмка сырья' }
  }

  it('previews decimal material consumption and posts all four good units without changing the accepted reserve', async () => {
    const space = await business(); await reserve(space)
    expect(await balance(space)).toEqual({ stock: 5, reserved: 2, available: 3 })
    const reservation = await database.db.select().from(database.orderStockReservations).where(eq(database.orderStockReservations.workspaceId, space.workspaceId))
    const allocation = await database.db.select().from(database.orderStockItems).where(eq(database.orderStockItems.workspaceId, space.workspaceId))
    const before = await snapshot(space), run = input(space)
    expect(await actions.previewConsumptionAction(space.app.slug, space.productId, 4)).toEqual({ ok: true, lines: [{ materialId: space.materialId, material: 'Пластик', unit: 'кг', need: 1, stock: 10, missing: 0 }] })
    expect(await snapshot(space)).toEqual(before)
    expect(await actions.saveProductionAction(space.app.slug, run)).toMatchObject({ ok: true, repeated: false, quantity: 4, wrote: [{ material: 'Пластик', amount: 1, unit: 'кг' }], stockReceipt: { quantity: 4, before: 5, after: 9 } })
    expect(await balance(space)).toEqual({ stock: 9, reserved: 2, available: 7 })
    const saved = (await ledger(space))[0]!, stock = space.pair.inventory
    expect((await row(space.config.tables.production, run.runId)).data).toMatchObject({ [space.config.run.qty]: 4, [space.config.run.defects]: 1 })
    expect((await row(stock.tables.movements, saved.stockMovementRowId)).data).toMatchObject({ [stock.movement.qty]: 4, [stock.movement.item]: [space.productId] })
    expect((await row(space.config.tables.movements, saved.contract.materialMovements[0]!.rowId)).data).toMatchObject({ [space.config.movement.qty]: -1, [space.config.movement.material]: [space.materialId], [space.config.movement.run]: [run.runId] })
    expect(await database.db.select().from(database.orderStockReservations).where(eq(database.orderStockReservations.workspaceId, space.workspaceId))).toEqual(reservation)
    expect(await database.db.select().from(database.orderStockItems).where(eq(database.orderStockItems.workspaceId, space.workspaceId))).toEqual(allocation)
    expect(await actions.saveProductionAction(space.app.slug, { ...input(space), quantity: 1, defects: 2 })).toMatchObject({ ok: true, quantity: 1, stockReceipt: { quantity: 1, before: 9, after: 10 } })
    expect(await balance(space)).toEqual({ stock: 10, reserved: 2, available: 8 })
  })

  it('serializes duplicate run IDs, freezes consumption across changed norms and rejects changed payloads or actors', async () => {
    const space = await business(), run = input(space); await signIn(manager)
    const before = await snapshot(space)
    const result = await Promise.all([actions.saveProductionAction(space.app.slug, run), actions.saveProductionAction(space.app.slug, run)])
    expect(result.every(value => value.ok), JSON.stringify(result)).toBe(true)
    expect(result.filter(value => value.ok && value.repeated)).toHaveLength(1)
    expect(await ledger(space)).toHaveLength(1)
    const after = await snapshot(space)
    expect(after.records.length).toBe(before.records.length + 3)
    expect(after.usage[0]!.rows).toBe(before.usage[0]!.rows + 3)
    const norm = await row(space.config.tables.norms, space.normId)
    await database.db.update(database.rows).set({ data: { ...norm.data as Record<string, unknown>, [space.config.norm.perUnit]: 2 } }).where(eq(database.rows.id, norm.id))
    const frozen = await snapshot(space)
    expect(await actions.saveProductionAction(space.app.slug, run)).toMatchObject({ ok: true, repeated: true, wrote: [{ amount: 1 }], stockReceipt: { quantity: 4, before: 5, after: 9 } })
    expect(await snapshot(space)).toEqual(frozen)
    expect(await actions.saveProductionAction(space.app.slug, { ...run, quantity: 5 })).toMatchObject({ ok: false, error: expect.stringContaining('другими данными') })
    await signIn(foreman)
    expect(await actions.saveProductionAction(space.app.slug, run)).toMatchObject({ ok: false, error: expect.stringContaining('другим сотрудником') })
    expect(await snapshot(space)).toEqual(frozen)
  })

  it('allows a production-only foreman to post automatically while denying ordinary stock operations and client/sales production access', async () => {
    const space = await business(), productionOnly = visitorFor(space.app, foreman)
    expect(permits(space.app, space.config.tables.production, 'create', productionOnly)).toBe(true)
    expect(permits(space.app, space.pair.inventory.tables.movements, 'create', productionOnly)).toBe(false)
    await signIn(foreman)
    expect(await actions.previewConsumptionAction(space.app.slug, space.productId, 4)).toMatchObject({ ok: true, lines: [{ need: 1 }] })
    const completed = await actions.saveProductionAction(space.app.slug, input(space))
    expect(completed).toMatchObject({ ok: true, stockReceipt: { quantity: 4 } })
    if (!completed.ok) throw new Error(completed.error)
    expect(completed.stockReceipt).toEqual({ quantity: 4 })
    const before = await snapshot(space)
    expect(await (await import('@/app/inventory-actions')).saveStockOperationAction(space.app.slug, 'receipt', { id: newId('row'), itemId: space.productId, quantity: 1, note: '' })).toMatchObject({ ok: false })
    for (const email of [client, seller]) {
      await signIn(email)
      expect(await actions.previewConsumptionAction(space.app.slug, space.productId, 4)).toMatchObject({ ok: false })
      expect(await actions.saveProductionAction(space.app.slug, input(space))).toMatchObject({ ok: false })
    }
    expect(await snapshot(space)).toEqual(before)
  })

  it('refuses a product hidden by the production screen filter in preview and save without changes', async () => {
    const space = await business(), app = structuredClone(space.app)
    const productViewIds = app.screens.flatMap(screen => screen.name === 'Продукция' && space.module.screenIds!.includes(screen.id) && (screen.type === 'list' || screen.type === 'tiles') ? [screen.source.viewId] : [])
    expect(productViewIds).toHaveLength(1)
    for (const screen of app.screens) if ((screen.type === 'list' || screen.type === 'tiles') && productViewIds.includes(screen.source.viewId)) {
      screen.source.extraFilter = { id: newId('filter'), conjunction: 'and', conditions: [{ id: newId('filter'), fieldId: space.pair.inventory.item.name, op: 'is', value: 'Скрытое изделие' }] }
    }
    await publish(space, app); await signIn(foreman)
    const before = await snapshot(space)
    expect(await actions.previewConsumptionAction(space.app.slug, space.productId, 4)).toMatchObject({ ok: false })
    expect(await actions.saveProductionAction(space.app.slug, input(space))).toMatchObject({ ok: false })
    expect(await snapshot(space)).toEqual(before)
  })

  it('refuses a material hidden by ownership policy in preview and save without disclosing its balance', async () => {
    const space = await business(), app = structuredClone(space.app), ownerField = newId('field')
    await database.db.insert(database.fields).values({ id: ownerField, tableId: space.config.tables.materials, name: 'Доступ сотрудника', type: 'email', options: {}, position: 'z0' })
    const material = await row(space.config.tables.materials, space.materialId)
    await database.db.update(database.rows).set({ data: { ...material.data as Record<string, unknown>, [ownerField]: 'other@example.invalid' } }).where(eq(database.rows.id, material.id))
    app.rowAccessRules.push({ tableId: space.config.tables.materials, fieldId: ownerField, match: 'email', appliesTo: [space.module.roles!.director!, space.module.roles!.foreman!] })
    await publish(space, app); await signIn(foreman)
    const before = await snapshot(space)
    expect(await actions.previewConsumptionAction(space.app.slug, space.productId, 4)).toEqual({ ok: false, error: 'Изделие или материалы недоступны для этого выпуска' })
    expect(await actions.saveProductionAction(space.app.slug, input(space))).toEqual({ ok: false, error: 'Изделие или материалы недоступны для этого выпуска' })
    expect(await snapshot(space)).toEqual(before)
  })

  it('does not reveal material balances through preview or save when the stock field is hidden', async () => {
    const space = await business(), app = structuredClone(space.app), stockField = space.config.stock!.materialStockFieldId
    for (const screen of app.screens) {
      if (screen.type === 'dashboard') continue
      screen.components = screen.components.filter(component => !('fieldId' in component && component.fieldId === stockField))
      if (screen.type === 'list' || screen.type === 'tiles') {
        if (screen.subtitleFieldId === stockField) screen.subtitleFieldId = null
        if (screen.metaFieldId === stockField) screen.metaFieldId = null
        if (screen.statusFieldId === stockField) screen.statusFieldId = null
        screen.source.searchFieldIds = screen.source.searchFieldIds.filter(id => id !== stockField)
      }
    }
    await publish(space, app); await signIn(foreman)
    const before = await snapshot(space)
    expect(await actions.previewConsumptionAction(space.app.slug, space.productId, 4)).toEqual({ ok: false, error: 'Изделие или материалы недоступны для этого выпуска' })
    expect(await actions.saveProductionAction(space.app.slug, input(space))).toEqual({ ok: false, error: 'Изделие или материалы недоступны для этого выпуска' })
    expect(await snapshot(space)).toEqual(before)
  })

  it('rejects product and material IDs from another business without touching either business', async () => {
    const space = await business(), foreign = await business(); await signIn(manager)
    const before = await snapshot(space), foreignBefore = await snapshot(foreign)
    expect(await actions.previewConsumptionAction(space.app.slug, foreign.productId, 4)).toMatchObject({ ok: false })
    expect(await actions.saveProductionAction(space.app.slug, { ...input(space), productId: foreign.productId })).toMatchObject({ ok: false })
    expect(await snapshot(space)).toEqual(before)
    const norm = await row(space.config.tables.norms, space.normId)
    await database.db.update(database.rows).set({ data: { ...norm.data as Record<string, unknown>, [space.config.norm.material]: [foreign.materialId] } }).where(eq(database.rows.id, norm.id))
    const invalidNorm = await snapshot(space)
    expect(await actions.previewConsumptionAction(space.app.slug, space.productId, 4)).toMatchObject({ ok: false })
    expect(await actions.saveProductionAction(space.app.slug, input(space))).toMatchObject({ ok: false })
    expect(await snapshot(space)).toEqual(invalidNorm)
    expect(await snapshot(foreign)).toEqual(foreignBefore)
  })

  it('rejects invalid values and rolls back the complete run when the last receipt exceeds actual row quota', async () => {
    const space = await business(); await signIn(manager)
    const before = await snapshot(space)
    for (const patch of [{ quantity: 1.5 }, { defects: -1 }, { date: 'invalid-date' }]) {
      expect(await actions.saveProductionAction(space.app.slug, { ...input(space), ...patch })).toMatchObject({ ok: false })
      expect(await snapshot(space)).toEqual(before)
    }
    await database.db.update(database.workspaces).set({ plan: 'free' }).where(eq(database.workspaces.id, space.workspaceId))
    const ceiling = planOf('free').limits.rows + graceReserve(planOf('free').limits.rows)
    await database.db.insert(database.rows).values(Array.from({ length: ceiling - 2 - before.records.length }, (_, index) => ({ id: newId('row'), tableId: space.config.tables.norms, position: `bulk${index}x`, data: {} })))
    await (await import('./usage')).recountWorkspace(space.workspaceId)
    const full = await snapshot(space), run = input(space)
    expect(await actions.saveProductionAction(space.app.slug, run)).toMatchObject({ ok: false, error: expect.stringContaining('резерв') })
    expect(await snapshot(space)).toEqual(full)
    expect(await ledger(space)).toEqual([])
    expect(await balance(space)).toEqual({ stock: 5, reserved: 0, available: 5 })
  })

  it('protects runs, both journals and reverse links even after app deletion while allowing ordinary catalogue and customer edits', async () => {
    const space = await business(), orderId = await reserve(space), run = input(space)
    expect(await actions.saveProductionAction(space.app.slug, run)).toMatchObject({ ok: true })
    const saved = (await ledger(space))[0]!, materialMovement = saved.contract.materialMovements[0]!
    const update = (tableId: string, rowId: string, patch: Record<string, unknown>) => writes.writeRows(space.workspaceId, context => writes.updateRow(context, tableId, rowId, patch, actor()))
    const remove = (tableId: string, rowId: string) => writes.writeRows(space.workspaceId, context => writes.deleteRow(context, tableId, rowId, actor()))
    async function guarded() {
      const before = await snapshot(space)
      await expect(update(space.config.tables.production, run.runId, { [space.config.run.qty]: 5 })).rejects.toMatchObject({ code: 'invalid' })
      await expect(remove(space.config.tables.production, run.runId)).rejects.toMatchObject({ code: 'invalid' })
      await expect(update(space.config.tables.movements, materialMovement.rowId, { [space.config.movement.qty]: -2 })).rejects.toMatchObject({ code: 'invalid' })
      await expect(remove(space.config.tables.movements, materialMovement.rowId)).rejects.toMatchObject({ code: 'invalid' })
      await expect(update(space.pair.inventory.tables.movements, saved.stockMovementRowId, { [space.pair.inventory.movement.qty]: 8 })).rejects.toMatchObject({ code: 'invalid' })
      await expect(remove(space.pair.inventory.tables.movements, saved.stockMovementRowId)).rejects.toMatchObject({ code: 'invalid' })
      await expect(update(space.config.tables.materials, space.materialId, { [space.config.material.movements]: [] })).rejects.toMatchObject({ code: 'invalid' })
      await expect(update(space.pair.inventory.tables.items, space.productId, { [space.pair.inventory.item.movements]: [] })).rejects.toMatchObject({ code: 'invalid' })
      expect(await snapshot(space)).toEqual(before)
    }
    await guarded()
    await database.db.delete(database.apps).where(eq(database.apps.id, space.app.id))
    await guarded()
    expect(await update(space.pair.inventory.tables.items, space.productId, { [space.pair.inventory.item.name]: 'Обновлённое изделие' })).toMatchObject({ [space.pair.inventory.item.name]: 'Обновлённое изделие' })
    expect(await update(space.pair.order.tableId, orderId, { [space.pair.order.profile!.phoneFieldId]: '+7 900 111-00-00' })).toMatchObject({ [space.pair.order.profile!.phoneFieldId]: '+7 900 111-00-00' })
    expect((await row(space.pair.inventory.tables.items, space.productId)).data).toMatchObject({ [space.pair.inventory.item.name]: 'Обновлённое изделие' })
    expect((await row(space.pair.order.tableId, orderId)).data).toMatchObject({ [space.pair.order.profile!.phoneFieldId]: '+7 900 111-00-00' })
    expect(await balance(space)).toEqual({ stock: 9, reserved: 2, available: 7 })
  })

  it('posts decimal manual material receipts once and rejects changed retries, another director and forced production kinds', async () => {
    const space = await business(), app = structuredClone(space.app)
    app.moduleAccess = setModuleGrant(app.moduleAccess!, seller, space.module.id, space.module.roles!.director!)
    await publish(space, app); await signIn(manager)
    const movement = await movementInput(space)
    expect(await actions.saveMovementAction(space.app.slug, movement)).toMatchObject({ ok: true, repeated: false, amount: 0.5, stock: 10.5 })
    const saved = await snapshot(space)
    expect((await row(space.config.tables.movements, movement.movementId)).data).toMatchObject({ [space.config.movement.qty]: 0.5, [space.config.movement.material]: [space.materialId] })
    expect((await row(space.config.tables.materials, space.materialId)).data).toMatchObject({ [space.config.material.movements]: [movement.movementId] })
    expect(await actions.saveMovementAction(space.app.slug, movement)).toMatchObject({ ok: true, repeated: true, stock: 10.5 })
    expect(await actions.previewConsumptionAction(space.app.slug, space.productId, 4)).toMatchObject({ ok: true, lines: [{ stock: 10.5, need: 1 }] })
    expect(await actions.saveMovementAction(space.app.slug, { ...movement, amount: 0.75 })).toMatchObject({ ok: false, error: expect.stringContaining('другими данными') })
    await signIn(seller)
    expect(await actions.saveMovementAction(space.app.slug, movement)).toMatchObject({ ok: false, error: expect.stringContaining('другими данными') })
    expect(await actions.saveMovementAction(space.app.slug, { ...movement, movementId: newId('row'), kindId: space.config.movementKindId })).toMatchObject({ ok: false })
    expect(await snapshot(space)).toEqual(saved)
    expect(await ledger(space)).toEqual([])
    expect(await writes.writeRows(space.workspaceId, context => writes.deleteRow(context, space.config.tables.movements, movement.movementId, actor()))).toBe(1)
    expect((await row(space.config.tables.movements, movement.movementId)).deletedAt).not.toBeNull()
    expect((await row(space.config.tables.materials, space.materialId)).data).toMatchObject({ [space.config.material.movements]: [movement.movementId] })
    expect(await actions.previewConsumptionAction(space.app.slug, space.productId, 4)).toMatchObject({ ok: true, lines: [{ stock: 10, need: 1 }] })
  })

  it('rejects malformed input, overflowing material balances and inaccessible manual materials without changes', async () => {
    const space = await business(), foreign = await business(); await signIn(manager)
    const movement = await movementInput(space), before = await snapshot(space), foreignBefore = await snapshot(foreign)
    expect(await actions.saveProductionAction(space.app.slug, null as unknown as ProductionInput)).toMatchObject({ ok: false })
    expect(await actions.saveMovementAction(space.app.slug, null as unknown as MovementInput)).toMatchObject({ ok: false })
    expect(await actions.saveMovementAction(space.app.slug, { ...movement, amount: Number.MAX_SAFE_INTEGER })).toMatchObject({ ok: false, error: expect.stringContaining('Количество слишком велико') })
    expect(await actions.saveMovementAction(space.app.slug, { ...movement, materialId: foreign.materialId })).toMatchObject({ ok: false })
    expect(await snapshot(space)).toEqual(before)
    expect(await snapshot(foreign)).toEqual(foreignBefore)
    const app = structuredClone(space.app), ownerField = newId('field'), material = await row(space.config.tables.materials, space.materialId)
    await database.db.insert(database.fields).values({ id: ownerField, tableId: space.config.tables.materials, name: 'Доступ сотрудника', type: 'email', options: {}, position: 'z0' })
    await database.db.update(database.rows).set({ data: { ...material.data as Record<string, unknown>, [ownerField]: 'other@example.invalid' } }).where(eq(database.rows.id, material.id))
    app.rowAccessRules.push({ tableId: space.config.tables.materials, fieldId: ownerField, match: 'email', appliesTo: [space.module.roles!.director!] })
    await publish(space, app)
    const hidden = await snapshot(space)
    expect(await actions.saveMovementAction(space.app.slug, movement)).toEqual({ ok: false, error: 'Изделие или материалы недоступны для этого выпуска' })
    expect(await snapshot(space)).toEqual(hidden)
  })
})
