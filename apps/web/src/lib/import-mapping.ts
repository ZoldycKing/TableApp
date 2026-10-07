import type { Field } from '@tableapp/schema'
import { coerceCellValue, isComputed, parseCellValue } from '@tableapp/schema'

/**
 * Перенос строк файла в колонки существующей таблицы.
 *
 * Отдельно от серверного действия, потому что здесь вся смысловая часть:
 * какие пары «колонка файла → колонка таблицы» допустимы и что происходит
 * со значением, которое не переводится в нужный тип. Запись в базу —
 * механика, а вот это поведение должно быть проверяемым.
 */

export type ImportPair = { from: Field; to: Field }

/**
 * Пары отбираются здесь, а не на клиенте: сопоставление приходит из браузера,
 * и в нём может оказаться чужое поле или вычисляемое, которое не пишется.
 */
export function resolvePairs(input: {
  sourceFields: readonly Field[]
  targetFields: ReadonlyMap<string, Field>
  mapping: Record<string, string>
}): ImportPair[] {
  const pairs: ImportPair[] = []
  const taken = new Set<string>()

  for (const [sourceId, targetId] of Object.entries(input.mapping)) {
    const from = input.sourceFields.find((field) => field.id === sourceId)
    const to = input.targetFields.get(targetId)
    if (!from || !to || isComputed(to.type) || taken.has(to.id)) continue
    taken.add(to.id)
    pairs.push({ from, to })
  }
  return pairs
}

/**
 * Значение, которое не переводится в тип колонки, становится пустым:
 * потерять одну ячейку лучше, чем отменить импорт целиком, а пустая
 * ячейка в таблице видна и её можно заполнить руками.
 */
export function mapRow(source: Record<string, unknown>, pairs: readonly ImportPair[]): Record<string, unknown> {
  const data: Record<string, unknown> = {}
  for (const { from, to } of pairs) {
    try {
      data[to.id] = parseCellValue(to, coerceCellValue(from, to, source[from.id]))
    } catch {
      data[to.id] = null
    }
  }
  return data
}
