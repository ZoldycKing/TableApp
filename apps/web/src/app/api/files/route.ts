import { apps, attachments, db } from '@tableapp/db'
import { appSchema, newId } from '@tableapp/schema'
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { canSubmitFiles } from '@/lib/app-roles'
import { currentAppAccess } from '@/lib/app-session'
import { canEdit, currentMember } from '@/lib/session'
import { mayIncrease, type Origin } from '@/lib/limits'
import { explainToCustomer } from '@tableapp/schema'
import { putFile } from '@/lib/storage'

/**
 * Загрузка файла. Работает для двух контуров: участник команды грузит в свой
 * воркспейс, пользователь приложения — в воркспейс этого приложения.
 */
export async function POST(request: Request) {
  const form = await request.formData()
  const file = form.get('file')
  const appId = form.get('appId')

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
  if (member) {
    if (!canEdit(member)) {
      return NextResponse.json({ ok: false, error: 'У вас права только на просмотр' }, { status: 403 })
    }
    workspaceId = member.workspaceId
    uploadedBy = member.userId
  } else if (typeof appId === 'string' && appId) {
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
    const { visitor, viewer } = await currentAppAccess(parsed.data)
    if (!canSubmitFiles(parsed.data, visitor)) {
      return NextResponse.json({ ok: false, error: 'Загрузка файлов недоступна' }, { status: 403 })
    }
    uploadedBy = viewer?.id ?? null
    workspaceId = record.workspaceId
    origin = 'runtime'
  }

  if (!workspaceId) {
    return NextResponse.json({ ok: false, error: 'Нужно войти' }, { status: 401 })
  }

  /*
   * Место проверяем до записи в хранилище: положить файл и потом сказать
   * «не поместилось» значит оставить мусор, за который человек же и платит.
   */
  const allowed = await mayIncrease({
    workspaceId,
    resource: 'fileBytes',
    amount: file.size,
    origin,
  })
  if (!allowed.ok) {
    return NextResponse.json(
      { ok: false, error: origin === 'runtime' ? explainToCustomer() : allowed.error },
      { status: 413 },
    )
  }

  const bytes = new Uint8Array(await file.arrayBuffer())
  const result = await putFile(workspaceId, { name: file.name, type: file.type, bytes })
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 400 })

  const { stored } = result
  await db.insert(attachments).values({
    id: newId('attachment'),
    workspaceId,
    key: stored.key,
    name: stored.name,
    mime: stored.mime,
    size: stored.size,
    uploadedBy,
    referenced: false,
  })

  // Возвращаем значение ячейки в том виде, в котором оно хранится в строке.
  return NextResponse.json({
    ok: true,
    attachment: {
      id: newId('attachment'),
      key: stored.key,
      name: stored.name,
      mime: stored.mime,
      size: stored.size,
      width: null,
      height: null,
    },
  })
}
