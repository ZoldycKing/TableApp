import { describe, expect, it } from 'vitest'
import { changedFields, sameCellValue } from './compare'
import { normalizeFieldOptions } from './fields'
import type { Field } from './fields'

const field = (type: string, options: Record<string, unknown> = {}): Field =>
  ({
    id: `fld_${type}`,
    name: type,
    type,
    options: normalizeFieldOptions(type as never, options),
  }) as unknown as Field

describe('пустота во всех видах — это одно значение', () => {
  const text = field('text')

  it('нет ключа, null и пустая строка равны между собой', () => {
    expect(sameCellValue(text, undefined, null)).toBe(true)
    expect(sameCellValue(text, null, '')).toBe(true)
    expect(sameCellValue(text, undefined, '')).toBe(true)
  })

  it('пусто и не пусто — разное', () => {
    expect(sameCellValue(text, null, 'Перфоратор')).toBe(false)
  })

  it('пустой список равен пустоте', () => {
    expect(sameCellValue(field('multi_select', { choices: [] }), [], null)).toBe(true)
  })
})

describe('числа и текст', () => {
  it('строка «8» и число 8 — одно и то же после приведения', () => {
    expect(sameCellValue(field('number'), '8', 8)).toBe(true)
  })

  it('разные числа не равны', () => {
    expect(sameCellValue(field('number'), 8, 5)).toBe(false)
  })

  it('дробь без лишнего нуля равна себе же', () => {
    expect(sameCellValue(field('number'), 12490.5, '12490.50')).toBe(true)
  })

  it('переключатель: невыставленный флажок — это «нет», а не «пусто»', () => {
    expect(sameCellValue(field('checkbox'), true, true)).toBe(true)
    expect(sameCellValue(field('checkbox'), false, null)).toBe(true)
    expect(sameCellValue(field('checkbox'), false, undefined)).toBe(true)
    expect(sameCellValue(field('checkbox'), true, false)).toBe(false)
  })
})

describe('даты сравниваются как мгновения, а не как строки', () => {
  const date = field('date', { timeZone: 'Europe/Moscow' })

  it('одна и та же полночь в разных записях равна себе', () => {
    // Так выглядела дата до починки часового пояса и после неё.
    expect(sameCellValue(date, '2026-03-14T00:00:00.000Z', '2026-03-14T00:00:00Z')).toBe(true)
  })

  it('разные мгновения не равны', () => {
    expect(sameCellValue(date, '2026-03-14T00:00:00.000Z', '2026-03-13T21:00:00.000Z')).toBe(false)
  })

  it('мусор вместо даты сравнивается как текст, а не считается равным всему', () => {
    expect(sameCellValue(date, 'позавчера', 'позавчера')).toBe(true)
    expect(sameCellValue(date, 'позавчера', 'вчера')).toBe(false)
  })
})

describe('списки', () => {
  const multi = field('multi_select', {
    choices: [
      { id: 'sel_a', name: 'А', color: 'blue' },
      { id: 'sel_b', name: 'Б', color: 'green' },
    ],
  })
  const relation = field('relation', { tableId: 'tbl_1' })

  it('у множественного выбора порядок не значит ничего', () => {
    expect(sameCellValue(multi, ['sel_a', 'sel_b'], ['sel_b', 'sel_a'])).toBe(true)
  })

  it('у связей порядок задаёт человек, поэтому он значим', () => {
    expect(sameCellValue(relation, ['row_1', 'row_2'], ['row_2', 'row_1'])).toBe(false)
    expect(sameCellValue(relation, ['row_1', 'row_2'], ['row_1', 'row_2'])).toBe(true)
  })

  it('разная длина списка — разные значения', () => {
    expect(sameCellValue(multi, ['sel_a'], ['sel_a', 'sel_b'])).toBe(false)
  })
})

describe('файлы сравниваются по составу, а не побайтово', () => {
  const attachment = field('attachment')
  const file = (id: string, size: number) => ({ id, name: `${id}.pdf`, size, mime: 'application/pdf', key: id })

  it('тот же файл с другими служебными данными — тот же файл', () => {
    expect(sameCellValue(attachment, [file('att_1', 100)], [file('att_1', 120)])).toBe(true)
  })

  it('добавленный файл меняет значение', () => {
    expect(sameCellValue(attachment, [file('att_1', 100)], [file('att_1', 100), file('att_2', 50)])).toBe(false)
  })

  it('порядок файлов не важен', () => {
    expect(sameCellValue(attachment, [file('att_1', 1), file('att_2', 2)], [file('att_2', 2), file('att_1', 1)])).toBe(true)
  })
})

describe('различия строки целиком', () => {
  const fields = [field('text'), field('number'), field('rollup', { relationFieldId: 'fld_r', targetFieldId: 'fld_t', fn: 'sum' })]

  it('называет только изменившиеся поля', () => {
    const left = { fld_text: 'Ромашка', fld_number: 8 }
    const right = { fld_text: 'Ромашка', fld_number: 5 }
    expect(changedFields(fields, left, right)).toEqual(['fld_number'])
  })

  it('вычисляемые поля не считаются правкой: они пересчитались сами', () => {
    const left = { fld_text: 'Ромашка', fld_rollup: 100 }
    const right = { fld_text: 'Ромашка', fld_rollup: 200 }
    expect(changedFields(fields, left, right)).toEqual([])
  })
})
