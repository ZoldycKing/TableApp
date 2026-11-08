'use server'

import { revalidatePath } from 'next/cache'
import { authorizeTable } from '@/lib/authorize'
import { isPlanLimitError } from '@/lib/limits'
import { RowWriteError } from '@/lib/row-mutations'
import { commitEditorRows, EditorWriteError } from '@/lib/table-editor-write'
import type { EditorResult, EditorRowWrite } from '@/lib/table-editor-values'
import { loadTable, type LoadedTable } from '@/lib/queries'
import { editorPageRequestSchema } from '@/lib/table-page'

export async function loadTablePageAction(tableId: string, input: unknown): Promise<{ ok: true; table: LoadedTable } | { ok: false; error: string }> {
  if (typeof tableId !== 'string' || !tableId || tableId.length > 128) return { ok: false, error: 'Таблица не найдена.' }
  const auth = await authorizeTable(tableId, false)
  if (!auth.ok) return auth
  const parsed = editorPageRequestSchema.safeParse(input)
  if (!parsed.success || JSON.stringify(input).length > 64_000) return { ok: false, error: 'Проверьте параметры поиска и страницы.' }
  try {
    const table = await loadTable(tableId, auth.member.workspaceId, auth.member, parsed.data)
    return table ? { ok: true, table } : { ok: false, error: 'Таблица не найдена.' }
  } catch { return { ok: false, error: 'Не удалось загрузить строки. Повторите попытку.' } }
}

export async function saveTableRowsAction(tableId: string, writes: EditorRowWrite[]): Promise<EditorResult> {
  if (typeof tableId !== 'string' || !tableId || tableId.length > 128) return { ok: false, error: 'Таблица не найдена.' }
  const auth = await authorizeTable(tableId)
  if (!auth.ok) return auth
  try { await commitEditorRows(auth.member.workspaceId, tableId, writes, { id: auth.member.userId, kind: 'member' }) }
  catch (error) {
    if (error instanceof EditorWriteError) return { ok: false, error: error.message, rowId: error.rowId, fieldId: error.fieldId }
    if (error instanceof RowWriteError || isPlanLimitError(error)) return { ok: false, error: error.message }
    throw error
  }
  revalidatePath('/t/[tableId]', 'page')
  return { ok: true }
}
