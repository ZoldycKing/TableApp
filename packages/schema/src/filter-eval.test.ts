import { test } from 'vitest'
import assert from 'node:assert/strict'
import type { Field } from './fields'
import { evalFilter, indexFields } from './filter-eval'
import type { FilterGroup } from './filters'

function field(id: string, type: Field['type'], options: unknown = {}): Field {
  return { id, tableId: 'tbl_1', name: id, description: null, position: 'a', type, options } as Field
}

const fields = indexFields([
  field('fld_name', 'text'),
  field('fld_price', 'number'),
  field('fld_done', 'checkbox'),
  field('fld_due', 'date'),
  field('fld_tags', 'multi_select', { choices: [] }),
])

function group(conditions: FilterGroup['conditions'], conjunction: 'and' | 'or' = 'and'): FilterGroup {
  return { id: 'flt_root', conjunction, conditions }
}

function cond(fieldId: string, op: string, value: unknown = null) {
  return { id: `flt_${fieldId}`, fieldId, op, value } as FilterGroup['conditions'][number]
}

test('пустой фильтр пропускает все строки', () => {
  assert.equal(evalFilter(null, { fld_name: 'что угодно' }, fields), true)
  assert.equal(evalFilter(group([]), { fld_name: 'что угодно' }, fields), true)
})

test('текстовые операторы не зависят от регистра и пробелов', () => {
  const row = { fld_name: '  Иванов  ' }
  assert.equal(evalFilter(group([cond('fld_name', 'is', 'иванов')]), row, fields), true)
  assert.equal(evalFilter(group([cond('fld_name', 'contains', 'ВАН')]), row, fields), true)
  assert.equal(evalFilter(group([cond('fld_name', 'does_not_contain', 'петров')]), row, fields), true)
  assert.equal(evalFilter(group([cond('fld_name', 'is_not', 'иванов')]), row, fields), false)
})

test('пустые значения распознаются для всех форм пустоты', () => {
  const empties = [{ fld_name: null }, { fld_name: '' }, {}, { fld_tags: [] }]
  for (const row of empties) {
    const target = 'fld_tags' in row ? 'fld_tags' : 'fld_name'
    assert.equal(evalFilter(group([cond(target, 'is_empty')]), row, fields), true)
    assert.equal(evalFilter(group([cond(target, 'is_not_empty')]), row, fields), false)
  }
})

test('числовые сравнения работают и на строковых числах', () => {
  assert.equal(evalFilter(group([cond('fld_price', 'gt', 100)]), { fld_price: 150 }, fields), true)
  assert.equal(evalFilter(group([cond('fld_price', 'lte', 100)]), { fld_price: '100' }, fields), true)
  assert.equal(evalFilter(group([cond('fld_price', 'gt', 100)]), { fld_price: null }, fields), false)
})

test('даты сравниваются по календарному дню, а не по метке времени', () => {
  const row = { fld_due: '2026-03-14T23:30:00.000Z' }
  assert.equal(evalFilter(group([cond('fld_due', 'is', '2026-03-14T08:00:00.000Z')]), row, fields), false)
  assert.equal(evalFilter(group([cond('fld_due', 'is', '2026-03-15')]), row, fields), true)
  assert.equal(evalFilter(group([cond('fld_due', 'is_after', '2026-03-13T00:00:00.000Z')]), row, fields), true)
  assert.equal(evalFilter(group([cond('fld_due', 'is_before', '2026-03-13T00:00:00.000Z')]), row, fields), false)
})

test('множественный выбор: any, all, none, exactly', () => {
  const row = { fld_tags: ['sel_a', 'sel_b'] }
  assert.equal(evalFilter(group([cond('fld_tags', 'has_any_of', ['sel_b', 'sel_z'])]), row, fields), true)
  assert.equal(evalFilter(group([cond('fld_tags', 'has_all_of', ['sel_a', 'sel_b'])]), row, fields), true)
  assert.equal(evalFilter(group([cond('fld_tags', 'has_all_of', ['sel_a', 'sel_z'])]), row, fields), false)
  assert.equal(evalFilter(group([cond('fld_tags', 'has_none_of', ['sel_z'])]), row, fields), true)
  assert.equal(evalFilter(group([cond('fld_tags', 'is_exactly', ['sel_b', 'sel_a'])]), row, fields), true)
  assert.equal(evalFilter(group([cond('fld_tags', 'is_exactly', ['sel_a'])]), row, fields), false)
})

test('переключатель сравнивается как булево', () => {
  assert.equal(evalFilter(group([cond('fld_done', 'is', true)]), { fld_done: true }, fields), true)
  assert.equal(evalFilter(group([cond('fld_done', 'is', false)]), {}, fields), true)
})

test('вложенные группы: и, или', () => {
  const row = { fld_name: 'Иванов', fld_price: 50 }
  const nested = group(
    [
      cond('fld_name', 'is', 'иванов'),
      group([cond('fld_price', 'gt', 100), cond('fld_price', 'lt', 60)], 'or'),
    ],
    'and',
  )
  assert.equal(evalFilter(nested, row, fields), true)
  assert.equal(evalFilter(nested, { ...row, fld_price: 80 }, fields), false)
})

test('условие на удалённое поле игнорируется, а не роняет фильтр', () => {
  const row = { fld_name: 'Иванов' }
  const withGhost = group([cond('fld_name', 'is', 'иванов'), cond('fld_deleted', 'is', 'x')])
  assert.equal(evalFilter(withGhost, row, fields), true)
})
