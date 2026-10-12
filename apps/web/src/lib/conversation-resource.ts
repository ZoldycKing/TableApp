import { customerWorkflows, type App } from '@tableapp/schema'

/** Only records which actually have a client detail screen can acquire a conversation. */
export function conversationResource(app: App, tableId: string) {
  if (!app.screens.some(screen => screen.type === 'detail' && screen.tableId === tableId && screen.access.roles.includes('client'))) return null
  if (app.booking?.tables.visits === tableId) return { emailFieldId: app.booking.visit.email }
  const config = customerWorkflows(app).find(config => config.tableId === tableId)
  return config ? { emailFieldId: config.emailFieldId } : null
}
