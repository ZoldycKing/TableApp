import { apps, db } from '@tableapp/db'
import { appSchema } from '@tableapp/schema'
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { canSubmitFiles } from '@/lib/app-roles'
import { currentAppAccess } from '@/lib/app-session'
import { canEdit, currentMember } from '@/lib/session'
import { isPlanLimitError, type Origin } from '@/lib/limits'
import { explainToCustomer } from '@tableapp/schema'
import { storeAttachment } from '@/lib/file-upload'
import { validateFileContent, validateFileMetadata } from '@/lib/file-policy'
import { validateAppReferences } from '@/lib/app-references'

/**
 * Загрузка файла. Работает для двух контуров: участник команды грузит в свой
 * воркспейс, пользователь приложения — в воркспейс этого приложения.
 */
export async function POST(request: Request) {
  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ ok: false, error: 'Не удалось прочитать файл' }, { status: 400 })
  }
  const file = form.get('file')
  const appId = form.get('appId')
  if (appId !== null && (typeof appId !== 'string' || appId.length > 160)) return NextResponse.json({ ok: false, error: 'Некорректное приложение' }, { status: 400 })

  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: 'Файл не передан' }, { status: 400 })
  }

  let workspaceId: string | null = null
  let uploadedBy: string | null = null
  /*
   * Кто грузит. Владельцу отказывают на самом потолке — он видит страницу
   * расхода и может решить вопрос. Клиенту приложения даётся запас: человек,
   * у которого кончилось место, не должен узнавать об этом от потерянного
   * клиента, приложившего фотографию к заявке.
   */
  let origin: Origin = 'manual'

  const member = await currentMember()
  if (typeof appId === 'string' && appId) {
    const [record] = await db.select().from(apps).where(eq(apps.id, appId)).limit(1)
    if (!record) return NextResponse.json({ ok: false, error: 'Приложение не найдено' }, { status: 404 })
    if (member?.workspaceId === record.workspaceId && canEdit(member)) {
      workspaceId = record.workspaceId
      uploadedBy = member.userId
    }
  }
  if (member && !appId) {
    if (!canEdit(member)) {
      return NextResponse.json({ ok: false, error: 'У вас права только на просмотр' }, { status: 403 })
    }
    workspaceId = member.workspaceId
    uploadedBy = member.userId
  } else if (!workspaceId && typeof appId === 'string' && appId) {
    const [record] = await db.select().from(apps).where(eq(apps.id, appId)).limit(1)
    const parsed = record?.published ? appSchema.safeParse(record.published) : null
    if (!record || !parsed?.success) {
      return NextResponse.json({ ok: false, error: 'Приложение не опубликовано' }, { status: 404 })
    }
    /*
     * Файл принимается только от того, кому в этом приложении открыта хоть одна
     * форма. Иначе хранилище фирмы — открытая дверь: приложение публичное
     * само по себе не значит, что в него можно грузить что попало.
     */
    const app = { ...parsed.data, id: record.id, workspaceId: record.workspaceId }
    if (await validateAppReferences(app)) {
      return NextResponse.json({ ok: false, error: 'Приложение содержит некорректные ссылки' }, { status: 403 })
    }
    const { visitor, viewer } = await currentAppAccess(app)
    if (!viewer || !canSubmitFiles(app, visitor)) {
      return NextResponse.json({ ok: false, error: 'Загрузка файлов недоступна' }, { status: 403 })
    }
    uploadedBy = viewer?.id ?? null
    workspaceId = record.workspaceId
    origin = 'runtime'
  }

  if (!workspaceId || !uploadedBy) {
    return NextResponse.json({ ok: false, error: 'Нужно войти' }, { status: 401 })
  }

  const metadataError = validateFileMetadata(file)
  if (metadataError) return NextResponse.json({ ok: false, error: metadataError }, { status: 400 })
  const bytes = new Uint8Array(await file.arrayBuffer())
  const contentError = validateFileContent({ name: file.name, type: file.type, bytes })
  if (contentError) return NextResponse.json({ ok: false, error: contentError }, { status: 400 })

  try {
    const attachment = await storeAttachment(workspaceId, uploadedBy, origin, { name: file.name, type: file.type, bytes })
    return NextResponse.json({ ok: true, attachment }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    if (isPlanLimitError(error)) return NextResponse.json({ ok: false,
      error: origin === 'runtime' ? explainToCustomer() : error.message }, { status: 413 })
    return NextResponse.json({ ok: false, error: 'Не удалось сохранить файл. Попробуйте ещё раз' }, { status: 503 })
  }
}
