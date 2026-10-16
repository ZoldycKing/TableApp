import { describe, expect, it } from 'vitest'
import type { Field, Screen } from '@tableapp/schema'
import { templateExample } from './templates/presentation'
import { workflowRole } from './module-access'
import { customerFormPresentation } from './customer-form-presentation'

describe('working customer form presentation', () => {
  it('omits generated fields and legacy contact duplicates in new sales forms, while keeping order contents and access fields', () => {
    const example = templateExample('zakazy'), config = example.app.customer!
    const manager = workflowRole(example.app, config.tableId, 'manager')
    const forms = example.app.screens.filter(screen => screen.type === 'form' && screen.tableId === config.tableId && screen.access.roles.includes(manager))
    expect(forms).toHaveLength(2)
    const fields = example.fields.filter(field => field.tableId === config.tableId) as Field[]
    const legacyContacts = fields.filter(field => field.name === 'Покупатель' || field.name === 'Телефон').map(field => field.id)
    for (const form of forms) {
      expect(form.type).toBe('form')
      const components = 'components' in form ? form.components.filter(component => component.type === 'form_field') : []
      const ids = components.map(component => component.fieldId)
      expect(ids).not.toContain(config.submissionFieldId)
      expect(ids).not.toContain(config.createdFieldId)
      expect(ids).not.toContain(config.cart!.fieldId)
      expect(ids).toContain(config.cart!.positionsFieldId)
      expect(ids).toContain(config.profile!.nameFieldId)
      expect(ids).toContain(config.profile!.phoneFieldId)
      expect(ids).toContain(config.emailFieldId)
      expect(ids).toContain(config.assignmentFieldId)
      expect(ids.some(id => legacyContacts.includes(id))).toBe(false)
      expect(components.find(component => component.fieldId === config.cart!.positionsFieldId)?.label).toBe('Состав заказа')
      expect(components.find(component => component.fieldId === config.emailFieldId)?.label).toBe('Почта клиента для кабинета')
    }
  })
  it('normalizes an existing sales form through explicit bindings without hiding custom contact fields', () => {
    const example = templateExample('zakazy'), config = example.app.customer!
    const fields = example.fields.filter(field => field.tableId === config.tableId) as Field[]
    const customPhone = { ...fields.find(field => field.type === 'phone')!, id: 'custom-phone', name: 'Телефон', description: 'Телефон охраны для въезда на склад.' } as Field
    const manager = workflowRole(example.app, config.tableId, 'manager')
    const screen = example.app.screens.find(screen => screen.type === 'form' && screen.tableId === config.tableId && screen.access.roles.includes(manager)) as Screen
    const presentation = customerFormPresentation(example.app, screen, [...fields, customPhone])
    expect(presentation.hidden.has(config.submissionFieldId!)).toBe(true)
    expect(presentation.hidden.has(config.createdFieldId!)).toBe(true)
    expect(presentation.hidden.has(config.cart!.fieldId)).toBe(true)
    expect(presentation.hidden.has(fields.find(field => field.name === 'Покупатель')!.id)).toBe(true)
    expect(presentation.hidden.has(customPhone.id)).toBe(false)
    expect(presentation.hidden.has(config.cart!.positionsFieldId)).toBe(false)
    expect(presentation.labels.get(config.cart!.positionsFieldId)).toBe('Состав заказа')
    expect(presentation.hints.get(config.emailFieldId)).toContain('Письмо автоматически не отправляется')
    expect(presentation.labels.get(config.assignmentFieldId!)).toBe('Почта ответственного сотрудника')
  })
  it('leaves customer-facing labels and unrelated custom forms intact', () => {
    const example = templateExample('zakazy'), config = example.app.customer!, fields = example.fields as Field[]
    const customer = example.app.screens.find(screen => screen.id === config.formScreenId)!
    expect(customerFormPresentation(example.app, customer, fields).labels.size).toBe(0)
    const unrelated = { ...customer, tableId: 'custom-table' } as Screen
    const result = customerFormPresentation(example.app, unrelated, fields)
    expect(result.labels.size).toBe(0)
    expect(result.hidden.size).toBe(0)
  })
})
