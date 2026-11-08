import { describe, expect, it } from 'vitest'
import { appV2Schema, validateAppV2 } from '@tableapp/schema/app-v2'
import { validateAppV2Definition } from '@tableapp/schema/app-definition'
import { appV2Fixture, fixtureTables } from '@/components/builder/v2/fixture.test-utils'
import { editorCatalog } from '@/components/builder/v2/model'
import { collectionCardScreen } from '@/components/builder/v2/collection-navigation'
import { buildBuilderV2Starter } from './builder-v2-starter'

const empty = () => ({ ...appV2Fixture(), nodes: [], sources: [], workflows: [], screens: [], homeScreenId: null, policy: { tables: [], workflows: [] } })
describe('initial app from internal tables', () => {
  it('uses real names, links every list to its own record card and keeps access unchanged', () => {
    const tables = fixtureTables.slice(0, 2).map((table, index) => ({ ...table, name: index ? 'Мои задачи' : 'Мои проекты' }))
    const app = buildBuilderV2Starter(empty(), tables, tables[1]!.id)
    expect(appV2Schema.safeParse(app).success).toBe(true)
    expect(validateAppV2(app, editorCatalog(app, tables))).toEqual([])
    expect(app.screens.filter(screen => screen.navigation).map(screen => screen.name)).toEqual(['Мои задачи', 'Мои проекты'])
    expect(app.screens.find(screen => screen.id === app.homeScreenId)?.name).toBe('Мои задачи')
    const lists = app.nodes.filter(node => node.type === 'collection')
    expect(lists).toHaveLength(2)
    for (const list of lists) {
      const source = app.sources.find(source => source.id === list.sourceId)!
      const card = app.screens.find(screen => screen.id === collectionCardScreen(app, list))!
      expect(card.contextTableId).toBe(source.tableId)
      expect(card.navigation).toBe(false)
      expect(card.rootIds.length).toBeGreaterThan(0)
      expect(card.rootIds.length).toBeLessThanOrEqual(6)
    }
    expect(app.policy).toEqual(empty().policy)
    expect(app.authentication).toEqual(empty().authentication)
    expect(app.workflows.every(flow => flow.steps.every(step => step.type === 'open_screen'))).toBe(true)
  })
  it('keeps the primary field readable even when it is after the sixth column', () => {
    const table = { id: 'own', name: 'Очень длинное название '.repeat(10), primaryFieldId: 'field_7', views: [], fields: Array.from({ length: 8 }, (_, index) => ({ id: `field_${index}`, name: `Колонка ${index}`, type: 'text' as const })) }
    const app = buildBuilderV2Starter(empty(), [table], table.id)
    expect(validateAppV2(app, editorCatalog(app, [table]))).toEqual([])
    const heading = app.nodes.find(node => node.type === 'heading')!
    expect(heading.type === 'heading' && heading.value).toEqual({ kind: 'row', fieldId: 'field_7' })
    expect(app.screens.every(screen => screen.name.length <= 120)).toBe(true)
  })
  it.each(['Товары', 'Услуги'])('starts %s as a storefront and keeps orders as a regular list', name => {
    const entries = { id: 'catalog', name, primaryFieldId: 'sku', views: [], fields: [
      { id: 'sku', name: 'Артикул', type: 'text' as const },
      { id: 'title', name: 'Название', type: 'text' as const },
      { id: 'price', name: 'Цена, ₽', type: 'number' as const },
      { id: 'description', name: 'Описание', type: 'long_text' as const },
    ] }
    const orders = { id: 'orders', name: 'Заказы', primaryFieldId: 'order', views: [], fields: [
      { id: 'order', name: 'Название', type: 'text' as const },
      { id: 'order_total', name: 'Цена', type: 'number' as const },
    ] }
    const app = buildBuilderV2Starter(empty(), [entries, orders], entries.id)
    expect(validateAppV2Definition(app, editorCatalog(app, [entries, orders])).ok).toBe(true)
    const collection = app.nodes.find(node => node.type === 'collection' && node.name === name)!
    expect(collection).toMatchObject({ layout: 'catalog', titleFieldId: 'title', cardDetailFieldId: 'price' })
    expect(app.screens.find(screen => screen.id === collectionCardScreen(app, collection))?.catalog).toEqual({ titleFieldId: 'title', priceFieldId: 'price', descriptionFieldId: 'description' })
    expect(app.nodes.find(node => node.type === 'collection' && node.name === 'Заказы')).toMatchObject({ layout: 'list' })
  })
  it('refuses an empty source, a foreign main table or a second initialization of an edited layout', () => {
    expect(() => buildBuilderV2Starter(empty(), [], 'missing')).toThrow()
    expect(() => buildBuilderV2Starter(empty(), fixtureTables, 'missing')).toThrow()
    expect(() => buildBuilderV2Starter(empty(), [{ ...fixtureTables[0]!, fields: [] }], fixtureTables[0]!.id)).toThrow()
    expect(() => buildBuilderV2Starter(appV2Fixture(), fixtureTables, fixtureTables[0]!.id)).toThrow()
  })
  it('chooses tiles for categories and cards for records with a photo column', () => {
    const name = { id: 'name', name: 'Название', type: 'text' as const }
    const categories = { id: 'categories', name: 'Категории', primaryFieldId: 'name', views: [], fields: [name] }
    const projects = { id: 'visual_projects', name: 'Проекты', primaryFieldId: 'project_name', views: [], fields: [
      { ...name, id: 'project_name' }, { id: 'photo', name: 'Фото', type: 'image' as const },
    ] }
    const tables = [categories, projects]
    const app = buildBuilderV2Starter(empty(), tables, categories.id)
    expect(validateAppV2Definition(app, editorCatalog(app, tables)).ok).toBe(true)
    expect(app.nodes.find(node => node.name === categories.name)).toMatchObject({ layout: 'tiles' })
    expect(app.nodes.find(node => node.name === projects.name)).toMatchObject({ layout: 'cards', cardImageFieldId: 'photo' })
  })
  it('creates an order summary with scoped line items and uses the customer name on both screens', () => {
    const text = (id: string, name: string) => ({ id, name, type: 'text' as const })
    const orders = { id: 'orders', name: 'Заказы', primaryFieldId: 'number', views: [], fields: [
      text('number', '№ заказа'), text('product', 'Товар'), text('buyer', 'Клиент'),
      { id: 'amount', name: 'Сумма позиции, ₽', type: 'number' as const },
    ] }
    const customers = { id: 'customers', name: 'Клиенты', primaryFieldId: 'code', views: [], fields: [
      text('code', 'Код клиента'), text('customer_name', 'Имя'), { id: 'email', name: 'Почта', type: 'email' as const },
    ] }
    const tables = [orders, customers]
    const app = buildBuilderV2Starter(empty(), tables, orders.id)
    expect(validateAppV2Definition(app, editorCatalog(app, tables)).ok).toBe(true)
    const ordersList = app.nodes.find(node => node.type === 'collection' && node.name === 'Заказы')!
    const contacts = app.nodes.find(node => node.type === 'collection' && node.name === 'Клиенты')!
    expect(ordersList).toMatchObject({ titleFieldId: 'number', subtitleFieldId: 'buyer', recordGroup: { fieldId: 'number', amountFieldId: 'amount' } })
    expect(contacts).toMatchObject({ titleFieldId: 'customer_name', subtitleFieldId: 'email' })
    expect(app.screens.find(screen => screen.id === collectionCardScreen(app, contacts))?.recordTitleFieldId).toBe('customer_name')
    expect(app.sources).toContainEqual(expect.objectContaining({ tableId: orders.id, screenTableId: orders.id, filter: expect.objectContaining({ op: 'or' }) }))
    expect(app.nodes.some(node => node.name === 'История заказов')).toBe(false)

    const linkedTables = [{ ...orders, fields: [...orders.fields, { id: 'customer_link', name: 'Связь с клиентом', type: 'relation' as const, relationTableId: customers.id }] }, customers]
    const linked = buildBuilderV2Starter(empty(), linkedTables, orders.id)
    expect(validateAppV2Definition(linked, editorCatalog(linked, linkedTables)).ok).toBe(true)
    const history = linked.nodes.find(node => node.type === 'collection' && node.name === 'История заказов')
    if (history?.type !== 'collection') throw new Error('Missing order history')
    expect(linked.sources.find(source => source.id === history.sourceId)).toMatchObject({
      tableId: orders.id, screenTableId: customers.id, filter: { op: 'includes', left: { kind: 'row', fieldId: 'customer_link' }, right: { kind: 'screen_row_id' } },
    })
    const orderScreen = linked.screens.find(screen => screen.id === collectionCardScreen(linked, history))
    expect(orderScreen?.contextTableId).toBe(orders.id)
  })
})
