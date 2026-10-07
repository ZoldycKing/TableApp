import { APP_TIME_ZONE, calendarDay, dateInstant, fieldTimeZone, instantToWallClock, type Field } from '@tableapp/schema'

const dateFormatter = new Intl.DateTimeFormat('ru-RU', { timeZone: APP_TIME_ZONE })
const temporalFormatters = new Map<string, Intl.DateTimeFormat>()
function temporalFormat(field: Field, value: unknown): string {
  const zone = fieldTimeZone(field), instant = dateInstant(value, zone)
  if (instant === null) return ''
  const options = field.options as { dateFormat?: string; timeFormat?: string }
  const format = options.dateFormat ?? 'ru'
  const withTime = field.type !== 'date'
  const date = new Date(instant)
  if (format === 'iso') {
    return calendarDay(date, zone)! + (withTime ? `, ${instantToWallClock(date, zone)!.time}` : '')
  }
  const locale = format === 'us' ? 'en-US' : 'ru-RU'
  const key = JSON.stringify([zone, locale, format, withTime, options.timeFormat])
  let formatter = temporalFormatters.get(key)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, {
      timeZone: zone, year: 'numeric', month: format === 'friendly' ? 'long' : '2-digit', day: '2-digit',
      ...(withTime ? { hour: '2-digit', minute: '2-digit', hour12: options.timeFormat === '12' } : {}),
    })
    temporalFormatters.set(key, formatter)
  }
  return formatter.format(date)
}

/** Отображение значения ячейки. Форматирование живёт отдельно от хранения. */
export function formatCell(field: Field, value: unknown): string {
  if (value === null || value === undefined || value === '') return ''

  switch (field.type) {
    case 'number': {
      const n = typeof value === 'number' ? value : Number(value)
      if (!Number.isFinite(n)) return ''
      // Настройки приходят из JSONB и могли быть записаны до того, как у типа
      // появились значения по умолчанию, поэтому читаем их с запасным вариантом.
      const options = field.options
      const precision = Number.isFinite(options.precision) ? options.precision : 0
      const currency = options.currency || 'RUB'

      if (options.format === 'percent') {
        return new Intl.NumberFormat('ru-RU', {
          style: 'percent',
          maximumFractionDigits: precision,
        }).format(n)
      }
      if (options.format === 'currency') {
        return new Intl.NumberFormat('ru-RU', {
          style: 'currency',
          currency,
          maximumFractionDigits: precision,
        }).format(n)
      }
      return new Intl.NumberFormat('ru-RU', {
        maximumFractionDigits: Math.max(precision, 2),
        useGrouping: options.showThousandsSeparator !== false,
      }).format(n)
    }

    case 'date':
    case 'datetime':
    case 'created_time':
    case 'updated_time': {
      return temporalFormat(field, value)
    }

    case 'checkbox':
      return value ? 'Да' : 'Нет'

    case 'single_select': {
      const choice = field.options.choices.find((c) => c.id === value)
      return choice?.name ?? ''
    }

    case 'multi_select': {
      const ids = Array.isArray(value) ? value : []
      return ids
        .map((id) => field.options.choices.find((c) => c.id === id)?.name)
        .filter(Boolean)
        .join(', ')
    }

    case 'formula':
    case 'rollup': {
      // Тип результата известен после компиляции — по нему и форматируем,
      // иначе сумма в рублях показывается как «250000.1».
      if (typeof value === 'boolean') return value ? 'Да' : 'Нет'
      if (typeof value === 'number') {
        return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value)
      }
      const resultType = field.type === 'formula' ? field.options.resultType : 'unknown'
      if (resultType === 'date') {
        const date = new Date(String(value))
        return Number.isNaN(date.getTime()) ? String(value) : dateFormatter.format(date)
      }
      return String(value)
    }

    case 'count':
      return new Intl.NumberFormat('ru-RU').format(Number(value) || 0)

    case 'lookup':
      return Array.isArray(value)
        ? value.filter((item) => item !== null && item !== '').map(String).join(', ')
        : ''

    default:
      return Array.isArray(value) ? value.map(String).join(', ') : String(value)
  }
}
