import { attachments, db } from '@tableapp/db'
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { canReadAttachment } from '@/lib/file-access'
import { getFile } from '@/lib/storage'
import { fileDeliveryHeaders } from '@/lib/file-policy'
import { isBuilderV2LogoKey } from '@/lib/builder-v2-logo-types'

export async function GET(_request: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const { key: segments } = await params
  const key = segments.join('/')
  // Logos have their own public route; never serve them through the private file gate.
  if (isBuilderV2LogoKey(key)) return new NextResponse('Not found', { status: 404 })
  const [record] = await db.select().from(attachments).where(eq(attachments.key, key)).limit(1)
  if (!record || record.state !== 'ready' || record.scanStatus === 'infected') {
    return new NextResponse('Not found', { status: 404 })
  }
  const url = new URL(_request.url)
  const allowed = await canReadAttachment(record, {
    v2App: url.searchParams.has('v2App') ? url.searchParams.get('v2App') : undefined,
    business: url.searchParams.get('business') === '1',
  })
  // 404 (not 403) avoids leaking whether a key exists.
  if (!allowed) return new NextResponse('Not found', { status: 404 })
  const file = await getFile(key)
  if (!file) return new NextResponse('Not found', { status: 404 })
  const scrubbed = record.width != null && record.height != null
  return new NextResponse(file.body, { headers: fileDeliveryHeaders(record.name, file.mime, record.mime, { scrubbed }) })
}
