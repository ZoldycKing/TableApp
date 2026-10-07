import { test } from 'vitest'
import assert from 'node:assert/strict'
import { FormulaError } from './ast'
import { compile, computeRow, topologicalOrder, type Compiled, type FieldLike } from './compile'
import { evaluate } from './evaluate'
import { print } from './parser'

const fields: FieldLike[] = [
  { id: 'fld_price', name: 'Цена', type: 'number' },
  { id: 'fld_qty', name: 'Количество', type: 'number' },
  { id: 'fld_name', name: 'Имя клиента', type: 'text' },
  { id: 'fld_due', name: 'Срок', type: 'date' },
  { id: 'fld_paid', name: 'Оплачено', type: 'checkbox' },
]

const NOW = new Date('2026-03-14T12:00:00.000Z')

function run(expression: string, values: Record<string, unknown> = {}) {
  const compiled = compile(expression, fields)
  return evaluate(compiled.ast, { values, now: NOW, timeZone: 'Europe/Moscow' })
}

test('арифметика соблюдает приоритет операций', () => {
  assert.equal(run('2 + 2 * 2'), 6)
  assert.equal(run('(2 + 2) * 2'), 8)
  assert.equal(run('2 ^ 3 ^ 2'), 512)
  assert.equal(run('-3 + 10'), 7)
})

test('ссылки на поля читаются по имени и хранятся по id', () => {
  const compiled = compile('{Цена} * {Количество}', fields)
  assert.deepEqual(compiled.dependencies.sort(), ['fld_price', 'fld_qty'])
  assert.equal(compiled.resultType, 'number')
  assert.equal(evaluate(compiled.ast, { values: { fld_price: 100, fld_qty: 3 }, now: NOW, timeZone: 'UTC' }), 300)
})

test('переименование поля не ломает формулу, меняется только отображение', () => {
  const compiled = compile('{Цена} * 2', fields)
  const renamed = new Map([['fld_price', 'Стоимость']])
  assert.equal(print(compiled.ast, (id) => renamed.get(id) ?? null), '{Стоимость} * 2')
})

test('неизвестное поле — это понятная ошибка с позицией', () => {
  assert.throws(
    () => compile('{Неизвестное} + 1', fields),
    (error: unknown) => error instanceof FormulaError && error.message.includes('Неизвестное'),
  )
})

test('идентификатор без скобок подсказывает синтаксис ссылки на поле', () => {
  assert.throws(
    () => compile('Цена + 1', fields),
    (error: unknown) => error instanceof FormulaError && error.message.includes('{Цена}'),
  )
})

test('деление на ноль даёт пусто, а не ошибку', () => {
  assert.equal(run('10 / 0'), null)
  assert.equal(run('{Цена} / {Количество}', { fld_price: 10, fld_qty: 0 }), null)
})

test('ветки IF вычисляются лениво', () => {
  const result = run('IF({Количество} = 0, 0, 100 / {Количество})', { fld_qty: 0 })
  assert.equal(result, 0)
})

test('текстовые функции и конкатенация', () => {
  assert.equal(run('UPPER({Имя клиента})', { fld_name: 'иванов' }), 'ИВАНОВ')
  assert.equal(run('"Здравствуйте, " & {Имя клиента}', { fld_name: 'Анна' }), 'Здравствуйте, Анна')
  assert.equal(run('LEFT("Российская Федерация", 10)'), 'Российская')
  assert.equal(run('MID("Российская", 3, 4)'), 'ссий')
  assert.equal(run('REPLACE("2026-03-14", "-", ".")'), '2026.03.14')
  assert.equal(run('LEN(TRIM("  ок  "))'), 2)
})

test('сравнение текста не зависит от регистра, как и фильтры', () => {
  assert.equal(run('{Имя клиента} = "ИВАНОВ"', { fld_name: 'иванов' }), true)
})

test('десятичная запятая принимается наравне с точкой', () => {
  assert.equal(run('{Цена} + 1', { fld_price: '10,5' }), 11.5)
})

test('булево значение в тексте показывается как Да и Нет', () => {
  assert.equal(run('"Статус: " & {Оплачено}', { fld_paid: true }), 'Статус: Да')
})

test('функции дат', () => {
  assert.equal(run('FORMAT_DATE({Срок})', { fld_due: '2026-03-14T00:00:00.000Z' }), '14.03.2026')
  assert.equal(run('DATEDIFF({Срок}, TODAY(), "дни")', { fld_due: '2026-03-04T00:00:00.000Z' }), 10)
  assert.equal(run('FORMAT_DATE(DATEADD({Срок}, 1, "месяцы"))', { fld_due: '2026-01-31T00:00:00.000Z' }), '28.02.2026')
})

test('пустая ячейка не ломает вычисление', () => {
  assert.equal(run('{Цена} * {Количество}', { fld_price: null, fld_qty: 3 }), null)
  assert.equal(run('ISBLANK({Цена})', {}), true)
  assert.equal(run('CONCAT({Имя клиента}, "!")', {}), '!')
})

test('неверное число аргументов сообщается человеческим языком', () => {
  assert.throws(
    () => run('ROUND()'),
    (error: unknown) => error instanceof FormulaError && error.message.includes('ROUND'),
  )
})

test('формулы пересчитываются в порядке зависимостей', () => {
  const withFormulas: FieldLike[] = [
    ...fields,
    { id: 'fld_total', name: 'Сумма', type: 'formula', options: { resultType: 'number' } },
    { id: 'fld_vat', name: 'НДС', type: 'formula', options: { resultType: 'number' } },
  ]
  const compiled = new Map<string, Compiled>([
    ['fld_vat', compile('ROUND({Сумма} * 0.2, 2)', withFormulas)],
    ['fld_total', compile('{Цена} * {Количество}', withFormulas)],
  ])
  const result = computeRow({ fld_price: 100, fld_qty: 3 }, compiled)
  assert.equal(result.fld_total, 300)
  assert.equal(result.fld_vat, 60)
})

test('циклическая зависимость обнаруживается до рантайма', () => {
  const cyclic: FieldLike[] = [
    { id: 'fld_a', name: 'А', type: 'formula' },
    { id: 'fld_b', name: 'Б', type: 'formula' },
  ]
  const compiled = new Map<string, Compiled>([
    ['fld_a', compile('{Б} + 1', cyclic)],
    ['fld_b', compile('{А} + 1', cyclic)],
  ])
  const plan = topologicalOrder(compiled)
  assert.ok('cycle' in plan, 'цикл должен быть обнаружен')
})

test('сдвиг на месяц прижимается к концу месяца, а не перескакивает', () => {
  assert.equal(run('FORMAT_DATE(DATEADD({Срок}, 1, "месяцы"))', { fld_due: '2026-01-31T00:00:00.000Z' }), '28.02.2026')
  assert.equal(run('FORMAT_DATE(DATEADD({Срок}, 1, "месяцы"))', { fld_due: '2024-01-31T00:00:00.000Z' }), '29.02.2024')
  assert.equal(run('FORMAT_DATE(DATEADD({Срок}, 1, "год"))', { fld_due: '2024-02-29T00:00:00.000Z' }), '28.02.2025')
  assert.equal(run('FORMAT_DATE(DATEADD({Срок}, -1, "месяцы"))', { fld_due: '2026-03-31T00:00:00.000Z' }), '28.02.2026')
})
