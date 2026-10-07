import { describe, expect, it } from 'vitest'
import {
  createCode,
  hashCode,
  hashesMatch,
  isValidEmail,
  normalizeCode,
  normalizeEmail,
} from './auth'

describe('код из письма', () => {
  it('всегда шесть цифр без ведущего нуля', () => {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      expect(createCode()).toMatch(/^[1-9]\d{5}$/)
    }
  })

  it('не повторяется подряд', () => {
    const codes = new Set(Array.from({ length: 50 }, () => createCode()))
    expect(codes.size).toBeGreaterThan(40)
  })

  it('одинаковые коды разных попыток дают разные хэши', () => {
    expect(hashCode('tok_a', '123456')).not.toBe(hashCode('tok_b', '123456'))
  })

  it('сверяется с сохранённым хэшем', () => {
    const stored = hashCode('tok_a', '123456')
    expect(hashesMatch(stored, hashCode('tok_a', '123456'))).toBe(true)
    expect(hashesMatch(stored, hashCode('tok_a', '123457'))).toBe(false)
  })

  it('терпит то, как человек копирует код из письма', () => {
    expect(normalizeCode(' 123 456 ')).toBe('123456')
    expect(normalizeCode('123-456')).toBe('123456')
    expect(hashCode('tok_a', normalizeCode('123 456'))).toBe(hashCode('tok_a', '123456'))
  })
})

describe('адрес почты', () => {
  it('приводится к нижнему регистру без пробелов', () => {
    expect(normalizeEmail('  Ivanov@Example.RU ')).toBe('ivanov@example.ru')
  })

  it('отсекает явно неверные', () => {
    expect(isValidEmail('ivanov@example.ru')).toBe(true)
    expect(isValidEmail('ivanov@example')).toBe(false)
    expect(isValidEmail('ivanov example.ru')).toBe(false)
  })
})
