'use server'

import { revalidatePath } from 'next/cache'
import { handoffOrderDelivery, readOrderDelivery } from '@/lib/order-delivery'
import { RowWriteError } from '@/lib/row-mutations'

export async function readOrderDeliveryAction(tableId: string, rowId: string, slug?: string, business = false) {
  try { return { ok: true as const, state: await readOrderDelivery(tableId, rowId, slug, business) } }
  catch (error) { if (error instanceof RowWriteError) return { ok: false as const, error: error.message }; throw error }
}
export async function handoffOrderDeliveryAction(tableId: string, rowId: string, baseVersion: number, slug?: string, business = false) {
  try {
    const result = await handoffOrderDelivery(tableId, rowId, baseVersion, slug, business)
    if (slug) revalidatePath(`/a/${slug}`)
    revalidatePath(`/t/${tableId}`)
    return { ok: true as const, ...result }
  } catch (error) { if (error instanceof RowWriteError) return { ok: false as const, error: error.message }; throw error }
}
