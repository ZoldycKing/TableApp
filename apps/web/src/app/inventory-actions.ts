'use server'

import { rows } from '@tableapp/db'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { currentAppAccess } from '@/lib/app-session'
import { canOpenScreen, writableFields } from '@/lib/app-roles'
import { loadApp } from '@/lib/app-write-access'
import { loadPublishedApp } from '@/lib/app-runtime'
import { canAccessRow, rulesFor } from '@/lib/row-access'
import { createRow, updateRow, lockedRow, RowWriteError, writeRows } from '@/lib/row-mutations'
import { isPlanLimitError } from '@/lib/limits'

export type ReceiptInput = { id: string; itemId: string; quantity: number; note: string }
export type SavedReceipt = { ok: true; name: string; before: number; quantity: number; after: number; repeated: boolean }

/** Receipt and reverse relation commit together; the journal is the source of stock. */
export async function receiveStockAction(slug: string, input: ReceiptInput): Promise<SavedReceipt | { ok: false; error: string }> {
  const app = await loadApp(slug)
  const config = app?.inventory
  if (!app || !config) return { ok: false, error: 'Приёмка не настроена' }
  const { visitor, viewer } = await currentAppAccess(app)
  const screen = app.screens.find(s => s.id === config.receiptScreenId)
  const writable = writableFields(app, config.tables.movements, visitor, 'create')
  if (!visitor.authenticated || !viewer || !screen || !canOpenScreen(screen, visitor) ||
      !writable.has(config.movement.qty) || !writable.has(config.movement.item)) return { ok: false, error: 'Приёмка вам недоступна' }
  if (typeof input?.id !== 'string' || !/^row_[a-zA-Z0-9_-]{8,64}$/.test(input.id) ||
      typeof input.itemId !== 'string' || !Number.isSafeInteger(input.quantity) || input.quantity < 1 || input.quantity > 1_000_000 ||
      typeof input.note !== 'string' || input.note.length > 2000) return { ok: false, error: 'Укажите целое количество от 1 до 1 000 000 и комментарий до 2000 символов' }
  if (input.note && !writable.has(config.movement.note)) return { ok: false, error: 'Комментарий вам недоступен' }
  const runtime = await loadPublishedApp(slug, visitor)
  const item = runtime?.tables[config.tables.items]?.rows.find(row => row.id === input.itemId)
  if (!item) return { ok: false, error: 'Товар недоступен' }
  const name = String(item.data[config.item.name] ?? 'Товар')
  const actor = { id: viewer.id, kind: 'app_user' }
  const rules = rulesFor(app, config.tables.items, visitor)
  try {
    const saved = await writeRows(app.workspaceId, async context => {
      let before = 0, after = 0
      const current = await lockedRow(context, config.tables.items, input.itemId)
      if (!current || current.deletedAt || !canAccessRow(rules, viewer, current.data as Record<string, unknown>)) throw new RowWriteError('denied', 'Товар недоступен')
      const links = (current.data as Record<string, unknown>)[config.item.movements]
      const ids = Array.isArray(links) ? links.filter((id): id is string => typeof id === 'string') : []
      const journal = await context.tx.select({ id: rows.id, data: rows.data }).from(rows)
        .where(and(eq(rows.tableId, config.tables.movements), isNull(rows.deletedAt), inArray(rows.id, [...ids, input.id])))
      const linked = new Set(ids)
      before = Number((current.data as Record<string, unknown>)[config.item.opening] ?? 0) + journal.reduce((sum, row) => linked.has(row.id) ? sum + Number((row.data as Record<string, unknown>)[config.movement.qty] ?? 0) : sum, 0)
      const existing = journal.find(row => row.id === input.id)
      if (existing) {
        const data = existing.data as Record<string, unknown>
        if (!Array.isArray(data[config.movement.item]) || !(data[config.movement.item] as string[]).includes(input.itemId) ||
            data[config.movement.qty] !== input.quantity || data[config.movement.author] !== viewer.email || data[config.movement.note] !== input.note) throw new RowWriteError('conflict', 'Эта приёмка уже сохранена с другими данными')
        return { before: before - input.quantity, after: before, repeated: true }
      }
      await createRow(context, config.tables.movements, {
        [config.movement.name]: `Приёмка · ${name}`,
        [config.movement.item]: [input.itemId], [config.movement.qty]: input.quantity,
        [config.movement.date]: new Date().toISOString(), [config.movement.note]: input.note,
        [config.movement.author]: viewer.email,
      }, actor, { id: input.id, origin: 'runtime' })
      await updateRow(context, config.tables.items, input.itemId, { [config.item.movements]: [...new Set([...ids, input.id])] }, actor,
        { guard: data => canAccessRow(rules, viewer, data) })
      after = before + input.quantity
      return { before, after, repeated: false }
    })
    revalidatePath(`/a/${slug}`)
    return { ok: true, name, quantity: input.quantity, ...saved }
  } catch (error) {
    if (error instanceof RowWriteError || isPlanLimitError(error)) return { ok: false, error: error.message }
    throw error
  }
}
