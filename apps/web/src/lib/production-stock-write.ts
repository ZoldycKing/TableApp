import { apps, productionStockRuns, rows } from '@tableapp/db'
import { appSchema, type InventoryConfig, type ProductionConfig } from '@tableapp/schema'
import { and, eq, isNull, or, sql } from 'drizzle-orm'
import { sameCellValue } from './cell-conflict'
import { inventoryBinding } from './order-stock-contract'
import { stockBalance } from './order-stock-store'
import { productionStockBinding } from './production-stock-contract'
import { checkRow, lockedRow, mutationFields, RowWriteError, type RowTransaction } from './row-mutations'

export type ProductionStockAuthorization = {
  production: ProductionConfig
  inventory: InventoryConfig
  runId: string
  productId: string
  quantity: number
  stockMovementId: string
  materialMovements: { id: string; materialId: string; quantity: number }[]
}

type PostedRun = typeof productionStockRuns.$inferSelect
const frozen = () => new RowWriteError('invalid', 'Выпуск уже принят на общий склад. Сохраните выпуск, его движения и связи для истории; исправление требует отдельной складской операции.')
const linkedTo = (value: unknown, id: string) => Array.isArray(value) && value.length === 1 && value[0] === id
const stockOf = (production: ProductionConfig) => (production as ProductionConfig & { stock?: { itemsTableId: string } | null }).stock

/** A capability exists only inside the server's atomic production operation, never in a request payload. */
export async function withProductionStockWrite<T>(context: RowTransaction, authorization: ProductionStockAuthorization, write: () => Promise<T>): Promise<T> {
  if (context.productionStockInternal) throw new RowWriteError('invalid', 'Выпуск продукции уже выполняется')
  const { production: p, inventory: i } = authorization
  if (stockOf(p)?.itemsTableId !== i.tables.items || !i.operations ||
    Object.values(p.tables).some(id => id === i.tables.items || id === i.tables.movements) ||
    !Number.isSafeInteger(authorization.quantity) || authorization.quantity < 1 || authorization.quantity > 1_000_000 ||
    authorization.materialMovements.some(item => !Number.isFinite(item.quantity) || item.quantity <= 0) ||
    new Set([authorization.runId, authorization.stockMovementId, ...authorization.materialMovements.map(item => item.id)]).size !== authorization.materialMovements.length + 2)
    throw new RowWriteError('invalid', 'Проверьте привязку производства к общему складу и количество выпуска')
  const coordinates = [[p.tables.production, authorization.runId], [i.tables.movements, authorization.stockMovementId],
    ...authorization.materialMovements.map(item => [p.tables.movements, item.id])] as [string, string][]
  for (const [tableId, rowId] of coordinates) {
    await mutationFields(context, tableId)
    if (await lockedRow(context, tableId, rowId)) throw new RowWriteError('conflict', 'Идентификатор выпуска или движения уже занят')
  }
  await mutationFields(context, i.tables.items)
  await mutationFields(context, p.tables.materials)
  context.productionStockInternal = authorization
  try {
    const result = await write()
    const [posted] = await context.tx.select().from(productionStockRuns).where(and(eq(productionStockRuns.workspaceId, context.workspaceId),
      eq(productionStockRuns.productionTableId, p.tables.production), eq(productionStockRuns.runRowId, authorization.runId)))
    const expectedMaterials = authorization.materialMovements.map(item => ({ tableId: p.tables.movements, rowId: item.id, materialId: item.materialId, quantity: item.quantity }))
    if (!posted || posted.productTableId !== i.tables.items || posted.productRowId !== authorization.productId ||
      posted.stockMovementTableId !== i.tables.movements || posted.stockMovementRowId !== authorization.stockMovementId || posted.outputQuantity !== authorization.quantity ||
      productionStockBinding(posted.contract.production) !== productionStockBinding(p) || inventoryBinding(posted.contract.inventory) !== inventoryBinding(i) ||
      !sameCellValue(posted.contract.materialMovements, expectedMaterials)) throw new RowWriteError('invalid', 'Не удалось сохранить полную складскую историю выпуска')
    // The JSON snapshot cannot itself enforce foreign keys for material entries.
    // Verify every child and reverse link before allowing the transaction to commit.
    const run = await lockedRow(context, p.tables.production, authorization.runId); checkRow(run)
    const receipt = await lockedRow(context, i.tables.movements, authorization.stockMovementId); checkRow(receipt)
    checkInternalCreate(context, p.tables.production, run.id, run.data as Record<string, unknown>, { production: p, inventory: i })
    checkInternalCreate(context, i.tables.movements, receipt.id, receipt.data as Record<string, unknown>, { production: p, inventory: i })
    const product = await lockedRow(context, i.tables.items, authorization.productId); checkRow(product)
    const productLinks = (product.data as Record<string, unknown>)[i.item.movements]
    if (!Array.isArray(productLinks) || !productLinks.includes(authorization.stockMovementId)) throw new RowWriteError('invalid', 'Приход продукции не связан с товаром')
    for (const entry of authorization.materialMovements) {
      const movement = await lockedRow(context, p.tables.movements, entry.id); checkRow(movement)
      checkInternalCreate(context, p.tables.movements, entry.id, movement.data as Record<string, unknown>, { production: p, inventory: i })
      const material = await lockedRow(context, p.tables.materials, entry.materialId); checkRow(material)
      const links = (material.data as Record<string, unknown>)[p.material.movements]
      if (!Array.isArray(links) || !links.includes(entry.id)) throw new RowWriteError('invalid', 'Списание выпуска не связано с материалом')
    }
    if ((await stockBalance(context, i, product.id, product.data as Record<string, unknown>)).available < 0) throw new RowWriteError('invalid', 'Остаток продукции меньше резерва заказов')
    return result
  } finally { context.productionStockInternal = undefined }
}

async function postedRuns(context: RowTransaction, tableId: string): Promise<PostedRun[]> {
  return context.tx.select().from(productionStockRuns).where(and(eq(productionStockRuns.workspaceId, context.workspaceId), or(
    eq(productionStockRuns.productionTableId, tableId), eq(productionStockRuns.productTableId, tableId), eq(productionStockRuns.stockMovementTableId, tableId),
    sql`${productionStockRuns.contract}->'production'->'tables'->>'materials'=${tableId}`,
    sql`${productionStockRuns.contract}->'production'->'tables'->>'movements'=${tableId}`)))
}

async function connectedContracts(context: RowTransaction, historical: PostedRun[]): Promise<{ production: ProductionConfig; inventory: InventoryConfig }[]> {
  if (!context.moduleStateCache) {
    const records = await context.tx.select({ published: apps.published }).from(apps).where(eq(apps.workspaceId, context.workspaceId))
    context.moduleStateCache = records.flatMap(record => { const parsed = appSchema.safeParse(record.published); return parsed.success ? [parsed.data] : [] })
  }
  const contracts = [...context.moduleStateCache.flatMap(app => app.production && stockOf(app.production) && app.inventory
    ? [{ production: app.production, inventory: app.inventory }] : []), ...historical.map(run => run.contract)]
  return [...new Map(contracts.map(contract => [`${productionStockBinding(contract.production)}:${inventoryBinding(contract.inventory)}`, contract])).values()]
}

function checkInternalCreate(context: RowTransaction, tableId: string, rowId: string, data: Record<string, unknown>, contract: { production: ProductionConfig; inventory: InventoryConfig }): void {
  const { production: p, inventory: i } = contract, scope = context.productionStockInternal
  const authorized = scope && productionStockBinding(scope.production) === productionStockBinding(p) && inventoryBinding(scope.inventory) === inventoryBinding(i)
  if (tableId === p.tables.production) {
    if (!authorized || rowId !== scope.runId || !linkedTo(data[p.run.product], scope.productId) || data[p.run.qty] !== scope.quantity) throw new RowWriteError('denied', 'Выпуск записывается через производственную форму вместе с движениями материалов и приходом продукции')
  }
  if (tableId === p.tables.movements && (data[p.movement.kind] === p.movementKindId || Array.isArray(data[p.movement.run]) && (data[p.movement.run] as unknown[]).length > 0)) {
    const movement = authorized ? scope.materialMovements.find(item => item.id === rowId) : undefined
    if (!movement || !scope || !linkedTo(data[p.movement.run], scope.runId) || !linkedTo(data[p.movement.material], movement.materialId) ||
      data[p.movement.kind] !== p.movementKindId || data[p.movement.qty] !== -movement.quantity) throw new RowWriteError('denied', 'Списание по выпуску создаётся только вместе с самим выпуском')
  }
  if (authorized && tableId === i.tables.movements && rowId === scope.stockMovementId &&
    (!linkedTo(data[i.movement.item], scope.productId) || data[i.movement.qty] !== scope.quantity || data[i.operations!.fields.kind] !== i.operations!.kinds.receipt)) throw new RowWriteError('invalid', 'Приход готовой продукции должен совпадать с выпуском')
}

function checkInternalLinks(context: RowTransaction, tableId: string, rowId: string, data: Record<string, unknown>, before: Record<string, unknown> | null): void {
  const scope = context.productionStockInternal
  if (!scope || !before) return
  const i = scope.inventory, p = scope.production
  const additions = tableId === i.tables.items && rowId === scope.productId ? [scope.stockMovementId]
    : tableId === p.tables.materials ? scope.materialMovements.filter(item => item.materialId === rowId).map(item => item.id) : []
  if (!additions.length) return
  const fieldId = tableId === i.tables.items ? i.item.movements : p.material.movements
  const prior = before[fieldId] ?? [], next = data[fieldId]
  if (!Array.isArray(prior) || !Array.isArray(next) || next.some(value => typeof value !== 'string') || new Set(next).size !== next.length ||
    prior.some(id => !next.includes(id)) || additions.some(id => !next.includes(id)) || next.some(id => !prior.includes(id) && !additions.includes(id)) ||
    !sameCellValue({ ...before, [fieldId]: null }, { ...data, [fieldId]: null })) throw new RowWriteError('invalid', 'Связь складского движения выпуска должна сохранять прежние данные и добавлять только его движения')
}

function guardPostedRun(run: PostedRun, tableId: string, rowId: string, data: Record<string, unknown>, before: Record<string, unknown> | null): void {
  const { production: p, inventory: i, materialMovements } = run.contract
  const immutable = run.productionTableId === tableId && run.runRowId === rowId || run.stockMovementTableId === tableId && run.stockMovementRowId === rowId ||
    materialMovements.some(item => item.tableId === tableId && item.rowId === rowId)
  if (immutable && (!before || !sameCellValue(before, data))) throw frozen()
  if (tableId === i.tables.items) {
    const links = data[i.item.movements]
    if (rowId === run.productRowId ? !Array.isArray(links) || !links.includes(run.stockMovementRowId) : Array.isArray(links) && links.includes(run.stockMovementRowId)) throw frozen()
  }
  if (tableId === p.tables.materials) for (const movement of materialMovements) {
    const links = data[p.material.movements]
    if (rowId === movement.materialId ? !Array.isArray(links) || !links.includes(movement.rowId) : Array.isArray(links) && links.includes(movement.rowId)) throw frozen()
  }
}

/** Applies to runtime, owner edits, imports and synchronization, including records whose app was deleted. */
export async function prepareProductionStockWrite(context: RowTransaction, tableId: string, rowId: string, data: Record<string, unknown>, before: Record<string, unknown> | null): Promise<void> {
  const historical = await postedRuns(context, tableId), contracts = await connectedContracts(context, historical)
  for (const run of historical) guardPostedRun(run, tableId, rowId, data, before)
  if (!before) for (const contract of contracts) checkInternalCreate(context, tableId, rowId, data, contract)
  checkInternalLinks(context, tableId, rowId, data, before)
  const inventories = [...new Map(contracts.map(contract => [inventoryBinding(contract.inventory), contract.inventory])).values()]
  for (const config of inventories) {
    if (tableId === config.tables.items && (await stockBalance(context, config, rowId, data)).available < 0) throw new RowWriteError('invalid', 'Изменение остатка уменьшит товар ниже резерва заказов')
    if (before && tableId === config.tables.movements) {
      const products = await context.tx.select().from(rows).where(and(eq(rows.tableId, config.tables.items), isNull(rows.deletedAt), sql`${rows.data}->${config.item.movements} ? ${rowId}`))
      for (const product of products) if ((await stockBalance(context, config, product.id, product.data as Record<string, unknown>, { id: rowId, data })).available < 0)
        throw new RowWriteError('invalid', 'Изменение движения уменьшит товар ниже резерва заказов')
    }
  }
}

export async function assertProductionStockDeletion(context: RowTransaction, tableId: string, rowId: string): Promise<void> {
  const historical = await postedRuns(context, tableId)
  if (historical.some(run => run.productionTableId === tableId && run.runRowId === rowId || run.productTableId === tableId && run.productRowId === rowId ||
    run.stockMovementTableId === tableId && run.stockMovementRowId === rowId || run.contract.materialMovements.some(item => item.tableId === tableId && item.rowId === rowId ||
      run.contract.production.tables.materials === tableId && item.materialId === rowId))) throw frozen()
  const contracts = await connectedContracts(context, historical)
  for (const config of [...new Map(contracts.map(contract => [inventoryBinding(contract.inventory), contract.inventory])).values()].filter(config => config.tables.movements === tableId)) {
    const products = await context.tx.select().from(rows).where(and(eq(rows.tableId, config.tables.items), isNull(rows.deletedAt), sql`${rows.data}->${config.item.movements} ? ${rowId}`))
    for (const product of products) if ((await stockBalance(context, config, product.id, product.data as Record<string, unknown>, { id: rowId, data: null })).available < 0)
      throw new RowWriteError('invalid', 'Удаление движения уменьшит товар ниже резерва заказов')
  }
}
