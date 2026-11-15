'use server'
import { readAppDefinition, validateAppV2Definition } from '@tableapp/schema/app-definition'
import { db } from '@tableapp/db'
import { authorizeApp } from '@/lib/authorize'
import { loadBuilderV2Catalog, loadBuilderV2Draft } from '@/lib/builder-v2'
import { builderV2MemberActor } from '@/lib/builder-v2-actor'
import { loadBookingData } from '@/lib/booking-store'
import { publishedV2Context, withPublishedV2Read } from '@/lib/builder-v2-published'
import { bookingTeamSnapshot, canOpenBookingPeople, type BookingTeamResult } from '@/lib/builder-v2-booking-people'

export async function readPublishedV2BookingPeopleAction(slug: string, screenId: string, requestedRevision: string): Promise<BookingTeamResult> {
  try { return await withPublishedV2Read(async tx => {
    const { app, actor, revision } = await publishedV2Context(slug, tx)
    if (revision !== requestedRevision) return { ok: false, error: 'Приложение обновлено. Обновите страницу.' }
    if (!canOpenBookingPeople(app, actor, screenId)) return { ok: false, error: 'Раздел недоступен.' }
    const data = await loadBookingData(app.booking!, app.workspaceId, tx)
    return data ? bookingTeamSnapshot(app, actor, data, screenId) : { ok: false, error: 'Проверьте таблицы онлайн-записи.' }
  }) } catch { return { ok: false, error: 'Не удалось загрузить команду и клиентов. Попробуйте ещё раз.' } }
}
export async function readBuilderV2BookingPeopleAction(appId: string, definition: unknown, screenId: string): Promise<BookingTeamResult> {
  const auth = await authorizeApp(appId, false)
  if (!auth.ok) return auth
  try {
    const read = readAppDefinition(definition), stored = await loadBuilderV2Draft(appId, auth.member.workspaceId)
    if (!read.ok || read.formatVersion !== 2 || !stored || read.app.id !== stored.app.id || read.app.workspaceId !== auth.member.workspaceId || read.app.slug !== stored.app.slug) return { ok: false, error: 'Приложение недоступно.' }
    const { catalog } = await loadBuilderV2Catalog(auth.member.workspaceId), valid = validateAppV2Definition(read.app, catalog)
    if (!valid.ok || !valid.app.booking) return { ok: false, error: 'Проверьте настройки онлайн-записи.' }
    const actor = builderV2MemberActor(valid.app, auth.member)
    if (!canOpenBookingPeople(valid.app, actor, screenId)) return { ok: false, error: 'Раздел недоступен.' }
    return await db.transaction(async tx => {
      const data = await loadBookingData(valid.app.booking!, valid.app.workspaceId, tx)
      return data ? bookingTeamSnapshot(valid.app, actor, data, screenId) : { ok: false, error: 'Проверьте таблицы онлайн-записи.' }
    })
  } catch { return { ok: false, error: 'Не удалось загрузить команду и клиентов. Попробуйте ещё раз.' } }
}
