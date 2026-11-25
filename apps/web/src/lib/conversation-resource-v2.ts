import type { AppV2 } from '@tableapp/schema/app-v2'

export type ConversationResourceV2 = {
  emailFieldId: string
  moduleId: string
  staffDetailScreenId: string
  clientDetailScreenId: string
  titleFieldId: string
}

/** Client-facing record tables that may own a Переписка thread in App V2 kits. */
export function conversationResourceV2(app: AppV2, tableId: string): ConversationResourceV2 | null {
  if (app.service?.repairsTableId === tableId) {
    const hasClientCard = app.screens.some(screen => screen.id === app.service!.clientRepairScreenId && screen.contextTableId === tableId
      && screen.audience.kind === 'roles' && screen.audience.roleIds.includes('client'))
    if (!hasClientCard) return null
    return {
      emailFieldId: app.service.repair.clientEmail,
      moduleId: `mod_service_${tableId}`,
      staffDetailScreenId: app.service.repairScreenId,
      clientDetailScreenId: app.service.clientRepairScreenId,
      titleFieldId: app.service.repair.device,
    }
  }
  if (app.prokat?.bookingsTableId === tableId) {
    const hasClientCard = app.screens.some(screen => screen.id === app.prokat!.clientBookingScreenId && screen.contextTableId === tableId
      && screen.audience.kind === 'roles' && screen.audience.roleIds.includes('client'))
    if (!hasClientCard) return null
    return {
      emailFieldId: app.prokat.booking.clientEmail,
      moduleId: `mod_prokat_${tableId}`,
      staffDetailScreenId: app.prokat.bookingScreenId,
      clientDetailScreenId: app.prokat.clientBookingScreenId,
      titleFieldId: app.prokat.booking.title,
    }
  }
  if (app.support?.ticketsTableId === tableId) {
    const hasClientCard = app.screens.some(screen => screen.id === app.support!.clientTicketScreenId && screen.contextTableId === tableId
      && screen.audience.kind === 'roles' && screen.audience.roleIds.includes('client'))
    if (!hasClientCard) return null
    return {
      emailFieldId: app.support.ticket.clientEmail,
      moduleId: `mod_support_${tableId}`,
      staffDetailScreenId: app.support.ticketScreenId,
      clientDetailScreenId: app.support.clientTicketScreenId,
      titleFieldId: app.support.ticket.subject,
    }
  }
  return null
}

export function conversationDetailScreenV2(resource: ConversationResourceV2, staff: boolean) {
  return staff ? resource.staffDetailScreenId : resource.clientDetailScreenId
}

/** Desk roles that may see internal notes and reply as staff. */
export function conversationStaffV2(app: AppV2, tableId: string, roleIds: readonly string[]) {
  if (app.service?.repairsTableId === tableId) return roleIds.includes('owner') || roleIds.includes('staff')
  if (app.prokat?.bookingsTableId === tableId) return roleIds.includes('owner') || roleIds.includes('staff')
  if (app.support?.ticketsTableId === tableId) return roleIds.includes('owner') || roleIds.includes('staff')
  return false
}

export function conversationManagerV2(app: AppV2, tableId: string, roleIds: readonly string[]) {
  if (app.service?.repairsTableId === tableId || app.prokat?.bookingsTableId === tableId || app.support?.ticketsTableId === tableId) return roleIds.includes('owner')
  return false
}
