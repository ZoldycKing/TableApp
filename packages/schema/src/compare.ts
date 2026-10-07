import { isComputed, type Field } from './fields'
import { isBlank } from './values'
import { dateInstant, fieldTimeZone } from './time'

/**
 * Сравнение значений ячеек для слияния правок.
 *
 * Правка из офлайна приезжает парой «было/стало», и сервер применяет её,
 * только если текущее значение совпадает с «было». Сравнение поэтому —
 * несущая конструкция: ошибётся в сторону «не равно» — человек получит
 * конфликт на ровном месте и перестанет доверять разбору; ошибётся в сторону
 * «равно» — тихо затрёт чужую правку.
 *
 * Обе стороны прогоняются через нормализацию сервера. Офлайн-устройство могло
 * уйти в офлайн на старой сборке, с другими правилами приведения, и его «было»
 * иначе не сошлось бы с тем, что лежит в базе.
 */

/** Файл узнаём по идентификатору: при перезагрузке меняются размеры, не он. */
function attachmentIds(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => (item && typeof item === 'object' ? String((item as { id?: unknown }).id ?? '') : ''))
    .filter(Boolean)
    .sort()
}

/**
 * Приведение к виду, в котором значения сравнимы.
 *
 * Здесь нужна терпимость, а не строгость: `parseCellValue` типы проверяет
 * и на строке «8» в числовом поле бросает исключение. Для записи это верно,
 * для сравнения — нет: в старых строках такое значение реально лежит,
 * и считать его отличным от числа 8 значит выдумать конфликт.
 */
function canonical(field: Field, value: unknown): unknown {
  switch (field.type) {
    // У переключателя нет «пусто»: невыставленный флажок — это «нет».
    case 'checkbox':
      return value === true || value === 'true' || value === 1

    case 'number':
    case 'count': {
      if (value === null || value === undefined || value === '') return null
      const n = typeof value === 'number' ? value : Number(String(value).trim().replace(',', '.'))
      return Number.isFinite(n) ? n : null
    }

    case 'date':
    case 'datetime':
    case 'created_time':
    case 'updated_time': {
      if (isBlank(value)) return null
      const time = dateInstant(value, fieldTimeZone(field))
      return time === null ? String(value) : time
    }

    case 'attachment':
    case 'image':
      return attachmentIds(value)

    case 'multi_select':
    case 'member':
      // Порядок не задаётся человеком — сравниваем как множество.
      return Array.isArray(value) ? [...value].map(String).sort() : []

    case 'relation':
    case 'lookup':
      // Связи человек расставляет руками, поэтому порядок значим.
      return Array.isArray(value) ? value.map(String) : []

    default:
      return isBlank(value) ? null : typeof value === 'string' ? value : String(value)
  }
}

export function sameCellValue(field: Field, left: unknown, right: unknown): boolean {
  const a = canonical(field, left)
  const b = canonical(field, right)

  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => item === b[index])
  }

  return a === b
}

/**
 * Сравнение строк целиком — для операций над строкой, а не ячейкой.
 * Вычисляемые поля не участвуют: их никто не правил, они пересчитались сами.
 */
export function changedFields(
  fields: readonly Field[],
  left: Record<string, unknown>,
  right: Record<string, unknown>,
): string[] {
  return fields
    .filter((field) => !isComputed(field.type))
    .filter((field) => !sameCellValue(field, left[field.id], right[field.id]))
    .map((field) => field.id)
}
