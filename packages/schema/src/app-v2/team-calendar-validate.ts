import type { AppV2, AppV2Node } from './schema'
import type { AppV2Catalog, AppV2Issue } from './validate'

export function validateTeamCalendar(app: AppV2, node: Extract<AppV2Node, { type: 'team_calendar' }>, catalog: AppV2Catalog, publish: boolean): AppV2Issue[] {
  const issues: AppV2Issue[] = [], path = `nodes.${node.id}`
  const issue = (message: string) => issues.push({ code: 'team_calendar', path, message })
  const data = node.data
  if (!data) { if (publish) issue('Выберите таблицы и поля календаря команды'); return issues }
  const source = (value: { tableId: string; viewId: string | null }) => {
    if (catalog.tables.get(value.tableId)?.workspaceId !== app.workspaceId) issue('Таблица календаря недоступна этому пространству')
    if (value.viewId && catalog.views.get(value.viewId)?.tableId !== value.tableId) issue('Выберите представление своей таблицы календаря')
  }
  const field = (tableId: string, id: string | null, types?: readonly string[], target?: string) => {
    if (!id) return
    const f = catalog.fields.get(id)
    if (!f || f.tableId !== tableId || types && !types.includes(f.type) || target && f.relationTableId !== target) issue('Проверьте поля календаря: тип поля и таблица должны соответствовать выбранным данным')
  }
  source(data); source(data.resources)
  field(data.tableId, data.titleFieldId); field(data.tableId, data.subtitleFieldId)
  field(data.tableId, data.startFieldId, ['datetime'])
  field(data.tableId, data.endFieldId, ['datetime'])
  field(data.tableId, data.durationFieldId, ['number', 'formula', 'rollup'])
  if (!data.durationFieldId && !data.endFieldId) issue('Выберите окончание записи или длительность в минутах')
  if (data.durationFieldId && data.endFieldId) issue('Выберите один способ: окончание записи или длительность в минутах')
  if (data.endFieldId === data.startFieldId) issue('Начало и окончание записи должны быть разными полями')
  field(data.tableId, data.resourceFieldId, ['relation'], data.resources.tableId)
  field(data.tableId, data.statusFieldId, ['single_select'])
  field(data.tableId, data.amountFieldId, ['number', 'formula', 'rollup'])
  field(data.resources.tableId, data.resources.titleFieldId)
  field(data.resources.tableId, data.resources.photoFieldId, ['image', 'url'])
  field(data.resources.tableId, data.resources.ownerEmailFieldId, ['email'])
  const hours = data.hours
  if (hours) {
    source(hours)
    field(hours.tableId, hours.resourceFieldId, ['relation'], data.resources.tableId)
    field(hours.tableId, hours.weekdayFieldId, ['single_select', 'text', 'number'])
    field(hours.tableId, hours.dateFieldId, ['date'])
    field(hours.tableId, hours.startFieldId, ['text']); field(hours.tableId, hours.endFieldId, ['text'])
    if (hours.startFieldId === hours.endFieldId) issue('Начало и окончание рабочих часов должны быть разными полями')
    field(hours.tableId, hours.closedFieldId, ['checkbox'])
    if (!hours.weekdayFieldId && !hours.dateFieldId) issue('Для рабочих часов выберите день недели или отдельную дату')
  }
  const target = (id: string | null, tableId: string | null) => {
    if (id && app.screens.find(screen => screen.id === id)?.contextTableId !== tableId) issue('Действие календаря должно открывать экран с подходящей таблицей')
  }
  target(node.actions.itemScreenId, data.tableId)
  target(node.actions.createScreenId, null); target(node.actions.configureScreenId, null)
  if (node.actions.periodScreenId) { if (!hours) issue('Сначала подключите рабочие часы'); else target(node.actions.periodScreenId, hours.tableId) }
  if (node.actions.manageRoleIds.some(id => !app.roles.some(role => role.id === id))) issue('Выберите существующие роли для управления календарём')
  return issues
}
