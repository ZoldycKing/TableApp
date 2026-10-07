import { cursorSchema, type SyncCursor } from '@tableapp/schema'
export { syncPayloadSchema, syncMutationSchema, type SyncCursor } from '@tableapp/schema'

export function encodeCursor(cursor: SyncCursor): string { return `v2.${Buffer.from(JSON.stringify(cursor)).toString('base64url')}` }
export function decodeCursor(value: string | null | undefined): SyncCursor | null {
  if (!value) return null
  if (!value.startsWith('v2.')) {
    if (!/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value))) throw new Error('Некорректный курсор')
    return null // Legacy timestamp cursors restart with a complete snapshot.
  }
  try { return cursorSchema.parse(JSON.parse(Buffer.from(value.slice(3), 'base64url').toString())) }
  catch { throw new Error('Некорректный курсор синхронизации') }
}

export const MAX_SYNC_BODY_BYTES = 1024 * 1024
