'use server'

import { revalidatePath } from 'next/cache'
import { confirmOrderStock, issueOrderStock, readOrderStock } from '@/lib/order-stock'
import { readInventoryBalance } from '@/lib/inventory-balance'
import { RowWriteError } from '@/lib/row-mutations'
import { isPlanLimitError } from '@/lib/limits'
const message = (error: unknown) => error instanceof RowWriteError || isPlanLimitError(error) ? error.message : 'Не удалось обработать складской заказ. Повторите попытку.'
export async function readOrderStockAction(tableId: string, rowId: string, slug?: string, business = false) {
  try { return { ok: true as const, state: await readOrderStock(tableId, rowId, slug, business) } }
  catch (error) { return { ok: false as const, error: message(error) } }
}
export async function readInventoryBalanceAction(tableId: string, rowId: string, slug?: string, business = false) {
  try { return { ok: true as const, state: await readInventoryBalance(tableId, rowId, slug, business) } }
  catch (error) { return { ok: false as const, error: message(error) } }
}
export async function confirmOrderStockAction(tableId: string, rowId: string, version: number, slug?: string, business = false) {
  try { const value = await confirmOrderStock(tableId, rowId, version, slug, business); if (slug) revalidatePath(`/a/${slug}`); revalidatePath(`/t/${tableId}`); return { ok: true as const, value } }
  catch (error) { return { ok: false as const, error: message(error) } }
}
export async function issueOrderStockAction(tableId: string, rowId: string, version: number, slug?: string, business = false) {
  try { const value = await issueOrderStock(tableId, rowId, version, slug, business); if (slug) revalidatePath(`/a/${slug}`); revalidatePath(`/t/${tableId}`); return { ok: true as const, value } }
  catch (error) { return { ok: false as const, error: message(error) } }
}
