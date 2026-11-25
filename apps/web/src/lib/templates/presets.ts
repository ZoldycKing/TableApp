import { type App, type Field } from '@tableapp/schema'
import type { BuiltTemplate } from './build'
import { asDispatch } from './dispatch-app'
import { asInventory } from './inventory-app'
import { asPortal } from './portal-app'
import { asProduction } from './production-app'
import { asSalon } from './salon-app'
import { asCustomerApp } from './customer-app'
import { asCRM } from './crm-app'
import { legacyAppModules } from '../app-modules'
import { withWorkflowScreenNames } from '../workflow-screen-names'

/** Installation and public examples must build the same application. */
export function templatePreset(app: App, built: BuiltTemplate): App {
  const preset = buildPreset(app, built)
  const modules = legacyAppModules(preset, new Map(built.tables.filter(table => table.templateId).map(table => [table.id, table.templateId!])))
  const withChat = preset.booking || preset.customer ? { communications: { enabled: true as const } } : {}
  return withWorkflowScreenNames({ ...preset, ...withChat, ...(modules.length ? { modules } : {}), templateTableIds: built.tables.map(table => table.id) }, Object.fromEntries(built.views.map(view => [view.id, view])))
}

function buildPreset(app: App, built: BuiltTemplate): App {
  if (built.tables.find(table => table.id === built.appTableId)?.templateId === 'salon') return asSalon(app, built)
  if (built.customer) {
    const ready = asCustomerApp(app, built)
    if (built.tables.find(table => table.id === built.appTableId)?.templateId !== 'crm') return ready
    return asCRM(ready, built)
  }
  if (built.portal) return asPortal(app, built.portal)
  if (built.production) return asProduction(app, built)
  if (built.inventory) return asInventory(app, built)
  if (built.tables.find(table => table.id === built.appTableId)?.templateId === 'zayavki') {
    const relation = built.fields.find(field => field.tableId === built.appTableId && field.name === 'Клиент')!
    const clientTable = built.tables.find(table => table.id === relation.options.tableId)!
    const clientFields = built.fields.filter(field => field.tableId === clientTable.id)
    return asDispatch(app, built.appTableId, built.fields.filter(field => field.tableId === built.appTableId) as Field[], false, {
      viewId: built.views.find(view => view.tableId === clientTable.id)!.id, primaryFieldId: clientTable.primaryFieldId!,
      phoneFieldId: clientFields.find(field => field.name === 'Телефон')!.id, addressFieldId: clientFields.find(field => field.name === 'Адрес')!.id,
    })
  }
  return app
}
