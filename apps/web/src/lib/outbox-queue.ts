import type { Mutation } from './sync-merge'

/**
 * Схлопывание очереди перед отправкой.
 *
 * Человек правит одну ячейку по нескольку раз подряд — и если отправить
 * каждое нажатие, все правки, кроме первой, придут с «было», которого
 * на сервере уже нет: они уйдут в конфликт сами с собой. Поэтому серия
 * правок одной ячейки сжимается в одну: «было» от самой первой,
 * «стало» от самой последней.
 *
 * Функция чистая: очередь на входе, очередь на выходе.
 */
export function squash(queue: readonly Mutation[]): Mutation[] {
  const result: Mutation[] = []
  const seen = new Map<string, number>()

  for (const mutation of queue) {
    // Схлопываются только правки ячеек. Создание и удаление — события строки,
    // их порядок несёт смысл, и склеивать их нельзя.
    if (mutation.op !== 'update' || !mutation.fieldId) {
      result.push(mutation)
      // После операции над строкой прежние правки её ячеек больше не склеиваем:
      // иначе правка «до удаления» смешается с правкой «после создания».
      for (const key of [...seen.keys()]) {
        if (key.startsWith(`${mutation.rowId}::`)) seen.delete(key)
      }
      continue
    }

    const key = `${mutation.rowId}::${mutation.fieldId}`
    const index = seen.get(key)

    if (index === undefined) {
      seen.set(key, result.length)
      result.push({ ...mutation })
      continue
    }

    const earlier = result[index]!
    result[index] = { ...earlier, id: mutation.id, next: mutation.next, clientAt: mutation.clientAt }
  }

  return result
}
