import { appSchema, isComputed, newId, positionSequence, type App, type Component, type Field, type Screen } from '@tableapp/schema'

export class DispatchSetupError extends Error {}

/** Resolve the standard template by names and types, never by field order. */
export function dispatchFields(fields: readonly Field[]) {
  const get = (name: string, type: Field['type']) => {
    const matches = fields.filter(field => field.name === name)
    if (matches.length !== 1 || matches[0]!.type !== type) throw new DispatchSetupError(`Не найдено однозначное поле «${name}» типа ${type}`)
    return matches[0]!.id
  }
  return {
    what: get('Что сделать', 'text'), client: get('Клиент', 'relation'), clientName: get('Клиент для выезда', 'lookup'),
    phone: get('Телефон', 'lookup'), address: get('Адрес', 'lookup'), status: get('Статус', 'single_select'),
    master: get('Мастер', 'text'), email: get('Почта мастера', 'email'), date: get('Дата выезда', 'date'),
    price: get('Стоимость', 'number'), paid: get('Оплачено', 'checkbox'), photo: get('Фото с выезда', 'attachment'),
    comment: get('Комментарий', 'long_text'),
  }
}

/** Used only for setup UI/idempotence; runtime permissions come from screens and row rules. */
export function hasDispatchPreset(app: App, tableId: string): boolean {
  if (app.customer?.tableId === tableId && app.customer.assignmentFieldId) return true
  return app.roles.some(role => role.id === 'staff' && role.name === 'Мастер') &&
    app.roles.some(role => role.id === 'manager' && role.name === 'Диспетчер') &&
    app.rowAccessRules.some(rule => rule.tableId === tableId && rule.match === 'email' && rule.appliesTo.includes('staff')) &&
    app.screens.some(screen => screen.type === 'form' && screen.tableId === tableId && screen.mode === 'edit' && screen.name === 'Отчёт мастера')
}

/** Closed dispatcher/master preset. Assignment is the verified email, not the displayed name. */
export function asDispatch(app: App, tableId: string, fields: readonly Field[], legacy = false,
  clients?: { viewId: string; primaryFieldId: string; phoneFieldId: string; addressFieldId: string }): App {
  const f = dispatchFields(fields)
  const workerRoles = legacy && app.roles.some(role => role.id === 'client') ? ['staff', 'client'] : ['staff']
  const both = ['manager', ...workerRoles]
  const access = (roles: string[]) => ({ public: false, publicFields: [], roles, allowDelete: false })
  const list = app.screens.find(screen => screen.type === 'list')!
  const detail = app.screens.find(screen => screen.type === 'detail' && screen.tableId === tableId)!
  const edit = app.screens.find(screen => screen.type === 'form' && screen.tableId === tableId && screen.mode === 'edit')!
  if (!list || !detail || !edit) throw new DispatchSetupError('Не найдены стандартные экраны заявок')
  const reportId = newId('screen')
  const readable = new Set([f.what, f.clientName, f.phone, f.address, f.status, f.master, f.date, f.photo, f.comment])
  const safeComponents = detail.type === 'detail' ? detail.components.map((component): Component => {
    if (component.type === 'field') return { ...component, roles: readable.has(component.fieldId) ? null : ['manager'] }
    if (component.type === 'heading' && component.source.kind === 'field' && component.source.fieldId === f.what ||
        component.type === 'image' && component.fieldId === f.photo) return component
    return { ...component, roles: ['manager'] }
  }) : []
  for (const fieldId of [f.clientName, f.email]) {
    if (!safeComponents.some(component => component.type === 'field' && component.fieldId === fieldId)) {
      safeComponents.push({ id: newId('component'), position: 'z', type: 'field', fieldId,
        roles: fieldId === f.email ? ['manager'] : null, visibleWhen: null, label: null, showWhenEmpty: false })
    }
  }
  // Existing forms retain their IDs; the worker gets a separate, limited form.
  const forms = app.screens.filter(screen => screen.type === 'form').map(screen => ({ ...screen, access: access(['manager']),
    name: screen.type === 'form' && screen.mode === 'create' ? 'Новая заявка' : 'Изменить заявку',
    ...(screen.type === 'form' ? {
      submitLabel: screen.mode === 'create' ? 'Создать заявку' : 'Сохранить',
      components: fields.filter(field => !isComputed(field.type)).map((field, i, all): Component => ({
        ...(screen.components.find(c => c.type === 'form_field' && c.fieldId === field.id) ?? {
          id: newId('component'), type: 'form_field' as const, fieldId: field.id, roles: null,
          visibleWhen: null, label: null, required: false, placeholder: null,
        }), position: positionSequence(all.length)[i]!, ...(!legacy && field.id === f.what ? { required: true } : {}),
      })),
    } : {}),
  }))
  const report: Screen = {
    id: reportId, appId: app.id, position: 'a', name: 'Отчёт мастера', tab: null, access: access(workerRoles),
    type: 'form', tableId, mode: 'edit', submitLabel: 'Сохранить', successScreenId: detail.id, successText: '',
    components: [f.status, f.photo, f.comment].map((fieldId, i): Component => ({
      id: newId('component'), position: positionSequence(3)[i]!, type: 'form_field', fieldId, roles: null,
      visibleWhen: null, label: null, required: false, placeholder: null,
    })),
  }
  const button: Component = { id: newId('component'), position: 'zz', type: 'button', roles: workerRoles,
    visibleWhen: null, label: 'Изменить', style: 'secondary', action: { id: newId('action'), type: 'open_screen', screenId: reportId } }
  const screens: Screen[] = [
    ...app.screens.filter(screen => screen.type === 'dashboard').map(screen => ({ ...screen, access: access(['manager']) })),
    { ...list, access: access(both), name: 'Заявки', tab: { icon: 'list', label: 'Заявки' }, ...(list.type === 'list' ? {
      titleFieldId: f.what, subtitleFieldId: f.clientName, metaFieldId: f.date, statusFieldId: f.status, imageFieldId: null,
      source: { ...list.source, searchFieldIds: [f.what, f.clientName, f.address] },
    } : {}) },
    { ...detail, access: access(both), ...(detail.type === 'detail' ? { components: [...safeComponents, button].map((c, i, all) => ({ ...c, position: positionSequence(all.length)[i]! })) } : {}) },
    ...forms, report,
    ...(clients ? [{ id: newId('screen'), appId: app.id, position: 'a', name: 'Клиенты', tab: { icon: 'users', label: 'Клиенты' },
      access: access(['manager']), type: 'list' as const, source: { viewId: clients.viewId, extraFilter: null, searchFieldIds: [clients.primaryFieldId, clients.phoneFieldId] },
      titleFieldId: clients.primaryFieldId, subtitleFieldId: clients.addressFieldId, metaFieldId: clients.phoneFieldId,
      imageFieldId: null, statusFieldId: null, onTapScreenId: null, components: [] }] : []),
  ]
  return appSchema.parse({ ...app, accessMode: 'allowlist', roles: [
    { id: 'staff', name: 'Мастер', isDefault: true }, { id: 'manager', name: 'Диспетчер', isDefault: false },
    ...(workerRoles.includes('client') ? [{ id: 'client', name: 'Мастер (прежняя роль)', isDefault: false }] : []),
  ], rowAccessRules: [{ tableId, fieldId: f.email, match: 'email', appliesTo: workerRoles }],
  screens: screens.map((screen, i) => ({ ...screen, position: positionSequence(screens.length)[i]! })) })
}
