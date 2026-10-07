/**
 * Частота попыток входа.
 *
 * Это **не** лимит выданных кодов — тот считается по базе и ограничивает,
 * сколько писем человек может получить за пятнадцать минут. Здесь другое:
 * сколько раз подряд можно вообще просить письмо.
 *
 * Разница видна, когда почтовый сервис лежит. Неудачная отправка кода
 * не выдаёт, и считать её как выданный код нечестно: человек не виноват
 * в нашей неисправности и не должен из-за неё остаться без входа на четверть
 * часа. Но и бесконечно дёргать отправку нельзя — каждая попытка держит
 * соединение и секунды ожидания. Поэтому попытки ограничиваются коротким
 * окном: минута, после которой всё снова можно.
 *
 * Счётчик живёт в памяти процесса — как и подписчики живых обновлений,
 * и по той же причине: приложение разворачивается одним процессом
 * (см. `docs/architecture.md`). Перезапуск счётчик обнуляет; это допустимо,
 * потому что за ним стоит второй рубеж — лимит выданных кодов в базе,
 * который перезапуск переживает.
 */

type Window = { until: number; used: number }

const windows: Map<string, Window> = ((globalThis as Record<string, unknown>).__tableappAuthRate ??=
  new Map<string, Window>()) as Map<string, Window>

/** Попытки одного адреса: человек жмёт «отправить ещё раз». */
export const PER_EMAIL = { limit: 3, windowMs: 60_000 }

/** Попытки с одного адреса сети: перебор чужих ящиков. */
export const PER_IP = { limit: 15, windowMs: 60_000 }

/**
 * Занять одну попытку.
 *
 * Занимает сразу, до всякой работы: два одновременных запроса не должны
 * оба уйти отправлять письмо. Возвращает `false`, когда попытки кончились,
 * и сколько секунд ждать.
 */
export function takeAttempt(
  key: string,
  { limit, windowMs }: { limit: number; windowMs: number },
  now = Date.now(),
): { ok: true } | { ok: false; retryAfterSec: number } {
  const current = windows.get(key)

  if (!current || current.until <= now) {
    windows.set(key, { until: now + windowMs, used: 1 })
    return { ok: true }
  }

  if (current.used >= limit) {
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((current.until - now) / 1000)) }
  }

  current.used += 1
  return { ok: true }
}

/** Для проверок и для перезапуска окна после починки почты. */
export function resetAttempts(key?: string): void {
  if (key === undefined) windows.clear()
  else windows.delete(key)
}

/** Сколько попыток осталось — нужно проверкам, продукту не показывается. */
export function attemptsLeft(key: string, limit: number, now = Date.now()): number {
  const current = windows.get(key)
  if (!current || current.until <= now) return limit
  return Math.max(0, limit - current.used)
}
