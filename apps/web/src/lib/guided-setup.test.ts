import { describe, expect, it } from 'vitest'
import { guidedSetupPlan, setupHelpHref, setupHref, setupTableHref } from './guided-setup'
import { templateExample } from './templates/presentation'

describe('scenario preparation from installed resource bindings', () => {
  it.each([
    ['salon', 'Услуги', 'Мастера и график'], ['zakazy', 'Товары', 'Обработка заказов'],
    ['service', 'Услуги', 'Приём и ремонт'], ['zayavki', 'Услуги', 'Назначение мастеров'],
    ['dostavka', 'Услуги доставки', 'Диспетчер и курьеры'], ['nedvizhimost', 'Объекты', 'Агенты и просмотры'],
    ['crm', 'Клиенты', 'Менеджеры и сделки'], ['sklad', 'Товары и остатки', 'Команда'],
    ['proizvodstvo', 'Материалы и продукция', 'Нормы и команда'],
  ])('prepares %s with relevant data and work tasks', (id, data, work) => {
    const example = templateExample(id!)
    const plan = guidedSetupPlan(example.app)
    expect(plan.steps.map(step => step.name)).toEqual(['Название', data, work, 'Проверка'])
    expect(plan.tasks.some(task => task.stage === 'data')).toBe(true)
    expect(plan.tasks.every(task => example.built.tables.some(table => table.id === task.id))).toBe(true)
    expect(new Set(plan.tasks.map(task => task.id)).size).toBe(plan.tasks.length)
  })
  it('separates booking services from staff setup and customer visits', () => {
    const { app } = templateExample('salon'), t = app.booking!.tables
    const plan = guidedSetupPlan(app)
    expect(plan.tasks.filter(task => task.stage === 'data').map(task => task.id)).toEqual([t.services])
    expect(plan.tasks.filter(task => task.stage === 'work').map(task => task.id)).toEqual([t.masters, t.schedule])
    expect(plan.tasks.find(task => task.id === t.visits)?.stage).toBe('activity')
  })
  it('keeps CRM contacts separate from the transaction history without offering an unused public catalog', () => {
    const { app } = templateExample('crm')
    const plan = guidedSetupPlan(app)
    expect(plan.tasks.filter(task => task.stage === 'data').map(task => task.id)).toEqual([app.customer!.crm!.clientsTableId])
    expect(plan.public).toBe(false)
    expect(plan.tasks.find(task => task.id === app.customer!.tableId)?.stage).toBe('activity')
  })
  it('uses bindings after renaming, and retains both engines in a combined app', () => {
    const salon = templateExample('salon').app, stock = templateExample('sklad').app
    const combined = { ...salon, name: 'Свои названия', inventory: stock.inventory, modules: [...salon.modules!, ...stock.modules!] }
    const plan = guidedSetupPlan(combined)
    expect(plan.steps[1]!.name).toBe('Ваши данные')
    expect(plan.tasks.filter(task => task.stage === 'data').map(task => task.id)).toEqual([salon.booking!.tables.services, stock.inventory!.tables.items])
    expect(plan.tasks.some(task => task.id === stock.inventory!.tables.movements && task.stage === 'activity')).toBe(true)
  })
  it('includes the product reference needed to enter production norms without guessing a table name', () => {
    const { app } = templateExample('proizvodstvo')
    const plan = guidedSetupPlan(app, [{ fieldId: app.production!.norm.product, targetId: 'renamed-product-table' }])
    expect(plan.tasks.find(task => task.id === 'renamed-product-table')?.stage).toBe('data')
    expect(plan.tasks.find(task => task.id === app.production!.tables.norms)?.stage).toBe('work')
  })
  it('preserves a generic path for imported tables and unknown setup steps', () => {
    expect(guidedSetupPlan(null).tasks).toEqual([])
    expect(guidedSetupPlan(null).steps.map(step => step.id)).toEqual(['business', 'data', 'work', 'review'])
  })
  it('opens record forms and preserves exact app/step context and read-only mode', () => {
    const url = new URL(setupTableHref('table 1', 'app&a', 'work', true), 'https://tableapp.test')
    expect(url.pathname).toBe('/t/table%201')
    expect(url.searchParams.get('mode')).toBe('records')
    expect(url.searchParams.get('readonly')).toBe('1')
    expect(url.searchParams.get('setup')).toBe(setupHref('app&a', 'work'))
    const help = new URL(setupHelpHref('schedule', 'app&a', 'work'), 'https://tableapp.test')
    expect(help.searchParams.get('app')).toBe('app&a')
    expect(help.searchParams.get('article')).toBe('schedule')
    expect(help.searchParams.get('step')).toBe('work')
  })
})
