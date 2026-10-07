import { describe, expect, it } from 'vitest'
import {
  base32Decode,
  base32Encode,
  createRecoveryCodes,
  hashRecoveryCode,
  normalizeRecoveryCode,
  totpAt,
  totpUri,
  verifyTotp,
} from './totp'

/** Секрет из RFC 6238: строка "12345678901234567890" в base32. */
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890'))

describe('TOTP по RFC 6238', () => {
  it('совпадает с тестовыми векторами стандарта', () => {
    // Время из приложения B стандарта, шаг 30 секунд, шесть цифр, SHA-1.
    expect(totpAt(RFC_SECRET, Math.floor(59 / 30))).toBe('287082')
    expect(totpAt(RFC_SECRET, Math.floor(1111111109 / 30))).toBe('081804')
    expect(totpAt(RFC_SECRET, Math.floor(1234567890 / 30))).toBe('005924')
    expect(totpAt(RFC_SECRET, Math.floor(2000000000 / 30))).toBe('279037')
  })

  it('принимает код с запасом в шаг в каждую сторону', () => {
    const now = 1234567890 * 1000
    expect(verifyTotp(RFC_SECRET, '005924', now)).toBe(true)
    expect(verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, Math.floor(1234567890 / 30) - 1), now)).toBe(true)
    expect(verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, Math.floor(1234567890 / 30) + 1), now)).toBe(true)
  })

  it('не принимает соседние окна за пределами запаса и мусор', () => {
    const now = 1234567890 * 1000
    expect(verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, Math.floor(1234567890 / 30) + 5), now)).toBe(false)
    expect(verifyTotp(RFC_SECRET, '000000', now)).toBe(false)
    expect(verifyTotp(RFC_SECRET, '12345', now)).toBe(false)
  })

  it('терпит пробелы в введённом коде', () => {
    expect(verifyTotp(RFC_SECRET, '005 924', 1234567890 * 1000)).toBe(true)
  })
})

describe('base32', () => {
  it('кодирует и декодирует обратно', () => {
    const source = Buffer.from('12345678901234567890')
    expect(base32Decode(base32Encode(source)).equals(source)).toBe(true)
  })
})

describe('ссылка для аутентификатора', () => {
  it('содержит секрет, издателя и адрес', () => {
    const uri = totpUri('JBSWY3DPEHPK3PXP', 'owner@example.ru')
    expect(uri.startsWith('otpauth://totp/TableApp%3Aowner%40example.ru?')).toBe(true)
    expect(uri).toContain('secret=JBSWY3DPEHPK3PXP')
    expect(uri).toContain('issuer=TableApp')
  })
})

describe('резервные коды', () => {
  it('выдаются разными и сверяются без учёта дефисов и регистра', () => {
    const codes = createRecoveryCodes()
    expect(new Set(codes).size).toBe(8)
    const stored = hashRecoveryCode(codes[0]!)
    expect(hashRecoveryCode(codes[0]!.toLowerCase().replace('-', ' '))).toBe(stored)
    expect(hashRecoveryCode(codes[1]!)).not.toBe(stored)
    expect(normalizeRecoveryCode('ab-cd ef')).toBe('ABCDEF')
  })
})
