import { readFile } from 'node:fs/promises'
import { beforeAll, describe, expect, it } from 'vitest'
import { buildFromRows } from './build'
import { inspectWorkbook, readSheets, SHEET_LIMITS, type SheetInfo } from './xlsx'

/**
 * Чтение книги Excel.
 *
 * Проверки идут по настоящим книгам: преобразование ячеек по отдельности
 * не ловит ни пустые хвосты, ни порядок листов, ни склейку заголовков.
 *
 * Главное здесь — вторая книга. Она собрана из того, на чём импорт молча
 * терял данные: формулы без сохранённого результата, ошибки вычисления,
 * пустые листы, скрытые листы и коды с ведущими нулями.
 */

/*
 * Прогрев библиотеки до тестов.
 *
 * Первый разбор книги тянет за собой `exceljs` — на свободной машине это
 * около четырёхсот миллисекунд, под нагрузкой заметно больше. Без прогрева
 * эту цену платит первый тест файла: он один шёл 441 мс при 1–23 мс
 * у остальных, и именно он упирался в предел в пять секунд, когда рядом
 * шла сборка. Предел не поднимаем — убираем из теста чужую работу.
 */
beforeAll(async () => {
  await import('exceljs')
}, 30_000)

const sklad = async () => new Uint8Array(await readFile(new URL('../fixtures/sklad.xlsx', import.meta.url)))
const kniga = async () => new Uint8Array(await readFile(new URL('../fixtures/kniga.xlsx', import.meta.url)))

const by = (sheets: SheetInfo[], name: string): SheetInfo => {
  const found = sheets.find((sheet) => sheet.name === name)
  if (!found) throw new Error(`лист «${name}» не найден: ${sheets.map((s) => s.name).join(', ')}`)
  return found
}

describe('чтение листа', () => {
  it('читает первый лист и обрезает пустые хвосты', async () => {
    const [first] = await readSheets(await sklad(), ['Склад'])

    expect(first!.grid[0]).toEqual([
      'Наименование', 'Артикул', 'Цена', 'Остаток', 'Дата приёмки', 'Оплачено', 'Адрес склада', 'Сумма',
    ])
    expect(first!.grid).toHaveLength(4)
    expect(first!.grid[1]).toEqual([
      'Перфоратор SDS-Plus, 800 Вт', 'ПР-0842', '12490.5', '8', '14.03.2026', 'да', 'Москва, Складочная 1', '99920',
    ])
    expect(first!.grid[2]![4]).toBe('16.03.2026 09:30')
  })

  it('берёт указанный лист', async () => {
    const [sheet] = await readSheets(await sklad(), ['Заявки'])
    expect(sheet!.grid).toEqual([['Клиент', 'Статус'], ['ООО «Вектор»', 'В работе'], ['ООО «Кристалл»', 'Новая']])
  })

  it('несуществующий лист не выдумывает, а говорит об этом', async () => {
    const [sheet] = await readSheets(await sklad(), ['Которого нет'])
    expect(sheet!.grid).toEqual([])
    expect(sheet!.info.blockers).toEqual([{ kind: 'missing' }])
  })

  it('типы полей определяются так же, как из CSV', async () => {
    const [sheet] = await readSheets(await sklad(), ['Склад'])
    const preview = buildFromRows(sheet!.grid)
    const types = Object.fromEntries(preview.fields.map((field) => [field.name, field.type]))

    expect(types['Цена']).toBe('number')
    expect(types['Остаток']).toBe('number')
    // В колонке есть значение со временем, поэтому вся колонка — дата
    // со временем: терять время у одной строки хуже, чем показать нули у всех.
    expect(types['Дата приёмки']).toBe('datetime')
    expect(types['Оплачено']).toBe('checkbox')
    expect(types['Наименование']).toBe('text')
  })

  it('на чужом формате объясняет, а не падает молча', async () => {
    await expect(inspectWorkbook(new Uint8Array([1, 2, 3, 4]))).rejects.toThrow()
  })
})

describe('осмотр книги', () => {
  it('перечисляет листы с числами строк и колонок', async () => {
    const sheets = await inspectWorkbook(await kniga())

    expect(sheets.map((sheet) => sheet.name)).toEqual([
      'Продажи', 'Клиенты', 'Итоги', 'Ошибки', 'Пусто', 'Шапка', 'Архив',
    ])

    const prodazhi = by(sheets, 'Продажи')
    expect(prodazhi.rows).toBe(3)
    expect(prodazhi.columns).toBe(5)
    expect(prodazhi.blockers).toEqual([])
    expect(prodazhi.header).toEqual(['Клиент', 'Дата', 'Количество', 'Цена', 'Сумма'])
  })

  it('совсем скрытый лист не показывается, обычный скрытый — помечается', async () => {
    const sheets = await inspectWorkbook(await kniga())

    expect(sheets.some((sheet) => sheet.name === 'Служебный')).toBe(false)
    const arhiv = by(sheets, 'Архив')
    expect(arhiv.hidden).toBe(true)
    expect(arhiv.rows).toBe(2)
    expect(arhiv.blockers).toEqual([])
  })

  it('пустой лист и лист из одних заголовков не пойдут в таблицу случайно', async () => {
    const sheets = await inspectWorkbook(await kniga())

    expect(by(sheets, 'Пусто').blockers).toEqual([{ kind: 'empty' }])
    expect(by(sheets, 'Пусто').rows).toBe(0)
    // «Шапка» — заголовки без данных: таблица из неё вышла бы пустой.
    expect(by(sheets, 'Шапка').blockers).toEqual([{ kind: 'empty' }])
    expect(by(sheets, 'Шапка').rows).toBe(0)
  })
})

describe('формулы', () => {
  it('формула с сохранённым значением читается как значение', async () => {
    const [sheet] = await readSheets(await kniga(), ['Продажи'])
    expect(sheet!.grid[1]).toEqual(['ООО «Вектор»', '14.03.2026', '3', '1200', '3600'])
  })

  it('формула без сохранённого значения блокирует лист и называет ячейки', async () => {
    const sheets = await inspectWorkbook(await kniga())
    const itogi = by(sheets, 'Итоги')

    expect(itogi.blockers).toEqual([{ kind: 'formulas', count: 2, cells: ['B2', 'B3'] }])

    // И главное: строк такого листа импорт не отдаёт вообще. Иначе колонка
    // «Выручка» приехала бы пустой, и это заметили бы через месяц.
    const [read] = await readSheets(await kniga(), ['Итоги'])
    expect(read!.grid).toEqual([])
  })

  it('ошибка вычисления видна, но импорту не мешает: значение в файле есть', async () => {
    const sheets = await inspectWorkbook(await kniga())
    const oshibki = by(sheets, 'Ошибки')

    expect(oshibki.blockers).toEqual([])
    expect(oshibki.notes).toEqual([{ kind: 'errors', count: 1, cells: ['B2'] }])

    const [read] = await readSheets(await kniga(), ['Ошибки'])
    expect(read!.grid[1]).toEqual(['Перфоратор', '#DIV/0!'])
  })
})

describe('потолки листа', () => {
  it('лист сверх потолка не обрезается, а называет, сколько в нём на самом деле', async () => {
    // Потолки передаются нарочно маленькие: проверяем поведение, а не число.
    const sheets = await inspectWorkbook(await kniga(), { rows: 2, columns: 4 })
    const prodazhi = by(sheets, 'Продажи')

    expect(prodazhi.blockers).toEqual([
      { kind: 'rows', found: 3, limit: 2 },
      { kind: 'columns', found: 5, limit: 4 },
    ])

    const [read] = await readSheets(await kniga(), ['Продажи'], { rows: 2, columns: 4 })
    expect(read!.grid).toEqual([])
  })

  it('потолки по умолчанию — те, о которых говорит интерфейс', () => {
    expect(SHEET_LIMITS).toEqual({ rows: 20_000, columns: 200 })
  })
})

describe('текстовые коды', () => {
  it('ведущие нули не теряются: «007» — это артикул, а не семь', async () => {
    const [sheet] = await readSheets(await kniga(), ['Клиенты'])
    const preview = buildFromRows(sheet!.grid)
    const code = preview.fields[0]!

    expect(code.name).toBe('Код')
    expect(code.type).toBe('text')
    expect(preview.rows.map((row) => row[code.id])).toEqual(['007', '0042', '0108'])
  })
})
