import { describe, expect, it } from 'vitest'
import { decide, type KnownPayment } from './decide'
import type { ProviderPayment } from './provider'
import { fromProvider } from './sender'

/**
 * Решение по платежу.
 *
 * Здесь проверяется то, из-за чего в платежах бывает больно: повторное
 * уведомление не должно продлевать подписку второй раз, опоздавшее —
 * откатывать оплату, а сумма меньше нужной — включать тариф. Всё это
 * случается на настоящих деньгах редко и тихо, поэтому проверяется
 * без базы и без сети.
 */

const stored = (patch: Partial<KnownPayment> = {}): KnownPayment => ({
  status: 'pending',
  amount: 199_000,
  currency: 'RUB',
  plan: 'start',
  providerAt: null,
  ...patch,
})

const fromGateway = (patch: Partial<ProviderPayment> = {}): ProviderPayment => ({
  providerId: 'pay_1',
  status: 'succeeded',
  confirmationUrl: null,
  amount: 199_000,
  currency: 'RUB',
  at: new Date('2026-10-05T12:00:00Z'),
  ...patch,
})

describe('подтверждение оплаты', () => {
  it('оплачено на нужную сумму — включаем тариф', () => {
    expect(decide(stored(), fromGateway())).toEqual({ act: 'activate' })
  })

  it('сумма меньше просимой — тариф не включаем', () => {
    // Иначе «Бизнес» включался бы рублём: цену назначает сервер, а платит
    // человек у провайдера, и совпадение надо проверять.
    expect(decide(stored(), fromGateway({ amount: 100 }))).toEqual({
      act: 'refuse',
      why: 'amount_mismatch',
    })
  })

  it('чужая валюта — тоже отказ', () => {
    expect(decide(stored(), fromGateway({ currency: 'USD' }))).toEqual({
      act: 'refuse',
      why: 'amount_mismatch',
    })
  })

  it('бесплатный тариф оплатить нельзя', () => {
    expect(decide(stored({ plan: 'free' }), fromGateway())).toEqual({ act: 'refuse', why: 'bad_plan' })
  })
})

describe('повторы и порядок', () => {
  it('повторное уведомление ничего не меняет', () => {
    // ЮKassa повторяет доставку сутки: второй раз подписка продлеваться не должна.
    expect(decide(stored({ status: 'succeeded' }), fromGateway())).toEqual({
      act: 'nothing',
      why: 'same_status',
    })
  })

  it('опоздавшее уведомление не откатывает оплату', () => {
    const known = stored({ status: 'succeeded', providerAt: new Date('2026-10-05T12:00:00Z') })
    const late = fromGateway({ status: 'canceled', at: new Date('2026-10-05T11:59:00Z') })
    expect(decide(known, late)).toEqual({ act: 'nothing', why: 'out_of_order' })
  })

  it('после оплаты отмена не принимается, а возврат принимается', () => {
    const paid = stored({ status: 'succeeded' })
    expect(decide(paid, fromGateway({ status: 'canceled', at: new Date('2026-10-06T10:00:00Z') }))).toEqual({
      act: 'nothing',
      why: 'terminal',
    })
    expect(decide(paid, fromGateway({ status: 'refunded', at: new Date('2026-10-06T10:00:00Z') }))).toEqual({
      act: 'refund',
    })
  })

  it('после возврата не происходит ничего', () => {
    const back = stored({ status: 'refunded' })
    expect(decide(back, fromGateway({ status: 'succeeded' })).act).toBe('nothing')
  })

  it('платёж, который ещё ждут, ничего не включает', () => {
    expect(decide(stored(), fromGateway({ status: 'pending' }))).toEqual({
      act: 'nothing',
      why: 'same_status',
    })
  })

  it('отмена неоплаченного платежа закрывает его', () => {
    expect(decide(stored(), fromGateway({ status: 'canceled' }))).toEqual({ act: 'cancel' })
  })
})

describe('адрес отправителя уведомления', () => {
  it('адреса ЮKassa принимаются', () => {
    expect(fromProvider('185.71.76.1')).toBe(true)
    expect(fromProvider('77.75.156.11')).toBe(true)
    expect(fromProvider('77.75.154.200')).toBe(true)
    expect(fromProvider('2a02:5180::1')).toBe(true)
  })

  it('чужие адреса — нет', () => {
    expect(fromProvider('185.71.76.33')).toBe(false)
    expect(fromProvider('8.8.8.8')).toBe(false)
    expect(fromProvider('')).toBe(false)
    expect(fromProvider('не адрес')).toBe(false)
    expect(fromProvider('2a03:5180::1')).toBe(false)
  })
})
