'use server'

import { readCustomerHistory, type HistoryInput } from '@/lib/customer-history'
import { readCustomerDirectory, type DirectoryInput } from '@/lib/customer-directory'
import { RowWriteError } from '@/lib/row-mutations'

export async function readCustomerHistoryAction(input: HistoryInput, business = false) {
  try { return { ok: true as const, page: await readCustomerHistory(input, business) } }
  catch (error) { if (error instanceof RowWriteError) return { ok: false as const, error: error.message }; throw error }
}
export async function readCustomerDirectoryAction(input: DirectoryInput, business = false) {
  try { return { ok: true as const, page: await readCustomerDirectory(input, business) } }
  catch (error) { if (error instanceof RowWriteError) return { ok: false as const, error: error.message }; throw error }
}
