import { createHash } from 'node:crypto'
import { productionStockRuns, rows } from '@tableapp/db'
import { newId, parseCellValue, type App, type InventoryConfig, type ProductionConfig } from '@tableapp/schema'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import type { ConsumptionPreview, MovementInput, ProductionInput, SavedMovement, SavedProduction } from '@/app/production-actions'
import { appReadPolicy } from './app-read-policy'
import { writableFields, type Visitor } from './app-roles'
import type { AppViewer } from './app-session'
import { needFor, shortagesOf, type Need, type Norm } from './production'
import { withProductionStockWrite } from './production-stock-write'
import { stockBalance } from './order-stock-store'
import { canAccessRow, rulesFor, stampOwner } from './row-access'
import { assertCurrentModuleState, checkRow, createRow, lockedRow, mutationFields, RowWriteError, updateRow, writeRows, type RowTransaction } from './row-mutations'

type Access = { app: App; config: ProductionConfig; viewer: AppViewer | null; visitor: Visitor }
type Material = { id: string; name: string; unit: string; stock: number; links: string[] }
const denied = () => new RowWriteError('denied', 'Изделие или материалы недоступны для этого выпуска')
const first = (value: unknown): string | null => Array.isArray(value) && value.length === 1 && typeof value[0] === 'string' ? value[0] : null

function inventoryOf(access: Access): InventoryConfig {
  const inventory = access.app.inventory
  if (!inventory?.operations || !access.config.stock || access.config.stock.itemsTableId !== inventory.tables.items || !access.viewer || !access.visitor.authenticated) throw denied()
  return inventory
}

function quantityOf(quantity: number) {
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1_000_000) throw new RowWriteError('invalid', 'Укажите целое количество годных изделий от 1 до 1 000 000')
}

/** Product IDs come from the shared catalogue; names are never used to match stock. */
async function productOf(context: RowTransaction, access: Access, inventory: InventoryConfig, productId: string) {
  const product = await lockedRow(context, inventory.tables.items, productId)
  checkRow(product)
  const policy = await appReadPolicy(access.app, inventory.tables.items, access.visitor, access.viewer!)
  if (!policy.canRead(product.data as Record<string, unknown>, product) || !policy.readable.fields.has(inventory.item.name)) throw denied()
  return { row: product, name: String(policy.project(product.data as Record<string, unknown>, product)[inventory.item.name] ?? 'Изделие'), stockVisible: policy.readable.fields.has(inventory.item.stock) }
}

async function currentNeeds(context: RowTransaction, config: ProductionConfig, productId: string, quantity: number): Promise<Need[]> {
  await mutationFields(context, config.tables.norms)
  const found = await context.tx.select().from(rows).where(and(eq(rows.tableId, config.tables.norms), isNull(rows.deletedAt)))
  const norms: Norm[] = []
  for (const row of found) {
    const data = row.data as Record<string, unknown>
    if (first(data[config.norm.product]) !== productId || data[config.norm.active] === false) continue
    const materialId = first(data[config.norm.material]), perUnit = Number(data[config.norm.perUnit] ?? 0)
    if (!Number.isFinite(perUnit) || perUnit < 0 || perUnit * quantity > Number.MAX_SAFE_INTEGER) throw new RowWriteError('invalid', 'Проверьте норму расхода материала')
    if (perUnit === 0) continue
    if (!materialId) throw new RowWriteError('invalid', 'В действующей норме не выбран материал')
    norms.push({ materialId, perUnit })
  }
  return needFor(quantity, norms)
}

/** Raw materials remain a separate decimal ledger; the production role authorizes consumption by a configured norm. */
async function materialsOf(context: RowTransaction, access: Access, needs: readonly Need[]) {
  const config = access.config, fields = await mutationFields(context, config.tables.materials)
  await mutationFields(context, config.tables.movements)
  const policy = await appReadPolicy(access.app, config.tables.materials, access.visitor, access.viewer!)
  const unit = fields.find(field => field.id === config.material.unit)
  const choices = unit?.type === 'single_select' ? unit.options.choices : []
  const result = new Map<string, Material>()
  for (const need of needs) {
    const material = await lockedRow(context, config.tables.materials, need.materialId)
    checkRow(material)
    const data = material.data as Record<string, unknown>
    if (!policy.canRead(data, material) || ![config.material.name, config.material.unit, config.stock!.materialStockFieldId].every(id => policy.readable.fields.has(id))) throw denied()
    const projected = policy.project(data, material), value = data[config.material.movements]
    if (value != null && (!Array.isArray(value) || value.some(id => typeof id !== 'string') || new Set(value).size !== value.length)) throw new RowWriteError('invalid', 'Проверьте журнал материала')
    const links = (value ?? []) as string[]
    const journal = links.length ? await context.tx.select().from(rows).where(and(eq(rows.tableId, config.tables.movements), inArray(rows.id, links))) : []
    let stock = Number(data[config.material.opening] ?? 0)
    if (journal.length !== links.length) throw new RowWriteError('invalid', 'В журнале материала отсутствует связанное движение')
    for (const movement of journal) {
      if (movement.deletedAt !== null) continue
      const values = movement.data as Record<string, unknown>, amount = Number(values[config.movement.qty])
      if (first(values[config.movement.material]) !== material.id || !Number.isFinite(amount)) throw new RowWriteError('invalid', 'Проверьте связь и количество движения материала')
      stock += amount
    }
    if (!Number.isFinite(stock) || Math.abs(stock) > Number.MAX_SAFE_INTEGER) throw new RowWriteError('invalid', 'Остаток материала некорректен')
    result.set(material.id, { id: material.id, name: String(projected[config.material.name] ?? 'Материал'), unit: choices.find(choice => choice.id === projected[config.material.unit])?.name ?? '', stock, links })
  }
  return result
}

export async function previewConnectedProduction(access: Access, productId: string, quantity: number): Promise<ConsumptionPreview> {
  if (typeof productId !== 'string' || !productId || productId.length > 200) throw new RowWriteError('invalid', 'Выберите изделие из каталога')
  quantityOf(quantity)
  const inventory = inventoryOf(access)
  return writeRows(access.app.workspaceId, async context => {
    await assertCurrentModuleState(context, access.app)
    await mutationFields(context, inventory.tables.items)
    await productOf(context, access, inventory, productId)
    const needs = await currentNeeds(context, access.config, productId, quantity), materials = await materialsOf(context, access, needs)
    const shortages = new Map(shortagesOf(needs, new Map([...materials].map(([id, material]) => [id, material.stock]))).map(value => [value.materialId, value.missing]))
    return { ok: true, lines: needs.map(need => ({ materialId: need.materialId, material: materials.get(need.materialId)!.name, unit: materials.get(need.materialId)!.unit, need: need.amount, stock: materials.get(need.materialId)!.stock, missing: shortages.get(need.materialId) ?? 0 })) }
  })
}

/** The director's manual raw-material movements retain decimal quantities and row restrictions. */
export async function saveConnectedMaterialMovement(access: Access, input: MovementInput): Promise<SavedMovement> {
  inventoryOf(access)
  const config = access.config, viewer = access.viewer!
  if (!input || !Number.isFinite(input.amount) || input.amount === 0 || Math.abs(input.amount) > Number.MAX_SAFE_INTEGER || typeof input.movementId !== 'string' || !input.movementId || input.movementId.length > 200 || typeof input.materialId !== 'string' || !input.materialId || input.materialId.length > 200 || typeof input.reason !== 'string' || input.reason.length > 10_000 || input.date !== null && (typeof input.date !== 'string' || input.date.length > 100)) throw new RowWriteError('invalid', 'Проверьте материал и количество движения')
  const writable = writableFields(access.app, config.tables.movements, access.visitor, 'create')
  if (![config.movement.material, config.movement.qty, config.movement.kind].every(id => writable.has(id)) || input.reason && !writable.has(config.movement.reason) || input.date && !writable.has(config.movement.date)) throw denied()
  return writeRows(access.app.workspaceId, async context => {
    await assertCurrentModuleState(context, access.app)
    const fields = await mutationFields(context, config.tables.movements), kind = fields.find(field => field.id === config.movement.kind)
    if (!input.kindId || input.kindId === config.movementKindId || kind?.type !== 'single_select' || !kind.options.choices.some(choice => choice.id === input.kindId)) throw new RowWriteError('invalid', 'Выберите приход, списание или корректировку материала; производство записывается при вводе выпуска')
    const date = fields.find(field => field.id === config.movement.date)
    if (!date) throw new RowWriteError('invalid', 'Поле даты движения отсутствует')
    let when: unknown
    try { when = parseCellValue(date, input.date ?? new Date().toISOString()) }
    catch { throw new RowWriteError('invalid', 'Проверьте дату движения') }
    const material = (await materialsOf(context, access, [{ materialId: input.materialId, amount: Math.abs(input.amount) }])).get(input.materialId)!
    const existing = await lockedRow(context, config.tables.movements, input.movementId)
    if (existing) {
      checkRow(existing)
      const data = existing.data as Record<string, unknown>
      if (existing.createdBy !== viewer.id || !material.links.includes(input.movementId) || first(data[config.movement.material]) !== input.materialId || data[config.movement.qty] !== input.amount || data[config.movement.kind] !== input.kindId || data[config.movement.reason] !== input.reason || input.date && data[config.movement.date] !== when || (data[config.movement.run] as unknown[] | undefined)?.length) throw new RowWriteError('conflict', 'Это движение уже сохранено с другими данными')
      return { ok: true, repeated: true, material: material.name, unit: material.unit, amount: input.amount, stock: material.stock }
    }
    const stock = material.stock + input.amount
    if (!Number.isFinite(stock) || Math.abs(stock) > Number.MAX_SAFE_INTEGER) throw new RowWriteError('invalid', 'Количество слишком велико для учёта материала')
    const values = stampOwner(rulesFor(access.app, config.tables.movements, access.visitor), viewer, { [config.movement.date]: when, [config.movement.material]: [input.materialId], [config.movement.kind]: input.kindId, [config.movement.qty]: input.amount, [config.movement.reason]: input.reason })
    if (!canAccessRow(rulesFor(access.app, config.tables.movements, access.visitor), viewer, values)) throw denied()
    const actor = { id: viewer.id, kind: 'app_user' }
    await createRow(context, config.tables.movements, values, actor, { id: input.movementId, origin: 'runtime' })
    await updateRow(context, config.tables.materials, input.materialId, { [config.material.movements]: [...material.links, input.movementId] }, actor, { guard: data => canAccessRow(rulesFor(access.app, config.tables.materials, access.visitor), viewer, data) })
    return { ok: true, repeated: false, material: material.name, unit: material.unit, amount: input.amount, stock }
  })
}

/** Run, frozen consumption, finished-goods receipt and retry ledger commit as one workspace write. */
export async function saveConnectedProduction(access: Access, input: ProductionInput): Promise<SavedProduction> {
  const inventory = inventoryOf(access), config = access.config, viewer = access.viewer!
  if (!input || typeof input !== 'object') throw new RowWriteError('invalid', 'Проверьте данные выпуска')
  quantityOf(input.quantity)
  if (!Number.isSafeInteger(input.defects) || input.defects < 0 || input.defects > 1_000_000) throw new RowWriteError('invalid', 'Укажите целое количество брака от 0 до 1 000 000')
  if (typeof input.runId !== 'string' || input.runId.length < 1 || input.runId.length > 200 || typeof input.productId !== 'string' || input.productId.length > 200 || typeof input.note !== 'string' || input.note.length > 10_000 || input.date !== null && (typeof input.date !== 'string' || input.date.length > 100) || input.shiftId !== null && (typeof input.shiftId !== 'string' || input.shiftId.length > 200)) throw new RowWriteError('invalid', 'Проверьте данные выпуска')
  const writable = writableFields(access.app, config.tables.production, access.visitor, 'create')
  if (![config.run.product, config.run.qty, config.run.defects].every(id => writable.has(id)) || input.note && !writable.has(config.run.note) || input.date && !writable.has(config.run.date) || input.shiftId && !writable.has(config.run.shift)) throw denied()
  const payloadHash = createHash('sha256').update(JSON.stringify([input.productId, input.quantity, input.defects, input.date, input.shiftId, input.note])).digest('hex')
  return writeRows(access.app.workspaceId, async context => {
    await assertCurrentModuleState(context, access.app)
    await mutationFields(context, config.tables.production)
    await mutationFields(context, inventory.tables.items)
    const product = await productOf(context, access, inventory, input.productId)
    const [saved] = await context.tx.select().from(productionStockRuns).where(and(eq(productionStockRuns.workspaceId, context.workspaceId), eq(productionStockRuns.productionTableId, config.tables.production), eq(productionStockRuns.runRowId, input.runId)))
    if (saved) {
      if (saved.actorId !== viewer.id || saved.payloadHash !== payloadHash) throw new RowWriteError('conflict', 'Этот выпуск уже сохранён с другими данными или другим сотрудником')
      const needs = saved.contract.materialMovements.map(movement => ({ materialId: movement.materialId, amount: movement.quantity }))
      const materials = await materialsOf(context, access, needs)
      const receipt = await lockedRow(context, saved.stockMovementTableId, saved.stockMovementRowId); checkRow(receipt)
      const data = receipt.data as Record<string, unknown>, ops = saved.contract.inventory.operations!
      return { ok: true, repeated: true, quantity: saved.outputQuantity, product: product.name, wrote: needs.map(need => ({ material: materials.get(need.materialId)!.name, amount: need.amount, unit: materials.get(need.materialId)!.unit })), stockReceipt: { quantity: saved.outputQuantity, ...(product.stockVisible ? { before: Number(data[ops.fields.before]), after: Number(data[ops.fields.after]) } : {}) } }
    }
    if (await lockedRow(context, config.tables.production, input.runId)) throw new RowWriteError('conflict', 'Этот идентификатор выпуска уже используется. Откройте новую форму.')
    const needs = await currentNeeds(context, config, input.productId, input.quantity), materials = await materialsOf(context, access, needs)
    const balance = await stockBalance(context, inventory, input.productId, product.row.data as Record<string, unknown>)
    const after = balance.stock + input.quantity
    if (!Number.isSafeInteger(after)) throw new RowWriteError('invalid', 'Количество слишком велико для складского учёта')
    const when = input.date ?? new Date().toISOString(), actor = { id: viewer.id, kind: 'production_stock' }
    const stockMovementId = newId('row'), materialMovements = needs.map(need => ({ id: newId('row'), materialId: need.materialId, quantity: need.amount }))
    const reason = `Выпуск: ${product.name}, ${input.quantity.toLocaleString('ru-RU')} шт.`
    await withProductionStockWrite(context, { production: config, inventory, runId: input.runId, productId: input.productId, stockMovementId, materialMovements, quantity: input.quantity }, async () => {
      const values = stampOwner(rulesFor(access.app, config.tables.production, access.visitor), viewer, {
        [config.run.date]: when, [config.run.product]: [input.productId], [config.run.qty]: input.quantity, [config.run.defects]: input.defects,
        ...(input.shiftId ? { [config.run.shift]: input.shiftId } : {}), ...(input.note ? { [config.run.note]: input.note } : {}),
      })
      if (!canAccessRow(rulesFor(access.app, config.tables.production, access.visitor), viewer, values)) throw denied()
      await createRow(context, config.tables.production, values, actor, { id: input.runId, origin: 'runtime' })
      for (const movement of materialMovements) {
        await createRow(context, config.tables.movements, { [config.movement.date]: when, [config.movement.material]: [movement.materialId], [config.movement.kind]: config.movementKindId, [config.movement.qty]: -movement.quantity, [config.movement.run]: [input.runId], [config.movement.reason]: reason }, actor, { id: movement.id, origin: 'runtime' })
        await updateRow(context, config.tables.materials, movement.materialId, (_fields, current) => {
          const data = current.data as Record<string, unknown>, links = (data[config.material.movements] ?? []) as string[]
          return { [config.material.movements]: [...links, movement.id] }
        }, actor, { guard: data => canAccessRow(rulesFor(access.app, config.tables.materials, access.visitor), viewer, data) })
      }
      const ops = inventory.operations!
      await createRow(context, inventory.tables.movements, { [inventory.movement.name]: reason, [inventory.movement.item]: [input.productId], [inventory.movement.qty]: input.quantity, [inventory.movement.date]: when, [inventory.movement.note]: `Выпуск ${input.runId}`, [inventory.movement.author]: viewer.email, [ops.fields.kind]: ops.kinds.receipt, [ops.fields.before]: balance.stock, [ops.fields.after]: after }, actor, { id: stockMovementId, origin: 'runtime' })
      const links = ((product.row.data as Record<string, unknown>)[inventory.item.movements] ?? []) as string[]
      await updateRow(context, inventory.tables.items, input.productId, { [inventory.item.movements]: [...links, stockMovementId] }, actor)
      await context.tx.insert(productionStockRuns).values({ workspaceId: context.workspaceId, productionTableId: config.tables.production, runRowId: input.runId, productTableId: inventory.tables.items, productRowId: input.productId, stockMovementTableId: inventory.tables.movements, stockMovementRowId: stockMovementId, actorId: viewer.id, payloadHash, outputQuantity: input.quantity, contract: { production: config, inventory, materialMovements: materialMovements.map(movement => ({ tableId: config.tables.movements, rowId: movement.id, materialId: movement.materialId, quantity: movement.quantity })) } })
    })
    return { ok: true, repeated: false, quantity: input.quantity, product: product.name, wrote: needs.map(need => ({ material: materials.get(need.materialId)!.name, amount: need.amount, unit: materials.get(need.materialId)!.unit })), stockReceipt: { quantity: input.quantity, ...(product.stockVisible ? { before: balance.stock, after } : {}) } }
  })
}
