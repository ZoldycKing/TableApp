import { test } from 'vitest'
import assert from 'node:assert/strict'
import type { Field, ViewConfig } from '@tableapp/schema'
import { defaultViewConfig } from '@tableapp/schema'
import { applyView, countFilters, groupLabel, visibleFields } from './apply-view'
import type { TableRow } from './table-store'

function field(id: string, name: string, type: Field['type'], options: unknown = {}): Field {
  return { id, tableId: 'tbl_1', name, description: null, position: id, type, options } as Field
}

const STATUS_CHOICES = [
  { id: 'sel_new', name: 'Новая', color: 'blue' },
  { id: 'sel_done', name: 'Готово', color: 'green' },
]

const fields: Field[] = [
  field('fld_a_name', 'Клиент', 'text'),
  field('fld_b_sum', 'Сумма', 'number'),
  field('fld_c_status', 'Статус', 'single_select', { choices: STATUS_CHOICES }),
  field('fld_d_paid', 'Оплачено', 'checkbox'),
]

function row(id: string, position: string, data: Record<string, unknown>): TableRow {
  return { id, position, data }
}

const rows: TableRow[] = [
  row('row_1', 'a', { fld_a_name: 'Ромашка', fld_b_sum: 1000, fld_c_status: 'sel_new', fld_d_paid: true }),
  row('row_2', 'b', { fld_a_name: 'Вектор', fld_b_sum: 500, fld_c_status: 'sel_done', fld_d_paid: false }),
  row('row_3', 'c', { fld_a_name: 'Полюс', fld_b_sum: 7000, fld_c_status: 'sel_new', fld_d_paid: false }),
  row('row_4', 'd', { fld_a_name: 'Сфера', fld_b_sum: null, fld_c_status: null, fld_d_paid: true }),
]

function config(overrides: Partial<ViewConfig> = {}): ViewConfig {
  return { ...defaultViewConfig('grid', 'flt_root'), ...overrides } as ViewConfig
}

test('без настроек представление показывает все строки в исходном порядке', () => {
  const applied = applyView(rows, fields, config())
  assert.deepEqual(applied.rows.map((r) => r.id), ['row_1', 'row_2', 'row_3', 'row_4'])
  assert.equal(applied.isGrouped, false)
  assert.equal(applied.hiddenCount, 0)
})

test('фильтр отсекает строки и считает скрытые', () => {
  const applied = applyView(rows, fields, config({
    filter: {
      id: 'flt_root',
      conjunction: 'and',
      conditions: [{ id: 'flt_1', fieldId: 'fld_b_sum', op: 'gt', value: 600 }],
    },
  }))
  assert.deepEqual(applied.rows.map((r) => r.id), ['row_1', 'row_3'])
  assert.equal(applied.hiddenCount, 2)
})

test('сортировка по числу, пустые значения в конце', () => {
  const applied = applyView(rows, fields, config({
    sorts: [{ fieldId: 'fld_b_sum', direction: 'asc' }],
  }))
  assert.deepEqual(applied.rows.map((r) => r.id), ['row_2', 'row_1', 'row_3', 'row_4'])
})

test('сортировка по убыванию не поднимает пустые наверх', () => {
  const applied = applyView(rows, fields, config({
    sorts: [{ fieldId: 'fld_b_sum', direction: 'desc' }],
  }))
  assert.equal(applied.rows[applied.rows.length - 1]!.id, 'row_4')
})

test('группировка по полю выбора раскладывает строки по вариантам', () => {
  const applied = applyView(rows, fields, config({
    groupBy: [{ fieldId: 'fld_c_status', direction: 'asc' }],
  }))
  assert.equal(applied.isGrouped, true)
  const labels = applied.groups.map((group) => groupLabel(fields[2], group.value))
  assert.deepEqual(labels.sort(), ['Готово', 'Новая', 'Пусто'])
  const total = applied.groups.reduce((sum, group) => sum + group.rows.length, 0)
  assert.equal(total, rows.length)
})

test('поиск идёт по всем полям и не зависит от регистра', () => {
  assert.deepEqual(applyView(rows, fields, config(), 'ромашка').rows.map((r) => r.id), ['row_1'])
  assert.deepEqual(applyView(rows, fields, config(), '7000').rows.map((r) => r.id), ['row_3'])
  assert.equal(applyView(rows, fields, config(), 'нет такого').rows.length, 0)
})

test('фильтр и поиск применяются вместе', () => {
  const applied = applyView(rows, fields, config({
    filter: {
      id: 'flt_root',
      conjunction: 'and',
      conditions: [{ id: 'flt_1', fieldId: 'fld_d_paid', op: 'is', value: false }],
    },
  }), 'полюс')
  assert.deepEqual(applied.rows.map((r) => r.id), ['row_3'])
})

test('скрытые поля исчезают, а порядок представления соблюдается', () => {
  const shown = visibleFields(fields, config({
    hiddenFieldIds: ['fld_b_sum'],
    fieldOrder: ['fld_c_status', 'fld_a_name'],
  }))
  // Поля из fieldOrder идут первыми в заданном порядке, остальные — следом.
  assert.deepEqual(shown.map((f) => f.id), ['fld_c_status', 'fld_a_name', 'fld_d_paid'])
})

test('заголовок группы разворачивает id варианта в имя', () => {
  assert.equal(groupLabel(fields[2], 'sel_done'), 'Готово')
  assert.equal(groupLabel(fields[2], null), 'Пусто')
  assert.equal(groupLabel(fields[2], 'null'), 'Пусто')
  assert.equal(groupLabel(fields[3], true), 'Да')
  assert.equal(groupLabel(fields[3], false), 'Нет')
})

test('счётчик условий считает и вложенные группы', () => {
  const nested = config({
    filter: {
      id: 'flt_root',
      conjunction: 'and',
      conditions: [
        { id: 'flt_1', fieldId: 'fld_b_sum', op: 'gt', value: 1 },
        {
          id: 'grp_1',
          conjunction: 'or',
          conditions: [
            { id: 'flt_2', fieldId: 'fld_a_name', op: 'contains', value: 'о' },
            { id: 'flt_3', fieldId: 'fld_d_paid', op: 'is', value: true },
          ],
        },
      ],
    },
  })
  assert.equal(countFilters(nested), 3)
})

test('группа пустых значений остаётся последней и при обратной группировке', () => {
  const asc = applyView(rows, fields, config({
    groupBy: [{ fieldId: 'fld_c_status', direction: 'asc' }],
  }))
  const desc = applyView(rows, fields, config({
    groupBy: [{ fieldId: 'fld_c_status', direction: 'desc' }],
  }))
  const lastLabel = (applied: typeof asc) =>
    groupLabel(fields[2], applied.groups[applied.groups.length - 1]!.value)
  assert.equal(lastLabel(asc), 'Пусто')
  assert.equal(lastLabel(desc), 'Пусто')
  // Порядок заполненных групп при этом действительно переворачивается.
  assert.notDeepEqual(
    asc.groups.map((g) => g.key),
    desc.groups.map((g) => g.key),
  )
})
