import { APP_TIME_ZONE, calendarDay, dateInstant } from '@tableapp/schema'

/** A date-only value never shifts day; date-times use the configured field's zone. */
export function builderV2HistoryDate(value: unknown, type: string, timeZone = APP_TIME_ZONE) {
  if (type === 'date') {
    const day = calendarDay(value, timeZone)
    return day ? new Date(`${day}T12:00:00Z`).toLocaleDateString('ru-RU',{ day:'numeric', month:'short', year:'numeric', timeZone:'UTC' }) : ''
  }
  const instant = dateInstant(value,timeZone)
  return instant === null ? '' : new Date(instant).toLocaleString('ru-RU',{ day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit', timeZone })
}
