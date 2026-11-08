'use server'

import { randomBytes } from 'node:crypto'
import { authorizeApp } from '@/lib/authorize'
import { builderV2Enabled, loadBuilderV2Draft } from '@/lib/builder-v2'
import { BUILDER_V2_LOGO_MAX_BYTES, BUILDER_V2_LOGO_MIME, BUILDER_V2_LOGO_PREFIX } from '@/lib/builder-v2-logo-types'
import { validateFileContent } from '@/lib/file-policy'
import { storeAttachment } from '@/lib/file-upload'
import { isPlanLimitError } from '@/lib/limits'

export async function uploadBuilderV2LogoAction(appId: string, form: FormData): Promise<{ ok: true; key: string } | { ok: false; error: string }> {
  if (!builderV2Enabled() || typeof appId !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(appId)) {
    return { ok: false, error: 'Загрузка логотипа недоступна' }
  }
  const auth = await authorizeApp(appId)
  if (!auth.ok) return auth
  if (!await loadBuilderV2Draft(appId, auth.member.workspaceId)) return { ok: false, error: 'Черновик недоступен' }
  const file = form instanceof FormData ? form.get('file') : null
  if (!(file instanceof File) || !BUILDER_V2_LOGO_MIME.some(mime => mime === file.type)) {
    return { ok: false, error: 'Выберите изображение PNG, JPEG или WebP' }
  }
  if (file.size > BUILDER_V2_LOGO_MAX_BYTES) return { ok: false, error: 'Максимальный размер логотипа — 2 МБ.' }
  try {
    const image = { name: file.name, type: file.type, bytes: new Uint8Array(await file.arrayBuffer()) }
    const error = validateFileContent(image)
    if (error) return { ok: false, error }
    const key = `${auth.member.workspaceId}/${BUILDER_V2_LOGO_PREFIX}${appId}.${randomBytes(16).toString('hex')}`
    await storeAttachment(auth.member.workspaceId, auth.member.userId, 'manual', image, undefined, key)
    return { ok: true, key }
  } catch (error) {
    return { ok: false, error: isPlanLimitError(error) ? error.message : 'Не удалось загрузить логотип. Попробуйте ещё раз.' }
  }
}
