import { dateInstant } from '@tableapp/schema'
import type { AppV2, AppV2Node, AppV2TeamCalendarData } from '@tableapp/schema/app-v2'
import type { BookingIntent } from '@/components/builder/v2/booking-journey'
import { builderV2ScreenNodes } from './builder-v2-data-types'

export type CalendarSlot = { resourceId?: string; resourceName?: string; day?: string; time?: string }

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

/** Salon still remembers the clicked master and time. Other apps open the configured form. */
export function salonSlotIntent(app: AppV2, config: AppV2TeamCalendarData, slot: CalendarSlot): BookingIntent | null {
  if (app.booking?.tables.visits !== config.tableId) return null
  return { masterId: slot.resourceId, day: slot.day, time: slot.time }
}

/** Form opened from an empty slot: the salon owner form, or the create form on the configured screen. */
export function calendarCreateTarget(app: AppV2, node: Extract<AppV2Node, { type: 'team_calendar' }>): { screenId: string; formId: string } | null {
  const data = node.data
  if (!data) return null
  const booking = app.booking
  if (booking?.ownerCreateFormId && data.tableId === booking.tables.visits) {
    const form = app.nodes.find(item => item.id === booking.ownerCreateFormId && item.type === 'form' && item.mode === 'create')
    if (form?.type === 'form') return { screenId: booking.formScreenId, formId: form.id }
  }
  const screenId = node.actions.createScreenId
  if (!screenId) return null
  const form = builderV2ScreenNodes(app, screenId).find(item => item.type === 'form' && item.mode === 'create' && item.tableId === data.tableId)
  return form?.type === 'form' ? { screenId, formId: form.id } : null
}

/** Owner can pick the service when the calendar opens the form without a service card. */
export function ownerCalendarServiceField(app: AppV2, formId: string, recordId: string | undefined, roleIds: readonly string[]): string | null {
  const booking = app.booking
  if (!booking?.ownerCreateFormId || formId !== booking.ownerCreateFormId || recordId) return null
  if (!roleIds.includes('owner')) return null
  return booking.visit.service
}

export function bookingCalendarLimits(app: AppV2) {
  return {
    leadMinutes: app.booking?.leadMinutes ?? 60,
    stepMinutes: app.booking?.stepMinutes ?? 15,
    horizonDays: app.booking?.horizonDays ?? 60,
  }
}
