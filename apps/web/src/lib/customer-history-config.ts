import { customerWorkflows, type App } from '@tableapp/schema'
import { moduleForTable } from './module-access'

export function crmForTable(app: App, tableId: string) {
  return customerWorkflows(app).find(config => (config.tableId === tableId || config.crm?.clientsTableId === tableId) && moduleForTable(app, config.tableId)?.kind === 'crm')
}
