import { test } from 'vitest'
import assert from 'node:assert/strict'
import type { Field } from './fields'
import { coerceCellValue } from './values'

function field(type: Field['type'], options: unknown = {}): Field {
  return { id: `fld_${type}`, tableId: 'tbl_1', name: type, description: null, position: 'a', type, options } as Field
}

const text = field('text')
const number = field('number', { format: 'plain', precision: 0, currency: 'RUB', showThousandsSeparator: true })
const checkbox = field('checkbox')
const date = field('date', { dateFormat: 'ru' })
const select = field('single_select', {
  choices: [
    { id: 'sel_new', name: 'Новая', color: 'blue' },
    { id: 'sel_done', name: 'Готово', color: 'green' },
  ],
})

test('текст в число: разбирает пробелы и запятую, иначе пусто', () => {
  assert.equal(coerceCellValue(text, number, '1 234,50'), 1234.5)
  assert.equal(coerceCellValue(text, number, '42'), 42)
  assert.equal(coerceCellValue(text, number, 'не число'), null)
})

test('число в текст сохраняет значение', () => {
  assert.equal(coerceCellValue(number, text, 1234.5), '1234.5')
})

test('текст в переключатель понимает русские слова', () => {
  assert.equal(coerceCellValue(text, checkbox, 'да'), true)
  assert.equal(coerceCellValue(text, checkbox, 'Нет'), false)
  assert.equal(coerceCellValue(text, checkbox, 'что угодно'), false)
})

test('переключатель в текст показывает Да и Нет', () => {
  assert.equal(coerceCellValue(checkbox, text, true), 'Да')
  assert.equal(coerceCellValue(checkbox, text, false), 'Нет')
})

test('поле выбора в текст разворачивает id в имя варианта', () => {
  assert.equal(coerceCellValue(select, text, 'sel_done'), 'Готово')
})

test('текст в поле выбора сопоставляет по имени, а не по id', () => {
  // Идентификаторы вариантов у нового поля другие, поэтому сопоставление идёт по названию.
  assert.equal(coerceCellValue(text, select, 'Готово'), 'sel_done')
  assert.equal(coerceCellValue(text, select, 'готово'), 'sel_done')
  assert.equal(coerceCellValue(text, select, 'Такого варианта нет'), null)
})

test('текст в дату разбирает ISO, иначе пусто', () => {
  assert.equal(coerceCellValue(text, date, '2026-03-14'), '2026-03-13T21:00:00.000Z')
  assert.equal(coerceCellValue(text, date, 'вчера'), null)
})

test('пустое значение остаётся пустым в любом типе', () => {
  assert.equal(coerceCellValue(text, number, null), null)
  assert.equal(coerceCellValue(text, checkbox, ''), false)
  assert.deepEqual(coerceCellValue(text, field('multi_select', { choices: [] }), null), [])
})

test('несовместимые типы не переносят мусор', () => {
  const relation = field('relation', { tableId: 'tbl_2', allowMultiple: true, symmetricFieldId: null })
  // Строка «Иванов» не может стать ссылкой на строку другой таблицы.
  assert.deepEqual(coerceCellValue(text, relation, 'Иванов'), [])
  assert.deepEqual(coerceCellValue(relation, relation, ['row_1']), ['row_1'])
})

test('перевод в вычисляемое поле очищает значение', () => {
  const formula = field('formula', { expression: '1 + 1', resultType: 'number' })
  assert.equal(coerceCellValue(number, formula, 42), null)
})
