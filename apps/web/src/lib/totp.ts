import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * Одноразовые коды по RFC 6238 (TOTP поверх HOTP).
 * Написано руками, а не взято зависимостью: алгоритм короткий, зато не тащит
 * в проект чужой код в самое чувствительное место. Проверяется тестовыми
 * векторами из стандарта.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
export const TOTP_STEP_SECONDS = 30
export const TOTP_DIGITS = 6

/** Секрет в base32: в таком виде его принимают приложения-аутентификаторы. */
export function createTotpSecret(bytes = 20): string {
  return base32Encode(randomBytes(bytes))
}

export function base32Encode(buffer: Buffer): string {
  let bits = 0
  let value = 0
  let output = ''

  for (const byte of buffer) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      output += ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }

  if (bits > 0) output += ALPHABET[(value << (5 - bits)) & 31]
  return output
}

export function base32Decode(secret: string): Buffer {
  const clean = secret.replace(/=+$/, '').replace(/\s+/g, '').toUpperCase()
  let bits = 0
  let value = 0
  const bytes: number[] = []

  for (const char of clean) {
    const index = ALPHABET.indexOf(char)
    if (index === -1) throw new Error('Секрет не в base32')
    value = (value << 5) | index
    bits += 5
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }

  return Buffer.from(bytes)
}

/** Код на конкретный шаг времени. Алгоритм HOTP из RFC 4226. */
export function totpAt(secret: string, counter: number, algorithm = 'sha1'): string {
  const key = base32Decode(secret)
  const message = Buffer.alloc(8)
  message.writeBigUInt64BE(BigInt(counter))

  const digest = createHmac(algorithm, key).update(message).digest()
  const offset = digest[digest.length - 1]! & 0x0f
  const binary =
    ((digest[offset]! & 0x7f) << 24) |
    ((digest[offset + 1]! & 0xff) << 16) |
    ((digest[offset + 2]! & 0xff) << 8) |
    (digest[offset + 3]! & 0xff)

  return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, '0')
}

/**
 * Сверка кода с запасом в один шаг в каждую сторону: часы на телефоне
 * и на сервере расходятся, и требовать идеального совпадения — значит
 * ломать вход на ровном месте.
 */
export function verifyTotp(secret: string, input: string, now = Date.now()): boolean {
  if (typeof secret !== 'string' || typeof input !== 'string' || secret.length > 128 || input.length > 64 || !Number.isFinite(now)) return false
  const code = input.replace(/\D+/g, '')
  if (code.length !== TOTP_DIGITS) return false

  try {
    if (base32Decode(secret).length === 0) return false
  } catch {
    return false
  }
  const counter = Math.floor(now / 1000 / TOTP_STEP_SECONDS)
  if (!Number.isSafeInteger(counter) || counter < 0) return false
  for (const shift of [-1, 0, 1]) {
    if (counter + shift < 0) continue
    const expected = totpAt(secret, counter + shift)
    const a = Buffer.from(expected)
    const b = Buffer.from(code)
    if (a.length === b.length && timingSafeEqual(a, b)) return true
  }

  return false
}

/** Setup uses the canonical 160-bit secret issued by createTotpSecret(). */
export function isTotpSetupSecret(secret: string): boolean {
  return typeof secret === 'string' && /^[A-Z2-7]{32}$/.test(secret)
}

/** Ссылка для приложения-аутентификатора: из неё же рисуется QR-код. */
export function totpUri(secret: string, email: string, issuer = 'TableApp'): string {
  const label = encodeURIComponent(`${issuer}:${email}`)
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_STEP_SECONDS),
  })
  return `otpauth://totp/${label}?${params.toString()}`
}

/**
 * Резервные коды на случай потери телефона. Показываются один раз, в базе
 * лежат хэшами: их кража не должна давать вход.
 */
export function createRecoveryCodes(count = 8): string[] {
  return Array.from({ length: count }, () => {
    const raw = randomBytes(5).toString('hex').toUpperCase()
    return `${raw.slice(0, 5)}-${raw.slice(5)}`
  })
}

export function hashRecoveryCode(code: string): string {
  return createHash('sha256').update(normalizeRecoveryCode(code)).digest('hex')
}

export function normalizeRecoveryCode(code: string): string {
  return code.replace(/[^0-9a-z]/gi, '').toUpperCase()
}
