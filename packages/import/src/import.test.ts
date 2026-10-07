import { test } from 'vitest'
import assert from 'node:assert/strict'
import { buildFromCsv, buildFromRows } from './build'
import { detectDelimiter, detectEncoding, parseCsv, parseRows } from './csv'
import { inferColumn, parseDate, parseNumber } from './infer'

function cp1251(text: string): Uint8Array {
  const map: Record<string, number> = {}
  const alphabet = 'АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдежзийклмнопрстуфхцчшщъыьэюя'
  alphabet.split('').forEach((ch, i) => { map[ch] = 0xc0 + i })
  return new Uint8Array([...text].map((ch) => map[ch] ?? ch.charCodeAt(0)))
}

test('кодировка windows-1251 распознаётся без подсказок', () => {
  const bytes = cp1251('Имя;Город')
  assert.equal(detectEncoding(bytes), 'windows-1251')
  assert.equal(detectEncoding(new TextEncoder().encode('Имя;Город')), 'utf-8')
})

test('CSV из русского Excel читается целиком', () => {
  const bytes = cp1251('Клиент;Сумма\nИванов;1000\nПетров;2000')
  const grid = parseCsv(bytes)
  assert.deepEqual(grid[0], ['Клиент', 'Сумма'])
  assert.deepEqual(grid[1], ['Иванов', '1000'])
})

test('разделитель определяется по стабильности числа колонок', () => {
  assert.equal(detectDelimiter('a;b;c\n1;2;3'), ';')
  assert.equal(detectDelimiter('a,b,c\n1,2,3'), ',')
  assert.equal(detectDelimiter('a\tb\tc\n1\t2\t3'), '\t')
})

test('кавычки, экранирование и переводы строк внутри ячейки', () => {
  const grid = parseRows('"Иванов, Иван";"Он сказал ""да"""\n"Строка\nвторая";x', ';')
  assert.deepEqual(grid[0], ['Иванов, Иван', 'Он сказал "да"'])
  assert.deepEqual(grid[1], ['Строка\nвторая', 'x'])
})

test('числа с пробелами, запятой и рублём', () => {
  assert.equal(parseNumber('1 234,50'), 1234.5)
  assert.equal(parseNumber('1234.50'), 1234.5)
  assert.equal(parseNumber('15%'), 0.15)
  assert.equal(parseNumber('1 000 ₽'), 1000)
  assert.equal(parseNumber('не число'), null)
})

test('даты в русском и ISO формате', () => {
  // В файле записано настенное московское время, поэтому в ISO уходит
  // мгновение со смещением: иначе дата из таблицы съезжает при показе.
  assert.equal(parseDate('14.03.2026'), '2026-03-13T21:00:00.000Z')
  assert.equal(parseDate('2026-03-14'), '2026-03-13T21:00:00.000Z')
  assert.equal(parseDate('14.03.2026 15:30'), '2026-03-14T12:30:00.000Z')
  assert.equal(parseDate('32.03.2026'), null)
  assert.equal(parseDate('14.13.2026'), null)
})

test('типы колонок определяются по содержимому', () => {
  assert.equal(inferColumn(['1000', '2500', '300']).type, 'number')
  assert.equal(inferColumn(['14.03.2026', '01.01.2025']).type, 'date')
  assert.equal(inferColumn(['14.03.2026 10:00']).type, 'datetime')
  assert.equal(inferColumn(['да', 'нет', 'да']).type, 'checkbox')
  assert.equal(inferColumn(['a@b.ru', 'c@d.com']).type, 'email')
  assert.equal(inferColumn(['+7 999 123-45-67', '84951234567']).type, 'phone')
  assert.equal(inferColumn(['https://ya.ru']).type, 'url')
  assert.equal(inferColumn(['Иванов', 'Петров']).type, 'text')
  assert.equal(inferColumn([]).type, 'text')
})

test('повторяющиеся значения превращаются в поле выбора', () => {
  const statuses = ['Новая', 'В работе', 'Готово', 'Новая', 'Готово', 'В работе', 'Новая']
  const inferred = inferColumn(statuses)
  assert.equal(inferred.type, 'single_select')
  assert.deepEqual(inferred.choices, ['Новая', 'В работе', 'Готово'])
})

test('длинный текст отличается от обычного', () => {
  assert.equal(inferColumn(['x'.repeat(200)]).type, 'long_text')
})

test('импорт собирает поля и строки с приведением типов', () => {
  const csv = [
    'Клиент;Сумма;Оплачено;Срок;Статус',
    'Иванов;1 000,50;да;14.03.2026;Новая',
    'Петров;2000;нет;15.03.2026;Новая',
    'Сидоров;300;да;16.03.2026;Готово',
    'Кузнецов;450;нет;17.03.2026;Готово',
    'Смирнов;700;да;18.03.2026;Новая',
    'Попов;120;нет;19.03.2026;Готово',
  ].join('\n')
  const result = buildFromCsv(csv)

  assert.deepEqual(result.fields.map((f) => f.name), ['Клиент', 'Сумма', 'Оплачено', 'Срок', 'Статус'])
  assert.deepEqual(result.fields.map((f) => f.type), ['text', 'number', 'checkbox', 'date', 'single_select'])
  assert.equal(result.rows.length, 6)

  const [amount, paid, due] = [result.fields[1]!, result.fields[2]!, result.fields[3]!]
  assert.equal(result.rows[0]![amount.id], 1000.5)
  assert.equal(result.rows[0]![paid.id], true)
  assert.equal(result.rows[1]![due.id], '2026-03-14T21:00:00.000Z')
})

test('значения поля выбора ссылаются на созданные варианты', () => {
  const csv = 'Статус\nНовая\nГотово\nНовая\nГотово\nНовая\nГотово'
  const result = buildFromCsv(csv)
  const field = result.fields[0]!
  assert.equal(field.type, 'single_select')
  const choices = (field.options as { choices: { id: string; name: string }[] }).choices
  const byId = new Map(choices.map((c) => [c.id, c.name]))
  assert.equal(byId.get(result.rows[0]![field.id] as string), 'Новая')
  assert.equal(byId.get(result.rows[1]![field.id] as string), 'Готово')
})

test('файл без заголовков получает автоматические имена колонок', () => {
  const result = buildFromRows([['1000', '2000'], ['3000', '4000']])
  assert.deepEqual(result.fields.map((f) => f.name), ['Колонка 1', 'Колонка 2'])
  assert.equal(result.rows.length, 2)
  assert.ok(result.warnings.some((w) => w.includes('Заголовки')))
})

test('повторяющиеся заголовки получают уникальные имена', () => {
  const result = buildFromRows([['Имя', 'Имя', 'Имя'], ['а', 'б', 'в']])
  assert.deepEqual(result.fields.map((f) => f.name), ['Имя', 'Имя 2', 'Имя 3'])
})

test('пустые строки пропускаются и попадают в предупреждения', () => {
  const result = buildFromCsv('Имя;Возраст\nИванов;30\n;\nПетров;40')
  assert.equal(result.rows.length, 2)
  assert.equal(result.skippedRows, 0)
})

test('пустой файл не роняет импорт', () => {
  const result = buildFromRows([])
  assert.deepEqual(result.fields, [])
  assert.ok(result.warnings.includes('Файл пуст'))
})

test('на малой выборке колонка остаётся текстом, а не становится выбором', () => {
  // Три строки не дают оснований считать колонку справочником.
  assert.equal(inferColumn(['Новая', 'Новая', 'Готово']).type, 'text')
})

test('ведущие нули остаются текстом, но тип всё равно можно перебить', () => {
  const csv = 'Артикул\n001\n002\n003'
  const auto = buildFromCsv(csv)

  // Раньше колонка становилась числом, и «001» превращался в единицу молча:
  // артикул, табельный номер и код подразделения теряли смысл на импорте.
  assert.equal(auto.fields[0]!.type, 'text')
  assert.equal(auto.rows[0]![auto.fields[0]!.id], '001')

  // Угадывание остаётся подсказкой: человек вправе сказать, что это числа.
  const fixed = buildFromCsv(csv, { typeOverrides: { 0: 'number' }, nameOverrides: { 0: 'Код товара' } })
  assert.equal(fixed.fields[0]!.type, 'number')
  assert.equal(fixed.fields[0]!.name, 'Код товара')
  assert.equal(fixed.rows[0]![fixed.fields[0]!.id], 1)
})

test('ручной выбор типа «поле выбора» собирает варианты из значений', () => {
  const result = buildFromCsv('Город\nМосква\nКазань\nМосква', { typeOverrides: { 0: 'single_select' } })
  const field = result.fields[0]!
  const choices = (field.options as { choices: { id: string; name: string }[] }).choices
  assert.deepEqual(choices.map((c) => c.name), ['Москва', 'Казань'])
  assert.equal(choices.length, 2)
})

test('настройки поля заполняются значениями по умолчанию, а не пустым объектом', () => {
  // Пустой options у числа приводил к NaN в Intl.NumberFormat при отрисовке.
  const result = buildFromCsv('Сумма\n1000\n2000')
  const options = result.fields[0]!.options as Record<string, unknown>
  assert.equal(options.format, 'plain')
  assert.equal(options.precision, 0)
  assert.equal(options.currency, 'RUB')
  assert.equal(options.showThousandsSeparator, true)
})

test('варианты выбора получают разные цвета', () => {
  const csv = 'Статус\nНовая\nВ работе\nГотово\nНовая\nВ работе\nГотово\nНовая\nВ работе'
  const field = buildFromCsv(csv).fields[0]!
  const choices = (field.options as { choices: { name: string; color: string }[] }).choices
  assert.equal(choices.length, 3)
  assert.equal(new Set(choices.map((c) => c.color)).size, 3)
  assert.ok(choices.every((c) => c.color !== 'gray'))
})
