import { appSchema, positionSequence, type App, type Field, type View } from '@tableapp/schema'
import { generateApp } from '../app-builder'
import type { BuiltTemplate } from './build'

/** CRM contacts remain internal; adding a catalog to the app must not expose them. */
export function asCRM(ready: App, built: BuiltTemplate): App {
  const crm = ready.customer?.crm
  if (!crm) throw new Error('CRM requires an explicit client binding')
  const table = built.tables.find(table => table.id === crm.clientsTableId)!
  const contacts = generateApp({ appId: ready.id, workspaceId: ready.workspaceId, name: table.name, slug: ready.slug, table,
    fields: built.fields.filter(field => field.tableId === table.id) as Field[], view: built.views.find(view => view.tableId === table.id)! as unknown as View })
  const contactScreens = contacts.screens.filter(screen => screen.type !== 'dashboard').map(screen => ({ ...screen,
    name: screen.type === 'list' ? 'Клиенты' : screen.type === 'detail' ? 'Карточка клиента' : screen.type === 'form' && screen.mode === 'create' ? 'Новый клиент' : 'Изменить клиента',
    tab: screen.type === 'list' ? { icon: 'users', label: 'Клиенты' } : null,
    access: { roles: ['manager'], public: false, publicFields: [], allowDelete: false },
  }))
  crm.listScreenId = contactScreens.find(screen => screen.type === 'list')!.id
  crm.detailScreenId = contactScreens.find(screen => screen.type === 'detail')!.id
  const screens = ready.screens.map(screen => {
    const hidden = screen.access.public || !screen.access.roles.some(role => role === 'staff' || role === 'manager')
    const names: Record<string, string> = { 'Назначенные мне': 'Мои сделки', 'Все обращения': 'Все сделки', 'Работа с обращением': 'Работа со сделкой', 'Управление обращением': 'Управление сделкой', 'Добавить обращение': 'Добавить сделку' }
    return { ...screen, name: names[screen.name] ?? screen.name,
      tab: hidden ? null : screen.tab ? { ...screen.tab, label: names[screen.tab.label] ?? screen.tab.label } : null,
      access: { ...screen.access, public: false, publicFields: [], roles: hidden ? [] : screen.access.roles.filter(role => role !== 'client') } }
  })
  return appSchema.parse({ ...ready, accessMode: 'allowlist', homeScreenId: ready.screens.find(screen => screen.type === 'dashboard' && screen.access.roles.includes('manager'))!.id,
    screens: [...screens, ...contactScreens].map((screen, i, all) => ({ ...screen, position: positionSequence(all.length)[i]! })) })
}
