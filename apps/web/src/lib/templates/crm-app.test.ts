import { describe, expect, it } from 'vitest'
import { templateExample } from './presentation'
import { composeModules } from '../module-composition'
import { checkAppReferences } from '../app-references'
import { ANONYMOUS, asRole, canOpenScreen, visitorFor } from '../app-roles'
import { moduleContract } from '../app-modules'
import { moduleForTable } from '../module-access'

describe('private CRM contacts', () => {
  it('creates internal deals without a service catalogue or duplicate customer contacts', () => {
    const example = templateExample('crm'), config = example.app.customer!
    const create = example.app.screens.find(screen => screen.type === 'form' && screen.mode === 'create' && screen.tableId === config.tableId && screen.access.roles.includes('manager'))!
    if (create.type !== 'form') throw new Error('Missing deal form')
    const inputs = create.components.filter(component => component.type === 'form_field')
    const required = inputs.filter(component => component.required).map(component => example.fields.find(field => field.id === component.fieldId)!.name)
    expect(required).toEqual(['О чём сделка', 'Клиент'])
    const names = inputs.map(component => example.fields.find(field => field.id === component.fieldId)!.name)
    for (const name of ['Выбранная услуга', 'Имя клиента', 'Телефон клиента', 'Ответственный', 'Почта клиента']) expect(names).not.toContain(name)
    expect(example.built.tables.map(table => table.name)).toEqual(['Клиенты', 'Сделки', 'Контакты по сделкам'])
    expect(create.submitLabel).toBe('Создать сделку')
    const destination = example.app.screens.find(screen => screen.id === create.successScreenId)!
    expect(canOpenScreen(destination, asRole('manager', 'owner@example.invalid'))).toBe(true)
    expect(destination.type).toBe('list')
  })
  it('preserves the sample negotiation stage instead of turning it into a completed deal', () => {
    const example = templateExample('crm'), stage = example.field('deals', 'stage')
    if (stage.type !== 'single_select') throw new Error('Missing stage')
    const negotiation = stage.options.choices.find(choice => choice.name === 'Переговоры')!.id
    expect(example.built.rows.some(row => row.data[stage.id] === negotiation)).toBe(true)
  })
  it('shows the assigned manager a client-name lookup without opening the private contact directory', () => {
    const example = templateExample('crm'), config = example.app.customer!, clientName = example.field('deals', 'clientName')
    const detail = example.app.screens.find(screen => screen.type === 'detail' && screen.tableId === config.tableId && screen.access.roles.includes('staff'))!
    if (detail.type !== 'detail') throw new Error('Missing assigned deal card')
    expect(detail.components.some(component => component.type === 'field' && component.fieldId === clientName.id && component.roles?.includes('staff') && component.label === 'Клиент')).toBe(true)
    expect(detail.components.some(component => component.type === 'field' && component.fieldId === config.crm!.relationFieldId && component.roles?.includes('staff'))).toBe(false)
    expect(canOpenScreen(example.app.screens.find(screen => screen.id === config.crm!.listScreenId)!, asRole('staff', 'worker@example.invalid'))).toBe(false)
  })
  it('binds a real client relation and assigns contacts, forms and history to the CRM module', () => {
    const example = templateExample('crm'), crm = example.app.customer!.crm!, module = example.app.modules!.find(module => module.kind === 'crm')!
    expect(checkAppReferences(example.app, { tableIds: new Set(example.built.tables.map(table => table.id)), fields: new Map(example.fields.map(field => [field.id, field])), views: new Map(example.views.map(view => [view.id, view])) })).toBeNull()
    expect(moduleContract(example.app, module)?.writeTables).toContain(crm.clientsTableId)
    expect(moduleForTable(example.app, crm.clientsTableId)?.id).toBe(module.id)
    expect(example.app.screens.find(screen => screen.id === crm.listScreenId)?.tab?.label).toBe('Клиенты')
    expect(example.app.screens.filter(screen => screen.type === 'form' && screen.tableId === crm.clientsTableId && screen.mode === 'create')).toHaveLength(1)
  })
  it('keeps contacts private after adding a client catalog; only the explicit CRM manager opens the directory', () => {
    const crmExample = templateExample('crm'), catalog = templateExample('zakazy'), views = [...crmExample.views, ...catalog.views]
    const app = composeModules(crmExample.app, catalog.app, new Map(views.map(view => [view.id, view])))
    const crm = app.customer!.crm!, module = app.modules!.find(module => module.kind === 'crm')!
    app.moduleAccess!.grants = [{ email: 'manager@example.invalid', moduleId: module.id, roleId: module.roles!.manager! }, { email: 'worker@example.invalid', moduleId: module.id, roleId: module.roles!.staff! }]
    const screen = app.screens.find(screen => screen.id === crm.listScreenId)!
    expect(canOpenScreen(screen, ANONYMOUS)).toBe(false)
    expect(canOpenScreen(screen, visitorFor(app, 'customer@example.invalid'))).toBe(false)
    expect(canOpenScreen(screen, visitorFor(app, 'worker@example.invalid'))).toBe(false)
    expect(canOpenScreen(screen, visitorFor(app, 'manager@example.invalid'))).toBe(true)
  })
  it('rejects a public/default-role contact screen or a form used as the profile detail', () => {
    const example = templateExample('crm'), catalog = { tableIds: new Set(example.built.tables.map(table => table.id)), fields: new Map(example.fields.map(field => [field.id, field])), views: new Map(example.views.map(view => [view.id, view])) }
    const crm = example.app.customer!.crm!, original = example.app.screens.find(screen => screen.id === crm.listScreenId)!
    original.access.public = true
    expect(checkAppReferences(example.app, catalog)).toContain('внутренний экран клиентов')
    original.access.public = false; original.access.roles = ['client']
    expect(checkAppReferences(example.app, catalog)).toContain('внутренний экран клиентов')
    original.access.roles = ['manager']; crm.detailScreenId = example.app.screens.find(screen => screen.type === 'form' && screen.tableId === crm.clientsTableId)!.id
    expect(checkAppReferences(example.app, catalog)).toContain('внутренний экран клиентов')
  })
})
