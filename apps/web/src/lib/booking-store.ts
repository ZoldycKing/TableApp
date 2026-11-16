import { apps, appUsers, fields, rows, tables, db } from '@tableapp/db'
import { bookingConfigSchema, calendarDay, dateInstant, fieldTimeZone, type BookingConfig, type Field } from '@tableapp/schema'
import type { RowActor, RowTransaction } from './row-mutations'
import type { Origin } from './limits'
import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import type { Transaction } from './db-transaction'
import { bookingService, oneRelation, slotError, type BookingData } from './booking'
import { bookingClientChangeError, bookingRules } from './booking-rules'
import { canCompleteBooking } from './booking-lifecycle'

export async function loadBookingData(config: BookingConfig, workspaceId: string, query: Transaction | typeof db = db): Promise<BookingData | null> {
  const ids = [...Object.values(config.tables), ...(config.clients ? [config.clients.tableId] : [])]
  const owned = await query.select({ id: tables.id }).from(tables).where(and(eq(tables.workspaceId, workspaceId), inArray(tables.id, ids)))
  if (owned.length !== ids.length) return null
  const columns = await query.select().from(fields).where(inArray(fields.tableId, ids))
  for (const [group, tableId] of [[config.service, config.tables.services], [config.master, config.tables.masters],
    [config.schedule, config.tables.schedule], [config.visit, config.tables.visits]] as const) {
    if (Object.values(group).some(id => !columns.some(field => field.id === id && field.tableId === tableId))) return null
  }
  const start = columns.find(field => field.id === config.visit.start)
  if (config.clients) {
    const c = config.clients, relation = columns.find(field => field.id === c.linkFieldId)
    if ([c.name,c.phone,c.email,c.note].some(id => !columns.some(field => field.id === id && field.tableId === c.tableId)) || relation?.type !== 'relation' || (relation.options as { tableId?: string }).tableId !== c.tableId) return null
  }
  if (start?.type !== 'datetime') return null
  const source = await query.select({ id: rows.id, tableId: rows.tableId, data: rows.data }).from(rows)
    .where(and(inArray(rows.tableId, ids), isNull(rows.deletedAt)))
  const of = (tableId: string) => source.filter(row => row.tableId === tableId).map(row => ({ id: row.id, data: row.data as Record<string, unknown> }))
  const scheduleDate = columns.find(field => field.id === config.schedule.date)!
  return { services: of(config.tables.services), masters: of(config.tables.masters), schedule: of(config.tables.schedule).map(row => ({ ...row,
    data: { ...row.data, [config.schedule.date]: calendarDay(row.data[config.schedule.date], fieldTimeZone(scheduleDate as unknown as Field)) } })),
    visits: of(config.tables.visits), ...(config.clients ? { clients: of(config.clients.tableId) } : {}), timeZone: fieldTimeZone(start as unknown as Field) }
}

/** A published client, not the owner or a staff member working in the same app. */
async function publishedClientOnly(tx: Transaction, actor: RowActor | undefined) {
  if (!actor || actor.kind !== 'app_user' || !actor.id) return false
  const [user] = await tx.select({ appId: appUsers.appId, email: appUsers.email }).from(appUsers).where(eq(appUsers.id, actor.id)).limit(1)
  if (!user) return false
  const [record] = await tx.select({ published: apps.published, draft: apps.draft }).from(apps).where(eq(apps.id, user.appId)).limit(1)
  const auth = ((record?.published ?? record?.draft) as { authentication?: { mode?: string; defaultRoleId?: string | null; members?: { email: string; roleIds: string[] }[] } } | null)?.authentication
  if (!auth) return false
  const email = user.email.trim().toLowerCase()
  const member = auth.members?.find(item => item.email.trim().toLowerCase() === email)
  const roleIds = member?.roleIds ?? (auth.mode === 'verified_email' && auth.defaultRoleId ? [auth.defaultRoleId] : [])
  return roleIds.includes('client') && !roleIds.some(id => id === 'owner' || id === 'staff')
}

/** Used by the shared mutation engine, including workspace, imports and sync. */
export async function prepareBookingWrite(tx: Transaction, workspaceId: string, tableId: string,
  clean: Record<string, unknown>, before?: Record<string, unknown>, rowId?: string, mutation?: { context: RowTransaction; actor: RowActor; origin?: Origin }): Promise<{ data: Record<string, unknown>; error: string | null }> {
  const definitions = await tx.select({ draft: apps.draft, published: apps.published }).from(apps)
    .where(and(eq(apps.workspaceId, workspaceId), sql`coalesce(${apps.published}, ${apps.draft})->'booking'->'tables' @> jsonb_build_object('visits', ${tableId}::text)`))
    .for('share')
  if (!definitions.length) return { data: clean, error: null }
  const policies = definitions.map(record => bookingConfigSchema.safeParse(((record.published ?? record.draft) as { booking?: unknown } | null)?.booking))
  if (policies.some(policy => !policy.success)) return { data: clean, error: 'Настройки записи повреждены. Обратитесь к владельцу.' }
  const config = policies[0]!.data!
  if (policies.some(policy => JSON.stringify(policy.data) !== JSON.stringify(config))) return { data: clean, error: 'Для этой таблицы настроены разные правила записи.' }
  const data = await loadBookingData(config, workspaceId, tx)
  if (!data) return { data: clean, error: 'Настройки записи ссылаются на недоступные поля.' }
  const result = { ...clean }, visit = config.visit
  if (config.clients) {
    const c = config.clients, linkedId = oneRelation(result[c.linkFieldId])
    if (before && JSON.stringify(before[c.linkFieldId] ?? []) !== JSON.stringify(result[c.linkFieldId] ?? [])) return { data: clean, error: 'Связь визита с клиентом нельзя менять при переносе или смене статуса.' }
    if (result[c.linkFieldId] != null && (!Array.isArray(result[c.linkFieldId]) || (result[c.linkFieldId] as unknown[]).length > 1)) return { data: clean, error: 'Выберите одного клиента.' }
    if (!before && linkedId) {
      const client = data.clients?.find(row => row.id === linkedId)
      if (!client) return { data: clean, error: 'Клиент не найден. Выберите клиента заново.' }
      result[visit.client] = client.data[c.name]
      result[visit.phone] = client.data[c.phone]
      result[visit.email] = client.data[c.email] ?? ''
    }
  }
  if (!Object.values(config.statuses).includes(String(result[visit.status]))) return { data: clean, error: 'Выберите допустимый статус записи.' }
  if (config.statuses.completed && result[visit.status] === config.statuses.completed) {
    const start = dateInstant(result[visit.start], data.timeZone)
    if (start === null || start > Date.now() || before?.[visit.status] !== config.statuses.completed &&
      (!before || !canCompleteBooking(config, { id: rowId ?? '', data: before }, data.timeZone, Date.now()))) {
      return { data: clean, error: 'Завершить можно только начавшееся посещение со статусом «Записан» или «Пришёл».' }
    }
  }
  const serviceId = oneRelation(result[visit.service]), masterId = oneRelation(result[visit.master])
  if (!serviceId || !masterId || typeof result[visit.client] !== 'string' || !String(result[visit.client]).trim()) return { data: clean, error: 'Укажите имя клиента, услугу и мастера.' }
  const master = data.masters.find(row => row.id === masterId)
  if (!master) return { data: clean, error: 'Мастер не найден.' }
  result[visit.masterEmail] = String(master.data[config.master.email] ?? '').trim().toLowerCase()
  const changedService = !before || oneRelation(before[visit.service]) !== serviceId
  if (changedService) {
    const service = bookingService(config, data, serviceId)
    if (!service) return { data: clean, error: 'Услуга сейчас недоступна для записи.' }
    result[visit.minutes] = service.data[config.service.minutes]
    result[visit.price] = service.data[config.service.price]
  }
  const timeChanged = !before || changedService || oneRelation(before[visit.master]) !== masterId ||
    before[visit.start] !== result[visit.start] || before[visit.minutes] !== result[visit.minutes] ||
    before[visit.status] === config.statuses.cancelled && result[visit.status] !== config.statuses.cancelled
  if (timeChanged && result[visit.status] !== config.statuses.cancelled &&
    (typeof result[visit.phone] !== 'string' || !/^[+\d\s()-]+$/.test(String(result[visit.phone])) || String(result[visit.phone]).replace(/\D/g, '').length < 7 || String(result[visit.phone]).replace(/\D/g, '').length > 15)) {
    return { data: clean, error: 'Укажите корректный номер телефона для связи.' }
  }
  const cancelling = Boolean(before && result[visit.status] === config.statuses.cancelled && before[visit.status] !== config.statuses.cancelled)
  const rescheduling = Boolean(before && (result[visit.start] !== before[visit.start] || JSON.stringify(result[visit.master] ?? null) !== JSON.stringify(before[visit.master] ?? null)))
  if ((cancelling || rescheduling) && bookingRules(config).cancelDeadlineHours > 0 && await publishedClientOnly(tx, mutation?.actor)) {
    const closed = bookingClientChangeError(config, before![visit.start], Date.now(), data.timeZone)
    if (closed) return { data: clean, error: closed }
  }
  const error = timeChanged && result[visit.status] !== config.statuses.cancelled ? slotError(config, data, {
    serviceId, masterId, start: result[visit.start], minutes: Number(result[visit.minutes]), excludeId: rowId,
  }) : null
  if (!error && !before && config.clients && !oneRelation(result[config.clients.linkFieldId]) && mutation) {
    const c = config.clients, email = String(result[visit.email] ?? '').trim().toLowerCase()
    const matching = email ? data.clients?.filter(row => String(row.data[c.email] ?? '').trim().toLowerCase() === email) ?? [] : []
    let clientId = matching.length === 1 ? matching[0]!.id : undefined
    if (!clientId) {
      // The same mutation engine keeps limits, history, notifications and rollback atomic with the visit.
      const { createRow } = await import('./row-mutations')
      clientId = (await createRow(mutation.context, c.tableId, { [c.name]: result[visit.client], [c.phone]: result[visit.phone], [c.email]: email, [c.note]: '' }, mutation.actor, { origin: mutation.origin })).id
    }
    result[c.linkFieldId] = [clientId]
  }
  return { data: result, error }
}
