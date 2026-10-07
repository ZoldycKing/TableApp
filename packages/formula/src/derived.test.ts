import { test } from 'vitest'
import assert from 'node:assert/strict'
import type { Field } from '@tableapp/schema'
import {
  compileTableFormulas,
  computeDerivedRow,
  relatedIndexFrom,
  stripDerived,
  type RelatedIndex,
} from './derived'

function field(id: string, name: string, type: Field['type'], options: unknown = {}): Field {
  return { id, tableId: 'tbl_orders', name, description: null, position: id, type, options } as Field
}

// Заказы ссылаются на позиции: классический случай «сумма по связанным строкам».
const fields: Field[] = [
  field('fld_client', 'Клиент', 'text'),
  field('fld_items', 'Позиции', 'relation', { tableId: 'tbl_items', allowMultiple: true, symmetricFieldId: null }),
  field('fld_names', 'Названия', 'lookup', { relationFieldId: 'fld_items', targetFieldId: 'fld_title' }),
  field('fld_total', 'Сумма', 'rollup', { relationFieldId: 'fld_items', targetFieldId: 'fld_price', fn: 'sum' }),
  field('fld_count', 'Позиций', 'count', { relationFieldId: 'fld_items' }),
  field('fld_vat', 'НДС', 'formula', { expression: 'ROUND({Сумма} * 0.2, 2)', resultType: 'number' }),
]

const related: RelatedIndex = new Map([
  [
    'tbl_items',
    new Map([
      ['row_a', { fld_title: 'Болт', fld_price: 120 }],
      ['row_b', { fld_title: 'Гайка', fld_price: 80 }],
      ['row_c', { fld_title: 'Шайба', fld_price: null }],
    ]),
  ],
])

const formulas = compileTableFormulas(fields)

test('lookup собирает значения связанных строк', () => {
  const result = computeDerivedRow({ fld_items: ['row_a', 'row_b'] }, fields, related, formulas)
  assert.deepEqual(result.fld_names, ['Болт', 'Гайка'])
})

test('rollup суммирует, считает и усредняет', () => {
  const data = { fld_items: ['row_a', 'row_b', 'row_c'] }
  assert.equal(computeDerivedRow(data, fields, related, formulas).fld_total, 200)

  const avg = fields.map((f) =>
    f.id === 'fld_total' ? field('fld_total', 'Сумма', 'rollup', { relationFieldId: 'fld_items', targetFieldId: 'fld_price', fn: 'avg' }) : f,
  )
  // Пустая цена не должна утягивать среднее вниз как ноль.
  assert.equal(computeDerivedRow(data, avg, related, compileTableFormulas(avg)).fld_total, 100)
})

test('count считает связанные строки, а не значения', () => {
  const result = computeDerivedRow({ fld_items: ['row_a', 'row_c'] }, fields, related, formulas)
  assert.equal(result.fld_count, 2)
})

test('формула видит результат rollup', () => {
  const result = computeDerivedRow({ fld_items: ['row_a', 'row_b'] }, fields, related, formulas)
  assert.equal(result.fld_total, 200)
  assert.equal(result.fld_vat, 40)
})

test('пустая связь даёт пустые производные, а не ошибку', () => {
  const result = computeDerivedRow({ fld_items: [] }, fields, related, formulas)
  assert.deepEqual(result.fld_names, [])
  assert.equal(result.fld_total, 0)
  assert.equal(result.fld_count, 0)
  assert.equal(result.fld_vat, 0)
})

test('ссылка на удалённую строку просто игнорируется', () => {
  const result = computeDerivedRow({ fld_items: ['row_a', 'row_removed'] }, fields, related, formulas)
  assert.deepEqual(result.fld_names, ['Болт'])
  assert.equal(result.fld_count, 1)
})

test('связь на несуществующую таблицу не роняет пересчёт', () => {
  const broken = [field('fld_items', 'Позиции', 'relation', { tableId: 'tbl_gone', allowMultiple: true, symmetricFieldId: null }), ...fields.slice(2)]
  const result = computeDerivedRow({ fld_items: ['row_a'] }, broken, related, compileTableFormulas(broken))
  assert.equal(result.fld_count, 0)
})

test('rollup с логическими функциями', () => {
  const withFlags: RelatedIndex = new Map([
    ['tbl_items', new Map([['row_a', { fld_ok: true }], ['row_b', { fld_ok: false }]])],
  ])
  const makeField = (fn: string) =>
    [
      field('fld_items', 'Позиции', 'relation', { tableId: 'tbl_items', allowMultiple: true, symmetricFieldId: null }),
      field('fld_all', 'Все', 'rollup', { relationFieldId: 'fld_items', targetFieldId: 'fld_ok', fn }),
    ] as Field[]

  const data = { fld_items: ['row_a', 'row_b'] }
  assert.equal(computeDerivedRow(data, makeField('and'), withFlags, new Map()).fld_all, false)
  assert.equal(computeDerivedRow(data, makeField('or'), withFlags, new Map()).fld_all, true)
})

test('производные поля не попадают в записываемые данные', () => {
  const clean = stripDerived(
    { fld_client: 'Иванов', fld_items: ['row_a'], fld_names: ['Болт'], fld_total: 120, fld_vat: 24 },
    fields,
  )
  assert.deepEqual(Object.keys(clean).sort(), ['fld_client', 'fld_items'])
})

// --- Индекс связанных строк -------------------------------------------------

const itemFields: Field[] = [
  field('fld_qty', 'Количество', 'number'),
  field('fld_price2', 'Цена', 'number'),
  field('fld_cost', 'Стоимость', 'formula', { expression: '{Количество} * {Цена}', resultType: 'number' }),
]

const orderFields: Field[] = [
  field('fld_items2', 'Позиции', 'relation', { tableId: 'tbl_items', allowMultiple: true, symmetricFieldId: null }),
  field('fld_sum2', 'Итого', 'rollup', { relationFieldId: 'fld_items2', targetFieldId: 'fld_cost', fn: 'sum' }),
]

// В базе формульных значений нет: они считаются на чтении.
const stored = new Map([
  [
    'tbl_items',
    new Map([
      ['row_1', { fld_qty: 2, fld_price2: 100 }],
      ['row_2', { fld_qty: 3, fld_price2: 50 }],
    ]),
  ],
])

test('формулы связанной таблицы считаются при построении индекса', () => {
  const related2 = relatedIndexFrom(stored, new Map([['tbl_items', itemFields]]))
  assert.equal(related2.get('tbl_items')?.get('row_1')?.fld_cost, 200)
  assert.equal(related2.get('tbl_items')?.get('row_2')?.fld_cost, 150)
})

test('«Итого» по формульной колонке перестаёт быть нулём', () => {
  const related2 = relatedIndexFrom(stored, new Map([['tbl_items', itemFields]]))
  const order = computeDerivedRow({ fld_items2: ['row_1', 'row_2'] }, orderFields, related2, new Map())
  assert.equal(order.fld_sum2, 350)

  // Так было до исправления: сырые строки без посчитанных формул давали ноль.
  const raw = computeDerivedRow({ fld_items2: ['row_1', 'row_2'] }, orderFields, stored, new Map())
  assert.equal(raw.fld_sum2, 0)
})

test('сломанная формула связанной таблицы не ломает чтение', () => {
  const broken: Field[] = [
    field('fld_cost', 'Стоимость', 'formula', { expression: '{Нет такого}', resultType: 'number' }),
  ]
  const related2 = relatedIndexFrom(stored, new Map([['tbl_items', broken]]))
  assert.equal(related2.get('tbl_items')?.size, 2)
})
