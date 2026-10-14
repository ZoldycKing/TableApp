import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq, inArray } from 'drizzle-orm'
import { ANONYMOUS } from './app-roles'
import { compareRows, indexFields, newId, type Field } from '@tableapp/schema'
import { templateExample } from './templates/presentation'
import { composeModules } from './module-composition'
import { STAFF_SESSION_COOKIE } from './auth'
import { RUNTIME_PAGE_SIZE, RUNTIME_SCAN_BATCH, runtimeQueryKey, type RuntimePageRequest } from './runtime-page-types'
import type { RuntimeApp } from './app-runtime'

const identity = vi.hoisted(() => ({ cookie: '', member: null as import('./session').Member | null }))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: (name: string) => name === STAFF_SESSION_COOKIE && identity.cookie ? { value: identity.cookie } : undefined }) }))
vi.mock('@/lib/session', async original => ({ ...await original<typeof import('./session')>(), currentMember: async () => identity.member }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
const envFile = resolve(import.meta.dirname, '../../../../.env')
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile)

describe.skipIf(!process.env.DATABASE_URL)('public catalogues and personal history pages in PostgreSQL', () => {
  let database: typeof import('@tableapp/db'), runtime: typeof import('./app-runtime'), actions: typeof import('@/app/runtime-screen-actions')
  const owner = newId('user'), ownerEmail = `${owner}@example.invalid`, client = `${newId('appUser')}@example.invalid`, otherClient = `${newId('appUser')}@example.invalid`
  const spaces: string[] = [], sessions: string[] = []
  const count = RUNTIME_PAGE_SIZE * 2 + 7, pastCount = RUNTIME_PAGE_SIZE + 3
  beforeAll(async () => {
    database = await import('@tableapp/db'); runtime = await import('./app-runtime'); actions = await import('@/app/runtime-screen-actions')
    await database.db.insert(database.users).values({ id: owner, email: ownerEmail })
  })
  beforeEach(() => { identity.cookie = ''; identity.member = null })
  afterAll(async () => {
    if (!database) return
    if (spaces.length) await database.db.delete(database.workspaces).where(inArray(database.workspaces.id, spaces))
    if (sessions.length) await database.db.delete(database.staffSessions).where(inArray(database.staffSessions.id, sessions))
    await database.db.delete(database.users).where(eq(database.users.id, owner)); await database.sql.end()
  })

  async function business() {
    const workspaceId = newId('workspace'); spaces.push(workspaceId)
    const salon = templateExample('salon'), sales = templateExample('zakazy')
    salon.app.workspaceId = workspaceId; sales.app.workspaceId = workspaceId
    const viewMap = new Map([...salon.views, ...sales.views].map(view => [view.id, view]))
    const app = composeModules(salon.app, sales.app, viewMap)
    app.slug = `runtime-pages-${workspaceId}`
    const config = app.customer!, booking = app.booking!, catalogue = app.screens.find(screen => (screen.type === 'list' || screen.type === 'tiles') && screen.source.viewId === config.catalog!.viewId)!
    if (catalogue.type !== 'list' && catalogue.type !== 'tiles') throw new Error('Missing catalogue')
    const category = sales.field('goods', 'category'), choices = category.type === 'single_select' ? category.options.choices : []
    const gate = newId('field'), privateField = newId('field'), derived = newId('field')
    const extraFields: Field[] = [
      { id: gate, tableId: config.catalog!.tableId, name: 'Публикация источника', type: 'checkbox', options: {}, position: 'z0', description: null },
      { id: privateField, tableId: config.catalog!.tableId, name: 'Закрытая заметка', type: 'text', options: {}, position: 'z1', description: null },
      { id: derived, tableId: config.catalog!.tableId, name: 'Расчётный порядок', type: 'formula', options: { expression: '{Цена} * -1', resultType: 'number' }, position: 'z2', description: null },
    ]
    catalogue.statusFieldId = category.id
    catalogue.source.extraFilter = { id: newId('filter'), conjunction: 'and', conditions: [{ id: newId('filter'), fieldId: gate, op: 'is', value: true }] }
    const catalogView = viewMap.get(config.catalog!.viewId)!
    catalogView.config.filter = { id: newId('filter'), conjunction: 'or', conditions: [
      { id: newId('filter'), fieldId: config.catalog!.activeFieldId, op: 'is', value: true },
      { id: newId('filter'), fieldId: config.catalog!.titleFieldId, op: 'contains', value: 'override' },
    ] }
    catalogView.config.sorts = [{ fieldId: config.catalog!.titleFieldId, direction: 'asc' }]
    const products = Array.from({ length: count }, (_, i) => ({ id: newId('row'), tableId: config.catalog!.tableId, position: `a${String(Math.floor(i / 2)).padStart(4, '0')}`, data: {
      [config.catalog!.titleFieldId]: i === count - 1 ? 'Product 999 needle-page-three' : `Product ${String(Math.floor(i / 2)).padStart(3, '0')}`,
      [config.catalog!.activeFieldId]: true, [config.cart!.priceFieldId]: 100 + i, [category.id]: choices[i % 2]!.id,
      [gate]: true, [privateField]: 'SECRET_SEARCH_ONLY',
    } }))
    const hidden = [
      { id: newId('row'), tableId: config.catalog!.tableId, position: 'a0000', data: { [config.catalog!.titleFieldId]: 'HIDDEN_UNAVAILABLE', [config.catalog!.activeFieldId]: false, [gate]: true } },
      { id: newId('row'), tableId: config.catalog!.tableId, position: 'a0000', data: { [config.catalog!.titleFieldId]: 'Product override CLOSED_SOURCE_MARKER', [config.catalog!.activeFieldId]: false, [gate]: false } },
      { id: newId('row'), tableId: config.catalog!.tableId, position: 'a0000', data: { [config.catalog!.titleFieldId]: 'HIDDEN_DELETED', [config.catalog!.activeFieldId]: true, [gate]: true }, deletedAt: new Date() },
    ]
    const services = Array.from({ length: count }, (_, i) => ({ id: newId('row'), tableId: booking.tables.services, position: `s${String(i).padStart(4, '0')}`, data: {
      [booking.service.name]: `Service ${String(i).padStart(3, '0')}`, [booking.service.active]: true, [booking.service.price]: 500 + i, [booking.service.minutes]: 30,
    } }))
    const orders: { id: string; tableId: string; position: string; data: Record<string, unknown> }[] = [], positions: typeof orders = []
    const ownActive: string[] = [], ownPast: string[] = [], foreignOrders: string[] = []
    for (const [email, amount, terminal, into] of [[client, count, false, ownActive], [client, pastCount, true, ownPast], [otherClient, count, false, foreignOrders]] as const) {
      for (let i = 0; i < amount; i++) {
        const id = newId('row'), positionId = newId('row'), product = products[i % products.length]!
        into.push(id)
        orders.push({ id, tableId: config.tableId, position: `o${String(i).padStart(4, '0')}`, data: {
          [config.emailFieldId]: email, [config.statusFieldId]: terminal ? config.terminalStatuses[0]! : config.initialStatus,
          [config.createdFieldId!]: '2026-10-01T12:00:00Z', [config.profile!.nameFieldId]: email === client ? 'Ирина' : 'FOREIGN_CLIENT_MARKER',
          [config.profile!.phoneFieldId]: '+7 900 000-00-00', [config.cart!.positionsFieldId]: [positionId],
        } })
        positions.push({ id: positionId, tableId: config.cart!.itemsTableId, position: `p${String(i).padStart(4, '0')}`, data: {
          [config.cart!.nameFieldId]: product.data[config.catalog!.titleFieldId], [config.cart!.productFieldId!]: [product.id], [config.cart!.quantityFieldId]: 2,
          [config.cart!.itemPriceFieldId]: product.data[config.cart!.priceFieldId], [config.cart!.itemEmailFieldId]: email,
        } })
      }
    }
    const fields = [...salon.fields, ...sales.fields, ...extraFields], allViews = [...viewMap.values()]
    await database.db.insert(database.workspaces).values({ id: workspaceId, ownerId: owner, slug: workspaceId, name: 'Synthetic runtime pages', plan: 'business' })
    await database.db.insert(database.workspaceMembers).values({ workspaceId, userId: owner, role: 'owner' })
    await database.db.insert(database.tables).values([...salon.built.tables, ...sales.built.tables].map(table => ({ ...table, workspaceId })))
    await database.db.insert(database.fields).values(fields)
    await database.db.insert(database.views).values(allViews)
    await database.db.insert(database.rows).values([...products, ...hidden, ...services, ...orders, ...positions])
    await database.db.insert(database.apps).values({ id: app.id, workspaceId, name: app.name, slug: app.slug, draft: app, published: app })
    expect(await (await import('./app-references')).validateAppReferences(app)).toBeNull()
    return { app, workspaceId, config, catalogueId: catalogue.id, products, hidden, services, ownActive, ownPast, foreignOrders, fields, catalogView, category, choices, derived, gate, privateField }
  }
  type Business = Awaited<ReturnType<typeof business>>
  async function signIn(email: string) {
    const id = newId('session'); sessions.push(id)
    await database.db.insert(database.staffSessions).values({ id, email, expiresAt: new Date(Date.now() + 3_600_000) }); identity.cookie = id
  }
  async function initial(space: Business) {
    const visitor = identity.cookie ? (await (await import('./app-session')).currentAppAccess(space.app)).visitor : ANONYMOUS
    return (await runtime.loadPublishedApp(space.app.slug, visitor, { screenId: space.app.homeScreenId! }))!
  }
  async function page(space: Business, screenId: string, request: RuntimePageRequest = {}, cursor?: string, revision?: string) {
    const result = await actions.loadRuntimePageAction(space.app.slug, screenId, revision ?? (await initial(space)).lazy!.revision, request, cursor)
    if (!result.ok) throw new Error(result.error)
    return result.runtime
  }
  async function walk(space: Business, screenId: string, request: RuntimePageRequest = {}) {
    const revision = (await initial(space)).lazy!.revision, ids: string[] = []
    let cursor: string | undefined
    for (let tries = 0; tries < 10; tries++) {
      const runtime = await page(space, screenId, request, cursor, revision), collection = runtime.screens[screenId]!
      expect(collection.rowIds.length).toBeLessThanOrEqual(RUNTIME_PAGE_SIZE)
      ids.push(...collection.rowIds)
      if (!collection.page!.next) return ids
      cursor = collection.page!.next
    }
    throw new Error('Pagination did not terminate')
  }
  function expectSafe(space: Business, value: RuntimeApp, callerKnown: readonly string[] = []) {
    const payload = JSON.stringify(value)
    for (const marker of ['HIDDEN_UNAVAILABLE', 'CLOSED_SOURCE_MARKER', 'HIDDEN_DELETED', 'SECRET_SEARCH_ONLY', 'FOREIGN_CLIENT_MARKER']) expect(payload).not.toContain(marker)
    const rowPayload = JSON.stringify({ ...value, lazy: value.lazy ? { ...value.lazy, loadedRows: undefined } : undefined })
    for (const hidden of space.hidden) expect(callerKnown.includes(hidden.id) ? rowPayload : payload).not.toContain(hidden.id)
    expect(value.app.allowlist).toEqual([])
    expect(value.app.moduleAccess!.grants).toEqual([])
  }

  it('bounds initial catalogue payloads, applies native OR plus source AND gates, and paginates every visible product in stable order', async () => {
    const space = await business(), loaded = await initial(space)
    expect(loaded.lazy).toMatchObject({ paged: true })
    expectSafe(space, loaded)
    for (const screenId of space.app.catalogScreenIds!) {
      expect(loaded.screens[screenId]!.rowIds).toHaveLength(RUNTIME_PAGE_SIZE)
      expect(loaded.screens[screenId]!.page!.total).toBe(count)
    }
    expect(loaded.tables[space.config.catalog!.tableId]!.rows.length).toBeLessThanOrEqual(RUNTIME_PAGE_SIZE)
    expect(loaded.tables[space.app.booking!.tables.services]!.rows.length).toBeLessThanOrEqual(RUNTIME_PAGE_SIZE)
    expect(loaded.relatedTitles[space.config.catalog!.tableId]?.length ?? 0).toBeLessThanOrEqual(RUNTIME_PAGE_SIZE)
    expect(loaded.tables[space.config.tableId]?.rows ?? []).toEqual([])
    const ids = await walk(space, space.catalogueId)
    const expected = [...space.products].sort((a, b) => compareRows(a, b, space.catalogView.config.sorts, indexFields(space.fields)) || a.id.localeCompare(b.id)).map(row => row.id)
    expect(ids).toEqual(expected)
    expect(new Set(ids).size).toBe(count)
  })

  it('searches beyond page one without searching hidden fields and computes global choices and personal-history sections', async () => {
    const space = await business(), found = await page(space, space.catalogueId, { query: 'NEEDLE-PAGE-THREE' })
    expect(found.screens[space.catalogueId]!.rowIds).toEqual([space.products.at(-1)!.id])
    expect(found.screens[space.catalogueId]!.page).toMatchObject({ matched: 1, total: count, key: runtimeQueryKey({ query: 'needle-page-three' }) })
    const empty = await page(space, space.catalogueId, { query: 'SECRET_SEARCH_ONLY' })
    expect(empty.screens[space.catalogueId]!.rowIds).toEqual([])
    expect(empty.screens[space.catalogueId]!.page!.matched).toBe(0)
    const choice = await page(space, space.catalogueId, { choiceId: space.choices[0]!.id })
    expect(choice.screens[space.catalogueId]!.page).toMatchObject({ total: count, matched: Math.ceil(count / 2), choiceCounts: { [space.choices[0]!.id]: Math.ceil(count / 2), [space.choices[1]!.id]: Math.floor(count / 2) } })
    await signIn(client)
    const active = await page(space, space.config.listScreenId, { customerSection: 'active' })
    expectSafe(space, active)
    expect(active.screens[space.config.listScreenId]!.page).toMatchObject({ total: count, matched: count, sectionCounts: { active: count, history: pastCount } })
    expect(active.tables[space.config.cart!.itemsTableId]!.rows.length).toBeLessThanOrEqual(RUNTIME_PAGE_SIZE)
    expect((await walk(space, space.config.listScreenId, { customerSection: 'active' })).sort()).toEqual([...space.ownActive].sort())
    expect((await walk(space, space.config.listScreenId, { customerSection: 'history' })).sort()).toEqual([...space.ownPast].sort())
    for (const [rowId, value] of [[space.ownActive[0]!, [client]], [space.ownActive[1]!, `\t${client}\n`]] as const) {
      const [record] = await database.db.select().from(database.rows).where(eq(database.rows.id, rowId))
      await database.db.update(database.rows).set({ data: { ...record!.data as Record<string, unknown>, [space.config.emailFieldId]: value } }).where(eq(database.rows.id, rowId))
    }
    expect((await walk(space, space.config.listScreenId, { customerSection: 'active' })).sort()).toEqual([...space.ownActive].sort())
  }, 15000)

  it('rejects cursors from a different query or identity and invalidates continuation after data or publication changes', async () => {
    const space = await business(), first = await page(space, space.catalogueId), revision = first.lazy!.revision, cursor = first.screens[space.catalogueId]!.page!.next!
    expect(await actions.loadRuntimePageAction(space.app.slug, space.catalogueId, revision, { query: 'Product' }, cursor)).toMatchObject({ ok: false })
    await signIn(client)
    expect(await actions.loadRuntimePageAction(space.app.slug, space.catalogueId, revision, {}, cursor)).toMatchObject({ ok: false, reload: true })
    const clientFirst = await page(space, space.catalogueId), clientCursor = clientFirst.screens[space.catalogueId]!.page!.next!
    await signIn(otherClient)
    const otherInitial = await initial(space)
    expect(await actions.loadRuntimePageAction(space.app.slug, space.catalogueId, otherInitial.lazy!.revision, {}, clientCursor)).toMatchObject({ ok: false })
    const latest = await page(space, space.catalogueId), latestCursor = latest.screens[space.catalogueId]!.page!.next!
    await (await import('./row-mutations')).writeRows(space.workspaceId, context => import('./row-mutations').then(module => module.updateRow(context, space.config.catalog!.tableId, space.products[0]!.id, { [space.config.catalog!.titleFieldId]: 'Updated product' }, { id: owner, kind: 'member' })))
    expect(await actions.loadRuntimePageAction(space.app.slug, space.catalogueId, latest.lazy!.revision, {}, latestCursor)).toMatchObject({ ok: false })
    await database.db.update(database.apps).set({ published: { ...space.app, name: 'Changed publication' } }).where(eq(database.apps.id, space.app.id))
    expect(await actions.loadRuntimePageAction(space.app.slug, space.catalogueId, latest.lazy!.revision)).toMatchObject({ ok: false, reload: true })
  })

  it('loads allowed off-page catalogue and detail rows without widening list IDs or accepting hidden and foreign rows', async () => {
    const space = await business(), first = await initial(space), chosen = space.products.at(-1)!, revision = first.lazy!.revision
    expect(first.screens[space.catalogueId]!.rowIds).not.toContain(chosen.id)
    const pins = await actions.loadRuntimeRowsAction(space.app.slug, space.catalogueId, revision, [chosen.id, space.hidden[1]!.id])
    if (!pins.ok) throw new Error(pins.error)
    expectSafe(space, pins.runtime, [space.hidden[1]!.id])
    expect(pins.runtime.tables[space.config.catalog!.tableId]!.rows.find(row => row.id === chosen.id)?.data).toMatchObject({ [space.config.catalog!.titleFieldId]: chosen.data[space.config.catalog!.titleFieldId], [space.config.cart!.priceFieldId]: chosen.data[space.config.cart!.priceFieldId] })
    expect(pins.runtime.screens[space.catalogueId]?.rowIds ?? []).not.toContain(chosen.id)
    expect(pins.runtime.screens[space.catalogueId]?.rowIds.length ?? 0).toBeLessThanOrEqual(RUNTIME_PAGE_SIZE)
    await signIn(client)
    const ownInitial = await initial(space), detail = await actions.loadRuntimeRowsAction(space.app.slug, space.config.detailScreenId, ownInitial.lazy!.revision, [space.ownPast.at(-1)!, space.foreignOrders.at(-1)!])
    if (!detail.ok) throw new Error(detail.error)
    expectSafe(space, detail.runtime)
    expect(detail.runtime.tables[space.config.tableId]!.rows.map(row => row.id)).toEqual([space.ownPast.at(-1)!])
    expect(detail.runtime.tables[space.config.cart!.itemsTableId]!.rows).toHaveLength(1)
  })

  it('keeps derived-field sorting exact across pages without projecting the private sort field', async () => {
    const space = await business(), config = { ...space.catalogView.config, sorts: [{ fieldId: space.derived, direction: 'desc' as const }] }
    const extra = Array.from({ length: RUNTIME_SCAN_BATCH + 17 }, (_, i) => ({ id: newId('row'), tableId: space.config.catalog!.tableId, position: `x${String(i).padStart(4, '0')}`, data: {
      ...space.products[0]!.data, [space.config.catalog!.titleFieldId]: `Extra ${String(i).padStart(3, '0')}`, [space.config.cart!.priceFieldId]: 1000 + i,
    } }))
    await database.db.insert(database.rows).values(extra)
    space.products.push(...extra)
    await database.db.update(database.views).set({ config }).where(eq(database.views.id, space.catalogView.id))
    const { compileTableFormulas, computeDerivedRow } = await import('@tableapp/formula')
    const fields = space.fields.filter(field => field.tableId === space.config.catalog!.tableId), formulas = compileTableFormulas(fields)
    const expected = space.products.map(row => ({ ...row, data: computeDerivedRow(row.data, fields, new Map(), formulas) }))
      .sort((a, b) => compareRows(a, b, config.sorts, indexFields(fields)) || a.id.localeCompare(b.id)).map(row => row.id)
    const first = await page(space, space.catalogueId)
    expectSafe(space, first)
    expect(first.tables[space.config.catalog!.tableId]!.fields.map(field => field.id)).not.toContain(space.derived)
    expect(first.tables[space.config.catalog!.tableId]!.rows.every(row => !(space.derived in row.data))).toBe(true)
    expect(await walk(space, space.catalogueId)).toEqual(expected)
    const beyondBatch = await page(space, space.catalogueId, { query: `Extra ${String(extra.length - 1).padStart(3, '0')}` })
    expect(beyondBatch.screens[space.catalogueId]!.rowIds).toEqual([extra.at(-1)!.id])
  }, 15000)
})
