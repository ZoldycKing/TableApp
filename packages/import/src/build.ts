import type { Field, FieldType } from '@tableapp/schema'
import { COLORS, newId, normalizeFieldOptions, positionSequence } from '@tableapp/schema'
import { parseCsv } from './csv'
import { inferColumn, isBlankCell, parseBoolean, parseDate, parseNumber } from './infer'

export type ImportPreview = {
  fields: Field[]
  rows: Record<string, unknown>[]
  /** Предупреждения показываются на экране предпросмотра, импорт при этом не блокируется. */
  warnings: string[]
  skippedRows: number
}

const MAX_PREVIEW_ROWS = 50

/**
 * Похожа ли строка на заголовки.
 *
 * Экспортируется, потому что этот же вопрос задаёт чтение книги: «сколько
 * в листе строк данных» зависит от того, считается ли первая строка
 * заголовками. Два ответа на один вопрос разошлись бы, и человек увидел бы
 * в списке листов одно число, а в таблице — другое.
 */
export function looksLikeHeader(row: readonly string[]): boolean {
  if (row.length === 0) return false
  const filled = row.filter((cell) => !isBlankCell(cell))
  if (filled.length < row.length) return false
  // Заголовок из одних чисел или дат — это, скорее всего, уже данные.
  return filled.every((cell) => parseNumber(cell) === null && parseDate(cell) === null)
}

function uniqueNames(raw: readonly string[]): string[] {
  const used = new Map<string, number>()
  return raw.map((name, index) => {
    const base = name.trim() === '' ? `Колонка ${index + 1}` : name.trim().slice(0, 200)
    const seen = used.get(base.toLowerCase()) ?? 0
    used.set(base.toLowerCase(), seen + 1)
    return seen === 0 ? base : `${base} ${seen + 1}`
  })
}

function convert(value: string, type: FieldType, choiceIds: Map<string, string>): unknown {
  if (isBlankCell(value)) return type === 'checkbox' ? false : null
  const trimmed = value.trim()
  switch (type) {
    case 'number': return parseNumber(trimmed)
    case 'date':
    case 'datetime': return parseDate(trimmed)
    case 'checkbox': return parseBoolean(trimmed) ?? false
    case 'single_select': return choiceIds.get(trimmed) ?? null
    default: return trimmed
  }
}

export type BuildOptions = {
  /** Принудительно считать или не считать первую строку заголовком. */
  hasHeader?: boolean
  tableId?: string
  /**
   * Типы, выбранные пользователем на экране предпросмотра, по индексу колонки.
   * Перебивают автоопределение: угадывание — подсказка, а не приговор.
   */
  typeOverrides?: Record<number, FieldType>
  /** Имена, исправленные пользователем, по индексу колонки. */
  nameOverrides?: Record<number, string>
}

export function buildFromRows(grid: readonly (readonly string[])[], options: BuildOptions = {}): ImportPreview {
  const warnings: string[] = []
  const tableId = options.tableId ?? newId('table')

  if (grid.length === 0) {
    return { fields: [], rows: [], warnings: ['Файл пуст'], skippedRows: 0 }
  }

  const width = Math.max(...grid.map((row) => row.length))
  const normalized = grid.map((row) => {
    const padded = [...row]
    while (padded.length < width) padded.push('')
    return padded
  })

  const headerRow = normalized[0]!
  const hasHeader = options.hasHeader ?? looksLikeHeader(headerRow)
  const dataRows = hasHeader ? normalized.slice(1) : normalized
  if (!hasHeader) warnings.push('Заголовки не распознаны — колонки названы автоматически')

  const names = uniqueNames(
    hasHeader ? headerRow : headerRow.map((_, i) => `Колонка ${i + 1}`),
  )

  const fieldPositions = positionSequence(width)
  const fields: Field[] = []
  const choiceMaps: Map<string, string>[] = []

  for (let column = 0; column < width; column++) {
    const values = dataRows.map((row) => row[column] ?? '')
    const inferred = inferColumn(values)
    const type = options.typeOverrides?.[column] ?? inferred.type
    const choiceIds = new Map<string, string>()

    let fieldOptions: Record<string, unknown> = {}
    if (type === 'single_select') {
      // При ручном выборе типа варианты собираются заново из значений колонки.
      const choiceNames = inferred.type === 'single_select' && inferred.choices
        ? inferred.choices
        : [...new Set(values.filter((v) => !isBlankCell(v)).map((v) => v.trim()))]
      // Варианты получают разные цвета по кругу: одноцветный канбан
      // не читается, а вручную перекрашивать десяток статусов никто не станет.
      const palette = COLORS.filter((color) => color !== 'gray')
      const choices = choiceNames.map((name, choiceIndex) => {
        const id = newId('choice')
        choiceIds.set(name, id)
        return { id, name, color: palette[choiceIndex % palette.length]! }
      })
      fieldOptions = { choices }
    }

    choiceMaps.push(choiceIds)
    fields.push({
      id: newId('field'),
      tableId,
      name: options.nameOverrides?.[column]?.trim() || names[column]!,
      description: null,
      position: fieldPositions[column]!,
      type,
      options: normalizeFieldOptions(type, fieldOptions),
    } as Field)
  }

  const rows: Record<string, unknown>[] = []
  let skippedRows = 0

  for (const raw of dataRows) {
    if (raw.every((cell) => isBlankCell(cell))) {
      skippedRows++
      continue
    }
    const row: Record<string, unknown> = {}
    for (let column = 0; column < width; column++) {
      const field = fields[column]!
      row[field.id] = convert(raw[column] ?? '', field.type, choiceMaps[column]!)
    }
    rows.push(row)
  }

  if (skippedRows > 0) warnings.push(`Пропущено пустых строк: ${skippedRows}`)

  return { fields, rows, warnings, skippedRows }
}

export function buildFromCsv(input: Uint8Array | string, options: BuildOptions = {}): ImportPreview {
  return buildFromRows(parseCsv(input), options)
}

/** Первые строки для экрана предпросмотра — весь файл на превью не нужен. */
export function previewRows(preview: ImportPreview, limit = MAX_PREVIEW_ROWS): Record<string, unknown>[] {
  return preview.rows.slice(0, limit)
}
