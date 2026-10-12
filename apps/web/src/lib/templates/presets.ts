import { appSchema, type App, type Field } from '@tableapp/schema'
import type { BuiltTemplate } from './build'
import { asDispatch } from './dispatch-app'
import { asInventory } from './inventory-app'
import { asPortal } from './portal-app'
import { asProduction } from './production-app'
import { asSalon } from './salon-app'
import { asCustomerApp } from './customer-app'
import { legacyAppModules } from '../app-modules'

/** Installation and public examples must build the same application. */
export function templatePreset(app: App, built: BuiltTemplate): App {
  const preset = buildPreset(app, built)
  const modules = legacyAppModules(preset, new Map(built.tables.filter(table => table.templateId).map(table => [table.id, table.templateId!])))
  return modules.length ? { ...preset, modules } : preset
}

function buildPreset(app: App, built: BuiltTemplate): App {
  if (built.tables.find(table => table.id === built.appTableId)?.templateId === 'salon') return asSalon(app, built)
  if (built.customer) {
    const ready = asCustomerApp(app, built)
    if (built.tables.find(table => table.id === built.appTableId)?.templateId !== 'crm') return ready
    // Retain the CRM engine and its configuration references. Client-only
    // screens stay inaccessible; they are not exposed as duplicate staff tabs.
    return appSchema.parse({ ...ready, accessMode: 'allowlist',
      homeScreenId: ready.screens.find(screen => screen.type === 'dashboard' && screen.access.roles.includes('manager'))!.id,
      screens: ready.screens.map(screen => {
        const hidden = screen.access.public || !screen.access.roles.some(role => role === 'staff' || role === 'manager')
        const names: Record<string, string> = { 'Назначенные мне': 'Мои сделки', 'Все обращения': 'Все сделки', 'Работа с обращением': 'Работа со сделкой', 'Управление обращением': 'Управление сделкой', 'Добавить обращение': 'Добавить сделку' }
        return { ...screen, name: names[screen.name] ?? screen.name,
          tab: hidden ? null : screen.tab ? { ...screen.tab, label: names[screen.tab.label] ?? screen.tab.label } : null,
          access: { ...screen.access, public: false, publicFields: [], roles: hidden ? [] : screen.access.roles.filter(role => role !== 'client') },
        }
      }),
    })
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
