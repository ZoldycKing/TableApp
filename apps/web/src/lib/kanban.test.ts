import { test } from 'vitest'
import assert from 'node:assert/strict'
import type { Field } from '@tableapp/schema'
import { EMPTY_COLUMN_KEY, buildKanbanColumns, columnKeyOf, pickStackField } from './kanban'
import type { TableRow } from './table-store'

function field(id: string, name: string, type: Field['type'], options: unknown = {}): Field {
  return { id, tableId: 'tbl_1', name, description: null, position: id, type, options } as Field
}

const status = field('fld_status', 'Статус', 'single_select', {
  choices: [
    { id: 'sel_new', name: 'Новая', color: 'blue' },
    { id: 'sel_work', name: 'В работе', color: 'amber' },
    { id: 'sel_done', name: 'Готово', color: 'green' },
  ],
})
const paid = field('fld_paid', 'Оплачено', 'checkbox')
const name = field('fld_name', 'Клиент', 'text')

function row(id: string, data: Record<string, unknown>): TableRow {
  return { id, position: id, data }
}

test('колонки строятся из вариантов поля, включая пустые', () => {
  const rows = [
    row('row_1', { fld_status: 'sel_new' }),
    row('row_2', { fld_status: 'sel_done' }),
    row('row_3', { fld_status: 'sel_new' }),
  ]
  const columns = buildKanbanColumns(status, rows)
  assert.deepEqual(columns.map((c) => c.label), ['Новая', 'В работе', 'Готово', 'Без значения'])
  assert.deepEqual(columns.map((c) => c.rows.length), [2, 0, 1, 0])
})

test('строка без значения не пропадает, а попадает в отдельную колонку', () => {
  const rows = [row('row_1', { fld_status: null }), row('row_2', {}), row('row_3', { fld_status: '' })]
  const columns = buildKanbanColumns(status, rows)
  const empty = columns.find((c) => c.key === EMPTY_COLUMN_KEY)
  assert.equal(empty?.rows.length, 3)
  // Ни одна строка не должна потеряться при раскладке по колонкам.
  assert.equal(columns.reduce((sum, c) => sum + c.rows.length, 0), rows.length)
})

test('неизвестный вариант не теряет строку', () => {
  // Вариант мог быть удалён из настроек поля позже, чем записан в строку.
  const columns = buildKanbanColumns(status, [row('row_1', { fld_status: 'sel_removed' })])
  assert.equal(columns.find((c) => c.key === EMPTY_COLUMN_KEY)?.rows.length, 1)
})

test('переключатель даёт две колонки без лишней пустой', () => {
  const rows = [row('row_1', { fld_paid: true }), row('row_2', { fld_paid: false })]
  const columns = buildKanbanColumns(paid, rows)
  assert.deepEqual(columns.map((c) => c.label), ['Да', 'Нет'])
})

test('поле выбора выигрывает у переключателя при выборе по умолчанию', () => {
  // Переключатель идёт в таблице раньше, но доску хотят по статусу.
  assert.equal(pickStackField([name, paid, status], null)?.id, 'fld_status')
  assert.equal(pickStackField([name, paid], null)?.id, 'fld_paid')
  assert.equal(pickStackField([name], null), undefined)
})

test('явно выбранное поле уважается', () => {
  assert.equal(pickStackField([name, paid, status], 'fld_paid')?.id, 'fld_paid')
  // Настройка на несуществующее или неподходящее поле откатывается к умолчанию.
  assert.equal(pickStackField([name, paid, status], 'fld_name')?.id, 'fld_status')
})

test('ключ колонки строки совпадает с ключом её колонки', () => {
  const rows = [row('row_1', { fld_status: 'sel_work' }), row('row_2', {})]
  const columns = buildKanbanColumns(status, rows)
  for (const row of rows) {
    const key = columnKeyOf(status, row)
    const column = columns.find((c) => c.key === key) ?? columns.find((c) => c.key === EMPTY_COLUMN_KEY)
    assert.ok(column?.rows.includes(row), `строка ${row.id} должна лежать в колонке ${key}`)
  }
})
