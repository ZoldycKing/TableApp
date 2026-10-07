/**
 * Живые обновления: кто-то изменил таблицу — остальные это видят.
 *
 * Модуль серверный: его зовут серверные действия и маршрут потока. В браузер
 * он не попадает — там живёт `use-live-table.ts`, который только слушает.
 *
 * Шина нарочно крошечная. По ней не ездят сами данные — только факт
 * «в таблице N что-то поменялось». Браузер на это перечитывает страницу
 * средствами Next, и дальше работает тот же путь, что и при обычной загрузке:
 * одни и те же запросы, одни и те же права, одна и та же сборка представления.
 * Гонять правки отдельным каналом значило бы завести вторую копию правил
 * доступа — и однажды она разошлась бы с первой.
 *
 * **Почему не WebSocket.** В `docs/mvp-scope.md` написан он, и это честно
 * менялось: сокет требует своего сервера с обработкой upgrade, а приложение
 * живёт на Next с маршрутами-обработчиками. Поток событий здесь
 * односторонний — сервер говорит, браузер слушает, — и для него хватает SSE:
 * обычный HTTP-ответ, который не закрывается. Это не опрос: соединение одно
 * и висит, пока открыта вкладка. Обратный канал у нас уже есть — серверные
 * действия. Решение записано в документе объёма работ.
 *
 * **Границы.** Подписчики живут в памяти процесса. Для одного сервера —
 * а именно так разворачивается продукт сейчас — этого достаточно. Как только
 * серверов станет два, понадобится общая шина: `LISTEN/NOTIFY` Postgres
 * лежит ближе всего, база и так одна. Это записано здесь, чтобы при переезде
 * не выяснять на ходу, почему половина вкладок не обновляется.
 */

export type LiveEvent = {
  /** Что поменялось. Браузеру хватает факта: подробности он перечитает сам. */
  kind: 'rows' | 'structure'
  at: number
}

type Listener = (event: LiveEvent) => void

/*
 * Через globalThis: серверные действия и маршруты-обработчики у Next могут
 * оказаться в разных экземплярах модуля, и шина, лежащая в модульной
 * переменной, тогда разделилась бы надвое — события отправлялись бы в одну
 * половину, а слушатели сидели в другой.
 */
const registry: Map<string, Set<Listener>> = ((globalThis as Record<string, unknown>).__tableappLive ??=
  new Map<string, Set<Listener>>()) as Map<string, Set<Listener>>

/** Сказать всем, кто смотрит на таблицу, что она изменилась. */
export function publishTable(tableId: string, kind: LiveEvent['kind'] = 'rows'): void {
  const listeners = registry.get(tableId)
  if (!listeners || listeners.size === 0) return

  const event: LiveEvent = { kind, at: Date.now() }
  for (const listener of listeners) {
    try {
      listener(event)
    } catch {
      // Сломавшийся слушатель не должен мешать остальным и тем более записи.
    }
  }
}

/** Подписаться на таблицу. Возвращает отписку — её зовут при закрытии вкладки. */
export function subscribeTable(tableId: string, listener: Listener): () => void {
  const listeners = registry.get(tableId) ?? new Set<Listener>()
  listeners.add(listener)
  registry.set(tableId, listeners)

  return () => {
    const current = registry.get(tableId)
    if (!current) return
    current.delete(listener)
    if (current.size === 0) registry.delete(tableId)
  }
}

/** Сколько вкладок слушает таблицу. Нужно проверкам, а не продукту. */
export function listenerCount(tableId: string): number {
  return registry.get(tableId)?.size ?? 0
}
