'use server'
import { readAppDefinition, validateAppV2Definition } from '@tableapp/schema/app-definition'
import { authorizeApp } from '@/lib/authorize'
import { loadBuilderV2Catalog, loadBuilderV2Draft } from '@/lib/builder-v2'
import { builderV2MemberActor } from '@/lib/builder-v2-actor'
import { bookingV2Availability, validBookingAvailabilityRequest, type BookingAvailabilityRequest, type BookingAvailabilityResult } from '@/lib/builder-v2-booking-availability'
import { loadBookingData } from '@/lib/booking-store'
import { publishedV2Context, withPublishedV2Read } from '@/lib/builder-v2-published'

export async function readPublishedV2BookingAction(slug: string, request: BookingAvailabilityRequest & { revision: string }): Promise<BookingAvailabilityResult> {
  if (!validBookingAvailabilityRequest(request)) return { ok: false, error: 'Выберите корректную дату.' }
  try {
    return await withPublishedV2Read(async tx => {
      const { app, actor, revision } = await publishedV2Context(slug, tx)
      if (revision !== request.revision) return { ok: false, error: 'Приложение обновлено. Обновите страницу.' }
      if (!app.booking) return { ok: false, error: 'Запись сейчас недоступна.' }
      const data = await loadBookingData(app.booking, app.workspaceId, tx)
      return data ? bookingV2Availability(app, actor, data, request) : { ok: false, error: 'Настройки расписания изменились. Обратитесь в студию.' }
    })
  } catch { return { ok: false, error: 'Не удалось проверить расписание. Попробуйте ещё раз.' } }
}
export async function readBuilderV2BookingAction(appId: string, definition: unknown, request: BookingAvailabilityRequest): Promise<BookingAvailabilityResult> {
  const auth = await authorizeApp(appId, false)
  if (!auth.ok) return auth
  if (!validBookingAvailabilityRequest(request)) return { ok: false, error: 'Выберите корректную дату.' }
  const read = readAppDefinition(definition), stored = await loadBuilderV2Draft(appId, auth.member.workspaceId)
  if (!read.ok || read.formatVersion !== 2 || !stored || read.app.id !== stored.app.id || read.app.workspaceId !== auth.member.workspaceId || read.app.slug !== stored.app.slug) return { ok: false, error: 'Приложение недоступно.' }
  const { catalog } = await loadBuilderV2Catalog(auth.member.workspaceId), valid = validateAppV2Definition(read.app, catalog)
  if (!valid.ok || !valid.app.booking) return { ok: false, error: 'Проверьте настройки онлайн-записи.' }
  try {
    const data = await loadBookingData(valid.app.booking, valid.app.workspaceId)
    return data ? bookingV2Availability(valid.app, builderV2MemberActor(valid.app, auth.member), data, request) : { ok: false, error: 'Проверьте таблицы расписания.' }
  } catch { return { ok: false, error: 'Не удалось проверить расписание. Попробуйте ещё раз.' } }
}
