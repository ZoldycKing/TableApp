'use server'

import { loadApp } from '@/lib/app-write-access'
import { currentAppAccess } from '@/lib/app-session'
import { canEnter, visibleScreensFor } from '@/lib/app-roles'
import { loadPublishedApp } from '@/lib/app-runtime'
import { configFingerprint } from '@/lib/app-config-history'
import { readRuntimeCollection } from '@/lib/runtime-collection-pages'
import { readRuntimeSelectedRows, runtimePageEnvelope, usesRuntimePages } from '@/lib/runtime-page-runtime'
import { RowWriteError } from '@/lib/row-mutations'
import type { RuntimePageRequest } from '@/lib/runtime-page-types'

function validPageRequest(value: unknown): value is RuntimePageRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const request = value as Record<string, unknown>
  return Object.keys(request).every(key => ['query', 'choiceId', 'bookingSection', 'customerSection'].includes(key)) &&
    (request.query === undefined || typeof request.query === 'string' && request.query.length <= 160) &&
    (request.choiceId === undefined || request.choiceId === null || typeof request.choiceId === 'string' && request.choiceId.length <= 200) &&
    (request.bookingSection === undefined || request.bookingSection === 'upcoming' || request.bookingSection === 'history') &&
    (request.customerSection === undefined || request.customerSection === 'active' || request.customerSection === 'history')
}
async function pageAccess(slug: string, screenId: string, expectedRevision: string) {
  if (typeof slug !== 'string' || slug.length > 200 || typeof screenId !== 'string' || screenId.length > 100 || typeof expectedRevision !== 'string' || expectedRevision.length !== 64) return null
  const app = await loadApp(slug)
  if (!app) return null
  const access = await currentAppAccess(app)
  return canEnter(app, access.visitor) && usesRuntimePages(app, access.visitor) && visibleScreensFor(app, access.visitor).some(screen => screen.id === screenId) && configFingerprint({ app, visitor: access.visitor }) === expectedRevision ? { app, visitor: access.visitor } : null
}

export async function loadRuntimePageAction(slug: string, screenId: string, expectedRevision: string, request: RuntimePageRequest = {}, cursor?: string) {
  if (!validPageRequest(request) || cursor !== undefined && (typeof cursor !== 'string' || cursor.length > 2000)) return { ok: false as const, error: 'Проверьте параметры поиска.', reload: false, reset: false }
  const access = await pageAccess(slug, screenId, expectedRevision)
  if (!access) return { ok: false as const, error: 'Доступ или настройки изменились. Обновляем приложение…', reload: true, reset: false }
  try {
    const page = await readRuntimeCollection(access.app, access.visitor, screenId, request, cursor)
    if (!await pageAccess(slug, screenId, expectedRevision)) return { ok: false as const, error: 'Доступ изменился. Обновляем приложение…', reload: true, reset: false }
    return { ok: true as const, runtime: await runtimePageEnvelope(access.app, access.visitor, page, [screenId]) }
  } catch (error) {
    if (error instanceof RowWriteError) return { ok: false as const, error: error.message, reload: error.code === 'denied', reset: error.code === 'conflict' }
    throw error
  }
}

export async function loadRuntimeRowsAction(slug: string, screenId: string, expectedRevision: string, rowIds: string[]) {
  if (!Array.isArray(rowIds) || !rowIds.length || rowIds.length > 100 || rowIds.some(id => typeof id !== 'string' || !id || id.length > 200) || new Set(rowIds).size !== rowIds.length) return { ok: false as const, error: 'Не удалось открыть выбранные записи.', reload: false }
  const access = await pageAccess(slug, screenId, expectedRevision)
  if (!access) return { ok: false as const, error: 'Доступ или настройки изменились. Обновляем приложение…', reload: true }
  try {
    const runtime = await readRuntimeSelectedRows(access.app, access.visitor, screenId, rowIds)
    if (!await pageAccess(slug, screenId, expectedRevision)) return { ok: false as const, error: 'Доступ изменился. Обновляем приложение…', reload: true }
    return { ok: true as const, runtime: await runtimePageEnvelope(access.app, access.visitor, runtime, [], { [screenId]: rowIds }) }
  } catch (error) {
    if (error instanceof RowWriteError) return { ok: false as const, error: error.message, reload: error.code === 'denied' }
    throw error
  }
}

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
