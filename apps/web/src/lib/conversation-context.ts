import { db, fields, rows, tables } from '@tableapp/db'
import { dateInstant, fieldTimeZone, normalizeFieldOptions, type App, type Field } from '@tableapp/schema'
import { and, eq, isNull } from 'drizzle-orm'
import type { AppAccess } from './app-session'
import { appReadPolicy } from './app-read-policy'

/** Data has already passed the current record/field policy; related titles must pass it too. */
export async function conversationContextTitle(app: App, tableId: string, data: Record<string, unknown>, access: AppAccess | null, primary?: string | null) {
  const booking = app.booking
  if (booking?.tables.visits === tableId) {
    const ids = data[booking.visit.service], serviceId = Array.isArray(ids) && typeof ids[0] === 'string' ? ids[0] : ''
    const [service] = serviceId ? await db.select().from(rows).where(and(eq(rows.id, serviceId), eq(rows.tableId, booking.tables.services), isNull(rows.deletedAt))) : []
    let serviceData = service?.data as Record<string, unknown> | undefined
    if (service && access) {
      const policy = await appReadPolicy(app, booking.tables.services, access.visitor, access.viewer!)
      serviceData = policy.canRead(serviceData!, service) ? policy.project(serviceData!, service) : undefined
    }
    const [start] = await db.select().from(fields).where(and(eq(fields.id, booking.visit.start), eq(fields.tableId, tableId)))
    const zone = start ? fieldTimeZone({ type: 'datetime', options: normalizeFieldOptions('datetime', start.options) as Field['options'] }) : 'UTC'
    const instant = dateInstant(data[booking.visit.start])
    const title = String(serviceData?.[booking.service.name] ?? 'Запись').slice(0, 120)
    return `${title}${instant ? ` · ${new Date(instant).toLocaleString('ru-RU', { timeZone: zone, day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}` : ''}`
  }
  if (primary === undefined) {
    const [table] = await db.select({ primary: tables.primaryFieldId }).from(tables).where(and(eq(tables.id, tableId), eq(tables.workspaceId, app.workspaceId)))
    primary = table?.primary ?? null
  }
  return String(data[primary ?? ''] ?? 'Обращение').slice(0, 160)
}
