import { compileTableFormulas, computeDerivedRow, relatedIndexFrom } from '@tableapp/formula'
import type { Field } from '@tableapp/schema'
import { describe, expect, it } from 'vitest'
import { buildTemplate } from './build'
import { findTemplate } from './catalog'

/**
 * Шаблон «Производственный учёт».
 *
 * Отдельным файлом, потому что проверяется не только сборка, но и то, ради
 * чего шаблон существует: остатки, выведенные из движений, должны сходиться
 * с примерами. Демонстрация, в которой склад не бьётся с выпуском, хуже
 * отсутствующей — человек решит, что так считает и продукт.
 */

function build(workspaceId = 'wsp_test') {
  return buildTemplate({
    template: findTemplate('proizvodstvo')!,
    workspaceId,
    now: new Date('2026-03-10T09:00:00Z'),
  })
}

/** Таблица по имени и её поля: ключи шаблона наружу не выходят. */
function tableOf(built: ReturnType<typeof build>, name: string) {
  const table = built.tables.find((item) => item.name === name)!
  const fields = built.fields.filter((field) => field.tableId === table.id) as unknown as Field[]
  const rows = built.rows.filter((row) => row.tableId === table.id)
  const byName = (fieldName: string) => fields.find((field) => field.name === fieldName)!
  return { table, fields, rows, byName }
}

/**
 * Значения строки со всеми вычисляемыми колонками.
 *
 * Тем же путём, что и на экране: свёртки и формулы считаются при чтении,
 * а не лежат в базе. Иначе проверялось бы не то, что увидит человек.
 */
function computed(built: ReturnType<typeof build>, tableName: string) {
  const raw = new Map<string, Map<string, Record<string, unknown>>>()
  const fieldsByTable = new Map<string, Field[]>()
  for (const table of built.tables) {
    const bucket = new Map<string, Record<string, unknown>>()
    for (const row of built.rows.filter((item) => item.tableId === table.id)) {
      bucket.set(row.id, row.data)
    }
    raw.set(table.id, bucket)
    fieldsByTable.set(
      table.id,
      built.fields.filter((field) => field.tableId === table.id) as unknown as Field[],
    )
  }

  const related = relatedIndexFrom(raw, fieldsByTable)
  const { fields, rows, byName } = tableOf(built, tableName)
  const formulas = compileTableFormulas(fields)

  return {
    byName,
    rows: rows.map((row) => computeDerivedRow(row.data, fields, related, formulas)),
  }
}

describe('состав шаблона', () => {
  it('пять таблиц: продукция, материалы, нормы, выпуск и журнал склада', () => {
    const names = build().tables.map((table) => table.name)
    expect(names).toEqual([
      'Продукция',
      'Материалы',
      'Нормы расхода',
      'Производство',
      'Движение материалов',
    ])
  })

  it('нормы заданы строкой на материал, а не колонкой', () => {
    /*
     * Главное решение модели. Колонки «Пластик», «Клей», «Коробки» означали бы,
     * что добавить материал можно только правкой структуры таблицы — а это
     * ровно то, чего человек делать не станет.
     */
    const { fields, rows } = tableOf(build(), 'Нормы расхода')
    const names = fields.map((field) => field.name)
    expect(names).toContain('Материал')
    expect(names).not.toContain('Пластик')
    expect(names).not.toContain('Клей')
    // Два изделия по четыре материала.
    expect(rows).toHaveLength(8)
  })

  it('у каждого пространства свои идентификаторы', () => {
    // Два человека, взявшие один шаблон, не делят ни строки, ни поля.
    const first = build('wsp_a')
    const second = build('wsp_b')
    const ids = new Set(first.tables.map((table) => table.id))
    for (const table of second.tables) expect(ids.has(table.id)).toBe(false)
  })

  it('все строки помечены примерами', () => {
    // Иначе «удалить примеры» их не найдёт и оставит демонстрацию навсегда.
    expect(build().rows.every((row) => row.sample)).toBe(true)
  })
})

describe('склад выводится из движений', () => {
  it('остаток равен начальному плюс сумма движений', () => {
    const { byName, rows } = computed(build(), 'Материалы')
    const stock = (name: string) =>
      rows.find((row) => row[byName('Название').id] === name)?.[byName('Текущий остаток').id]

    // Пластик: 1500 начальных + 500 прихода − 222 − 240 списаний.
    expect(stock('Пластик')).toBe(1538)
    // Коробки: 5000 − 185 − 200.
    expect(stock('Коробки')).toBe(4615)
    // Клей: 100 − 5,55 − 6.
    expect(stock('Клей')).toBeCloseTo(88.45, 6)
    // Краситель: 50 − 1,85 − 2.
    expect(stock('Краситель')).toBeCloseTo(46.15, 6)
  })

  it('ниже нормы отмечаются те и только те, у кого остаток меньше минимума', () => {
    const { byName, rows } = computed(build(), 'Материалы')
    const low = rows
      .filter((row) => row[byName('Ниже минимального остатка').id] === true)
      .map((row) => row[byName('Название').id])

    expect(low.sort()).toEqual(['Клей', 'Краситель'])
  })

  it('движения по выпуску отрицательные, приход положительный', () => {
    /*
     * Знак — это и есть модель: свёртки в Scatta не умеют отбора, поэтому
     * остаток считается одной суммой по знаковому количеству, без условий.
     */
    const { byName, rows } = tableOf(build(), 'Движение материалов')
    const qty = byName('Количество').id
    const kind = byName('Тип').id
    const choices = (byName('Тип').options as { choices: { id: string; name: string }[] }).choices
    const nameOf = (id: unknown) => choices.find((choice) => choice.id === id)?.name

    for (const row of rows) {
      const value = row.data[qty] as number
      if (nameOf(row.data[kind]) === 'Приход') expect(value).toBeGreaterThan(0)
      else expect(value).toBeLessThan(0)
    }
  })
})

describe('заголовки строк', () => {
  it('собираются из названий, а не из идентификаторов связей', () => {
    /*
     * Формула видит в связи идентификатор строки, а не её название: движок
     * формул связи не разворачивает. Поэтому названия берутся подстановкой —
     * без неё в списке выпусков стояло бы «row_k7z0s4vlm1 — 18500», и это
     * первое, что увидел бы человек после установки шаблона.
     */
    const built = build()
    const runs = computed(built, 'Производство')
    const titles = runs.rows.map((row) => String(row[runs.byName('Выпуск').id]))
    expect(titles).toEqual(['Пивной пакет 1 л — 18500', 'Пивной пакет 1 л — 20000'])

    const moves = computed(built, 'Движение материалов')
    expect(String(moves.rows[0]![moves.byName('Движение').id])).toBe('Пластик: 500')

    const norms = computed(built, 'Нормы расхода')
    expect(String(norms.rows[0]![norms.byName('Норма').id])).toBe('Пивной пакет 1 л — Пластик')

    for (const table of ['Производство', 'Движение материалов', 'Нормы расхода']) {
      const { byName, rows } = computed(built, table)
      const title = byName(table === 'Производство' ? 'Выпуск' : table === 'Нормы расхода' ? 'Норма' : 'Движение')
      for (const row of rows) expect(String(row[title.id])).not.toContain('row_')
    }
  })
})

describe('примеры согласованы между собой', () => {
  it('каждое списание по выпуску сходится с нормой и количеством', () => {
    /*
     * Это и проверяет честность демонстрации: сумма в журнале должна быть
     * ровно той, какую даёт норма, умноженная на выпуск. Иначе человек,
     * посчитавший на калькуляторе, перестанет верить расчёту.
     */
    const built = build()
    const products = tableOf(built, 'Продукция')
    const materials = tableOf(built, 'Материалы')
    const norms = tableOf(built, 'Нормы расхода')
    const production = tableOf(built, 'Производство')
    const movements = tableOf(built, 'Движение материалов')

    const single = (value: unknown) => (Array.isArray(value) ? String(value[0]) : String(value))

    for (const movement of movements.rows) {
      const productionId = movement.data[movements.byName('Выпуск').id]
      if (!productionId) continue

      const run = production.rows.find((row) => row.id === single(productionId))!
      const qty = run.data[production.byName('Произведено').id] as number
      const productId = single(run.data[production.byName('Продукт').id])
      const materialId = single(movement.data[movements.byName('Материал').id])

      const norm = norms.rows.find(
        (row) =>
          single(row.data[norms.byName('Продукт').id]) === productId &&
          single(row.data[norms.byName('Материал').id]) === materialId,
      )!
      const perUnit = norm.data[norms.byName('Норма на единицу').id] as number

      const wrote = -(movement.data[movements.byName('Количество').id] as number)
      expect(wrote, `${single(materialId)} по выпуску ${qty}`).toBeCloseTo(qty * perUnit, 6)
    }

    expect(products.rows).toHaveLength(2)
    expect(materials.rows).toHaveLength(4)
  })

  it('связь материала с его движениями заполнена', () => {
    // Без неё свёртка считает по пустому списку, и остаток равен начальному.
    const { byName, rows } = tableOf(build(), 'Материалы')
    for (const row of rows) {
      const links = row.data[byName('Движения').id]
      expect(Array.isArray(links) && links.length > 0).toBe(true)
    }
  })
})
