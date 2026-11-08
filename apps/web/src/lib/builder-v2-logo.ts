import { attachments } from '@tableapp/db'
import type { AppV2 } from '@tableapp/schema/app-v2'
import { and, eq, isNull } from 'drizzle-orm'
import { belongsToBuilderV2Logo, BUILDER_V2_LOGO_MIME } from './builder-v2-logo-types'
import type { Transaction } from './db-transaction'

export async function findBuilderV2Logo(tx: Pick<Transaction, 'select'>, workspaceId: string, appId: string, key: string, lock = false) {
  if (!belongsToBuilderV2Logo(key, workspaceId, appId)) return null
  const query = tx.select({ name: attachments.name, mime: attachments.mime }).from(attachments).where(and(
    eq(attachments.key, key), eq(attachments.workspaceId, workspaceId), eq(attachments.state, 'ready'),
    isNull(attachments.tableId), isNull(attachments.rowId), isNull(attachments.fieldId),
    isNull(attachments.conversationId), isNull(attachments.messageId),
  )).limit(1)
  const [file] = await (lock ? query.for('share') : query)
  return file && BUILDER_V2_LOGO_MIME.some(mime => mime === file.mime) ? file : null
}

export async function validateBuilderV2Logo(tx: Transaction, app: AppV2) {
  const key = app.theme.logoKey
  return !key || await findBuilderV2Logo(tx, app.workspaceId, app.id, key, true)
    ? null : 'Логотип недоступен. Загрузите его заново или удалите.'
}
