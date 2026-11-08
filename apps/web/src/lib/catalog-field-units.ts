import type { App } from '@tableapp/schema'

/** Infer no units from arbitrary column names: only installed semantic bindings count. */
export function catalogFieldUnits(app: Pick<App, 'booking'>, tableId: string | undefined): Readonly<Record<string, string>> | undefined {
  return app.booking && tableId === app.booking.tables.services ? { [app.booking.service.minutes]: 'мин' } : undefined
}
