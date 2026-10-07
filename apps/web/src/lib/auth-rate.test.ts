import { beforeEach, describe, expect, it } from 'vitest'
import { attemptsLeft, PER_EMAIL, PER_IP, resetAttempts, takeAttempt } from './auth-rate'

/**
 * Частота попыток входа.
 *
 * Это второй рубеж, отдельный от лимита выданных кодов. Проверяется то,
 * из-за чего он заведён: при лежащем почтовом сервисе нельзя бесконечно
 * дёргать отправку, но и запирать человека надолго из-за нашей неисправности
 * тоже нельзя.
 */

beforeEach(() => resetAttempts())

describe('сколько раз подряд можно попросить письмо', () => {
  it('первые попытки проходят, следующая — нет', () => {
    const key = 'email:kto@example.ru'
    for (let i = 0; i < PER_EMAIL.limit; i += 1) {
      expect(takeAttempt(key, PER_EMAIL).ok, `попытка ${i + 1}`).toBe(true)
    }
    const blocked = takeAttempt(key, PER_EMAIL)
    expect(blocked.ok).toBe(false)
    if (!blocked.ok) expect(blocked.retryAfterSec).toBeGreaterThan(0)
  })

  it('окно короткое: через минуту всё снова можно', () => {
    const key = 'email:kto@example.ru'
    const start = Date.now()
    for (let i = 0; i < PER_EMAIL.limit; i += 1) takeAttempt(key, PER_EMAIL, start)
    expect(takeAttempt(key, PER_EMAIL, start).ok).toBe(false)

    // Кратковременный сбой почты не должен запирать человека надолго.
    expect(takeAttempt(key, PER_EMAIL, start + PER_EMAIL.windowMs + 1).ok).toBe(true)
    expect(PER_EMAIL.windowMs).toBeLessThanOrEqual(60_000)
  })

  it('адреса считаются по отдельности', () => {
    takeAttempt('email:a@example.ru', PER_EMAIL)
    expect(attemptsLeft('email:b@example.ru', PER_EMAIL.limit)).toBe(PER_EMAIL.limit)
  })

  it('у адреса сети запас больше: за ним может быть офис', () => {
    expect(PER_IP.limit).toBeGreaterThan(PER_EMAIL.limit)
  })

  it('одновременные запросы занимают попытки по одной', () => {
    /*
     * Два запроса, пришедшие в одну миллисекунду, не должны оба уйти
     * отправлять письмо: счётчик занимается до работы и не делится.
     */
    const key = 'email:parallel@example.ru'
    const now = Date.now()
    const results = Array.from({ length: PER_EMAIL.limit + 2 }, () => takeAttempt(key, PER_EMAIL, now))
    expect(results.filter((r) => r.ok)).toHaveLength(PER_EMAIL.limit)
  })
})
