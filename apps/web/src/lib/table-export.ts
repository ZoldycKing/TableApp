import type { Field } from '@tableapp/schema'
import { formatCell } from './format'

/**
 * Выгрузка таблицы: CSV и книга Excel.
 *
 * Оба формата собираются из одной решётки значений. Это не экономия кода:
 * разойдись они хоть в одной ячейке — человек, открывший оба файла, не поймёт,
 * какой из них настоящий, и перестанет доверять обоим.
 *
 * CSV делается под русский Excel. Разделитель — точка с запятой, а не запятая:
 * Excel в русской локали читает запятую как десятичный знак и сваливает всю
 * строку в одну ячейку. В начало файла ставится BOM, иначе тот же Excel
 * открывает UTF-8 как windows-1251 и показывает кракозябры. Это ровно то,
 * что мы уже умеем читать при импорте.
 */
const SEPARATOR = ';'
const BOM = '﻿'

export function escapeCsvValue(value: string): string {
  if (!/[";\n\r]/.test(value)) return value
  return `"${value.replace(/"/g, '""')}"`
}

export type ExportRow = { data: Record<string, unknown> }

/** Заголовки связанных строк: те же, что подставляет таблица на экране. */
export type TitleIndex = Record<string, { id: string; title: string }[]>

/**
 * Значение ячейки для файла. Связи и файлы `formatCell` не разворачивает —
 * на экране их рисует сетка своими силами, — а идентификаторы строк
 * и «[object Object]» в выгрузке для клиента бессмысленны.
 */
export function cellText(field: Field, value: unknown, titles?: TitleIndex): string {
  if (field.type === 'relation') {
    const ids = Array.isArray(value) ? value.map(String) : []
    const options = titles?.[field.options.tableId] ?? []
    return ids
      .map((id) => options.find((option) => option.id === id)?.title ?? 'Строка удалена')
      .join(', ')
  }

  if (field.type === 'attachment' || field.type === 'image') {
    const files = Array.isArray(value) ? value : []
    return files
      .map((file) => (file && typeof file === 'object' ? String((file as { name?: unknown }).name ?? '') : ''))
      .filter(Boolean)
      .join(', ')
  }

  return formatCell(field, value)
}

/** Шапка и строки, уже приведённые к тексту: заготовка для обоих форматов. */
export function buildGrid(
  fields: readonly Field[],
  rows: readonly ExportRow[],
  titles?: TitleIndex,
): { header: string[]; rows: string[][] } {
  return {
    header: fields.map((field) => field.name),
    // Формат берём тот же, что на экране: выгрузка должна совпадать с тем,
    // что человек видел, иначе она выглядит как чужие данные.
    rows: rows.map((row) => fields.map((field) => cellText(field, row.data[field.id], titles))),
  }
}

export function buildCsv(
  fields: readonly Field[],
  rows: readonly ExportRow[],
  titles?: TitleIndex,
): string {
  const grid = buildGrid(fields, rows, titles)
  const lines = [grid.header, ...grid.rows].map((line) => line.map(escapeCsvValue).join(SEPARATOR))
  return BOM + lines.join('\r\n')
}

export type ExportFormat = 'csv' | 'xlsx'

export function isExportFormat(value: unknown): value is ExportFormat {
  return value === 'csv' || value === 'xlsx'
}

/** Что писать в заголовке ответа: браузер по нему решает, чем открыть файл. */
export const EXPORT_MIME: Record<ExportFormat, string> = {
  csv: 'text/csv;charset=utf-8',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
}

/** Имя файла: без служебных символов, с датой — их складывают в одну папку. */
export function exportFileName(
  tableName: string,
  viewName?: string,
  format: ExportFormat = 'csv',
): string {
  const stamp = new Date().toISOString().slice(0, 10)
  const base = [tableName, viewName].filter(Boolean).join(' — ')
  const safe = base
    .replace(/[/\\:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return `${safe || 'Таблица'} ${stamp}.${format}`
}
