import type { App, Field } from '@tableapp/schema'
import { defaultRole } from '../app-roles'

/** Upgrade only the original customer intake; preserve all IDs and published data. */
export function preparePortalUpgrade(app: App,
  table: { id: string; workspaceId: string; templateId: string | null; primaryFieldId: string | null }, fields: Field[]) {
  const fail = (): never => { throw new Error('Портал доработан. Настройте форму клиента вручную, сохранив правило доступа к своим заявкам.') }
  if (table.workspaceId !== app.workspaceId || table.templateId !== 'portal' || app.accessMode !== 'public') fail()
  const roleId = defaultRole(app)
  const rule = app.rowAccessRules.find(rule => rule.tableId === table.id && rule.match === 'email' && roleId && rule.appliesTo.includes(roleId))
  if (!roleId || !rule || !fields.some(field => field.id === rule.fieldId && field.type === 'email')) fail()
  const forms = app.screens.filter(screen => screen.type === 'form' && screen.tableId === table.id && screen.mode === 'create' && screen.access.public)
  if (forms.length !== 1) fail()
  const form = forms[0]!
  if (form.type !== 'form') return fail()
  const safe = new Set(fields.filter(field => ['Заказ', 'Почта клиента', 'Пожелания клиента'].includes(field.name)).map(field => field.id))
  if (safe.size !== 3 || !safe.has(table.primaryFieldId ?? '') || form.components.some(component => component.type === 'form_field' && !safe.has(component.fieldId))) fail()
  if (form.access.roles.some(role => role !== roleId)) fail()
  const components = form.components.filter(component => component.type !== 'form_field' || component.fieldId !== rule!.fieldId)
    .map(component => component.type === 'form_field' && component.fieldId === table.primaryFieldId ? { ...component, required: true } : component)
  const updated = { ...app, screens: app.screens.map(screen => screen.id !== form.id ? screen : {
    ...screen, components, access: { ...screen.access, roles: [roleId!] },
  }) }
  const updates: Field[] = []
  const status = fields.find(field => field.name === 'Статус' && field.type === 'single_select')
  if (status?.type === 'single_select' && !status.options.defaultChoiceId) {
    const choice = status.options.choices.find(choice => choice.name === 'Принят')
    if (choice) updates.push({ ...status, options: { ...status.options, defaultChoiceId: choice.id } })
  }
  const date = fields.find(field => field.name === 'Дата заказа' && field.type === 'date')
  if (date?.type === 'date' && date.options.defaultToday === undefined) updates.push({ ...date, options: { ...date.options, defaultToday: true } })
  return { app: updated, fields: updates }
}
