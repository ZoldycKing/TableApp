import type { AppV2, AppV2Node } from './schema'
import type { AppV2Catalog, AppV2Issue } from './validate'

const weekNames = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота']

export function validateTeamCalendar(
  app: AppV2,
  node: Extract<AppV2Node, { type: 'team_calendar' }>,
  catalog: AppV2Catalog,
  publish: boolean,
): AppV2Issue[] {
  const issues: AppV2Issue[] = []
  const at = (suffix: string, message: string) => issues.push({ code: 'team_calendar', path: `nodes.${node.id}${suffix}`, message })
  const data = node.data
  if (!data) {
    if (publish) at('', 'Выберите таблицы и поля календаря команды')
    return issues
  }
  const source = (value: { tableId: string; viewId: string | null }, suffix: string, label: string) => {
    if (catalog.tables.get(value.tableId)?.workspaceId !== app.workspaceId) at(`${suffix}.tableId`, `Таблица «${label}» недоступна этому пространству`)
    if (value.viewId && catalog.views.get(value.viewId)?.tableId !== value.tableId) at(`${suffix}.viewId`, `Выберите представление таблицы «${label}»`)
  }
  const field = (tableId: string, id: string | null, suffix: string, label: string, types?: readonly string[], target?: string) => {
    if (!id) return
    const found = catalog.fields.get(id)
    if (!found || found.tableId !== tableId) at(suffix, `Поле «${label}» не принадлежит выбранной таблице`)
    else if (types && !types.includes(found.type)) at(suffix, `Поле «${label}» должно иметь тип: ${types.join(', ')}`)
    else if (target && found.relationTableId !== target) at(suffix, `Поле «${label}» должно ссылаться на таблицу сотрудников`)
  }
  source(data, '.data', 'записи')
  source(data.resources, '.data.resources', 'сотрудники')
  field(data.tableId, data.titleFieldId, '.data.titleFieldId', 'Название записи')
  field(data.tableId, data.subtitleFieldId, '.data.subtitleFieldId', 'Подпись')
  field(data.tableId, data.startFieldId, '.data.startFieldId', 'Начало', ['datetime'])
  field(data.tableId, data.endFieldId, '.data.endFieldId', 'Окончание', ['datetime'])
  field(data.tableId, data.durationFieldId, '.data.durationFieldId', 'Длительность', ['number', 'formula', 'rollup'])
  if (!data.durationFieldId && !data.endFieldId) at('.data.endFieldId', 'Выберите окончание записи или длительность в минутах')
  if (data.durationFieldId && data.endFieldId) at('.data.endFieldId', 'Выберите один способ: окончание записи или длительность в минутах')
  if (data.endFieldId && data.endFieldId === data.startFieldId) at('.data.endFieldId', 'Начало и окончание записи должны быть разными полями')
  field(data.tableId, data.resourceFieldId, '.data.resourceFieldId', 'Связь с сотрудником', ['relation'], data.resources.tableId)
  field(data.tableId, data.statusFieldId, '.data.statusFieldId', 'Статус', ['single_select'])
  field(data.tableId, data.amountFieldId, '.data.amountFieldId', 'Стоимость', ['number', 'formula', 'rollup'])
  field(data.resources.tableId, data.resources.titleFieldId, '.data.resources.titleFieldId', 'Имя сотрудника')
  field(data.resources.tableId, data.resources.photoFieldId, '.data.resources.photoFieldId', 'Фото сотрудника', ['image', 'url'])
  field(data.resources.tableId, data.resources.ownerEmailFieldId, '.data.resources.ownerEmailFieldId', 'Почта сотрудника', ['email'])
  const statusChoices = data.statusFieldId ? catalog.fields.get(data.statusFieldId)?.choiceIds : undefined
  for (const [key, choiceId] of Object.entries(data.statusValues)) {
    if (!choiceId) continue
    if (!data.statusFieldId) at(`.data.statusValues.${key}`, 'Сначала выберите поле статуса')
    else if (statusChoices && !statusChoices.includes(choiceId)) at(`.data.statusValues.${key}`, 'Такого варианта нет в поле статуса')
  }
  const hours = data.hours
  if (hours) {
    source(hours, '.data.hours', 'рабочие часы')
    field(hours.tableId, hours.resourceFieldId, '.data.hours.resourceFieldId', 'Сотрудник в рабочих часах', ['relation'], data.resources.tableId)
    field(hours.tableId, hours.weekdayFieldId, '.data.hours.weekdayFieldId', 'День недели', ['single_select', 'text', 'number'])
    field(hours.tableId, hours.dateFieldId, '.data.hours.dateFieldId', 'Отдельная дата', ['date'])
    field(hours.tableId, hours.startFieldId, '.data.hours.startFieldId', 'Начало работы', ['text'])
    field(hours.tableId, hours.endFieldId, '.data.hours.endFieldId', 'Окончание работы', ['text'])
    if (hours.startFieldId === hours.endFieldId) at('.data.hours.endFieldId', 'Начало и окончание рабочих часов должны быть разными полями')
    field(hours.tableId, hours.closedFieldId, '.data.hours.closedFieldId', 'Выходной', ['checkbox'])
    if (!hours.weekdayFieldId && !hours.dateFieldId) at('.data.hours.weekdayFieldId', 'Для рабочих часов выберите день недели или отдельную дату')
    const weekdayChoices = hours.weekdayFieldId ? catalog.fields.get(hours.weekdayFieldId)?.choiceIds : undefined
    hours.weekdays.forEach((value, index) => {
      if (!hours.weekdayFieldId) return
      if (!value.trim()) at(`.data.hours.weekdays.${index}`, `Укажите значение для дня «${weekNames[index]}»`)
      else if (weekdayChoices && !weekdayChoices.includes(value)) at(`.data.hours.weekdays.${index}`, `Для «${weekNames[index]}» выберите существующий вариант дня недели`)
    })
  }
  const screenNodes = (screenId: string) => {
    const screen = app.screens.find(item => item.id === screenId)
    const byId = new Map(app.nodes.map(item => [item.id, item]))
    const found: AppV2Node[] = []
    const seen = new Set<string>()
    const walk = (ids: readonly string[]) => {
      for (const id of ids) {
        if (seen.has(id)) continue
        seen.add(id)
        const item = byId.get(id)
        if (!item) continue
        found.push(item)
        if ('childIds' in item) walk(item.childIds)
        if (item.type === 'collection') walk(item.itemIds)
      }
    }
    if (screen) walk(screen.rootIds)
    return { screen, found }
  }
  const formOn = (screenId: string | null, tableId: string, mode: 'create' | 'edit') => {
    if (!screenId) return false
    return screenNodes(screenId).found.some(item => item.type === 'form' && item.tableId === tableId && item.mode === mode)
  }
  const target = (id: string | null, tableId: string | null, suffix: string, label: string) => {
    if (!id) return
    const screen = app.screens.find(item => item.id === id)
    if (!screen) at(suffix, `Экран «${label}» не найден`)
    else if (screen.contextTableId !== tableId) at(suffix, `Экран «${label}» должен открывать ${tableId ? 'карточку этой таблицы' : 'обычный экран'}`)
  }
  target(node.actions.itemScreenId, data.tableId, '.actions.itemScreenId', 'запись')
  if (node.actions.createScreenId) {
    const bookingCatalog = app.booking?.catalogScreenId === node.actions.createScreenId
    target(node.actions.createScreenId, null, '.actions.createScreenId', 'добавление записи')
    if (publish && !bookingCatalog && !formOn(node.actions.createScreenId, data.tableId, 'create')) {
      at('.actions.createScreenId', 'На экране добавления нужна форма создания записи в выбранной таблице')
    }
  }
  if (node.actions.configureScreenId) {
    if (!hours) at('.actions.configureScreenId', 'Сначала подключите рабочие часы')
    else if (publish && !formOn(node.actions.configureScreenId, hours.tableId, 'create')) at('.actions.configureScreenId', 'На экране настройки нужна форма создания рабочих часов')
  }
  if (node.actions.periodScreenId) {
    if (!hours) at('.actions.periodScreenId', 'Сначала подключите рабочие часы')
    else {
      target(node.actions.periodScreenId, hours.tableId, '.actions.periodScreenId', 'рабочий период')
      if (publish && !formOn(node.actions.periodScreenId, hours.tableId, 'edit')) at('.actions.periodScreenId', 'На экране периода нужна форма изменения рабочих часов')
    }
  }
  node.actions.manageRoleIds.forEach((id, index) => {
    if (!app.roles.some(role => role.id === id)) at(`.actions.manageRoleIds.${index}`, 'Выберите существующую роль для управления календарём')
  })
  return issues
}
