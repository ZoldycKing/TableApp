import { customerWorkflows, type App, type Screen } from '@tableapp/schema'
import { acceptsModuleIntake } from './module-access'

/** Checkout is a private screen. Its public card may offer the email verification step. */
export function customerCheckoutIds(app: App): Set<string> {
  return new Set([
    ...customerWorkflows(app).map(config => config.formScreenId),
    ...(app.booking ? [app.booking.formScreenId] : []),
  ])
}

export function offersCustomerCheckout(app: App, source: Screen, targetId: string): boolean {
  if (!source.access.public || source.type !== 'detail') return false
  const config = customerWorkflows(app).find(config => config.formScreenId === targetId)
  if (config?.catalog) return acceptsModuleIntake(app, config.tableId) && source.id === config.catalog.detailScreenId
  return Boolean(app.booking && acceptsModuleIntake(app, app.booking.tables.visits) && targetId === app.booking.formScreenId && source.tableId === app.booking.tables.services)
}

export type CheckoutIntent = { screenId: string; rowId: string | null }

/** Only a public item reference is kept while signing in, never personal form values. */
export function parseCheckoutIntent(value: string, app: App): CheckoutIntent | null {
  try {
    const parsed = JSON.parse(value)
    if (!parsed || !customerCheckoutIds(app).has(parsed.screenId) ||
      !(parsed.rowId === null || typeof parsed.rowId === 'string' && parsed.rowId.length <= 100)) return null
    return { screenId: parsed.screenId, rowId: parsed.rowId }
  } catch { return null }
}
