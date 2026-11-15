import { calendarDay, dateInstant } from '@tableapp/schema'
import type { AppV2, AppV2Actor } from '@tableapp/schema/app-v2'

/** Additional lifecycle rules; normal row/field grants are still checked by the workflow engine. */
export function builderV2BookingWriteError(app: AppV2, actor: AppV2Actor, tableId: string, values: Record<string, unknown>, before?: Record<string, unknown>, now = Date.now(), timeZone = 'Europe/Moscow'): string | null {
  const config = app.booking
  if (!config) return null
  if (config.clients && tableId === config.clients.tableId) {
    if (!actor.roleIds.includes('owner')) return 'Изменять клиентов может только администратор.'
    const c = config.clients, merged = { ...before, ...values }, name = merged[c.name], phone = merged[c.phone], email = merged[c.email]
    if (typeof name !== 'string' || !name.trim()) return 'Укажите имя клиента.'
    if (typeof phone !== 'string' || !/^[+\d\s()-]+$/.test(phone) || phone.replace(/\D/g, '').length < 7 || phone.replace(/\D/g, '').length > 15) return 'Укажите корректный телефон клиента.'
    if (email && (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) return 'Проверьте почту клиента.'
    return null
  }
  if (tableId === config.tables.schedule) {
    const period = { ...before, ...values }, fields = config.schedule
    const master = period[fields.master], day = period[fields.date]
    if (!Array.isArray(master) || master.length !== 1) return 'Выберите одного мастера.'
    if (day ? !calendarDay(day, timeZone) : !config.weekdays.includes(String(period[fields.weekday]))) return 'Укажите день недели или конкретную дату.'
    if (!period[fields.closed]) {
      const from = period[fields.start], to = period[fields.end]
      const time = /^([01]\d|2[0-3]):[0-5]\d$/
      if (typeof from !== 'string' || typeof to !== 'string' || !time.test(from) || !time.test(to) || from >= to) return 'Укажите рабочие часы: например, с 09:00 до 13:00.'
    }
    return null
  }
  if (tableId !== config.tables.visits) return null
  const client = !actor.roleIds.includes('owner') && !actor.roleIds.includes('staff')
  const visit = config.visit
  if (!before) {
    if (values[visit.status] !== config.statuses.booked) return 'Новая запись должна иметь статус «Записан».'
    return null
  }
  const start = dateInstant(before[visit.start], timeZone)
  if (client) {
    if (before[visit.status] !== config.statuses.booked || start === null || start <= now) return 'Изменить или отменить можно только предстоящую запись.'
    if (values[visit.status] !== undefined && values[visit.status] !== config.statuses.cancelled) return 'Клиент может только отменить запись или выбрать другое время.'
    if (values[visit.status] === config.statuses.cancelled && Object.keys(values).some(id => id !== visit.status)) return 'Отмена не должна менять время записи.'
  }
  const status = values[visit.status]
  if ([config.statuses.arrived, config.statuses.noShow, config.statuses.completed].includes(String(status)) && (start === null || start > now)) return 'Отметить посещение можно после времени начала записи.'
  return null
}
