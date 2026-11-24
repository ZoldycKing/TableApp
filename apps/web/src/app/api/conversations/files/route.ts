import { NextResponse } from 'next/server'
import { discardConversationUpload, prepareConversationUpload } from '@/lib/conversations'
import { storeAttachment } from '@/lib/file-upload'
import { MAX_FILE_BYTES, MAX_FILE_MB, validateFileContent, validateFileMetadata } from '@/lib/file-policy'
import { RowWriteError } from '@/lib/row-mutations'
import { isPlanLimitError } from '@/lib/limits'
import { explainToCustomer } from '@tableapp/schema'

export async function POST(request: Request) {
  try {
    if (Number(request.headers.get('content-length')) > MAX_FILE_BYTES + 65536) {
      return NextResponse.json({ ok: false, error: `Файл больше ${MAX_FILE_MB} МБ` }, { status: 413 })
    }
    const form = await request.formData(), file = form.get('file'), slug = form.get('slug'), tableId = form.get('tableId'), rowId = form.get('rowId')
    if (!(file instanceof File) || typeof slug !== 'string' || typeof tableId !== 'string' || typeof rowId !== 'string') return NextResponse.json({ ok: false, error: 'Файл или обращение не указаны' }, { status: 400 })
    const error = validateFileMetadata(file)
    if (error) return NextResponse.json({ ok: false, error }, { status: 400 })
    const mode = form.get('business')
    if (mode !== null && mode !== 'true' && mode !== 'false') return NextResponse.json({ ok: false, error: 'Некорректный режим загрузки' }, { status: 400 })
    const context = await prepareConversationUpload(slug, tableId, rowId, mode === 'true')
    const bytes = new Uint8Array(await file.arrayBuffer()), contentError = validateFileContent({ name: file.name, type: file.type, bytes })
    if (contentError) return NextResponse.json({ ok: false, error: contentError }, { status: 400 })
    const attachment = await storeAttachment(context.workspaceId, context.uploadedBy, context.origin, { name: file.name, type: file.type, bytes }, context.conversationId)
    return NextResponse.json({ ok: true, attachment }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    if (error instanceof RowWriteError) return NextResponse.json({ ok: false, error: error.message }, { status: error.code === 'invalid' ? 400 : 403 })
    if (isPlanLimitError(error)) return NextResponse.json({ ok: false, error: explainToCustomer() }, { status: 413 })
    return NextResponse.json({ ok: false, error: 'Не удалось сохранить файл. Попробуйте ещё раз' }, { status: 503 })
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json() as {
      fileId?: unknown
      slug?: unknown
      tableId?: unknown
      rowId?: unknown
      business?: unknown
    }
    const { fileId, slug, tableId, rowId, business } = body
    if (typeof fileId !== 'string' || typeof slug !== 'string' || typeof tableId !== 'string' || typeof rowId !== 'string') {
      return NextResponse.json({ ok: false, error: 'Файл или обращение не указаны' }, { status: 400 })
    }
    if (business !== undefined && business !== true && business !== false) {
      return NextResponse.json({ ok: false, error: 'Некорректный режим загрузки' }, { status: 400 })
    }
    await discardConversationUpload(slug, tableId, rowId, fileId, business === true)
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    if (error instanceof RowWriteError) return NextResponse.json({ ok: false, error: error.message }, { status: error.code === 'invalid' ? 400 : 403 })
    return NextResponse.json({ ok: false, error: 'Не удалось удалить файл. Попробуйте ещё раз' }, { status: 503 })
  }
}
