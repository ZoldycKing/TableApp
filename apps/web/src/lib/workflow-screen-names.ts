import { customerWorkflows, type App, type CustomerWorkflow, type ModuleKind, type Screen } from '@tableapp/schema'
import { moduleForTable, workflowRole } from './module-access'

type Names = { list: string; listTab?: string; create: string; createTab?: string; assigned: string; work: string; manage: string; detail: string }

const names: Partial<Record<ModuleKind, Names>> = {
  sales: { list: 'Заказы', create: 'Новый заказ', assigned: 'Мои заказы', work: 'Работа с заказом', manage: 'Управление заказом', detail: 'Карточка заказа' },
  delivery: { list: 'Доставки', create: 'Новая доставка', assigned: 'Мои доставки', work: 'Работа с доставкой', manage: 'Управление доставкой', detail: 'Карточка доставки' },
  repair: { list: 'Ремонты', create: 'Заявка на ремонт', assigned: 'Мои ремонты', work: 'Работа с ремонтом', manage: 'Управление ремонтом', detail: 'Карточка ремонта' },
  property: { list: 'Заявки на просмотр', listTab: 'Просмотры', create: 'Новая заявка на просмотр', createTab: 'Новый просмотр', assigned: 'Мои просмотры', work: 'Работа с заявкой на просмотр', manage: 'Управление заявкой на просмотр', detail: 'Карточка просмотра' },
  field_service: { list: 'Заявки', create: 'Новая заявка', assigned: 'Мои заявки', work: 'Работа с заявкой', manage: 'Управление заявкой', detail: 'Карточка заявки' },
  requests: { list: 'Заявки', create: 'Новая заявка', assigned: 'Мои заявки', work: 'Работа с заявкой', manage: 'Управление заявкой', detail: 'Карточка заявки' },
  crm: { list: 'Сделки', create: 'Новая сделка', assigned: 'Мои сделки', work: 'Работа со сделкой', manage: 'Управление сделкой', detail: 'Карточка сделки' },
  support: { list: 'Вопросы клиентов', create: 'Новый вопрос', assigned: 'Мои вопросы', work: 'Работа с вопросом', manage: 'Управление вопросом', detail: 'Карточка вопроса' },
}

function workflowKind(app: App, workflow: CustomerWorkflow): ModuleKind {
  const installed = moduleForTable(app, workflow.tableId)
  if (installed) return installed.kind
  // Old publications may lack a manifest. Only explicit workflow bindings identify a specialized scenario.
  return workflow.parent ? 'support' : workflow.crm ? 'crm' : workflow.cart ? 'sales'
    : workflow.logistics?.kind === 'delivery' ? 'delivery' : workflow.approval ? 'repair' : workflow.appointment ? 'property' : 'requests'
}

/** Shared customer copy follows the installed workflow, never a table title. */
export function customerWorkflowNouns(app: App, workflow: CustomerWorkflow): { singular: string; genitivePlural: string; accusative: string } {
  const copy: Partial<Record<ModuleKind, { singular: string; genitivePlural: string }>> = {
    sales: { singular: 'заказ', genitivePlural: 'заказов' }, delivery: { singular: 'доставка', genitivePlural: 'доставок' },
    repair: { singular: 'заявка на ремонт', genitivePlural: 'заявок на ремонт' }, property: { singular: 'заявка на просмотр', genitivePlural: 'заявок на просмотр' },
    crm: { singular: 'сделка', genitivePlural: 'сделок' }, support: { singular: 'вопрос', genitivePlural: 'вопросов' },
  }
  const nouns = copy[workflowKind(app, workflow)] ?? { singular: 'заявка', genitivePlural: 'заявок' }
  return { ...nouns, accusative: nouns.singular.replace(/^заявка/, 'заявку').replace(/^доставка$/, 'доставку').replace(/^сделка$/, 'сделку') }
}

function standardName(screen: Screen, label: string, copy: Names, tab = false): string {
  if (screen.type === 'list' || screen.type === 'tiles') {
    if (label === 'Все обращения' || label === 'Обращения клиентов') return tab ? copy.listTab ?? copy.list : copy.list
    if (label === 'Назначенные мне' || label === 'Назначенные обращения') return copy.assigned
  } else if (screen.type === 'form') {
    if (screen.mode === 'create' && (label === 'Добавить обращение' || tab && label === 'Добавить')) return tab ? copy.createTab ?? copy.create : copy.create
    if (screen.mode === 'edit' && label === 'Работа с обращением') return copy.work
    if (screen.mode === 'edit' && label === 'Управление обращением') return copy.manage
  } else if (screen.type === 'detail' && label === 'Рабочая карточка') return copy.detail
  return label
}

/** Replace factory wording through workflow/table bindings; custom names and client screens stay authoritative. */
export function withWorkflowScreenNames(app: App, views: Readonly<Record<string, { tableId: string }>>): App {
  const workflows = customerWorkflows(app)
  if (!workflows.length) return app
  let changed = false
  const screens = app.screens.map(screen => {
    const tableId = 'tableId' in screen ? screen.tableId : 'source' in screen ? views[screen.source.viewId]?.tableId : undefined
    const workflow = workflows.find(candidate => candidate.tableId === tableId)
    if (!workflow || screen.access.public || [workflow.listScreenId, workflow.formScreenId, workflow.detailScreenId].includes(screen.id)) return screen
    if (!['staff', 'manager'].some(role => screen.access.roles.includes(workflowRole(app, workflow.tableId, role)))) return screen
    const copy = names[workflowKind(app, workflow)]
    if (!copy) return screen
    const name = standardName(screen, screen.name, copy)
    const label = screen.tab ? standardName(screen, screen.tab.label, copy, true) : null
    if (name === screen.name && label === (screen.tab?.label ?? null)) return screen
    changed = true
    return { ...screen, name, tab: screen.tab ? { ...screen.tab, label: label! } : null }
  })
  return changed ? { ...app, screens } : app
}
