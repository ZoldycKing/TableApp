import { buildFromRows } from '@tableapp/import'
import type { Field } from '@tableapp/schema'
import { describe, expect, it } from 'vitest'
import { mapRow, resolvePairs } from './import-mapping'

function target(id: string, name: string, type: Field['type'], options: Record<string, unknown> = {}): Field {
  return { id, tableId: 'tbl_1', name, type, options, description: null, position: 'a' } as unknown as Field
}

const yes = { id: 'sel_yes', name: 'Готово', color: 'green' as const }

const targets = new Map<string, Field>(
  [
    target('fld_name', 'Клиент', 'text'),
    target('fld_sum', 'Сумма', 'number', { format: 'plain', precision: 2, currency: 'RUB', showThousandsSeparator: true }),
    target('fld_paid', 'Оплачено', 'checkbox'),
    target('fld_status', 'Статус', 'single_select', { choices: [yes] }),
    target('fld_total', 'Итого', 'formula', { expression: '{Сумма} * 2', resultType: 'number' }),
  ].map((field) => [field.id, field]),
)

const file = buildFromRows([
  ['Клиент', 'Сумма', 'Оплачено', 'Статус'],
  ['ООО «Вектор»', '12 500,50', 'да', 'Готово'],
  ['ИП Соколов', 'не число', 'нет', 'Неизвестный'],
])

const byName = (name: string) => file.fields.find((field) => field.name === name)!

describe('перенос файла в существующую таблицу', () => {
  it('переносит только выбранные колонки', () => {
    const pairs = resolvePairs({
      sourceFields: file.fields,
      targetFields: targets,
      mapping: { [byName('Клиент').id]: 'fld_name' },
    })
    const data = mapRow(file.rows[0]!, pairs)
    expect(Object.keys(data)).toEqual(['fld_name'])
    expect(data.fld_name).toBe('ООО «Вектор»')
  })

  it('вычисляемую колонку заполнить нельзя', () => {
    const pairs = resolvePairs({
      sourceFields: file.fields,
      targetFields: targets,
      mapping: { [byName('Сумма').id]: 'fld_total' },
    })
    expect(pairs).toHaveLength(0)
  })

  it('чужое поле игнорируется', () => {
    const pairs = resolvePairs({
      sourceFields: file.fields,
      targetFields: targets,
      mapping: { [byName('Клиент').id]: 'fld_from_another_table' },
    })
    expect(pairs).toHaveLength(0)
  })

  it('две колонки файла не занимают одно поле таблицы', () => {
    const pairs = resolvePairs({
      sourceFields: file.fields,
      targetFields: targets,
      mapping: { [byName('Клиент').id]: 'fld_name', [byName('Статус').id]: 'fld_name' },
    })
    expect(pairs).toHaveLength(1)
  })

  it('число с пробелами и запятой становится числом, «да» — галочкой', () => {
    const pairs = resolvePairs({
      sourceFields: file.fields,
      targetFields: targets,
      mapping: {
        [byName('Сумма').id]: 'fld_sum',
        [byName('Оплачено').id]: 'fld_paid',
        [byName('Статус').id]: 'fld_status',
      },
    })
    const first = mapRow(file.rows[0]!, pairs)
    expect(first.fld_sum).toBe(12500.5)
    expect(first.fld_paid).toBe(true)
    // Вариант выбора сопоставляется по названию: идентификаторы в файле не пишут.
    expect(first.fld_status).toBe('sel_yes')
  })

  it('непереводимое значение становится пустым, а не рушит импорт', () => {
    const pairs = resolvePairs({
      sourceFields: file.fields,
      targetFields: targets,
      mapping: { [byName('Сумма').id]: 'fld_sum', [byName('Статус').id]: 'fld_status' },
    })
    const second = mapRow(file.rows[1]!, pairs)
    expect(second.fld_sum).toBeNull()
    expect(second.fld_status).toBeNull()
  })
})
