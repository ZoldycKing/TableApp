import { apps, db, fields, rows, stockAutomations, stockAutomationRuns, tables, views } from '@tableapp/db'
import { appSchema, defaultViewConfig, newId, positionBetween, positionSequence, type InventoryConfig } from '@tableapp/schema'
import { and, asc, desc, eq, gt, isNull, ne, sql } from 'drizzle-orm'
import type { Transaction } from './db-transaction'
import { assertCanIncreaseUsage } from './limits'
import { inventoryStock } from './order-stock-store'
import { createRow, mutationFields, RowWriteError, writeRows, type RowTransaction } from './row-mutations'
import { nextStockCheck, stockScheduleValid } from './stock-automation-time'

export type StockAutomation = typeof stockAutomations.$inferSelect
export type StockAutomationRun = typeof stockAutomationRuns.$inferSelect
type Scope = Pick<StockAutomation, 'workspaceId' | 'appId'>
type Destination = Pick<StockAutomation, 'taskTableId' | 'taskFields'>

export const stockAutomationScope = ({ workspaceId, appId }: Scope) => and(eq(stockAutomations.workspaceId, workspaceId), eq(stockAutomations.appId, appId))
export const stockRunScope = ({ workspaceId, appId }: Scope) => and(eq(stockAutomationRuns.workspaceId, workspaceId), eq(stockAutomationRuns.appId, appId))

async function stockSource(scope: Scope, connection: Transaction | typeof db = db, lock = false) {
  const query = connection.select({ name: apps.name, draft: apps.draft, published: apps.published }).from(apps)
    .where(and(eq(apps.workspaceId, scope.workspaceId), eq(apps.id, scope.appId)))
  const [record] = lock ? await query.for('share') : await query
  if (!record) return null
  const draft = appSchema.safeParse(record.draft)
  const published = appSchema.safeParse(record.published)
  const inventory = published.success && published.data.id === scope.appId && published.data.workspaceId === scope.workspaceId ? published.data.inventory : null
  const columns = inventory ? await connection.select({ id: fields.id, name: fields.name }).from(fields)
    .innerJoin(tables, eq(tables.id, fields.tableId))
    .where(and(eq(tables.workspaceId, scope.workspaceId), eq(fields.tableId, inventory.tables.items), eq(fields.type, 'number')))
    .orderBy(asc(fields.position)) : []
  return { name: record.name, inventory, columns, inventoryDraft: draft.success && Boolean(draft.data.inventory) }
}

export async function loadStockAutomation(scope: Scope) {
  const source = await stockSource(scope)
  if (!source) return null
  const [[automation], runs] = await Promise.all([
    db.select().from(stockAutomations).where(stockAutomationScope(scope)),
    db.select().from(stockAutomationRuns).where(stockRunScope(scope)).orderBy(desc(stockAutomationRuns.scheduledFor), desc(stockAutomationRuns.id)).limit(20),
  ])
  if (!automation && !source.inventory && !source.inventoryDraft) return null
  const [taskTable] = automation ? await db.select({ id: tables.id, name: tables.name }).from(tables)
    .where(and(eq(tables.workspaceId, scope.workspaceId), eq(tables.id, automation.taskTableId))) : []
  return { ...source, automation, runs, taskTable }
}

async function createTaskTable(context: RowTransaction, inventory: InventoryConfig): Promise<Destination> {
  const { tx, workspaceId } = context
  await assertCanIncreaseUsage({ workspaceId, resource: 'tables', tx })
  const [last] = await tx.select({ position: tables.position }).from(tables).where(eq(tables.workspaceId, workspaceId))
    .orderBy(desc(tables.position)).limit(1)
  const taskTableId = newId('table')
  const taskFields = { title: newId('field'), item: newId('field'), stock: newId('field'), minimum: newId('field'), done: newId('field') }
  const definitions = [
    { id: taskFields.title, name: 'Задача', type: 'text', options: {} },
    { id: taskFields.item, name: 'Товар', type: 'relation', options: { tableId: inventory.tables.items, allowMultiple: false } },
    { id: taskFields.stock, name: 'Остаток при проверке', type: 'number', options: {} },
    { id: taskFields.minimum, name: 'Минимум при проверке', type: 'number', options: {} },
    { id: taskFields.done, name: 'Выполнена', type: 'checkbox', options: {} },
  ]
  const positions = positionSequence(definitions.length)
  await tx.insert(tables).values({ id: taskTableId, workspaceId, name: 'Задачи на закупку', icon: 'table',
    primaryFieldId: taskFields.title, position: positionBetween(last?.position ?? null, null) })
  await tx.insert(fields).values(definitions.map((field, index) => ({ ...field, tableId: taskTableId, position: positions[index]! })))
  await tx.insert(views).values({ id: newId('view'), tableId: taskTableId, name: 'Все задачи', type: 'grid',
    config: defaultViewConfig('grid', newId('filter')), position: positionBetween(null, null) })
  return { taskTableId, taskFields }
}

async function cancelQueued(context: RowTransaction, scope: Scope, now: Date) {
  await context.tx.update(stockAutomationRuns).set({ status: 'cancelled', finishedAt: now })
    .where(and(stockRunScope(scope), eq(stockAutomationRuns.status, 'queued'), eq(stockAutomationRuns.trigger, 'schedule')))
}

export async function saveStockAutomation(scope: Scope, input: { minimumFieldId: string; localTime: string; timeZone: string }, now = new Date()) {
  if (!stockScheduleValid(input.localTime, input.timeZone)) throw new RowWriteError('invalid', 'Укажите время и часовой пояс.')
  return writeRows(scope.workspaceId, async context => {
    const source = await stockSource(scope, context.tx, true)
    if (!source?.inventory) throw new RowWriteError('missing', 'Сначала опубликуйте приложение со складом.')
    const itemTableId = source.inventory.tables.items
    if (!(await mutationFields(context, itemTableId)).some(field => field.id === input.minimumFieldId && field.type === 'number')) {
      throw new RowWriteError('invalid', 'Выберите числовое поле с минимальным остатком.')
    }
    const [other] = await context.tx.select({ appId: stockAutomations.appId }).from(stockAutomations)
      .where(and(eq(stockAutomations.workspaceId, scope.workspaceId), eq(stockAutomations.itemTableId, itemTableId), ne(stockAutomations.appId, scope.appId)))
    if (other) throw new RowWriteError('invalid', 'Для этой таблицы товаров уже настроена проверка в другом приложении.')
    const [current] = await context.tx.select().from(stockAutomations).where(stockAutomationScope(scope)).for('update')
    const [existing] = current?.itemTableId === itemTableId ? await context.tx.select({ id: tables.id }).from(tables)
      .where(and(eq(tables.workspaceId, scope.workspaceId), eq(tables.id, current.taskTableId))) : []
    const destination = current && existing ? { taskTableId: current.taskTableId, taskFields: current.taskFields }
      : await createTaskTable(context, source.inventory)
    const nextRunAt = !current || current.nextRunAt ? nextStockCheck(now, input.localTime, input.timeZone) : null
    const definition = { ...destination, ...input, itemTableId, nextRunAt }
    await context.tx.insert(stockAutomations).values({ ...scope, ...definition })
      .onConflictDoUpdate({ target: stockAutomations.appId, set: definition })
    if (current) await cancelQueued(context, scope, now)
  })
}

export async function setStockAutomationActive(scope: Scope, active: boolean, now = new Date()) {
  return writeRows(scope.workspaceId, async context => {
    const [current] = await context.tx.select().from(stockAutomations).where(stockAutomationScope(scope)).for('update')
    if (!current) throw new RowWriteError('missing', 'Сначала настройте проверку остатков.')
    if (active === Boolean(current.nextRunAt)) return
    if (active) await stockExecutionConfig(context, current)
    const nextRunAt = active ? nextStockCheck(now, current.localTime, current.timeZone) : null
    await context.tx.update(stockAutomations).set({ nextRunAt }).where(stockAutomationScope(scope))
    if (!active) await cancelQueued(context, scope, now)
  })
}

async function stockExecutionConfig(context: RowTransaction, automation: StockAutomation) {
  const source = await stockSource(automation, context.tx, true)
  const inventory = source?.inventory
  if (!inventory) throw new RowWriteError('invalid', 'Опубликуйте приложение со складом и повторите запуск.')
  if (inventory.tables.items !== automation.itemTableId) throw new RowWriteError('invalid', 'В приложении изменилась таблица товаров. Сохраните настройки проверки ещё раз.')
  const itemFields = await mutationFields(context, inventory.tables.items)
  const moveFields = await mutationFields(context, inventory.tables.movements)
  const links = itemFields.find(field => field.id === inventory.item.movements)
  const item = moveFields.find(field => field.id === inventory.movement.item)
  if (!itemFields.some(field => field.id === inventory.item.opening && field.type === 'number') ||
    links?.type !== 'relation' || links.options.tableId !== inventory.tables.movements ||
    item?.type !== 'relation' || item.options.tableId !== inventory.tables.items ||
    !moveFields.some(field => field.id === inventory.movement.qty && field.type === 'number')) {
    throw new RowWriteError('invalid', 'Проверьте настройки начального остатка и журнала движений.')
  }
  if (!itemFields.some(field => field.id === automation.minimumFieldId && field.type === 'number')) {
    throw new RowWriteError('invalid', 'Выберите числовое поле с минимальным остатком в настройках проверки.')
  }
  const [taskTable] = await context.tx.select({ id: tables.id }).from(tables)
    .where(and(eq(tables.workspaceId, automation.workspaceId), eq(tables.id, automation.taskTableId))).for('share')
  if (!taskTable) throw new RowWriteError('missing', 'Таблица задач удалена. Сохраните настройки проверки ещё раз.')
  const taskColumns = await mutationFields(context, taskTable.id)
  const { title, item: linkId, done, stock, minimum } = automation.taskFields
  const taskLink = taskColumns.find(field => field.id === linkId)
  if (taskLink?.type !== 'relation' || taskLink.options.tableId !== inventory.tables.items || taskLink.options.allowMultiple ||
    ![[title, 'text'], [stock, 'number'], [minimum, 'number'], [done, 'checkbox']].every(([id, type]) => taskColumns.some(field => field.id === id && field.type === type))) {
    throw new RowWriteError('invalid', 'Проверьте поля «Задача», «Товар», «Остаток при проверке», «Минимум при проверке» и «Выполнена» в таблице задач.')
  }
  return inventory
}

export async function queueStockCheck(scope: Scope, runId?: string, now = new Date()) {
  return writeRows(scope.workspaceId, async context => {
    const { tx } = context
    const [current] = await tx.select().from(stockAutomations).where(stockAutomationScope(scope)).for('update')
    if (!current) throw new RowWriteError('missing', 'Сначала настройте проверку остатков.')
    await stockExecutionConfig(context, current)
    if (runId !== undefined) {
      const [queued] = await tx.update(stockAutomationRuns).set({ status: 'queued', readyAt: now, finishedAt: null, error: null })
        .where(and(stockRunScope(scope), eq(stockAutomationRuns.id, runId), eq(stockAutomationRuns.status, 'failed')))
        .returning({ id: stockAutomationRuns.id })
      if (!queued) throw new RowWriteError('invalid', 'Повторить можно только неудачный запуск.')
      return queued.id
    }
    const [pending] = await tx.select({ id: stockAutomationRuns.id }).from(stockAutomationRuns)
      .where(and(stockRunScope(scope), eq(stockAutomationRuns.trigger, 'manual'), eq(stockAutomationRuns.status, 'queued'))).limit(1)
    if (pending) return pending.id
    const id = newId('run')
    await tx.insert(stockAutomationRuns).values({ ...scope, id, scheduledFor: now, readyAt: now, trigger: 'manual' })
    return id
  })
}

export async function executeStockCheck(context: RowTransaction, automation: StockAutomation) {
  const inventory = await stockExecutionConfig(context, automation)
  const { tx } = context
  const { item, stock, minimum, title, done } = automation.taskFields
  const open = await tx.select({ products: sql<unknown>`${rows.data}->${item}::text` }).from(rows).where(and(
    eq(rows.tableId, automation.taskTableId), isNull(rows.deletedAt), sql`${rows.data}->${done}::text is distinct from 'true'::jsonb`,
  ))
  const withTask = new Set(open.flatMap(({ products }) => Array.isArray(products) ? products.filter((id): id is string => typeof id === 'string') : []))
  let checked = 0
  let createdTasks = 0
  let afterId: string | undefined
  for (;;) {
    const page: { id: string; data: unknown }[] = await tx.select({ id: rows.id, data: rows.data }).from(rows).where(and(
      eq(rows.tableId, inventory.tables.items), isNull(rows.deletedAt),
      sql`jsonb_typeof(${rows.data}->${automation.minimumFieldId}::text) = 'number'`, afterId ? gt(rows.id, afterId) : undefined,
    )).orderBy(asc(rows.id)).limit(200)
    if (!page.length) break
    afterId = page.at(-1)!.id
    for (const product of page) {
      const data = product.data as Record<string, unknown>
      const threshold = data[automation.minimumFieldId]
      if (typeof threshold !== 'number' || !Number.isFinite(threshold) || threshold < 0) continue
      checked++
      if (withTask.has(product.id)) continue
      const remaining = await inventoryStock(context, inventory, product.id, data)
      if (remaining > threshold) continue
      const value = data[inventory.item.name]
      const name = typeof value === 'string' && value.trim() ? value.trim().slice(0, 180) : 'Товар'
      await createRow(context, automation.taskTableId, {
        [title]: `Закупить: ${name}`, [item]: [product.id], [stock]: remaining, [minimum]: threshold, [done]: false,
      }, { id: null, kind: 'automation' })
      createdTasks++
    }
  }
  return { checked, createdTasks }
}
