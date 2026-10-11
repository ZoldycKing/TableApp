import { composePilot } from '../module-composition'
import { templateExample, templateExampleFromDefinition } from './presentation'
import { katalog } from './defs/katalog'
import { withCustomerScenario } from './customer-definitions'
import type { TemplateDef } from './types'

/** A review fixture built from the same presets and composition used by module installation. */
export function modularPilotExample(now = new Date()): ReturnType<typeof templateExample> {
  const goods = [
    { name: 'Шампунь для окрашенных волос, 250 мл', descr: 'Мягкое очищение и уход за цветом. Можно забрать в салоне после визита.', price: 1200 },
    { name: 'Маска для восстановления волос, 200 мл', descr: 'Домашний уход после окрашивания. Мастер подскажет, как применять.', price: 1800 },
    { name: 'Термозащита для укладки, 150 мл', descr: 'Защита волос при сушке феном и укладке.', price: 950 },
    { name: 'Масло для кончиков волос, 50 мл', descr: 'Несмываемый уход для гладкости и блеска.', price: 1400 },
    { name: 'Подарочный набор для ухода', descr: 'Шампунь и маска в подарочной упаковке.', price: 2700 },
  ]
  const salesTemplate: TemplateDef = { ...katalog, tables: katalog.tables.map(table => ({ ...table,
    fields: table.fields.map(field => field.key === 'category' ? { ...field, choices: [{ name: 'Уход', color: 'blue' }] } : field),
    rows: goods.map((values, index) => ({ key: `salon-product-${index}`, values: { ...values, available: true, unit: 'шт.', category: 'Уход', lead: 'Самовывоз из салона' } })) })) }
  const salon = templateExample('salon', now), sales = templateExampleFromDefinition(withCustomerScenario(salesTemplate), now)
  const views = [...salon.views, ...sales.views]
  const app = composePilot(salon.app, sales.app, new Map(views.map(view => [view.id, view])))
  app.name = 'Салон «Лилия»: услуги и товары'
  return { ...salon, app, views, fields: [...salon.fields, ...sales.fields], rows: [...salon.rows, ...sales.rows],
    byTable: new Map([...salon.byTable, ...sales.byTable]),
    built: { ...salon.built, tables: [...salon.built.tables, ...sales.built.tables], fields: [...salon.built.fields, ...sales.built.fields],
      views: [...salon.built.views, ...sales.built.views], rows: [...salon.built.rows, ...sales.built.rows] } }
}
