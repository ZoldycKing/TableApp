import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'
import { LOGIN_CODE_TTL_MINUTES } from './auth-constants'

/**
 * Одноразовые ссылки для входа.
 * В базе лежит только хэш токена: утечка таблицы не должна давать возможность
 * войти за кого-то, а сам токен живёт лишь в письме и в адресной строке.
 */

export const TOKEN_TTL_MS = LOGIN_CODE_TTL_MINUTES * 60 * 1000
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000

/** Кука сотрудника: одна на все его приложения, права считаются по базе. */
export const STAFF_SESSION_COOKIE = 'tableapp_staff'
export const MEMBER_SESSION_COOKIE = 'tableapp_session'
export const ACTIVE_WORKSPACE_COOKIE = 'tableapp_workspace'

export function createToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url')
  return { token, hash: hashToken(token) }
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** Сравнение хэшей постоянным временем, чтобы не подсказывать перебором. */
export function hashesMatch(left: string, right: string): boolean {
  const a = Buffer.from(left, 'hex')
  const b = Buffer.from(right, 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[a-zа-я]{2,}$/i

export function isValidEmail(email: string): boolean {
  return EMAIL_PATTERN.test(normalizeEmail(email))
}

export function expiresAt(ttlMs: number): Date {
  return new Date(Date.now() + ttlMs)
}

export function isExpired(date: Date | null | undefined): boolean {
  return !date || date.getTime() <= Date.now()
}

export const CHALLENGE_COOKIE = 'tableapp_challenge'

/** Сколько писем с кодом можно попросить за окно и сколько раз ошибиться. */
export const THROTTLE_WINDOW_MS = 15 * 60 * 1000
export const MAX_REQUESTS_PER_EMAIL = 5
export const MAX_REQUESTS_PER_IP = 20
export const MAX_CODE_ATTEMPTS = 5

/**
 * Код из письма: шесть цифр, без ведущего нуля — его теряют при копировании
 * и путают с буквой O. Берём криптостойкий источник, а не Math.random.
 */
export function createCode(): string {
  const value = randomInt(100000, 1000000)
  return String(value)
}

/**
 * Код короткий, поэтому подбор ограничивается числом попыток, а не длиной.
 * В хэш подмешивается идентификатор попытки: одинаковые коды у разных
 * попыток дают разные хэши, и по базе их не сопоставить.
 */
export function hashCode(tokenId: string, code: string): string {
  return createHash('sha256').update(`${tokenId}:${code.trim()}`).digest('hex')
}

/** Только цифры: человек вводит код с пробелами и дефисами из письма. */
export function normalizeCode(raw: string): string {
  return raw.replace(/\D+/g, '')
}
