import { test } from 'vitest'
import assert from 'node:assert/strict'
import type { Field, View } from '@tableapp/schema'
import { defaultViewConfig, newId } from '@tableapp/schema'
import { generateApp, slugify } from './app-builder'

function field(id: string, name: string, type: Field['type'], options: unknown = {}): Field {
  return { id, tableId: 'tbl_orders', name, description: null, position: id, type, options } as Field
}

const fields: Field[] = [
  field('fld_a_client', 'Клиент', 'text'),
  field('fld_b_sum', 'Сумма', 'number'),
  field('fld_c_status', 'Статус', 'single_select', {
    choices: [
      { id: 'sel_new', name: 'Новая', color: 'blue' },
      { id: 'sel_done', name: 'Готово', color: 'green' },
    ],
  }),
  field('fld_d_items', 'Позиции', 'relation', { tableId: 'tbl_items', allowMultiple: true, symmetricFieldId: null }),
  field('fld_e_total', 'Итого', 'rollup', { relationFieldId: 'fld_d_items', targetFieldId: 'fld_price', fn: 'sum' }),
]

const view: View = {
  id: 'viw_1',
  tableId: 'tbl_orders',
  name: 'Все заявки',
  type: 'grid',
  position: 'a',
  config: defaultViewConfig('grid', 'flt_1'),
} as View

function build() {
  return generateApp({
    appId: newId('app'),
    workspaceId: 'wsp_1',
    name: 'Заявки',
    slug: 'zayavki',
    table: { id: 'tbl_orders', name: 'Заявки', primaryFieldId: 'fld_a_client' },
    fields,
    view,
  })
}

test('адрес приложения транслитерируется из русского названия', () => {
  assert.equal(slugify('Заявки'), 'zayavki')
  assert.equal(slugify('Мой Склад 2024'), 'moy-sklad-2024')
  assert.equal(slugify('  Тест!  '), 'test')
  // Из одних эмодзи осмысленный адрес не собрать, но ссылка должна остаться рабочей.
  assert.match(slugify('🎉🎉'), /^app-[a-z0-9]+$/)
})

/** Список — второй экран: первым идёт сводка. */
const listOf = (app: ReturnType<typeof build>) => app.screens.find((screen) => screen.type === 'list')!

test('приложение собирается из пяти экранов, домашний — сводка', () => {
  const app = build()
  // Сводка, список, карточка, форма создания и форма редактирования.
  assert.deepEqual(app.screens.map((screen) => screen.type), ['dashboard', 'list', 'detail', 'form', 'form'])
  assert.equal(app.homeScreenId, app.screens[0]!.id)
  assert.equal(app.screens[0]!.type, 'dashboard')
})

test('сводка собирается по колонкам таблицы', () => {
  const app = build()
  const home = app.screens[0]!
  assert.equal(home.type, 'dashboard')
  if (home.type !== 'dashboard') return

  const kinds = home.blocks.map((block) => block.type)
  // Числа сверху, доска по статусу, последние записи и кнопка добавления.
  assert.ok(kinds.filter((kind) => kind === 'metric').length >= 2, 'плитки с числами')
  assert.ok(kinds.includes('list'), 'последние записи')
  assert.ok(kinds.includes('pipeline'), 'у таблицы есть статус — значит есть доска')
  assert.ok(kinds.includes('actions'), 'быстрые действия')

  // Блоки считают по тому же представлению, что и список: иначе сводка
  // и список показывали бы разное.
  for (const block of home.blocks) {
    if ('source' in block) assert.equal(block.source.viewId, 'viw_1')
  }
})

test('список ведёт на карточку, а карточка — на редактирование', () => {
  const app = build()
  const list = listOf(app)
  const detail = app.screens.find((screen) => screen.type === 'detail')!
  assert.equal(list.type === 'list' ? list.onTapScreenId : null, detail.id)

  const button = detail.components.find((component) => component.type === 'button')
  assert.ok(button && button.type === 'button' && button.action.type === 'open_screen')
})

test('заголовок карточки берётся из первичного поля', () => {
  const app = build()
  const list = listOf(app)
  assert.equal(list.type === 'list' ? list.titleFieldId : null, 'fld_a_client')
})

test('в форме нет вычисляемых полей, но есть связь', () => {
  const app = build()
  const form = app.screens.find((screen) => screen.type === 'form')!
  const fieldIds = form.components
    .filter((component) => component.type === 'form_field')
    .map((component) => (component.type === 'form_field' ? component.fieldId : ''))

  assert.ok(fieldIds.includes('fld_d_items'), 'связь должна заполняться в форме')
  assert.ok(!fieldIds.includes('fld_e_total'), 'Rollup вычисляется, его не заполняют')
})

test('на карточке показаны все поля, включая вычисляемые', () => {
  const app = build()
  const detail = app.screens.find((screen) => screen.type === 'detail')!
  const shown = detail.components
    .filter((component) => component.type === 'field')
    .map((component) => (component.type === 'field' ? component.fieldId : ''))

  assert.ok(shown.includes('fld_e_total'), 'Rollup на карточке виден')
  // Первичное поле выводится заголовком, а не строкой «подпись — значение».
  assert.ok(!shown.includes('fld_a_client'))
  assert.ok(detail.components.some((component) => component.type === 'heading'))
})

test('список привязан к представлению таблицы, а не к таблице напрямую', () => {
  const app = build()
  const list = listOf(app)
  // Благодаря этому фильтры и сортировка представления действуют и в приложении.
  assert.equal(list.type === 'list' ? list.source.viewId : null, 'viw_1')
})

test('вкладки нижней навигации есть у сводки, списка и формы создания', () => {
  const app = build()
  const tabs = app.screens.filter((screen) => screen.tab !== null)
  assert.equal(tabs.length, 3)
  assert.deepEqual(tabs.map((screen) => screen.type), ['dashboard', 'list', 'form'])
})

test('у списка своя колонка статуса, отдельно от подписи', () => {
  /*
   * Статус отвечает на «на каком этапе», подпись — на «что это и чьё».
   * Пока это было одно поле, в строке не оставалось места ни для заказчика,
   * ни для даты: приходилось выбирать что-то одно.
   */
  const list = listOf(build())
  assert.equal(list.statusFieldId, 'fld_c_status')
  assert.notEqual(list.subtitleFieldId, 'fld_c_status')
  // Подписью становится первое подходящее не-выборное поле.
  assert.equal(list.subtitleFieldId, 'fld_b_sum')
})

test('искать можно по названию и подписи, а не по одной колонке', () => {
  // По служебным колонкам человек искать не станет, а каждое лишнее поле
  // в поиске — это поле, которое приходится отправить в браузер.
  const list = listOf(build())
  assert.deepEqual(list.source.searchFieldIds, ['fld_a_client', 'fld_b_sum'])
})

test('счётчик статуса подписан «сейчас», а не «за всё время»', () => {
  /*
   * Плитка «В работе» отвечает на вопрос про текущее состояние. Подпись
   * «за всё время» превращала бы её в исторический итог — число то же,
   * а смысл другой.
   */
  const home = build().screens[0]!
  assert.equal(home.type, 'dashboard')
  if (home.type !== 'dashboard') return

  const counters = home.blocks.filter(
    (block) => block.type === 'metric' && block.kind === 'count' && block.where !== null,
  )
  assert.ok(counters.length > 0, 'счётчиков по статусам не нашлось')
  for (const block of counters) {
    assert.equal(block.type === 'metric' && block.description, 'сейчас')
  }
})
