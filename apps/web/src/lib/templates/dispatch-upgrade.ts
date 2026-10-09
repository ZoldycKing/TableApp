import { byPosition, isComputed, newId, positionBetween, type App, type Field, type View } from '@tableapp/schema'
import { asDispatch, DispatchSetupError, dispatchFields, hasDispatchPreset } from './dispatch-app'

/** Only a standard closed template can be upgraded automatically. No rows are rewritten. */
export function prepareDispatchUpgrade(app: App,
  table: { id: string; workspaceId: string; templateId: string | null }, fields: Field[], views: View[],
  clients: { id: string; workspaceId: string; primaryFieldId: string | null } | null, clientFields: Field[]) {
  if (table.workspaceId !== app.workspaceId || table.templateId !== 'zayavki' || fields.some(field => field.tableId !== table.id)) {
    throw new DispatchSetupError('Таблица заявок недоступна или создана из другого шаблона')
  }
  if (hasDispatchPreset(app, table.id)) { dispatchFields(fields); return { app, fields: [] as Field[] } }
  const roleNames: Record<string, string[]> = { client: ['Клиент'], staff: ['Сотрудник'], manager: ['Ведущий', 'Руководитель'] }
  if (app.accessMode !== 'allowlist' || app.inventory || app.production || app.rowAccessRules.length ||
      app.roles.length !== 3 || app.roles.some(role => !roleNames[role.id]?.includes(role.name))) {
    throw new DispatchSetupError('Права приложения уже настроены. Автоматическое подключение не заменяет ваши правила; настройте роли вручную или установите новый шаблон.')
  }
  const list = app.screens.find(screen => screen.type === 'list')
  const detail = app.screens.find(screen => screen.type === 'detail')
  const edit = app.screens.find(screen => screen.type === 'form' && screen.mode === 'edit')
  const create = app.screens.find(screen => screen.type === 'form' && screen.mode === 'create')
  const standardRoles = app.screens[0]?.access.roles ?? []
  const standard = app.screens.length === 5 && app.screens.filter(screen => screen.type === 'dashboard').length === 1 &&
    list?.type === 'list' && views.some(view => view.id === list.source.viewId && view.tableId === table.id) &&
    !list.source.extraFilter && !list.components.length && detail?.type === 'detail' && detail.tableId === table.id &&
    edit?.type === 'form' && edit.tableId === table.id && create?.type === 'form' && create.tableId === table.id &&
    app.screens.every(screen => !screen.access.public && !screen.access.allowDelete && !screen.access.publicFields.length &&
      [2, 3].includes(standardRoles.length) && ['staff', 'manager'].every(role => standardRoles.includes(role)) &&
      standardRoles.every(role => ['client', 'staff', 'manager'].includes(role)) &&
      screen.access.roles.length === standardRoles.length && standardRoles.every(role => screen.access.roles.includes(role)))
  if (!standard || app.screens.some(screen => screen.type !== 'dashboard' && screen.components.some(component =>
    component.roles !== null || component.visibleWhen !== null ||
    (screen.type === 'form' ? component.type !== 'form_field' :
      component.type === 'button' ? component.action.type !== 'open_screen' || component.action.screenId !== edit!.id :
      !['field', 'heading', 'image'].includes(component.type))))) {
    throw new DispatchSetupError('Экраны заявок доработаны. Автоматическое подключение не заменяет ваши настройки; используйте ручную настройку или новый шаблон.')
  }
  // Preserve custom form labels/required fields only when the form still covers the standard table.
  const editable = fields.filter(field => !isComputed(field.type)).map(field => field.id)
  for (const form of [create, edit]) {
    if (form?.type !== 'form' || form.components.length !== editable.length ||
        editable.some(id => !form.components.some(component => component.type === 'form_field' && component.fieldId === id))) {
      throw new DispatchSetupError('Поля формы доработаны. Автоматическое подключение недоступно')
    }
  }
  const relation = fields.find(field => field.name === 'Клиент' && field.type === 'relation')
  const target = clientFields.find(field => field.id === clients?.primaryFieldId && field.type === 'text')
  if (!relation || relation.type !== 'relation' || !clients || clients.workspaceId !== app.workspaceId ||
      clients.id !== relation.options.tableId || !target || target.tableId !== clients.id) {
    throw new DispatchSetupError('Не найден справочник клиентов с текстовым названием в этом рабочем пространстве')
  }
  let position = [...fields].sort(byPosition).at(-1)?.position ?? null
  const additions: Field[] = []
  const add = (name: string, type: 'email' | 'lookup', options: Record<string, string>, description: string) => {
    if (fields.some(field => field.name === name)) return
    position = positionBetween(position, null)
    additions.push({ id: newId('field'), tableId: table.id, name, type, options, position, description } as Field)
  }
  add('Почта мастера', 'email', {}, 'Почта для назначения заявки. Добавьте адрес в список доступа с ролью «Мастер». Существующие заявки автоматически никому не назначаются.')
  add('Клиент для выезда', 'lookup', { relationFieldId: relation.id, targetFieldId: target.id }, 'Имя клиента из справочника, доступное мастеру в его заявках.')
  const all = [...fields, ...additions]
  const config = dispatchFields(all)
  const customer = all.find(field => field.id === config.clientName)!
  if (customer.type !== 'lookup' || customer.options.relationFieldId !== relation.id || customer.options.targetFieldId !== target.id) {
    throw new DispatchSetupError('Поле «Клиент для выезда» уже существует и настроено иначе')
  }
  const phone = clientFields.find(field => field.name === 'Телефон' && field.type === 'phone')
  const address = clientFields.find(field => field.name === 'Адрес' && field.type === 'text')
  const clientView = views.find(view => view.tableId === clients.id && view.type === 'grid')
  if (!phone || !address || !clientView || relation.options.allowMultiple || [config.phone, config.address].some((id, index) => {
    const lookup = all.find(field => field.id === id)
    return lookup?.type !== 'lookup' || lookup.options.relationFieldId !== relation.id || lookup.options.targetFieldId !== [phone.id, address.id][index]
  })) throw new DispatchSetupError('Справочник клиентов или подстановки телефона и адреса доработаны; настройте права вручную')
  return { app: asDispatch(app, table.id, all, true, { viewId: clientView.id, primaryFieldId: target.id, phoneFieldId: phone.id, addressFieldId: address.id }), fields: additions }
}
