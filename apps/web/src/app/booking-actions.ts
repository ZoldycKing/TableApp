'use server'

import { apps } from '@tableapp/db'
import { appSchema, calendarDay, dateInstant } from '@tableapp/schema'
import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { loadApp } from '@/lib/app-write-access'
import { currentAppAccess } from '@/lib/app-session'
import { canOpenScreen, visitorFor } from '@/lib/app-roles'
import { canAccessRow, rulesFor } from '@/lib/row-access'
import { bookingService, eligibleMasters, freeBookingSlots, oneRelation, type BookingSlot } from '@/lib/booking'
import { loadBookingData } from '@/lib/booking-store'
import { createRow, updateRow, writeRows, RowWriteError } from '@/lib/row-mutations'
import { isPlanLimitError } from '@/lib/limits'
import { explainToCustomer, newId } from '@tableapp/schema'

export async function bookingAvailabilityAction(slug: string, serviceId: string, day: string, masterId = '', rowId?: string): Promise<
  { ok: true; slots: BookingSlot[]; masters: { id: string; name: string }[]; timeZone: string } | { ok: false; error: string }
> {
  const app = await loadApp(slug), config = app?.booking
  if (!app || !config) return { ok: false, error: 'Запись сейчас недоступна.' }
  const { visitor, viewer } = await currentAppAccess(app)
  const screen = app.screens.find(s => s.id === (rowId ? config.rescheduleScreenId : config.formScreenId))
  if (!screen || !canOpenScreen(screen, visitor)) return { ok: false, error: 'Запись сейчас недоступна.' }
  const data = await loadBookingData(config, app.workspaceId)
  if (!data) return { ok: false, error: 'Настройки записи изменились. Свяжитесь с салоном.' }
  let minutes: number | undefined
  if (rowId) {
    const row = data.visits.find(row => row.id === rowId)
    if (!row || !canAccessRow(rulesFor(app, config.tables.visits, visitor), viewer, row.data) || oneRelation(row.data[config.visit.service]) !== serviceId) return { ok: false, error: 'Запись вам недоступна.' }
    if (row.data[config.visit.status] !== config.statuses.booked || (dateInstant(row.data[config.visit.start]) ?? 0) <= Date.now()) return { ok: false, error: 'Перенести можно только предстоящую запись.' }
    minutes = Number(row.data[config.visit.minutes])
  }
  if (!bookingService(config, data, serviceId)) return { ok: false, error: 'Услуга недоступна для записи.' }
  return { ok: true, slots: freeBookingSlots(config, data, { serviceId, day, masterId: masterId || undefined, minutes, excludeId: rowId }),
    masters: eligibleMasters(config, data, serviceId).map(row => ({ id: row.id, name: String(row.data[config.master.name] ?? 'Мастер') })), timeZone: data.timeZone }
}

export async function cancelBookingAction(slug: string, rowId: string, baseVersion: number) {
  const app = await loadApp(slug), config = app?.booking
  if (!app || !config) return { ok: false as const, error: 'Запись сейчас недоступна.' }
  const { visitor, viewer } = await currentAppAccess(app)
  const screen = app.screens.find(s => s.type === 'detail' && s.tableId === config.tables.visits)
  if (!visitor.authenticated || !viewer || !screen || !canOpenScreen(screen, visitor)) return { ok: false as const, error: 'Войдите в кабинет.' }
  try {
    await writeRows(app.workspaceId, context => updateRow(context, config.tables.visits, rowId,
      { [config.visit.status]: config.statuses.cancelled }, { id: viewer.id, kind: 'app_user' }, { baseVersion,
        guard: data => canAccessRow(rulesFor(app, config.tables.visits, visitor), viewer, data) &&
          data[config.visit.status] === config.statuses.booked && (dateInstant(data[config.visit.start]) ?? 0) > Date.now(),
      }))
  } catch (error) {
    if (error instanceof RowWriteError) return { ok: false as const, error: error.message }
    throw error
  }
  revalidatePath(`/a/${slug}`)
  return { ok: true as const }
}

export type BookingSetupInput = { name: string; email: string; serviceIds: string[]; weekdays: number[]; start: string; end: string; breakStart: string; breakEnd: string; timeZone: string }
export async function setupBookingMasterAction(slug: string, input: BookingSetupInput) {
  const app = await loadApp(slug), config = app?.booking
  if (!app || !config) return { ok: false as const, error: 'Приложение не опубликовано.' }
  const { visitor, viewer } = await currentAppAccess(app)
  const screen = app.screens.find(s => s.id === config.setupScreenId)
  if (!viewer || !screen || !canOpenScreen(screen, visitor) || visitor.roleId !== 'manager') return { ok: false as const, error: 'Настройка доступна администратору.' }
  const clock = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3)) : -1
  const start = clock(input.start), end = clock(input.end), breakStart = clock(input.breakStart), breakEnd = clock(input.breakEnd)
  const hasBreak = Boolean(input.breakStart || input.breakEnd)
  const { isValidEmail, normalizeEmail } = await import('@/lib/auth')
  if (!input.name.trim() || !isValidEmail(input.email) || !input.serviceIds.length || !input.weekdays.length ||
    input.weekdays.some(day => !Number.isInteger(day) || day < 0 || day > 6) || start < 0 || end <= start ||
    hasBreak && (breakStart <= start || breakEnd <= breakStart || breakEnd >= end)) return { ok: false as const, error: 'Заполните имя, почту, услуги и рабочие часы. Перерыв должен быть внутри смены.' }
  try {
    await writeRows(app.workspaceId, async context => {
      const data = await loadBookingData(config, app.workspaceId, context.tx)
      if (!data || input.serviceIds.some(id => !bookingService(config, data, id))) throw new RowWriteError('invalid', 'Выберите доступные услуги с ценой и длительностью.')
      if (data.masters.some(row => String(row.data[config.master.email]).trim().toLowerCase() === normalizeEmail(input.email))) throw new RowWriteError('invalid', 'Мастер с этой почтой уже есть. Измените его карточку и рабочее время.')
      if (data.timeZone !== input.timeZone) throw new RowWriteError('conflict', 'Часовой пояс изменился. Обновите страницу.')
      const masterId = newId('row')
      await createRow(context, config.tables.masters, { [config.master.name]: input.name.trim(), [config.master.email]: normalizeEmail(input.email),
        [config.master.services]: [...new Set(input.serviceIds)], [config.master.active]: true }, { id: viewer.id, kind: 'app_user' }, { id: masterId, origin: 'runtime' })
      for (const weekday of new Set(input.weekdays)) {
        const windows = hasBreak ? [[input.start, input.breakStart], [input.breakEnd, input.end]] : [[input.start, input.end]]
        for (const [from, to] of windows) await createRow(context, config.tables.schedule,
          { [config.schedule.master]: [masterId], [config.schedule.weekday]: config.weekdays[weekday], [config.schedule.start]: from, [config.schedule.end]: to, [config.schedule.closed]: false,
            [config.schedule.name]: `${input.name.trim()} — ${['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'][weekday]}: ${from}–${to}` }, { id: viewer.id, kind: 'app_user' }, { origin: 'runtime' })
      }
      const [record] = await context.tx.select().from(apps).where(eq(apps.id, app.id)).for('update')
      if (!record?.published) throw new RowWriteError('conflict', 'Публикация изменилась. Обновите страницу.')
      const addMaster = (value: unknown) => {
        const definition = appSchema.parse(value), email = normalizeEmail(input.email)
        if (JSON.stringify(definition.booking) !== JSON.stringify(config) || !definition.roles.some(role => role.id === 'staff')) throw new RowWriteError('conflict', 'Настройки приложения изменились. Обновите страницу.')
        const existing = definition.allowlist.find(entry => normalizeEmail(entry.email) === email)
        if (existing?.roleId !== 'manager') definition.allowlist = [
          ...definition.allowlist.filter(entry => normalizeEmail(entry.email) !== email), { email, roleId: 'staff', company: '' },
        ]
        return definition
      }
      const live = appSchema.parse(record.published)
      if (visitorFor(live, viewer.email).roleId !== 'manager') throw new RowWriteError('denied', 'Права администратора изменились.')
      const published = addMaster(record.published), draft = addMaster(record.draft)
      await context.tx.update(apps).set({ published, draft, allowlist: published.allowlist }).where(eq(apps.id, app.id))
    })
  } catch (error) {
    if (isPlanLimitError(error)) return { ok: false as const, error: explainToCustomer() }
    if (error instanceof RowWriteError) return { ok: false as const, error: error.message }
    throw error
  }
  revalidatePath(`/a/${slug}`)
  return { ok: true as const }
}

export async function setBookingDayOffAction(slug: string, masterId: string, day: string) {
  const app = await loadApp(slug), config = app?.booking
  if (!app || !config) return { ok: false as const, error: 'Приложение не опубликовано.' }
  const { visitor, viewer } = await currentAppAccess(app)
  const screen = app.screens.find(s => s.id === config.setupScreenId)
  if (!viewer || !screen || !canOpenScreen(screen, visitor) || visitor.roleId !== 'manager') return { ok: false as const, error: 'Настройка доступна администратору.' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || calendarDay(day) !== day) return { ok: false as const, error: 'Выберите дату выходного.' }
  try {
    await writeRows(app.workspaceId, async context => {
      const data = await loadBookingData(config, app.workspaceId, context.tx)
      const master = data?.masters.find(row => row.id === masterId)
      if (!data || !master) throw new RowWriteError('invalid', 'Выберите мастера этого салона.')
      if (data.schedule.some(row => oneRelation(row.data[config.schedule.master]) === masterId && row.data[config.schedule.date] === day && row.data[config.schedule.closed] === true)) return
      await createRow(context, config.tables.schedule, { [config.schedule.name]: `${String(master.data[config.master.name])} — выходной ${day}`,
        [config.schedule.master]: [masterId], [config.schedule.date]: day, [config.schedule.closed]: true }, { id: viewer.id, kind: 'app_user' }, { origin: 'runtime' })
    })
  } catch (error) {
    if (isPlanLimitError(error)) return { ok: false as const, error: explainToCustomer() }
    if (error instanceof RowWriteError) return { ok: false as const, error: error.message }
    throw error
  }
  revalidatePath(`/a/${slug}`)
  return { ok: true as const }
}
