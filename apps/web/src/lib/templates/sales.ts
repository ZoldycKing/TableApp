import { katalog } from './defs/katalog'
import type { TemplateDef } from './types'

/** One sales starter, retaining the order IDs and its richer catalogue. */
export function asSalesStarter(orders: TemplateDef): TemplateDef {
  const template = structuredClone(orders)
  const goods = structuredClone(katalog.tables.find(table => table.key === 'goods')!)
  goods.name = 'Каталог товаров'
  goods.fields.find(field => field.key === 'available')!.name = 'Доступен для заказа'
  goods.fields.find(field => field.key === 'available')!.help = 'Отметьте позиции, которые можно заказать. Это доступность в каталоге, а не складской остаток.'
  goods.views = goods.views.map(view => view.name === 'В наличии' ? { ...view, name: 'Доступные' } : view)
  template.tables = template.tables.map(table => table.key === 'goods' ? goods : table)
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
