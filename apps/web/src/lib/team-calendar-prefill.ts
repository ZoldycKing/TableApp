import { dateInstant } from '@tableapp/schema'
import type { AppV2, AppV2TeamCalendarData } from '@tableapp/schema/app-v2'
import type { BookingIntent } from '@/components/builder/v2/booking-journey'

export type CalendarSlot = { resourceId?: string; day?: string; time?: string }

/** Shared prefill: employee and start time, nothing else. */
export function calendarFormValues(config: AppV2TeamCalendarData, slot: CalendarSlot, timeZone: string) {
  const start = slot.day && slot.time ? dateInstant(`${slot.day}T${slot.time}`, timeZone) : null
  return {
    tableId: config.tableId,
    values: {
      ...(slot.resourceId ? { [config.resourceFieldId]: [slot.resourceId] } : {}),
      ...(start !== null ? { [config.startFieldId]: new Date(start).toISOString() } : {}),
    },
  }
}

/** Salon still starts from the service catalog. Other apps open the configured form. */
export function salonSlotIntent(app: AppV2, config: AppV2TeamCalendarData, slot: CalendarSlot): BookingIntent | null {
  if (app.booking?.tables.visits !== config.tableId) return null
  return { masterId: slot.resourceId, day: slot.day, time: slot.time }
}

export function bookingCalendarLimits(app: AppV2) {
  return {
    leadMinutes: app.booking?.leadMinutes ?? 60,
    stepMinutes: app.booking?.stepMinutes ?? 15,
    horizonDays: app.booking?.horizonDays ?? 60,
  }
}
