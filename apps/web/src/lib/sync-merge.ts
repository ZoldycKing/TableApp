import { isComputed, parseCellValue, sameCellValue, type Field } from '@tableapp/schema'

/**
 * Решение по одной правке из очереди устройства.
 *
 * Правило одно: применяем, если ячейка не менялась с тех пор, как человек её
 * видел. Сравниваем значения, а не время — часы на телефоне врут, а «сделано
 * позже» не значит «правильнее»: человек ушёл в офлайн со старой картинкой.
 *
 * Функция чистая и ничего не знает про базу: всё, что нужно для решения,
 * приходит аргументами. Так её можно проверить перебором случаев.
 */

export type Mutation = {
  id: string
  op: 'create' | 'update' | 'delete'
  rowId: string
  fieldId?: string
  base?: unknown
  next?: unknown
  /** Версия строки, которую видело устройство — для операций над строкой целиком. */
  baseVersion?: number
  clientAt?: string
}

export type Decision =
  | { status: 'applied'; value?: unknown }
  | { status: 'duplicate' }
  | { status: 'conflict'; reason: string; current?: unknown }
  | { status: 'dropped'; reason: string }

export type RowState = {
  exists: boolean
  deleted: boolean
  version: number
  data: Record<string, unknown>
}

export const MISSING_ROW: RowState = { exists: false, deleted: false, version: 0, data: {} }

export function decideMutation(
  mutation: Mutation,
  row: RowState,
  fields: readonly Field[],
  alreadyApplied: boolean,
): Decision {
  // Связь могла оборваться после записи, но до ответа: повтор не должен
  // ни создавать дубль, ни выглядеть конфликтом.
  if (alreadyApplied) return { status: 'duplicate' }

  if (mutation.op === 'create') {
    if (row.exists) return { status: 'duplicate' }
    return { status: 'applied' }
  }

  if (!row.exists) {
    return { status: 'dropped', reason: 'Строка не найдена' }
  }

  if (row.deleted) {
    // Мягкое удаление сохраняет данные, поэтому это не тупик: человеку
    // предлагаем вернуть строку, а не выбрасываем его работу.
    return { status: 'conflict', reason: 'Строку удалили, пока вы были офлайн' }
  }

  if (mutation.op === 'delete') {
    if (mutation.baseVersion !== undefined && mutation.baseVersion !== row.version) {
      return { status: 'conflict', reason: 'После вашего удаления строку меняли' }
    }
    return { status: 'applied' }
  }

  const field = fields.find((item) => item.id === mutation.fieldId)
  if (!field) return { status: 'dropped', reason: 'Поле удалили' }
  if (isComputed(field.type)) {
    return { status: 'dropped', reason: 'Поле вычисляемое, его не правят вручную' }
  }

  let value: unknown
  try {
    value = parseCellValue(field, mutation.next)
  } catch {
    // Тип поля могли сменить, пока человек был офлайн.
    return { status: 'dropped', reason: 'Значение не подходит типу поля' }
  }

  const current = row.data[field.id]
  if (!sameCellValue(field, current, mutation.base)) {
    return { status: 'conflict', reason: 'Ячейку изменили, пока вы были офлайн', current }
  }

  // Нечего записывать: значение и так такое. Считаем применённой, чтобы
  // правка не висела в очереди вечно.
  if (sameCellValue(field, current, value)) return { status: 'applied', value: current }

  return { status: 'applied', value }
}
