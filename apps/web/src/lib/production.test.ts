import { describe, expect, it } from 'vitest'
import { needFor, round, rowsToCreate, shortagesOf, type Norm } from './production'

/**
 * Расчёт расхода.
 *
 * Тот же расчёт показывают человеку до сохранения и по нему же списывают
 * материалы при сохранении. Ошибка здесь — это расхождение между экраном
 * и складом, и заметят его не сразу, а когда материал кончится раньше срока.
 */

const NORMS: Norm[] = [
  { materialId: 'm_plastic', perUnit: 0.012 },
  { materialId: 'm_box', perUnit: 0.01 },
  { materialId: 'm_glue', perUnit: 0.0003 },
  { materialId: 'm_dye', perUnit: 0.0001 },
]

const amountOf = (needs: { materialId: string; amount: number }[], id: string) =>
  needs.find((need) => need.materialId === id)?.amount

describe('расход по нормам', () => {
  it('считает ровно то, что посчитал бы человек на калькуляторе', () => {
    const needs = needFor(20_000, NORMS)
    expect(amountOf(needs, 'm_plastic')).toBe(240)
    expect(amountOf(needs, 'm_box')).toBe(200)
    expect(amountOf(needs, 'm_glue')).toBe(6)
    expect(amountOf(needs, 'm_dye')).toBe(2)
  })

  it('не оставляет двоичного мусора', () => {
    /*
     * 18 500 × 0,0003 в двоичной дроби даёт 5,550000000000001. Такое число
     * попало бы и в журнал склада, и на экран — и человек решил бы, что
     * продукт считает неправильно.
     */
    const needs = needFor(18_500, NORMS)
    expect(amountOf(needs, 'm_glue')).toBe(5.55)
    expect(amountOf(needs, 'm_dye')).toBe(1.85)
    expect(String(amountOf(needs, 'm_glue'))).not.toContain('0000')
  })

  it('дробный расход сохраняет знаки, а не округляется до целого', () => {
    // «Ноль клея» на выпуске в тысячу штук — это потерянный учёт.
    expect(amountOf(needFor(1_000, NORMS), 'm_glue')).toBe(0.3)
  })

  it('две строки на один материал складываются', () => {
    // Так бывает, когда норму разбили по операциям: литьё и склейка.
    const needs = needFor(100, [
      { materialId: 'm_glue', perUnit: 0.001 },
      { materialId: 'm_glue', perUnit: 0.002 },
    ])
    expect(needs).toHaveLength(1)
    expect(amountOf(needs, 'm_glue')).toBe(0.3)
  })

  it('пустая и отрицательная норма движения не порождают', () => {
    // Строка нормы без числа — незаполненная строка, а не указание списать ноль.
    const needs = needFor(1_000, [
      { materialId: 'm_a', perUnit: 0 },
      { materialId: 'm_b', perUnit: -0.5 },
      { materialId: 'm_c', perUnit: Number.NaN },
      { materialId: 'm_d', perUnit: 0.01 },
    ])
    expect(needs.map((need) => need.materialId)).toEqual(['m_d'])
  })

  it('нулевой и отрицательный выпуск ничего не списывает', () => {
    expect(needFor(0, NORMS)).toEqual([])
    expect(needFor(-5, NORMS)).toEqual([])
    expect(needFor(Number.NaN, NORMS)).toEqual([])
  })

  it('без норм списывать нечего', () => {
    // Изделие, которому нормы ещё не задали, сохраняется как выпуск
    // без движений — это законный случай, а не ошибка.
    expect(needFor(1_000, [])).toEqual([])
  })
})

describe('нехватка на складе', () => {
  const stock = new Map([
    ['m_plastic', 180],
    ['m_box', 5_000],
    ['m_glue', 0],
  ])

  it('показывает, сколько именно не хватает', () => {
    const short = shortagesOf(needFor(20_000, NORMS), stock)
    const plastic = short.find((item) => item.materialId === 'm_plastic')!
    expect(plastic.need).toBe(240)
    expect(plastic.stock).toBe(180)
    expect(plastic.missing).toBe(60)
  })

  it('материал, которого хватает, в список не попадает', () => {
    const short = shortagesOf(needFor(20_000, NORMS), stock)
    expect(short.map((item) => item.materialId)).not.toContain('m_box')
  })

  it('материал, которого нет на складе вовсе, считается недостающим целиком', () => {
    // Неизвестный складу материал — это ноль, а не «нет данных, пропустим».
    const short = shortagesOf(needFor(20_000, NORMS), stock)
    expect(short.find((item) => item.materialId === 'm_dye')?.missing).toBe(2)
  })

  it('ровно столько, сколько нужно, нехваткой не считается', () => {
    const short = shortagesOf([{ materialId: 'm_a', amount: 100 }], new Map([['m_a', 100]]))
    expect(short).toEqual([])
  })
})

describe('сколько строк появится', () => {
  it('выпуск плюс по строке на каждый материал', () => {
    /*
     * Нужно до транзакции: потолок тарифа проверяется на всю операцию сразу.
     * Проверить только строку выпуска значило бы пропустить её при полном
     * складе и получить выпуск без списаний — молча разошедшийся учёт.
     */
    expect(rowsToCreate(needFor(20_000, NORMS))).toBe(5)
  })

  it('выпуск без норм — одна строка', () => {
    expect(rowsToCreate([])).toBe(1)
  })
})

describe('округление', () => {
  it('держит шесть знаков и не ломается на бесконечности', () => {
    expect(round(1 / 3)).toBe(0.333333)
    expect(round(Number.POSITIVE_INFINITY)).toBe(0)
    expect(round(Number.NaN)).toBe(0)
  })
})
