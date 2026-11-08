import { isComputed, parseCellValue, type Field } from '@tableapp/schema'
import { cellText, type TitleIndex } from './table-export'
import type { TableRow } from './table-store'

export const MAX_EDITOR_CELLS = 5000
export type EditorCell = { rowId: string; fieldId: string; value: unknown; base: unknown }
export type EditorRowWrite = { id: string; create?: boolean; data: Record<string, unknown>; base?: Record<string, unknown>; afterRowId?: string }
export type EditorResult = { ok: true } | { ok: false; error: string; rowId?: string; fieldId?: string }
export type GridPoint = { rowId: string; fieldId: string }
export type GridBookmark = { anchor: GridPoint | null; focus: GridPoint | null; scrollLeft: number; scrollTop: number }
export type EditorLeaveGuard = { save: () => Promise<boolean>; discard: () => void }

export class EditorInputError extends Error {
  constructor(message: string, readonly rowId?: string, readonly fieldId?: string) { super(message) }
}

/** Excel and Sheets quote multiline cells and escape quotes by doubling them. */
export function parseTsv(text: string): string[][] {
  const rows: string[][] = [[]]
  let cell = '', quoted = false, atStart = true
  const push = () => { rows[rows.length - 1]!.push(cell); cell = ''; atStart = true }
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { cell += '"'; i++ }
      else if (char === '"') quoted = false
      else cell += char
    } else if (char === '"' && atStart) { quoted = true; atStart = false }
    else if (char === '\t') push()
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++
      push(); rows.push([])
    } else { cell += char; atStart = false }
  }
  if (quoted) throw new EditorInputError('В скопированном тексте не закрыты кавычки.')
  push()
  if (rows.length > 1 && rows[rows.length - 1]!.length === 1 && rows[rows.length - 1]![0] === '' && /[\r\n]$/.test(text)) rows.pop()
  if (rows.reduce((n, row) => n + row.length, 0) > MAX_EDITOR_CELLS) throw new EditorInputError('За один раз можно вставить до 5 000 ячеек.')
  return rows
}

export function toTsv(rows: string[][]): string {
  return rows.map(row => row.map(value => /[\t\r\n"]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value).join('\t')).join('\n')
}

export function parseEditorValue(field: Field, raw: unknown): unknown {
  if (isComputed(field.type)) throw new EditorInputError(`Поле «${field.name}» вычисляется автоматически.`)
  let value = raw
  if (field.type === 'number' && typeof raw === 'string') {
    const normalized = raw.trim().replace(/\s/g, '').replace(',', '.')
    if (!normalized) value = null
    else {
      value = Number(normalized)
      if (!Number.isFinite(value)) throw new EditorInputError(`В поле «${field.name}» нужно число.`)
    }
  }
  try { return parseCellValue(field, value === '' ? null : value) }
  catch { throw new EditorInputError(`Проверьте значение поля «${field.name}».`) }
}

function optionId(raw: string, options: { id: string; title: string }[], name: string): string {
  const exact = options.find(option => option.id === raw)
  if (exact) return exact.id
  const matches = options.filter(option => option.title.trim().toLocaleLowerCase('ru-RU') === raw.trim().toLocaleLowerCase('ru-RU'))
  if (matches.length !== 1) throw new EditorInputError(matches.length ? `В поле «${name}» несколько вариантов «${raw}». Выберите запись в ячейке.` : `В поле «${name}» нет варианта «${raw}».`)
  return matches[0]!.id
}

export function clipboardValue(field: Field, text: string, titles: TitleIndex): unknown {
  if (isComputed(field.type)) throw new EditorInputError(`Поле «${field.name}» вычисляется автоматически.`)
  const raw = text.trim()
  if (field.type === 'image' || field.type === 'attachment') throw new EditorInputError(`Файлы в поле «${field.name}» добавляются через ячейку.`)
  if (field.type === 'checkbox') {
    if (['', 'нет', 'false', '0'].includes(raw.toLocaleLowerCase('ru-RU'))) return false
    if (['да', 'true', '1'].includes(raw.toLocaleLowerCase('ru-RU'))) return true
    throw new EditorInputError(`В поле «${field.name}» укажите «Да» или «Нет».`)
  }
  if (field.type === 'single_select') return raw ? optionId(raw, field.options.choices.map(c => ({ id: c.id, title: c.name })), field.name) : null
  if (field.type === 'multi_select' || field.type === 'relation') {
    const options = field.type === 'relation' ? titles[field.options.tableId] ?? [] : field.options.choices.map(c => ({ id: c.id, title: c.name }))
    const ids = raw ? [...new Set(raw.split(';').map(value => optionId(value.trim(), options, field.name)))] : []
    return parseEditorValue(field, ids)
  }
  return parseEditorValue(field, text)
}

export function clipboardText(field: Field, value: unknown, titles: TitleIndex): string {
  if (field.type === 'relation' || field.type === 'multi_select') {
    const options = field.type === 'relation' ? titles[field.options.tableId] ?? [] : field.options.choices.map(c => ({ id: c.id, title: c.name }))
    return (Array.isArray(value) ? value : []).map(id => options.find(option => option.id === id)?.title ?? String(id)).join('; ')
  }
  if (field.type === 'checkbox') return value ? 'Да' : 'Нет'
  return cellText(field, value, titles)
}

export function planGridPaste(matrix: string[][], rows: TableRow[], fields: Field[], top: number, left: number, titles: TitleIndex, fill?: { rows: number; columns: number }): EditorCell[] {
  const single = matrix.length === 1 && matrix[0]?.length === 1
  const height = single && fill ? fill.rows : matrix.length
  const width = single && fill ? fill.columns : Math.max(...matrix.map(row => row.length))
  if (height * width > MAX_EDITOR_CELLS) throw new EditorInputError('За один раз можно вставить до 5 000 ячеек.')
  if (top < 0 || left < 0 || top + height > rows.length || left + width > fields.length) throw new EditorInputError('Диапазон выходит за пределы таблицы. Добавьте нужные строки или поля перед вставкой.')
  const cells: EditorCell[] = []
  for (let r = 0; r < height; r++) for (let c = 0; c < width; c++) {
    const row = rows[top + r]!, field = fields[left + c]!
    try { cells.push({ rowId: row.id, fieldId: field.id, value: clipboardValue(field, single ? matrix[0]![0]! : matrix[r]?.[c] ?? '', titles), base: row.data[field.id] ?? null }) }
    catch (error) { throw new EditorInputError(error instanceof Error ? error.message : 'Проверьте значение.', row.id, field.id) }
  }
  return cells
}

export function groupEditorCells(cells: EditorCell[]): EditorRowWrite[] {
  const rows = new Map<string, EditorRowWrite>()
  for (const cell of cells) {
    const row = rows.get(cell.rowId) ?? { id: cell.rowId, data: {}, base: {} }
    row.data[cell.fieldId] = cell.value; row.base![cell.fieldId] = cell.base
    rows.set(cell.rowId, row)
  }
  return [...rows.values()]
}
