import { apps, attachments, db, rows } from '@tableapp/db'
import { appSchema } from '@tableapp/schema'
import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { appReadPolicy } from '@/lib/app-read-policy'
import { canSubmitFiles } from '@/lib/app-roles'
import { currentAppAccess } from '@/lib/app-session'
import { currentMember } from '@/lib/session'
import { getFile } from '@/lib/storage'
import { validateAppReferences } from '@/lib/app-references'
import { fileDeliveryHeaders } from '@/lib/file-policy'
import { canReadConversationFile } from '@/lib/conversations'

export async function GET(_request: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const { key: segments } = await params
  const key = segments.join('/')
  const [record] = await db.select().from(attachments).where(eq(attachments.key, key)).limit(1)
  if (!record || record.state !== 'ready') return new NextResponse('Not found', { status: 404 })
  const member = await currentMember()
  let allowed = record.conversationId || record.messageId ? await canReadConversationFile(record, new URL(_request.url).searchParams.get('business') === '1') : member?.workspaceId === record.workspaceId
  if (!allowed && !record.conversationId && !record.messageId) {
    const published = await db.select().from(apps).where(eq(apps.workspaceId, record.workspaceId))
    for (const candidate of published) {
      const parsed = candidate.published ? appSchema.safeParse(candidate.published) : null
      if (!parsed?.success) continue
      const app = { ...parsed.data, id: candidate.id, workspaceId: candidate.workspaceId }
      if (await validateAppReferences(app)) continue
      const { visitor, viewer } = await currentAppAccess(app)
      if (!record.tableId && !record.rowId && !record.fieldId) {
        // Only its uploader can preview a file before the form is saved.
        if (viewer && record.uploadedBy === viewer.id && canSubmitFiles(app, visitor)) allowed = true
      } else if (record.tableId && record.rowId && record.fieldId) {
        const policy = await appReadPolicy(app, record.tableId, visitor, viewer)
        if (!policy.readable.fields.has(record.fieldId)) continue
        const [row] = await db.select().from(rows)
          .where(and(eq(rows.id, record.rowId), eq(rows.tableId, record.tableId))).limit(1)
        if (!row || row.deletedAt !== null) continue
        const data = row.data as Record<string, unknown>
        const cell = data[record.fieldId]
        const linked = Array.isArray(cell) && cell.some((file) => file && typeof file === 'object' && file.key === key)
        if (linked && policy.canRead(data, row)) allowed = true
      }
      if (allowed) break
    }
  }
  if (!allowed) return new NextResponse('Forbidden', { status: 403 })
  const file = await getFile(key)
  if (!file) return new NextResponse('Not found', { status: 404 })
  return new NextResponse(file.body, { headers: fileDeliveryHeaders(record.name, file.mime, record.mime) })
}
