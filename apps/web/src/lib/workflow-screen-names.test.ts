import { customerWorkflows, type App, type CustomerWorkflow } from '@tableapp/schema'
import { describe, expect, it } from 'vitest'
import { composeModules } from './module-composition'
import { workflowRole } from './module-access'
import { templateExample } from './templates/presentation'
import { withWorkflowScreenNames } from './workflow-screen-names'

type Views = Readonly<Record<string, { tableId: string }>>

function privateScreens(app: App, views: Views, workflow: CustomerWorkflow) {
  const manager = workflowRole(app, workflow.tableId, 'manager'), staff = workflowRole(app, workflow.tableId, 'staff')
  const collection = app.screens.filter(screen => (screen.type === 'list' || screen.type === 'tiles') && views[screen.source.viewId]?.tableId === workflow.tableId)
  return {
    list: collection.find(screen => screen.access.roles.includes(manager))!,
    assigned: collection.find(screen => screen.access.roles.includes(staff))!,
    create: app.screens.find(screen => screen.type === 'form' && screen.tableId === workflow.tableId && screen.mode === 'create' && screen.access.roles.includes(manager))!,
    work: app.screens.find(screen => screen.type === 'form' && screen.tableId === workflow.tableId && screen.mode === 'edit' && screen.access.roles.includes(staff))!,
    manage: app.screens.find(screen => screen.type === 'form' && screen.tableId === workflow.tableId && screen.mode === 'edit' && screen.access.roles.includes(manager))!,
    detail: app.screens.find(screen => screen.type === 'detail' && screen.tableId === workflow.tableId && screen.access.roles.includes(staff))!,
  }
}

function restoreFactoryNames(app: App, views: Views, workflow: CustomerWorkflow) {
  const screens = privateScreens(app, views, workflow)
  screens.list.name = workflow.parent ? 'Обращения клиентов' : 'Все обращения'
  screens.list.tab!.label = screens.list.name
  screens.assigned.name = workflow.parent ? 'Назначенные обращения' : 'Назначенные мне'
  screens.assigned.tab!.label = screens.assigned.name
  screens.create.name = 'Добавить обращение'; screens.create.tab!.label = 'Добавить'
  screens.work.name = 'Работа с обращением'; screens.manage.name = 'Управление обращением'; screens.detail.name = 'Рабочая карточка'
  return screens
}

function legacyFixture(id: string, support = false) {
  const example = templateExample(id), app = example.app
  const views = Object.fromEntries(example.views.map(view => [view.id, view]))
  const workflow = support ? app.customerSections![0]! : app.customer!
  return { app, views, workflow, screens: restoreFactoryNames(app, views, workflow) }
}

function withoutNames(app: App) {
  return { ...app, screens: app.screens.map(screen => ({ ...screen, name: '', tab: screen.tab ? { ...screen.tab, label: '' } : null })) }
}

describe('workflow screen terminology', () => {
  it('keeps existing factory CRM domain labels and the explicit customer terminology', () => {
    for (const id of ['crm', 'zakazy', 'dostavka', 'service', 'nedvizhimost', 'zayavki', 'portal']) {
      const example = templateExample(id), views = Object.fromEntries(example.views.map(view => [view.id, view]))
      const result = withWorkflowScreenNames(example.app, views)
      expect(result).toBe(example.app)
      for (const workflow of customerWorkflows(result)) {
        for (const id of [workflow.listScreenId, workflow.formScreenId, workflow.detailScreenId]) {
          expect(result.screens.find(screen => screen.id === id)).toBe(example.app.screens.find(screen => screen.id === id))
        }
      }
    }
  })

  it('adapts an old delivery publication without a manifest using its explicit logistics binding', () => {
    const fixture = legacyFixture('dostavka')
    delete fixture.app.modules
    const result = withWorkflowScreenNames(fixture.app, fixture.views)
    expect(privateScreens(result, fixture.views, fixture.workflow).list.name).toBe('Доставки')
    expect(result.modules).toBeUndefined()
  })

  it('updates assigned work, edit forms and the private card without changing behavior or mutating the source', () => {
    const fixture = legacyFixture('zakazy'), before = JSON.stringify(fixture.app)
    const result = withWorkflowScreenNames(fixture.app, fixture.views), renamed = privateScreens(result, fixture.views, fixture.workflow)
    expect(renamed.assigned.name).toBe('Мои заказы'); expect(renamed.assigned.tab?.label).toBe('Мои заказы')
    expect(renamed.work.name).toBe('Работа с заказом'); expect(renamed.manage.name).toBe('Управление заказом'); expect(renamed.detail.name).toBe('Карточка заказа')
    expect(withoutNames(result)).toEqual(withoutNames(fixture.app))
    expect(JSON.stringify(fixture.app)).toBe(before)
    expect(withWorkflowScreenNames(result, fixture.views)).toBe(result)
  })

  it('preserves custom headings and tab labels independently', () => {
    const fixture = legacyFixture('zakazy')
    fixture.screens.list.name = 'Заказы интернет-магазина'
    fixture.screens.create.tab!.label = 'Создать вручную'
    const renamed = privateScreens(withWorkflowScreenNames(fixture.app, fixture.views), fixture.views, fixture.workflow)
    expect(renamed.list.name).toBe('Заказы интернет-магазина'); expect(renamed.list.tab?.label).toBe('Заказы')
    expect(renamed.create.name).toBe('Новый заказ'); expect(renamed.create.tab?.label).toBe('Создать вручную')
  })

  it('never rewrites the bound client screens even when their labels match private factory defaults', () => {
    const fixture = legacyFixture('zakazy')
    const client = fixture.app.screens.filter(screen => [fixture.workflow.listScreenId, fixture.workflow.formScreenId, fixture.workflow.detailScreenId].includes(screen.id))
    for (const screen of client) {
      screen.name = screen.type === 'form' ? 'Добавить обращение' : screen.type === 'detail' ? 'Рабочая карточка' : 'Все обращения'
      if (screen.tab) screen.tab.label = 'Все обращения'
      screen.access.roles.push('manager')
    }
    const result = withWorkflowScreenNames(fixture.app, fixture.views)
    for (const screen of client) expect(result.screens.find(candidate => candidate.id === screen.id)).toBe(screen)
  })

  it('does not guess from labels when the source is missing or access is unrelated to workflow work', () => {
    const example = templateExample('zakazy'), views = Object.fromEntries(example.views.map(view => [view.id, view]))
    const screens = privateScreens(example.app, views, example.app.customer!)
    screens.list.name = 'Все обращения'; screens.list.tab!.label = 'Все обращения'
    screens.create.name = 'Добавить обращение'; screens.create.tab!.label = 'Добавить'; screens.create.access.roles = ['client']
    const result = withWorkflowScreenNames(example.app, {})
    expect(result).toBe(example.app)
    screens.create.access.roles = ['manager']; screens.create.access.public = true
    expect(withWorkflowScreenNames(example.app, {})).toBe(example.app)
  })

  it('resolves each module and its scoped private roles in a composite app', () => {
    const sales = templateExample('zakazy'), repair = templateExample('service'), allViews = [...sales.views, ...repair.views]
    const views = Object.fromEntries(allViews.map(view => [view.id, view]))
    const app = composeModules(sales.app, repair.app, new Map(allViews.map(view => [view.id, view])))
    for (const workflow of customerWorkflows(app)) restoreFactoryNames(app, views, workflow)
    const before = JSON.stringify(app), result = withWorkflowScreenNames(app, views)
    for (const workflow of customerWorkflows(result)) {
      const renamed = privateScreens(result, views, workflow)
      expect(renamed.list.name).toBe(workflow.cart ? 'Заказы' : 'Ремонты')
      expect(renamed.create.name).toBe(workflow.cart ? 'Новый заказ' : 'Заявка на ремонт')
      expect(renamed.list.access.roles.includes('manager')).toBe(false)
    }
    expect(withoutNames(result)).toEqual(withoutNames(app)); expect(JSON.stringify(app)).toBe(before)
  })
})
