'use server'
import { readAppDefinition, validateAppV2Definition } from '@tableapp/schema/app-definition'
import { authorizeApp } from '@/lib/authorize'
import { loadBuilderV2Catalog, loadBuilderV2Draft } from '@/lib/builder-v2'
import { builderV2MemberActor } from '@/lib/builder-v2-actor'
import { bookingV2Availability, validBookingAvailabilityRequest, type BookingAvailabilityRequest, type BookingAvailabilityResult } from '@/lib/builder-v2-booking-availability'
import { loadBookingData } from '@/lib/booking-store'
import { publishedV2Context, withPublishedV2Read } from '@/lib/builder-v2-published'
import { bookingScheduleScopeSchema, bookingScheduleRequestSchema, type BookingScheduleScope, type BookingScheduleRequest, type BookingScheduleRead, type BookingScheduleResult } from '@/lib/builder-v2-booking-schedule'
import { bookingScheduleForm, bookingScheduleMasters, inspectPublishedBookingSchedule, savePublishedBookingSchedule } from '@/lib/builder-v2-booking-schedule-store'
import { RowWriteError } from '@/lib/row-mutations'
import { isPlanLimitError } from '@/lib/limits'
import { db } from '@tableapp/db'
import { inspectPublishedV2Form } from '@/lib/builder-v2-published-form'

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

export async function readPublishedV2BookingScheduleAction(slug: string, scope: BookingScheduleScope & { revision: string }): Promise<BookingScheduleRead> {
  if (!bookingScheduleScopeSchema.safeParse({ screenId: scope?.screenId, formId: scope?.formId, recordId: scope?.recordId }).success) return { ok: false, error: 'Рабочие часы недоступны.' }
  try { return await withPublishedV2Read(async tx => {
    const current = await publishedV2Context(slug, tx)
    if (scope.revision !== current.revision) return { ok: false, error: 'Приложение обновлено. Откройте рабочие часы заново.' }
    return inspectPublishedBookingSchedule(current, tx, scope)
  }) } catch (error) { return { ok: false, error: error instanceof RowWriteError ? error.message : 'Не удалось загрузить рабочие часы. Попробуйте ещё раз.' } }
}
export async function savePublishedV2BookingScheduleAction(slug: string, request: BookingScheduleRequest): Promise<BookingScheduleResult> {
  if (!bookingScheduleRequestSchema.safeParse(request).success) return { ok: false, error: 'Проверьте мастера, рабочие дни и время.' }
  try { return await savePublishedBookingSchedule(slug, request) }
  catch (error) { return { ok: false, error: error instanceof RowWriteError || isPlanLimitError(error) ? error.message : 'Не удалось подтвердить сохранение. Повторите запрос.', uncertain: !(error instanceof RowWriteError || isPlanLimitError(error)) } }
}
export async function readBuilderV2BookingScheduleAction(appId: string, definition: unknown, scope: BookingScheduleScope): Promise<BookingScheduleRead> {
  const auth = await authorizeApp(appId, false)
  if (!auth.ok) return auth
  try {
    const read = readAppDefinition(definition), stored = await loadBuilderV2Draft(appId, auth.member.workspaceId)
    if (!bookingScheduleScopeSchema.safeParse(scope).success || !read.ok || read.formatVersion !== 2 || !stored || read.app.id !== stored.app.id || read.app.workspaceId !== auth.member.workspaceId || read.app.slug !== stored.app.slug) return { ok: false, error: 'Приложение недоступно.' }
    const { catalog } = await loadBuilderV2Catalog(auth.member.workspaceId), valid = validateAppV2Definition(read.app, catalog)
    if (!valid.ok || !valid.app.booking) return { ok: false, error: 'Проверьте настройки онлайн-записи.' }
    bookingScheduleForm(valid.app, scope)
    const actor = builderV2MemberActor(valid.app, auth.member)
    const preview = valid.app
    return await db.transaction(async tx => {
      const checked = await inspectPublishedV2Form({ app: preview, actor, revision: 'preview' }, tx, { ...scope, mode: 'initial' })
      if (!checked.ok) return checked
      if (!('state' in checked) || !checked.state) return { ok: false, error: 'Не удалось открыть рабочие часы.' }
      const data = await loadBookingData(preview.booking!, preview.workspaceId, tx)
      return data ? { ok: true, state: { revision: 'preview', fingerprint: checked.state.fingerprint, values: checked.state.values, masters: bookingScheduleMasters(preview, actor, data) } } : { ok: false, error: 'Проверьте таблицы расписания.' }
    })
  } catch (error) { return { ok: false, error: error instanceof RowWriteError ? error.message : 'Не удалось открыть рабочие часы.' } }
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
