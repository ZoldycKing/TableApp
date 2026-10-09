import { rows, tables } from '@tableapp/db'
import type { App, CustomerWorkflow } from '@tableapp/schema'
import { and, eq, isNull } from 'drizzle-orm'
import { createRow, lockedRow, RowWriteError, type RowTransaction } from './row-mutations'
import type { RowAuthor } from './row-write'
import type { Transaction } from './db-transaction'
import { parseCustomerCart } from './customer-cart'

/** First and repeat orders use one transaction and the currently published catalog price. */
export async function createCustomerRecord(context: RowTransaction, app: App, config: CustomerWorkflow, values: Record<string, unknown>, author: RowAuthor, beforeInsert?: (tx: Transaction) => Promise<void>) {
  if (!author.viewer?.email) throw new RowWriteError('denied', 'Подтвердите почту перед оформлением')
  const email = author.viewer.email.trim().toLowerCase()
  const data = { ...values, [config.emailFieldId]: email, [config.statusFieldId]: config.initialStatus }
  if (config.createdFieldId) data[config.createdFieldId] = new Date().toISOString()
  const actor = { id: author.viewer.id, kind: 'app_user', ip: author.ip }
  const title = (await context.tx.select({ primary: tables.primaryFieldId }).from(tables).where(and(eq(tables.id, config.tableId), eq(tables.workspaceId, app.workspaceId))))[0]?.primary
  const catalog = config.catalog
  let orderId: string | undefined
  if (config.submissionFieldId) {
    const token = data[config.submissionFieldId]
    if (typeof token !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(token)) throw new RowWriteError('invalid', 'Обновите форму перед оформлением')
    orderId = `row_${token}`
    const existing = await lockedRow(context, config.tableId, orderId)
    if (existing) {
      if (existing.deletedAt || (existing.data as Record<string, unknown>)[config.emailFieldId] !== email) throw new RowWriteError('conflict', 'Обновите форму перед оформлением')
      return { id: existing.id }
    }
  }
  if (config.parent) {
    const selection = data[config.parent.relationFieldId]
    if (!Array.isArray(selection) || selection.length !== 1 || typeof selection[0] !== 'string') throw new RowWriteError('invalid', 'Выберите свой заказ')
    const parent = await lockedRow(context, config.parent.tableId, selection[0])
    if (!parent || parent.deletedAt || String((parent.data as Record<string, unknown>)[config.parent.emailFieldId] ?? '').trim().toLowerCase() !== email) throw new RowWriteError('denied', 'Можно обратиться только по своему заказу')
  }
  if (catalog?.selectionFieldId) {
    const selection = data[catalog.selectionFieldId]
    if (!Array.isArray(selection) || selection.length !== 1 || typeof selection[0] !== 'string') throw new RowWriteError('invalid', 'Выберите услугу или объект')
    const [source] = await context.tx.select().from(rows).where(and(eq(rows.tableId, catalog.tableId), eq(rows.id, selection[0]), isNull(rows.deletedAt))).for('share')
    const sourceData = source?.data as Record<string, unknown> | undefined
    if (!sourceData || sourceData[catalog.activeFieldId] !== true) throw new RowWriteError('invalid', 'Эта услуга или объект больше не принимает заявки. Выберите другой вариант.')
    if (title && !data[title]) data[title] = String(sourceData[catalog.titleFieldId] ?? 'Заявка')
  }
  if (config.cart && catalog) {
    const cart = config.cart
    let input
    try { input = parseCustomerCart(data[cart.fieldId]) } catch { throw new RowWriteError('invalid', 'Добавьте товары в корзину и проверьте количество') }
    if (orderId && orderId !== `row_${input.requestId}`) throw new RowWriteError('invalid', 'Обновите корзину перед оформлением')
    orderId = `row_${input.requestId}`
    const existing = await lockedRow(context, config.tableId, orderId)
    if (existing) {
      if (existing.deletedAt || (existing.data as Record<string, unknown>)[config.emailFieldId] !== email) throw new RowWriteError('conflict', 'Обновите корзину перед оформлением')
      return { id: existing.id }
    }
    const positions: string[] = []
    for (const item of input.items) {
      const [source] = await context.tx.select().from(rows).where(and(eq(rows.tableId, catalog.tableId), eq(rows.id, item.id), isNull(rows.deletedAt))).for('share')
      const product = source?.data as Record<string, unknown> | undefined
      const price = product?.[cart.priceFieldId]
      if (!product || product[catalog.activeFieldId] !== true) throw new RowWriteError('invalid', 'Один из товаров больше недоступен. Обновите корзину.')
      if (typeof price !== 'number' || !Number.isFinite(price) || price < 0 || !Number.isSafeInteger(Math.round(price * 100)) || price > 1_000_000_000) throw new RowWriteError('invalid', 'Цена товара не указана. Свяжитесь с бизнесом.')
      const position = await createRow(context, cart.itemsTableId, { [cart.nameFieldId]: String(product[catalog.titleFieldId] ?? 'Товар'), [cart.quantityFieldId]: item.qty,
        [cart.itemPriceFieldId]: price, [cart.itemEmailFieldId]: email, [cart.itemAssignmentFieldId]: '' }, actor, { origin: 'runtime' })
      positions.push(position.id)
    }
    data[cart.positionsFieldId] = positions
    delete data[cart.fieldId]
    if (title) data[title] = `Заказ · ${input.items.length} поз.`
  }
  if (title && !data[title]) data[title] = 'Новое обращение'
  // No caller can set lifecycle outcome, assignment or an agreed repair price.
  if (config.assignmentFieldId) delete data[config.assignmentFieldId]
  if (config.approval) delete data[config.approval.approvedPriceFieldId]
  return createRow(context, config.tableId, data, actor, { id: orderId, origin: 'runtime', beforeInsert })
}
