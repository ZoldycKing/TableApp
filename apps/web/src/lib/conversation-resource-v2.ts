import type { AppV2 } from '@tableapp/schema/app-v2'

/** Client-facing record tables that may own a Переписка thread in App V2 kits. */
export function conversationResourceV2(app: AppV2, tableId: string): { emailFieldId: string; moduleId: string; detailScreenId: string; titleFieldId: string } | null {
  if (app.service?.repairsTableId === tableId) {
    const hasClientCard = app.screens.some(screen => screen.id === app.service!.clientRepairScreenId && screen.contextTableId === tableId
      && screen.audience.kind === 'roles' && screen.audience.roleIds.includes('client'))
    if (!hasClientCard) return null
    return {
      emailFieldId: app.service.repair.clientEmail,
      moduleId: `mod_service_${tableId}`,
      detailScreenId: app.service.repairScreenId,
      titleFieldId: app.service.repair.device,
    }
  }
  if (app.support?.ticketsTableId === tableId) {
    const hasClientCard = app.screens.some(screen => screen.id === app.support!.clientTicketScreenId && screen.contextTableId === tableId
      && screen.audience.kind === 'roles' && screen.audience.roleIds.includes('client'))
    if (!hasClientCard) return null
    return {
      emailFieldId: app.support.ticket.clientEmail,
      moduleId: `mod_support_${tableId}`,
      detailScreenId: app.support.ticketScreenId,
      titleFieldId: app.support.ticket.subject,
    }
  }
  return null
}

/** Desk roles that may see internal notes and reply as staff. */
export function conversationStaffV2(app: AppV2, tableId: string, roleIds: readonly string[]) {
  if (app.service?.repairsTableId === tableId) return roleIds.includes('owner') || roleIds.includes('staff')
  if (app.support?.ticketsTableId === tableId) return roleIds.includes('owner') || roleIds.includes('staff')
  return false
}

export function conversationManagerV2(app: AppV2, tableId: string, roleIds: readonly string[]) {
  if (app.service?.repairsTableId === tableId || app.support?.ticketsTableId === tableId) return roleIds.includes('owner')
  return false
}
