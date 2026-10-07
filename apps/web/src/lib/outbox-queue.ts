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
export function squashGroups(queue: readonly Mutation[]): { mutation: Mutation; ids: string[] }[] {
  const result: { mutation: Mutation; ids: string[] }[] = []
  const seen = new Map<string, number>()
  for (const mutation of queue) {
    if (mutation.op !== 'update' || !mutation.fieldId) {
      result.push({ mutation, ids: [mutation.id] })
      for (const key of [...seen.keys()]) if (key.startsWith(`${mutation.rowId}::`)) seen.delete(key)
      continue
    }
    const key = `${mutation.rowId}::${mutation.fieldId}`
    const index = seen.get(key)
    if (index === undefined) {
      seen.set(key, result.length)
      result.push({ mutation: { ...mutation }, ids: [mutation.id] })
    } else {
      const earlier = result[index]!
      result[index] = { mutation: { ...earlier.mutation, id: mutation.id, next: mutation.next, clientAt: mutation.clientAt },
        ids: [...earlier.ids, mutation.id] }
    }
  }
  return result
}

export function squash(queue: readonly Mutation[]): Mutation[] {
  return squashGroups(queue).map((group) => group.mutation)
}
