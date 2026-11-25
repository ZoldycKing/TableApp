'use server'

import { rows } from '@tableapp/db'
import { INVENTORY_OPERATIONS, type InventoryOperation } from '@tableapp/schema'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { currentAppAccess } from '@/lib/app-session'
import { canOpenScreen, canSeePart } from '@/lib/app-roles'
import { loadApp } from '@/lib/app-write-access'
import { loadPublishedApp } from '@/lib/app-runtime'
import { assertCurrentModuleState, createRow, updateRow, lockedRow, RowWriteError, writeRows } from '@/lib/row-mutations'
import { isPlanLimitError } from '@/lib/limits'
import { INVENTORY_COPY, inventoryScreen } from '@/lib/inventory'
import { orderStockPair } from '@/lib/order-stock-config'
import { stockBalance } from '@/lib/order-stock-store'

export type ReceiptInput = { id: string; itemId: string; quantity: number; note: string; baseVersion?: number }
export type SavedReceipt = { ok: true; name: string; before: number; quantity: number; after: number; repeated: boolean; operation?: InventoryOperation; legacyRepeat?: boolean }

export async function receiveStockAction(slug: string, input: ReceiptInput): Promise<SavedReceipt | { ok: false; error: string }> {
  return saveStockOperationAction(slug, 'receipt', input)
}

/** Signed movement, snapshots and reverse link commit together under the stock lock. */
export async function saveStockOperationAction(slug: string, operation: InventoryOperation, input: ReceiptInput): Promise<SavedReceipt | { ok: false; error: string }> {
  if (!INVENTORY_OPERATIONS.includes(operation)) return { ok: false, error: 'Неизвестная складская операция' }
  const app = await loadApp(slug), config = app?.inventory
  if (!app || !config || (operation !== 'receipt' && !config.operations)) return { ok: false, error: 'Складская операция не настроена' }
  const copy = INVENTORY_COPY[operation], ops = config.operations
  const { visitor, viewer } = await currentAppAccess(app)
  const screen = app.screens.find(s => s.id === inventoryScreen(config, operation))
  // Permission on another movement must not grant this specific operation.
  const writable = new Set(screen?.type === 'form' ? screen.components.filter(c => c.type === 'form_field' && canSeePart(c, visitor)).map(c => c.type === 'form_field' ? c.fieldId : '') : [])
  if (!visitor.authenticated || !viewer || !screen || !canOpenScreen(screen, visitor) ||
      !writable.has(config.movement.qty) || !writable.has(config.movement.item)) return { ok: false, error: `${copy.name} вам недоступна` }
  if (typeof input?.id !== 'string' || !/^row_[a-zA-Z0-9_-]{8,64}$/.test(input.id) ||
      typeof input.itemId !== 'string' || !Number.isSafeInteger(input.quantity) || input.quantity < (operation === 'stocktake' ? 0 : 1) || input.quantity > 1_000_000 ||
      typeof input.note !== 'string' || input.note.length > 2000) return { ok: false, error: `Укажите целое количество от ${operation === 'stocktake' ? 0 : 1} до 1 000 000 и комментарий до 2000 символов` }
  if (input.note && !writable.has(config.movement.note)) return { ok: false, error: 'Комментарий вам недоступен' }
  if (copy.reason && !input.note.trim()) return { ok: false, error: 'Укажите причину операции' }
  if (operation === 'stocktake' && (!Number.isSafeInteger(input.baseVersion) || input.baseVersion! < 0)) return { ok: false, error: 'Откройте инвентаризацию из карточки товара заново' }
  // Screen permission already gates this action. Load the referenced product
  // through the actor's projection so invisible catalog rows stay unavailable,
  // then apply the journal link as a trusted workflow write (not a generic
  // client update that would require owning the product row).
  const runtime = await loadPublishedApp(slug, visitor)
  const item = runtime?.tables[config.tables.items]?.rows.find(row => row.id === input.itemId)
  if (!item) return { ok: false, error: 'Товар недоступен' }
  const name = String(item.data[config.item.name] ?? 'Товар'), actor = { id: viewer.id, kind: 'app_user' }
  try {
    const saved = await writeRows(app.workspaceId, async context => {
      await assertCurrentModuleState(context, app)
      const current = await lockedRow(context, config.tables.items, input.itemId)
      if (!current || current.deletedAt) throw new RowWriteError('denied', 'Товар недоступен')
      const currentData = current.data as Record<string, unknown>, links = currentData[config.item.movements]
      const ids = Array.isArray(links) ? links.filter((id): id is string => typeof id === 'string') : []
      const journal = await context.tx.select({ id: rows.id, data: rows.data }).from(rows)
        .where(and(eq(rows.tableId, config.tables.movements), isNull(rows.deletedAt), inArray(rows.id, [...ids, input.id])))
      const linked = new Set(ids)
      const before = Number(currentData[config.item.opening] ?? 0) + journal.reduce((sum, row) => linked.has(row.id) ? sum + Number((row.data as Record<string, unknown>)[config.movement.qty] ?? 0) : sum, 0)
      if (!Number.isSafeInteger(before) || before < 0) throw new RowWriteError('invalid', 'Остаток некорректен. Владелец должен проверить начальный запас и журнал движений.')
      const existing = journal.find(row => row.id === input.id)
      if (existing) {
        const data = existing.data as Record<string, unknown>
        const kind = ops ? data[ops.fields.kind] ?? ops.kinds.receipt : null
        const sameQuantity = operation === 'stocktake' ? ops && data[ops.fields.after] === input.quantity : data[config.movement.qty] === copy.sign * input.quantity
        if (!linked.has(existing.id) || !Array.isArray(data[config.movement.item]) || !(data[config.movement.item] as string[]).includes(input.itemId) ||
            !sameQuantity || (ops && kind !== ops.kinds[operation]) || data[config.movement.author] !== viewer.email || data[config.movement.note] !== input.note) throw new RowWriteError('conflict', 'Эта операция уже сохранена с другими данными')
        const originalBefore = ops ? data[ops.fields.before] : null, originalAfter = ops ? data[ops.fields.after] : null
        return { before: typeof originalBefore === 'number' ? originalBefore : before - Number(data[config.movement.qty]), after: typeof originalAfter === 'number' ? originalAfter : before,
          repeated: true, legacyRepeat: typeof originalBefore !== 'number' || typeof originalAfter !== 'number' }
      }
      if (operation === 'stocktake' && current.version !== input.baseVersion) throw new RowWriteError('conflict', 'После открытия формы товар изменился. Откройте инвентаризацию заново и проверьте фактическое количество.')
      const delta = operation === 'stocktake' ? input.quantity - before : copy.sign * input.quantity
      const after = before + delta
      if (after < 0) throw new RowWriteError('invalid', `Недостаточно товара: доступно ${before} шт., запрошено ${input.quantity} шт.`)
      if (!Number.isSafeInteger(after)) throw new RowWriteError('invalid', 'Количество слишком велико для складского учёта')
      if (orderStockPair(app)) {
        const held = await stockBalance(context, config, input.itemId, currentData)
        if (after < held.reserved) throw new RowWriteError('invalid', `Свободно ${held.available} шт. Ещё ${held.reserved} шт. закреплены за заказами — их нельзя выдать или списать отдельно.`)
      }
      const movement = {
        [config.movement.name]: `${copy.name} · ${String(currentData[config.item.name] ?? name)}`,
        [config.movement.item]: [input.itemId], [config.movement.qty]: delta,
        [config.movement.date]: new Date().toISOString(), [config.movement.note]: input.note,
        [config.movement.author]: viewer.email,
        ...(ops ? { [ops.fields.kind]: ops.kinds[operation], [ops.fields.before]: before, [ops.fields.after]: after } : {}),
      }
      // Workflow write: movement + item journal link are server-authored side
      // effects of an authorized stock operation — not generic client row edits.
      await createRow(context, config.tables.movements, movement, actor, { id: input.id, origin: 'runtime' })
      await updateRow(context, config.tables.items, input.itemId, { [config.item.movements]: [...new Set([...ids, input.id])] }, actor)
      return { before, after, repeated: false }
    })
    revalidatePath(`/a/${slug}`)
    return { ok: true, name, quantity: input.quantity, operation, ...saved }
  } catch (error) {
    if (error instanceof RowWriteError || isPlanLimitError(error)) return { ok: false, error: error.message }
    throw error
  }
}
