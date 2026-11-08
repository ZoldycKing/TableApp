import type { Workbook, Worksheet } from 'exceljs'
import { looksLikeHeader } from './build'

/**
 * Чтение XLSX.
 *
 * Разбирается на сервере: библиотеки для Excel тянут за собой узловые модули,
 * и в браузерной сборке это оборачивается полифилами ради одной страницы.
 * Результат — та же таблица строк, что даёт парсер CSV, поэтому дальше
 * определение типов и построение полей работают без изменений.
 *
 * Здесь же проходит главная граница честности импорта. Раньше лист, который
 * не помещался в потолок, молча обрезался: человек получал таблицу, выглядящую
 * законченной, и узнавал о пропаже строк спустя недели. Теперь лист
 * либо читается целиком, либо не читается вовсе и говорит, почему: сколько
 * в нём строк, сколько колонок и что именно превышено. То же с формулами
 * без сохранённого результата — считать их пустыми значит тихо потерять
 * колонку итогов.
 */

export type SheetLimits = { rows: number; columns: number }

export const SHEET_LIMITS: SheetLimits = { rows: 20_000, columns: 200 }

/**
 * Запас строк, которые читаем сверх потолка, прежде чем признать лист
 * заведомо превышающим его. Нужен из-за пустых строк внутри данных: данными
 * они не считаются, но место в решётке занимают.
 */
const HEADROOM = 5_000

/** Сколько адресов проблемных ячеек показываем: список должен помещаться в глаз. */
const SAMPLE = 5

/** Почему лист нельзя импортировать. Числа — чтобы человек понял масштаб. */
export type SheetBlocker =
  | { kind: 'empty' }
  | { kind: 'rows'; found: number; limit: number }
  | { kind: 'columns'; found: number; limit: number }
  | { kind: 'formulas'; count: number; cells: string[] }
  | { kind: 'missing' }
  | { kind: 'unreadable'; message: string }

/** Что стоит знать до импорта, но импорту не мешает. */
export type SheetNote = { kind: 'errors'; count: number; cells: string[] }

export type SheetInfo = {
  name: string
  /** Обычный «Скрыть» в Excel. Такой лист не выбирается сам, но импортируется. */
  hidden: boolean
  /** Строк данных без строки заголовков. */
  rows: number
  columns: number
  /** Первая строка, если она похожа на заголовки: по ней узнают лист в списке. */
  header: string[]
  blockers: SheetBlocker[]
  notes: SheetNote[]
}

export type SheetGrid = {
  name: string
  /** Пусто, если лист заблокирован: половина листа хуже, чем ничего. */
  grid: string[][]
  info: SheetInfo
}

async function openWorkbook(bytes: Uint8Array): Promise<Workbook> {
  const excel = await import('exceljs')
  const WorkbookConstructor = excel.Workbook ?? excel.default.Workbook
  const workbook = new WorkbookConstructor()
  await workbook.xlsx.load(toArrayBuffer(bytes))
  return workbook
}

/**
 * Листы книги, пригодные к показу.
 *
 * `veryHidden` не показываем: такой лист прячут из самого Excel, и это почти
 * всегда служебная кухня книги, а не данные. Обычный скрытый лист остаётся
 * в списке — его прячут от глаз, а не от импорта.
 */
function sheetsOf(workbook: Workbook): Worksheet[] {
  return workbook.worksheets.filter((sheet) => sheet.state !== 'veryHidden')
}

/** Что в книге: по листу на строку, без чтения данных в память. */
export async function inspectWorkbook(
  bytes: Uint8Array,
  limits: SheetLimits = SHEET_LIMITS,
): Promise<SheetInfo[]> {
  const workbook = await openWorkbook(bytes)
  const sheets = sheetsOf(workbook)
  if (sheets.length === 0) throw new Error('В книге нет ни одного листа')
  return sheets.map((sheet) => describe(sheet, false, limits).info)
}

/**
 * Строки названных листов. Без имён — все листы книги.
 *
 * Заблокированный лист возвращается с пустой решёткой и своими причинами:
 * решение «не импортировать» принимает вызывающий, а не парсер, но обрезанных
 * данных он от парсера не получит никогда.
 */
export async function readSheets(
  bytes: Uint8Array,
  names?: readonly string[],
  limits: SheetLimits = SHEET_LIMITS,
): Promise<SheetGrid[]> {
  const workbook = await openWorkbook(bytes)
  const sheets = sheetsOf(workbook)
  if (sheets.length === 0) throw new Error('В книге нет ни одного листа')

  if (!names) return sheets.map((sheet) => describe(sheet, true, limits))

  return names.map((name) => {
    const sheet = sheets.find((candidate) => candidate.name === name)
    if (!sheet) {
      return {
        name,
        grid: [],
        info: { name, hidden: false, rows: 0, columns: 0, header: [], blockers: [{ kind: 'missing' }], notes: [] },
      }
    }
    return describe(sheet, true, limits)
  })
}

/** Один лист: числа, причины и — если он пригоден — сами строки. */
function describe(sheet: Worksheet, materialize: boolean, limits: SheetLimits): SheetGrid {
  const name = sheet.name
  const hidden = sheet.state === 'hidden'

  let scan: Scan
  try {
    scan = scanSheet(sheet, materialize, limits)
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'не удалось прочитать'
    return {
      name,
      grid: [],
      info: { name, hidden, rows: 0, columns: 0, header: [], blockers: [{ kind: 'unreadable', message }], notes: [] },
    }
  }

  const first = scan.grid[0] ?? scan.firstRow
  const hasHeader = first.length > 0 && looksLikeHeader(first)
  const rows = Math.max(scan.filled - (hasHeader ? 1 : 0), 0)

  const blockers: SheetBlocker[] = []
  if (rows === 0) blockers.push({ kind: 'empty' })
  // `truncated` означает «строк столько, что мы перестали их читать»: для
  // человека это то же самое превышение, и число у нас точное — счёт шёл
  // по всему листу, а не по прочитанной части.
  if (rows > limits.rows || scan.truncated) {
    blockers.push({ kind: 'rows', found: rows, limit: limits.rows })
  }
  if (scan.columns > limits.columns) {
    blockers.push({ kind: 'columns', found: scan.columns, limit: limits.columns })
  }
  if (scan.formulas.count > 0) {
    blockers.push({ kind: 'formulas', count: scan.formulas.count, cells: scan.formulas.cells })
  }

  const notes: SheetNote[] = []
  if (scan.errors.count > 0) notes.push({ kind: 'errors', count: scan.errors.count, cells: scan.errors.cells })

  const info: SheetInfo = {
    name,
    hidden,
    rows,
    columns: scan.columns,
    header: hasHeader ? first : [],
    blockers,
    notes,
  }

  return { name, grid: blockers.length === 0 ? shape(scan.grid, scan.columns) : [], info }
}

type Scan = {
  grid: string[][]
  /** Первая строка листа — нужна и тогда, когда решётку не собирали. */
  firstRow: string[]
  /** Непустых строк всего, включая строку заголовков. */
  filled: number
  columns: number
  formulas: { count: number; cells: string[] }
  errors: { count: number; cells: string[] }
  truncated: boolean
}

/**
 * Один проход по листу.
 *
 * Считает всегда, собирает строки — только когда попросили. Порядок именно
 * такой: число строк должно быть правдой и для листа, который мы отказываемся
 * читать, иначе в отказе нечего показать.
 */
function scanSheet(sheet: Worksheet, materialize: boolean, limits: SheetLimits): Scan {
  const ceiling = limits.rows + HEADROOM
  const grid: string[][] = []
  let firstRow: string[] = []
  let filled = 0
  let columns = 0
  let truncated = false
  const formulas = { count: 0, cells: [] as string[] }
  const errors = { count: 0, cells: [] as string[] }

  sheet.eachRow({ includeEmpty: true }, (row) => {
    const width = row.cellCount
    const line: string[] = []
    let hasValue = false

    for (let index = 1; index <= width; index += 1) {
      const cell = row.getCell(index)
      const raw = cell.value
      const state = formulaState(raw)

      if (state === 'missing') {
        formulas.count += 1
        if (formulas.cells.length < SAMPLE) formulas.cells.push(cell.address)
      } else if (state === 'error') {
        errors.count += 1
        if (errors.cells.length < SAMPLE) errors.cells.push(cell.address)
      }

      const text = cellText(raw)
      line.push(text)

      // Формула без результата — это данные, которых мы не получили. Считать
      // такую ячейку пустой значит занизить размер листа и потерять колонку.
      if (text !== '' || state === 'missing') {
        hasValue = true
        if (index > columns) columns = index
      }
    }

    if (hasValue) filled += 1
    if (firstRow.length === 0 && line.length > 0) firstRow = line
    if (!materialize) return
    if (grid.length < ceiling) grid.push(line)
    else truncated = true
  })

  return { grid, firstRow, filled, columns, formulas, errors, truncated }
}

/**
 * Решётка под общую ширину: ровно столько колонок, сколько занято данными.
 *
 * Пустые хвосты не нужны: Excel помечает использованными тысячи пустых ячеек
 * после единственной правки, и без обрезки в таблице появлялись бы «Колонка 7»
 * и десяток пустых строк в конце.
 */
function shape(grid: readonly string[][], width: number): string[][] {
  const shaped = grid.map((row) => {
    const line = row.slice(0, width)
    while (line.length < width) line.push('')
    return line
  })
  while (shaped.length > 0 && shaped[shaped.length - 1]!.every((value) => value === '')) shaped.pop()
  return shaped
}

/**
 * Что с формулой в ячейке.
 *
 * Excel хранит в файле и выражение, и посчитанное значение. Значение
 * появляется при сохранении из Excel — но книга, собранная выгрузкой из чужой
 * программы, часто содержит только выражение. Посчитать его мы не можем
 * и не будем: свой вычислитель формул Excel — это отдельный продукт.
 */
function formulaState(value: unknown): 'none' | 'ok' | 'missing' | 'error' {
  if (value === null || typeof value !== 'object') return 'none'
  const record = value as Record<string, unknown>

  if ('error' in record) return 'error'
  if (!('formula' in record) && !('sharedFormula' in record)) return 'none'

  const result = record.result
  if (result === undefined || result === null) return 'missing'
  if (typeof result === 'object' && result !== null && 'error' in (result as Record<string, unknown>)) return 'error'
  return 'ok'
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(copy).set(bytes)
  return copy
}

/**
 * Значение ячейки строкой — в том виде, в котором его потом узнает
 * определение типов: дата как ДД.ММ.ГГГГ, число с точкой, «да» и «нет»
 * для логических. Формула отдаёт посчитанное значение, а не текст формулы:
 * человеку нужен результат, а не то, как он получен.
 */
export function cellText(value: unknown): string {
  if (value === null || value === undefined) return ''

  if (value instanceof Date) return formatDate(value)
  if (typeof value === 'number') return String(value)
  if (typeof value === 'boolean') return value ? 'да' : 'нет'
  if (typeof value === 'string') return value.trim()

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>

    // Ошибка вычисления: показываем как есть, чтобы её было видно и в таблице.
    if ('error' in record) return String(record.error)
    if ('result' in record) return cellText(record.result)
    if ('text' in record) return cellText(record.text)
    if ('hyperlink' in record) return String(record.hyperlink)
    if (Array.isArray(record.richText)) {
      // Куски склеиваем как есть и обрезаем только целиком: пробел между
      // словами часто и есть граница куска — обрезав каждый, слова слипнутся.
      return record.richText
        .map((part) => String((part as { text?: unknown }).text ?? ''))
        .join('')
        .trim()
    }
    // Формула без сохранённого результата. Пустая строка здесь — не «нет
    // значения», а «значения нет в файле»: лист с такими ячейками не пройдёт
    // проверку выше и до таблицы не доедет. Но если код позовут напрямую,
    // человек должен увидеть пустоту, а не «[object Object]».
    if ('formula' in record || 'sharedFormula' in record) return ''
  }

  return String(value)
}

function formatDate(date: Date): string {
  const day = String(date.getUTCDate()).padStart(2, '0')
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const year = date.getUTCFullYear()
  const time = date.getUTCHours() * 60 + date.getUTCMinutes()

  // Время добавляем, только если оно есть: иначе каждая дата станет «датой
  // со временем» и в таблице появится лишний ноль-ноль.
  if (time === 0 && date.getUTCSeconds() === 0) return `${day}.${month}.${year}`

  const hours = String(date.getUTCHours()).padStart(2, '0')
  const minutes = String(date.getUTCMinutes()).padStart(2, '0')
  return `${day}.${month}.${year} ${hours}:${minutes}`
}
