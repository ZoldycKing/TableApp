import { katalog } from './defs/katalog'
import { SHOP_SAMPLE_PRODUCTS } from './shop-samples'
import { inDays, type TemplateDef } from './types'

const orders = [
  { number: 'ТА-106', customer: 'Ольга Смирнова', items: [[1, 1], [5, 2]] },
  { number: 'ТА-103', customer: 'Ольга Смирнова', items: [[0, 1], [3, 1]] },
  { number: 'ТА-105', customer: 'Марина Белова', items: [[4, 1], [2, 1]] },
  { number: 'ТА-102', customer: 'Илья Соколов', items: [[0, 2], [5, 1]] },
  { number: 'ТА-104', customer: 'Анна Волкова', items: [[2, 1]] },
] as const

/** One sales starter, retaining the order IDs and its richer catalogue. */
export function asSalesStarter(definition: TemplateDef): TemplateDef {
  const template = structuredClone(definition)
  const goods = structuredClone(katalog.tables.find(table => table.key === 'goods')!)
  goods.name = 'Каталог товаров'
  goods.fields.find(field => field.key === 'category')!.choices =
    [...new Set(SHOP_SAMPLE_PRODUCTS.map(product => product.category))].map(name => ({ name, color: 'blue' }))
  goods.rows = SHOP_SAMPLE_PRODUCTS.map(product => ({ key: product.code, values: {
    name: product.name, descr: product.description, price: product.price, category: product.category,
    unit: 'шт.', available: true, lead: 'Со склада',
  } }))
  goods.fields.find(field => field.key === 'available')!.name = 'Доступен для заказа'
  goods.fields.find(field => field.key === 'available')!.help = 'Отметьте позиции, которые можно заказать. Это доступность в каталоге, а не складской остаток.'
  goods.views = goods.views.map(view => view.name === 'В наличии' ? { ...view, name: 'Доступные' } : view)
  template.tables = template.tables.map(table => table.key === 'goods' ? goods : table)
  const orderTable = template.tables.find(table => table.key === 'orders')!
  const itemTable = template.tables.find(table => table.key === 'items')!
  itemTable.rows = []
  orderTable.rows = orderTable.rows.map((row, index) => {
    const order = orders[index]!
    const rowKeys = order.items.map(([productIndex, qty], itemIndex) => {
      const product = SHOP_SAMPLE_PRODUCTS[productIndex]
      const key = `${row.key}-${itemIndex}`
      itemTable.rows.push({ key, values: {
        name: product.name, qty, price: product.price, product: { rowKey: product.code },
        customerEmail: row.values.customerEmail!, assignedEmail: row.values.assignedEmail!,
      } })
      return key
    })
    return { ...row, values: {
      ...row.values, title: `Заказ ${order.number}`, customer: order.customer, requestName: order.customer,
      date: inDays(-index), address: 'Получение в магазине', note: '', positions: { rowKeys },
    } }
  })
  template.name = 'Продажа товаров'
  template.appName = 'Продажи'
  template.tagline = 'Каталог, корзина, оформление и свои заказы в одном приложении'
  template.audience = 'Магазины и торговые компании, которые принимают заказы и согласуют оплату с клиентом'
  template.kin = ['salon', 'sklad', 'dostavka']
  template.gives = [
    'Публичный каталог: фотографии, описания, цены и доступность для заказа',
    'Корзина и оформление после подтверждения почты; онлайн-оплаты нет',
    'Кабинет клиента: свои заказы, статусы, история и отмена до отгрузки',
    'Рабочие экраны сотрудника и администратора; итог считается из позиций заказа',
  ]
  template.limits = [
    'Без подключённого склада оформление не резервирует товар; со складом резерв создаётся при подтверждении администратором',
    'Способ получения, срок и оплату согласует сотрудник после оформления',
    'Онлайн-оплаты и автоматических уведомлений о смене статуса нет',
    'Склад и доставку можно подключить к приложению; перенос отдельного действующего склада требует проверки товаров и истории',
  ]
  template.customer!.catalog = {
    ...template.customer!.catalog!, view: 'Доступные',
    fields: ['name', 'photo', 'descr', 'price', 'unit', 'category', 'lead'],
  }
  return template
}
