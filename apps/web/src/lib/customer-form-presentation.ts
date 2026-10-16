import { customerWorkflows, type App, type Field, type Screen } from '@tableapp/schema'

/** Presentation only: server permissions still decide which values can be written. */
export function customerFormPresentation(app: App, screen: Screen, fields: Field[]) {
  const hidden = new Set<string>(), labels = new Map<string, string>(), hints = new Map<string, string>()
  if (screen.type !== 'form') return { hidden, labels, hints }
  const config = customerWorkflows(app).find(config => config.tableId === screen.tableId)
  if (!config) return { hidden, labels, hints }
  for (const id of [config.submissionFieldId, config.cart?.fieldId, config.createdFieldId, config.approval?.approvedPriceFieldId]) if (id) hidden.add(id)
  if (screen.id === config.formScreenId) return { hidden, labels, hints }
  labels.set(config.emailFieldId, 'Почта клиента для кабинета')
  hints.set(config.emailFieldId, 'Клиент увидит заказ или заявку после входа с этой почтой. Письмо автоматически не отправляется.')
  if (config.assignmentFieldId) {
    labels.set(config.assignmentFieldId, 'Почта ответственного сотрудника')
    hints.set(config.assignmentFieldId, 'Укажите почту сотрудника с рабочим доступом к этому разделу. Она определяет, кому назначена запись.')
  }
  if (config.cart) labels.set(config.cart.positionsFieldId, 'Состав заказа')
  if (config.profile && config.logistics?.kind === 'sales') {
    // Only the exact legacy template duplicates are normalized. A custom contact
    // column with its own purpose, label or description remains editable.
    for (const field of fields) {
      if (field.id === config.profile.nameFieldId || field.id === config.profile.phoneFieldId) continue
      if (field.type === 'text' && field.name === 'Покупатель' && field.description === 'Кому отгружаем. Если покупателей много и они повторяются, заведите для них отдельную таблицу и свяжите.' ||
        field.type === 'phone' && field.name === 'Телефон' && field.description === 'Кому звонить перед доставкой.') hidden.add(field.id)
    }
  }
  return { hidden, labels, hints }
}
