import { attachments, db } from '@tableapp/db'
import type { Attachment, Field } from '@tableapp/schema'
import { and, eq, inArray } from 'drizzle-orm'

/**
 * Привязка загруженных файлов к ячейке.
 *
 * Ссылка нужна не для учёта, а для прав: по файлу находится строка, и доступ
 * к файлу решается тем же правилом, что доступ к строке. Неугадываемый ключ —
 * это не право доступа.
 */

export const ATTACHMENT_FIELD_TYPES = new Set(['attachment', 'image'])

export function isAttachmentField(field: Field): boolean {
  return ATTACHMENT_FIELD_TYPES.has(field.type)
}

function keysOf(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => (item && typeof item === 'object' ? (item as Attachment).key : null))
    .filter((key): key is string => typeof key === 'string' && key.length > 0)
}

type Target = { tableId: string; rowId: string; fieldId: string }

/** Отмечает файлы ячейки использованными, а выброшенные — свободными. */
export async function linkAttachments(target: Target, value: unknown): Promise<void> {
  const keys = keysOf(value)

  // Файлы, которые раньше были в этой ячейке, а теперь нет, освобождаются:
  // уборщик сможет удалить их из хранилища.
  const previous = await db
    .select({ id: attachments.id, key: attachments.key })
    .from(attachments)
    .where(and(eq(attachments.rowId, target.rowId), eq(attachments.fieldId, target.fieldId)))

  const removed = previous.filter((item) => !keys.includes(item.key)).map((item) => item.id)
  if (removed.length > 0) {
    await db
      .update(attachments)
      .set({ referenced: false, tableId: null, rowId: null, fieldId: null })
      .where(inArray(attachments.id, removed))
  }

  if (keys.length > 0) {
    await db
      .update(attachments)
      .set({ referenced: true, tableId: target.tableId, rowId: target.rowId, fieldId: target.fieldId })
      .where(inArray(attachments.key, keys))
  }
}

/** Привязка всех файловых полей строки сразу — при создании записи. */
export async function linkRowAttachments(
  tableId: string,
  rowId: string,
  fields: readonly Field[],
  data: Record<string, unknown>,
): Promise<void> {
  for (const field of fields) {
    if (!isAttachmentField(field)) continue
    const value = data[field.id]
    if (keysOf(value).length === 0) continue
    await linkAttachments({ tableId, rowId, fieldId: field.id }, value)
  }
}
