import { customerWorkflows, type App } from '@tableapp/schema'

/**
 * Only records with a client scenario (booking visit or customer workflow) can
 * acquire a conversation. The client detail screen may be projected out of a
 * staff runtime; the workflow binding is the source of truth.
 */
export function conversationResource(app: App, tableId: string) {
  if (app.booking?.tables.visits === tableId) return { emailFieldId: app.booking.visit.email }
  const config = customerWorkflows(app).find(config => config.tableId === tableId)
  // Internal CRM deals are customer workflows without a public client cabinet.
  if (!config || config.crm && !app.screens.some(screen => screen.type === 'detail' && screen.tableId === tableId && screen.access.roles.includes('client'))) return null
  return { emailFieldId: config.emailFieldId }
}
