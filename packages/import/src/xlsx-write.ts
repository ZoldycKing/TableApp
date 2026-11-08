/**
 * Запись XLSX.
 *
 * Обратная сторона `parseXlsx`, и живёт рядом с ним не случайно: `exceljs`
 * тяжёлая, и держать её в одном пакете — единственный способ не протащить
 * её заодно в браузерную сборку. Поэтому и здесь всё делается на сервере.
 *
 * Знание о колонках сюда не попадает намеренно. На вход приходит готовая
 * решётка строк — что в ячейке, как это назвать и в каком порядке, решает
 * тот, кто знает про поля и права. Здесь только формат файла.
 */

export type SheetData = {
  /** Имя листа. Excel режет длинные и не принимает часть знаков — почистим. */
  name: string
  header: string[]
  rows: string[][]
}

/** Excel не открывает книгу с листом, названным не по его правилам. */
const FORBIDDEN = /[\\/*?:[\]]/g
const MAX_SHEET_NAME = 31

export function sheetName(raw: string): string {
  const clean = raw.replace(FORBIDDEN, ' ').replace(/\s+/g, ' ').trim()
  return clean.slice(0, MAX_SHEET_NAME) || 'Лист 1'
}

/**
 * Ширина колонки по содержимому.
 *
 * Без этого в файле всё слипается в узкие столбцы, и человек первым делом
 * растягивает их мышью. Считаем по самой длинной ячейке, с потолком: одна
 * колонка с длинным примечанием иначе уедет за край экрана.
 */
function widthFor(header: string, values: string[]): number {
  const longest = values.reduce((max, value) => Math.max(max, value.length), header.length)
  return Math.min(Math.max(longest + 2, 10), 60)
}

export async function writeXlsx(sheet: SheetData): Promise<Uint8Array> {
  const excel = await import('exceljs')
  const Workbook = excel.Workbook ?? excel.default.Workbook
  const workbook = new Workbook()
  workbook.created = new Date()

  const worksheet = workbook.addWorksheet(sheetName(sheet.name), {
    views: [{ state: 'frozen', ySplit: 1 }],
  })

  worksheet.addRow(sheet.header)
  for (const row of sheet.rows) worksheet.addRow(row)

  const head = worksheet.getRow(1)
  head.font = { bold: true }
  head.alignment = { vertical: 'middle' }

  sheet.header.forEach((name, index) => {
    const column = worksheet.getColumn(index + 1)
    column.width = widthFor(
      name,
      sheet.rows.map((row) => row[index] ?? ''),
    )
  })

  /*
   * Автофильтр по шапке: таблицу на тысячу строк открывают, чтобы что-то
   * в ней найти, и делать это руками после выгрузки — работа, которую
   * файл может взять на себя.
   */
  if (sheet.header.length > 0) {
    worksheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: sheet.rows.length + 1, column: sheet.header.length },
    }
  }

  const buffer = await workbook.xlsx.writeBuffer()
  return new Uint8Array(buffer as ArrayBuffer)
}
