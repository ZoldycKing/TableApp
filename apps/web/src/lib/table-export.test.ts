import type { Field } from '@tableapp/schema'
import { describe, expect, it } from 'vitest'
import {
  buildCsv,
  buildGrid,
  cellText,
  exportFileName,
  escapeCsvValue,
  isExportFormat,
} from './table-export'

const text = (id: string, name: string): Field =>
  ({ id, name, type: 'text', options: {} }) as unknown as Field

const number = (id: string, name: string): Field =>
  ({ id, name, type: 'number', options: { format: 'plain', precision: 0 } }) as unknown as Field

describe('экранирование', () => {
  it('не трогает обычные значения', () => {
    expect(escapeCsvValue('Перфоратор')).toBe('Перфоратор')
  })

  it('прячет в кавычки разделитель, перевод строки и сами кавычки', () => {
    expect(escapeCsvValue('Москва; Складочная')).toBe('"Москва; Складочная"')
    expect(escapeCsvValue('первая\nвторая')).toBe('"первая\nвторая"')
    expect(escapeCsvValue('шуруповёрт "Профи"')).toBe('"шуруповёрт ""Профи"""')
  })
})

describe('файл выгрузки', () => {
  const fields = [text('fld_a', 'Товар'), number('fld_b', 'Остаток')]
  const rows = [
    { data: { fld_a: 'Перфоратор', fld_b: 8 } },
    { data: { fld_a: 'Набор; бит', fld_b: 41 } },
  ]

  it('начинается с BOM: иначе русский Excel покажет кракозябры', () => {
    expect(buildCsv(fields, rows).startsWith('\ufeff')).toBe(true)
  })

  it('разделяет точкой с запятой и ставит заголовок из имён полей', () => {
    const lines = buildCsv(fields, rows).replace('\ufeff', '').split('\r\n')
    expect(lines[0]).toBe('Товар;Остаток')
    expect(lines[1]).toBe('Перфоратор;8')
  })

  it('экранирует значение с разделителем', () => {
    const lines = buildCsv(fields, rows).split('\r\n')
    expect(lines[2]).toBe('"Набор; бит";41')
  })

  it('пустую таблицу отдаёт с одним заголовком', () => {
    expect(buildCsv(fields, []).replace('\ufeff', '')).toBe('Товар;Остаток')
  })

  it('пропущенные значения становятся пустыми ячейками, а не undefined', () => {
    const line = buildCsv(fields, [{ data: {} }]).split('\r\n')[1]
    expect(line).toBe(';')
  })
})

describe('имя файла', () => {
  it('склеивает таблицу с представлением и добавляет дату', () => {
    expect(exportFileName('Склад', 'Все позиции')).toMatch(/^Склад — Все позиции \d{4}-\d{2}-\d{2}\.csv$/)
  })

  it('убирает символы, недопустимые в имени файла', () => {
    expect(exportFileName('Отчёт: 1/2 "итог"')).toMatch(/^Отчёт 1 2 итог \d{4}-\d{2}-\d{2}\.csv$/)
  })
})

describe('связи и файлы', () => {
  const relation = {
    id: 'fld_rel',
    name: 'Позиции',
    type: 'relation',
    options: { tableId: 'tbl_pos' },
  } as unknown as Field

  const titles = {
    tbl_pos: [
      { id: 'row_1', title: 'Монтаж оборудования' },
      { id: 'row_2', title: 'Пусконаладка' },
    ],
  }

  it('подставляет названия связанных строк вместо их идентификаторов', () => {
    expect(cellText(relation, ['row_1', 'row_2'], titles)).toBe('Монтаж оборудования, Пусконаладка')
  })

  it('не молчит про удалённую строку', () => {
    expect(cellText(relation, ['row_9'], titles)).toBe('Строка удалена')
  })

  it('без указателя заголовков отдаёт пусто, а не идентификаторы', () => {
    expect(cellText(relation, ['row_1'])).toBe('Строка удалена')
  })

  it('файлы выгружаются именами, а не объектами', () => {
    const attachment = { id: 'fld_f', name: 'Фото', type: 'attachment', options: {} } as unknown as Field
    const value = [
      { id: 'att_1', name: 'акт.pdf', size: 10, mime: 'application/pdf', key: 'k1' },
      { id: 'att_2', name: 'схема.png', size: 20, mime: 'image/png', key: 'k2' },
    ]
    expect(cellText(attachment, value)).toBe('акт.pdf, схема.png')
    expect(cellText(attachment, [])).toBe('')
  })
})

describe('два формата из одной решётки', () => {
  const fields = [text('fld_a', 'Товар'), number('fld_b', 'Остаток')]
  const rows = [
    { data: { fld_a: 'Перфоратор', fld_b: 8 } },
    { data: { fld_a: 'Набор; бит', fld_b: 41 } },
  ]

  it('шапка и значения совпадают с тем, что уходит в CSV', () => {
    /*
     * Расхождение между файлом CSV и книгой человек заметит не сразу
     * и не поймёт, какой из них правильный. Поэтому решётка одна на оба
     * формата, и это утверждение надо стеречь.
     */
    const grid = buildGrid(fields, rows)
    const csv = buildCsv(fields, rows)

    expect(grid.header).toEqual(['Товар', 'Остаток'])
    for (const value of grid.rows.flat()) {
      if (value === '') continue
      expect(csv, `значение «${value}» есть в решётке, но не в CSV`).toContain(value)
    }
  })

  it('решётка не теряет и не переставляет строки', () => {
    const grid = buildGrid(fields, rows)
    expect(grid.rows).toEqual([
      ['Перфоратор', '8'],
      ['Набор; бит', '41'],
    ])
  })
})

describe('имя файла и формат', () => {
  it('получает нужное расширение', () => {
    expect(exportFileName('Заявки', 'Все', 'xlsx').endsWith('.xlsx')).toBe(true)
    expect(exportFileName('Заявки', 'Все', 'csv').endsWith('.csv')).toBe(true)
    // По умолчанию CSV: так было до появления книги, и ломать вызовы незачем.
    expect(exportFileName('Заявки').endsWith('.csv')).toBe(true)
  })

  it('не содержит знаков, запрещённых в файловой системе', () => {
    // Иначе браузер сохранит файл под искажённым именем или не сохранит вовсе.
    const name = exportFileName('Отчёт: 10/2026 «прод»', 'Всё <важное>', 'xlsx')
    expect(/[/\:*?"<>|]/.test(name)).toBe(false)
    expect(name).toContain('прод')
  })

  it('формат из адреса принимается только известный', () => {
    // В адрес пишет кто угодно: неизвестное значение должно стать CSV,
    // а не дойти до записи файла.
    expect(isExportFormat('csv')).toBe(true)
    expect(isExportFormat('xlsx')).toBe(true)
    expect(isExportFormat('exe')).toBe(false)
    expect(isExportFormat(undefined)).toBe(false)
  })
})
