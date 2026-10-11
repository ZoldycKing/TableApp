'use server'

import { loadApp } from '@/lib/app-write-access'
import { currentAppAccess } from '@/lib/app-session'
import { canEnter, visibleScreensFor } from '@/lib/app-roles'
import { loadPublishedApp } from '@/lib/app-runtime'
import { configFingerprint } from '@/lib/app-config-history'

export async function loadRuntimeScreenAction(slug: string, screenId: string, expectedRevision: string) {
  if (typeof slug !== 'string' || slug.length > 200 || typeof screenId !== 'string' || screenId.length > 100 || typeof expectedRevision !== 'string' || expectedRevision.length !== 64) return { ok: false as const, error: 'Не удалось открыть этот раздел.', reload: false }
  const app = await loadApp(slug)
  if (!app) return { ok: false as const, error: 'Приложение больше недоступно.', reload: true }
  const access = await currentAppAccess(app)
  if (!canEnter(app, access.visitor) || !visibleScreensFor(app, access.visitor).some(screen => screen.id === screenId)) return { ok: false as const, error: 'Этот раздел недоступен с текущим входом.', reload: true }
  if (configFingerprint({ app, visitor: access.visitor }) !== expectedRevision) return { ok: false as const, error: 'Доступ или настройки изменились. Обновляем приложение…', reload: true }
  const runtime = await loadPublishedApp(slug, access.visitor, { screenId })
  if (!runtime || runtime.lazy?.revision !== expectedRevision) return { ok: false as const, error: 'Приложение изменилось. Обновляем данные…', reload: true }
  return { ok: true as const, runtime }
}
