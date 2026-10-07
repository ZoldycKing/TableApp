import { z } from 'zod'
import type { Field, FieldType } from './fields'
import { dateInstant, fieldTimeZone } from './time'

export const attachmentSchema = z.object({
  id: z.string(),
  name: z.string(),
  size: z.number().int().nonnegative(),
  mime: z.string(),
  /** Ключ в объектном хранилище; публичный URL выдаётся подписанным. */
  key: z.string(),
  width: z.number().int().positive().nullable().default(null),
  height: z.number().int().positive().nullable().default(null),
})
export type Attachment = z.infer<typeof attachmentSchema>

const nullableString = z.string().nullable().default(null)
const idArray = z.array(z.string()).default([])

/**
 * Схема значения ячейки для каждого типа поля.
 * Значения хранятся в rows.data под ключом = id поля.
 */
export const CELL_VALUE = {
  text: nullableString,
  long_text: nullableString,
  email: nullableString,
  phone: nullableString,
  url: nullableString,
  number: z.number().nullable().default(null),
  /** Дата — ISO-строка. Время храним в UTC, отображаем в таймзоне поля. */
  date: nullableString,
  datetime: nullableString,
  checkbox: z.boolean().default(false),
  single_select: nullableString,
  multi_select: idArray,
  attachment: z.array(attachmentSchema).default([]),
  image: z.array(attachmentSchema).default([]),
  member: idArray,
  relation: idArray,

  formula: z.union([z.string(), z.number(), z.boolean(), z.null()]).default(null),
  lookup: z.array(z.unknown()).default([]),
  rollup: z.union([z.string(), z.number(), z.boolean(), z.null()]).default(null),
  count: z.number().int().nonnegative().default(0),
  created_time: nullableString,
  updated_time: nullableString,
  created_by: nullableString,
  updated_by: nullableString,
  row_id: nullableString,
} as const satisfies Record<FieldType, z.ZodType>

export type CellValue<T extends FieldType = FieldType> = z.infer<(typeof CELL_VALUE)[T]>

/** Данные строки: ключ — id поля, значение — ячейка. */
export type RowData = Record<string, unknown>

export const rowSchema = z.object({
  id: z.string(),
  tableId: z.string(),
  data: z.record(z.string(), z.unknown()),
  position: z.string(),
  version: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string(),
  createdBy: z.string().nullable(),
  updatedBy: z.string().nullable(),
})
export type Row = z.infer<typeof rowSchema>

export function emptyValue(type: FieldType): unknown {
  return CELL_VALUE[type].parse(undefined)
}

/** Приводит записываемое значение к схеме своего типа; бросает при несовпадении. */
export function parseCellValue(field: Field, value: unknown): unknown {
  const parsed = CELL_VALUE[field.type].parse(value ?? undefined)
  if ((field.type === 'date' || field.type === 'datetime') && parsed !== null) {
    const instant = dateInstant(parsed, fieldTimeZone(field))
    if (instant === null) throw new Error('Некорректная дата или время')
    return new Date(instant).toISOString()
  }
  return parsed
}

export function isBlank(value: unknown): boolean {
  if (value === null || value === undefined || value === '') return true
  if (Array.isArray(value)) return value.length === 0
  return false
}

const TRUTHY_WORDS = new Set(['да', 'true', 'истина', 'yes', '1', '+'])

function textOf(field: Field, value: unknown): string {
  if (value === null || value === undefined) return ''
  if (field.type === 'single_select' || field.type === 'multi_select') {
    const ids = Array.isArray(value) ? value : [value]
    return ids
      .map((id) => field.options.choices.find((choice) => choice.id === id)?.name)
      .filter(Boolean)
      .join(', ')
  }
  if (Array.isArray(value)) return value.map(String).join(', ')
  if (typeof value === 'boolean') return value ? 'Да' : 'Нет'
  return String(value)
}

/**
 * Преобразование значения при смене типа поля.
 * Что не переводится — обнуляется: подсунуть в числовую колонку строку
 * хуже, чем показать пустую ячейку, которую видно и можно заполнить.
 */
export function coerceCellValue(from: Field, to: Field, value: unknown): unknown {
  if (isBlank(value)) return emptyValue(to.type)

  switch (to.type) {
    case 'text':
    case 'long_text':
    case 'email':
    case 'phone':
    case 'url':
      return textOf(from, value) || null

    case 'number': {
      if (typeof value === 'number') return value
      if (typeof value === 'boolean') return value ? 1 : 0
      const normalized = textOf(from, value).replace(/\s/g, '').replace(',', '.')
      const parsed = Number(normalized)
      return Number.isFinite(parsed) && normalized !== '' ? parsed : null
    }

    case 'checkbox': {
      if (typeof value === 'boolean') return value
      if (typeof value === 'number') return value !== 0
      return TRUTHY_WORDS.has(textOf(from, value).trim().toLowerCase())
    }

    case 'date':
    case 'datetime': {
      const instant = dateInstant(textOf(from, value), fieldTimeZone(to))
      return instant === null ? null : new Date(instant).toISOString()
    }

    case 'single_select':
    case 'multi_select': {
      // Значения сопоставляются с вариантами по имени: id в новом поле другие.
      const names = textOf(from, value).split(',').map((name) => name.trim()).filter(Boolean)
      const ids = names
        .map((name) => to.options.choices.find((choice) => choice.name.toLowerCase() === name.toLowerCase())?.id)
        .filter((id): id is string => Boolean(id))
      return to.type === 'single_select' ? (ids[0] ?? null) : ids
    }

    case 'relation':
      return from.type === 'relation' && Array.isArray(value) ? value : []

    case 'attachment':
    case 'image':
      return from.type === 'attachment' || from.type === 'image' ? value : []

    case 'member':
      return from.type === 'member' && Array.isArray(value) ? value : []

    default:
      // Вычисляемые типы значения не хранят — они пересчитываются.
      return emptyValue(to.type)
  }
}
