import { APP_TIME_ZONE, type Field } from '@tableapp/schema'

const dateFormatter = new Intl.DateTimeFormat('ru-RU', { timeZone: APP_TIME_ZONE })
const dateTimeFormatter = new Intl.DateTimeFormat('ru-RU', {
  timeZone: APP_TIME_ZONE,
  dateStyle: 'short',
  timeStyle: 'short',
})

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
      const date = new Date(String(value))
      if (Number.isNaN(date.getTime())) return ''
      return field.type === 'datetime' ? dateTimeFormatter.format(date) : dateFormatter.format(date)
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
