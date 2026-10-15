import { customerWorkflows, type App } from '@tableapp/schema'

/** Only customer-facing businesses with a public catalog can accept general questions. */
export function generalChatAvailableApp(app: App): boolean {
  if (app.roles.find(role => role.isDefault)?.id !== 'client') return false
  const catalogs = new Set(customerWorkflows(app).flatMap(workflow => workflow.catalog ? [workflow.catalog.detailScreenId] : []))
  return app.screens.some(screen => screen.access.public && (
    catalogs.has(screen.id) || Boolean(app.booking && screen.type === 'detail' && screen.tableId === app.booking.tables.services)
  ))
}
