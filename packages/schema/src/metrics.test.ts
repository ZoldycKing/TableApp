import type { Field } from './fields'
import { instantToWallClock } from './time'
import { describe, expect, it } from 'vitest'
import { computeMetric, countByChoice, spansFor } from './metrics'

/**
 * Числа в сводке человек принимает за правду не глядя, поэтому проверяем
 * не только «считает ли», но и границы сроков: ошибка в один день сдвигает
 * выручку месяца и остаётся незамеченной.
 */

// 14 марта 2026 — суббота, 12:00 по Москве.
const now = new Date('2026-03-14T09:00:00Z')

const row = (date: string, sum: number) => ({ data: { d: date, s: sum } })

const rows = [
  row('2026-03-14T07:00:00Z', 100), // сегодня
  row('2026-03-13T07:00:00Z', 200), // вчера, та же неделя
  row('2026-03-02T07:00:00Z', 50), // этот месяц
  row('2026-02-20T07:00:00Z', 400), // прошлый месяц
  row('2026-02-01T07:00:00Z', 600), // прошлый месяц
  { data: { d: null, s: 999 } }, // без даты — в сроки не попадает
]

describe('сроки', () => {
  it('за всё время срока нет', () => {
    expect(spansFor('all', now)).toBeNull()
  })

  // Границы проверяем по московским суткам: в UTC они приходятся
  // на предыдущий день, и сравнение с ISO путало бы больше, чем помогало.
  const moscowDate = (instant: number) => instantToWallClock(new Date(instant))!.date

  it('неделя начинается с понедельника', () => {
    const week = spansFor('week', now)!
    // 14 марта 2026 — суббота, значит неделя началась 9 марта.
    expect(moscowDate(week.current.from)).toBe('2026-03-09')
    expect(week.current.to - week.current.from).toBe(7 * 24 * 60 * 60 * 1000)
  })

  it('месяц календарный, а не тридцать дней', () => {
    const month = spansFor('month', now)!
    expect(moscowDate(month.current.from)).toBe('2026-03-01')
    expect(moscowDate(month.previous.from)).toBe('2026-02-01')
  })

  it('срок начинается в московскую полночь', () => {
    for (const range of ['today', 'week', 'month', 'year'] as const) {
      expect(instantToWallClock(new Date(spansFor(range, now)!.current.from))!.time, range).toBe('00:00')
    }
  })

  it('предыдущий срок примыкает к текущему без зазора', () => {
    for (const range of ['today', 'week', 'month', 'quarter', 'year'] as const) {
      const spans = spansFor(range, now)!
      expect(spans.previous.to, range).toBe(spans.current.from)
    }
  })
})

describe('плитка', () => {
  it('считает количество за всё время', () => {
    const result = computeMetric({ kind: 'count', fieldId: null, dateFieldId: null, range: 'all', compare: false }, rows, now)
    expect(result.value).toBe(6)
  })

  it('сумма за месяц берёт только строки этого месяца', () => {
    const result = computeMetric({ kind: 'sum', fieldId: 's', dateFieldId: 'd', range: 'month', compare: false }, rows, now)
    expect(result.value).toBe(350)
  })

  it('сравнение с прошлым месяцем даёт процент', () => {
    const result = computeMetric({ kind: 'sum', fieldId: 's', dateFieldId: 'd', range: 'month', compare: true }, rows, now)
    expect(result.value).toBe(350)
    expect(result.previous).toBe(1000)
    expect(Math.round(result.delta!)).toBe(-65)
  })

  it('строка без даты не попадает ни в один срок', () => {
    const result = computeMetric({ kind: 'count', fieldId: null, dateFieldId: 'd', range: 'year', compare: false }, rows, now)
    expect(result.value).toBe(5)
  })

  it('без поля даты срок не применяется', () => {
    const result = computeMetric({ kind: 'sum', fieldId: 's', dateFieldId: null, range: 'month', compare: true }, rows, now)
    expect(result.value).toBe(2349)
    expect(result.delta).toBeNull()
  })

  it('среднее и максимум считаются по непустым числам', () => {
    const only = [{ data: { s: 10 } }, { data: { s: 20 } }, { data: { s: null } }]
    const spec = { fieldId: 's', dateFieldId: null, range: 'all' as const, compare: false }
    expect(computeMetric({ ...spec, kind: 'avg' }, only, now).value).toBe(15)
    expect(computeMetric({ ...spec, kind: 'max' }, only, now).value).toBe(20)
  })

  it('пустая выборка даёт пусто, а не ноль', () => {
    // Ноль значит «посчитали и вышло ноль», пусто — «считать было нечего».
    const result = computeMetric({ kind: 'sum', fieldId: 's', dateFieldId: null, range: 'all', compare: false }, [], now)
    expect(result.value).toBeNull()
    expect(computeMetric({ kind: 'count', fieldId: null, dateFieldId: null, range: 'all', compare: false }, [], now).value).toBe(0)
  })

  it('деления на ноль в сравнении не происходит', () => {
    const fresh = [row('2026-03-10T07:00:00Z', 5)]
    const result = computeMetric({ kind: 'sum', fieldId: 's', dateFieldId: 'd', range: 'month', compare: true }, fresh, now)
    expect(result.previous).toBeNull()
    expect(result.delta).toBeNull()
  })
})

describe('доска', () => {
  const status = {
    id: 'fld_status',
    tableId: 'tbl_1',
    name: 'Статус',
    type: 'single_select',
    description: null,
    position: 'a',
    options: {
      choices: [
        { id: 'sel_new', name: 'Новая', color: 'blue' },
        { id: 'sel_done', name: 'Готово', color: 'green' },
      ],
    },
  } as unknown as Field

  it('считает записи в каждой колонке, включая пустые', () => {
    const counts = countByChoice(
      [{ data: { fld_status: 'sel_new' } }, { data: { fld_status: 'sel_new' } }, { data: { fld_status: null } }],
      status,
    )
    expect(counts).toEqual([
      { id: 'sel_new', name: 'Новая', color: 'blue', count: 2 },
      { id: 'sel_done', name: 'Готово', color: 'green', count: 0 },
    ])
  })
})

describe('подсчёты без чисел и без строк', () => {
  it('«сколько заполнено» считает любые значения, а не только числа', () => {
    // Заполненность телефона или подписанного договора — такой же вопрос,
    // как и сумма, но числа там нет.
    const rows = [
      { data: { fld_phone: '+7 900 000-00-00' } },
      { data: { fld_phone: '   ' } },
      { data: { fld_phone: null } },
      { data: {} },
      { data: { fld_phone: 'без номера' } },
    ]

    const block = {
      kind: 'count_filled' as const,
      fieldId: 'fld_phone',
      dateFieldId: null,
      range: 'all' as const,
      compare: false,
    }

    expect(computeMetric(block, rows).value).toBe(2)
    // Без колонки считать нечего — и ноль тут был бы враньём.
    expect(computeMetric({ ...block, fieldId: null }, rows).value).toBe(null)
  })

  it('пустой список полей: количество ноль, остальное — прочерк', () => {
    const empty: { data: Record<string, unknown> }[] = []
    const base = { fieldId: 'fld_sum', dateFieldId: null, range: 'all' as const, compare: false }

    expect(computeMetric({ ...base, kind: 'count' }, empty).value).toBe(0)
    // Ноль — это посчитанная сумма нуля строк; тут же считать нечего вовсе.
    expect(computeMetric({ ...base, kind: 'sum' }, empty).value).toBe(null)
    expect(computeMetric({ ...base, kind: 'avg' }, empty).value).toBe(null)
    expect(computeMetric({ ...base, kind: 'min' }, empty).value).toBe(null)
    expect(computeMetric({ ...base, kind: 'max' }, empty).value).toBe(null)
  })
})
