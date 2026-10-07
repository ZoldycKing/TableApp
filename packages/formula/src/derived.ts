import type { Field, RollupFn } from '@tableapp/schema'
import { APP_TIME_ZONE, isComputed } from '@tableapp/schema'
import type { Compiled } from './compile'
import { compile, topologicalOrder } from './compile'
import { evaluate } from './evaluate'
import { FormulaError } from './ast'
import { toNumber, toText, type Value } from './values'

/**
 * Вычисление производных полей: Lookup, Rollup, количество связей и формулы.
 *
 * Производные значения считаются на чтении, а не хранятся: иначе правка строки
 * в одной таблице требовала бы каскадного пересчёта всех строк, которые на неё
 * ссылаются, — а это самый надёжный способ получить расходящиеся данные.
 */

export type RowData = Record<string, unknown>

/** Строки связанных таблиц: id таблицы -> id строки -> данные. */
export type RelatedIndex = ReadonlyMap<string, ReadonlyMap<string, RowData>>

function relatedRows(
  relationField: Field | undefined,
  data: RowData,
  related: RelatedIndex,
): RowData[] {
  if (!relationField || relationField.type !== 'relation') return []
  const target = related.get(relationField.options.tableId)
  if (!target) return []

  const raw = data[relationField.id]
  const ids = Array.isArray(raw) ? raw : raw ? [raw] : []
  return ids
    .map((id) => target.get(String(id)))
    .filter((row): row is RowData => row !== undefined)
}

function applyRollup(fn: RollupFn, values: unknown[]): Value {
  const numbers = values.map((value) => toNumber(value as Value)).filter((n): n is number => n !== null)

  switch (fn) {
    case 'count': return values.length
    case 'sum': return numbers.reduce((total, n) => total + n, 0)
    case 'min': return numbers.length === 0 ? null : Math.min(...numbers)
    case 'max': return numbers.length === 0 ? null : Math.max(...numbers)
    case 'avg': return numbers.length === 0 ? null : numbers.reduce((t, n) => t + n, 0) / numbers.length
    case 'and': return values.length > 0 && values.every(Boolean)
    case 'or': return values.some(Boolean)
    case 'concat':
      return values.map((value) => toText(value as Value)).filter((text) => text !== '').join(', ')
    default: return null
  }
}

/** Скомпилированные формулы таблицы. Компиляция не зависит от строк. */
export function compileTableFormulas(fields: readonly Field[]): Map<string, Compiled> {
  const compiled = new Map<string, Compiled>()
  for (const field of fields) {
    if (field.type !== 'formula' || field.options.expression.trim() === '') continue
    try {
      compiled.set(field.id, compile(field.options.expression, fields))
    } catch {
      // Сломанная формула не должна мешать читать остальные колонки.
    }
  }
  return compiled
}

export type ComputeDerivedOptions = {
  now?: Date
  timeZone?: string
}

/**
 * Порядок важен: сначала значения из связей, потом формулы —
 * формула имеет право ссылаться на Lookup и Rollup, но не наоборот.
 */
export function computeDerivedRow(
  data: RowData,
  fields: readonly Field[],
  related: RelatedIndex,
  formulas: ReadonlyMap<string, Compiled>,
  options: ComputeDerivedOptions = {},
): RowData {
  const byId = new Map(fields.map((field) => [field.id, field]))
  const result: RowData = { ...data }

  for (const field of fields) {
    switch (field.type) {
      case 'lookup': {
        const rows = relatedRows(byId.get(field.options.relationFieldId), data, related)
        result[field.id] = rows.map((row) => row[field.options.targetFieldId] ?? null)
        break
      }
      case 'rollup': {
        const rows = relatedRows(byId.get(field.options.relationFieldId), data, related)
        result[field.id] = applyRollup(field.options.fn, rows.map((row) => row[field.options.targetFieldId]))
        break
      }
      case 'count': {
        result[field.id] = relatedRows(byId.get(field.options.relationFieldId), data, related).length
        break
      }
      default:
        break
    }
  }

  const plan = topologicalOrder(formulas)
  if ('cycle' in plan) {
    throw new FormulaError(`Циклическая зависимость формул: ${plan.cycle.join(' → ')}`)
  }

  const ctx = {
    values: result,
    now: options.now ?? new Date(),
    timeZone: options.timeZone ?? APP_TIME_ZONE,
  }
  for (const fieldId of plan.order) {
    try {
      result[fieldId] = evaluate(formulas.get(fieldId)!.ast, ctx)
    } catch {
      // Ошибка в одной строке не должна ронять пересчёт остальных.
      result[fieldId] = null
    }
  }

  return result
}

/** Производные поля не записываются: при сохранении их значения отбрасываются. */
export function stripDerived(data: RowData, fields: readonly Field[]): RowData {
  const derived = new Set(fields.filter((field) => isComputed(field.type)).map((field) => field.id))
  const clean: RowData = {}
  for (const [key, value] of Object.entries(data)) {
    if (!derived.has(key)) clean[key] = value
  }
  return clean
}

/**
 * Индекс связанных строк для Lookup и Rollup.
 *
 * Формулы связанной таблицы вычисляются здесь, а не берутся из базы: они не
 * хранятся. Без этого Rollup по формульной колонке — «Итого» по стоимости
 * позиций — суммировал пустоту и показывал ноль при непустых позициях.
 *
 * Глубина одна: у связанной таблицы считаются только формулы по её собственным
 * полям. Её же Lookup и Rollup остаются пустыми — иначе пришлось бы обходить
 * граф связей произвольной глубины на каждом чтении.
 */
export function relatedIndexFrom(
  rowsByTable: ReadonlyMap<string, ReadonlyMap<string, RowData>>,
  fieldsByTable: ReadonlyMap<string, readonly Field[]>,
  options: ComputeDerivedOptions = {},
): RelatedIndex {
  const index = new Map<string, Map<string, RowData>>()
  const empty: RelatedIndex = new Map()

  for (const [tableId, rows] of rowsByTable) {
    const fields = fieldsByTable.get(tableId) ?? []
    const formulas = compileTableFormulas(fields)
    const computed = new Map<string, RowData>()

    for (const [rowId, data] of rows) {
      try {
        computed.set(rowId, computeDerivedRow(data, fields, empty, formulas, options))
      } catch {
        // Сломанная формула в связанной таблице не должна ломать чтение этой.
        computed.set(rowId, data)
      }
    }
    index.set(tableId, computed)
  }

  return index
}
