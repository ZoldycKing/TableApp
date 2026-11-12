import { describe, expect, it } from 'vitest'
import { builderV2MessengerLinks, builderV2MessengersFromRecord } from './builder-v2-messengers'

describe('builderV2MessengerLinks', () => {
  it('builds telegram and whatsapp deep links and copies MAX without a stable URL', () => {
    const links = builderV2MessengerLinks({
      telegram: '@anna_klimat',
      whatsapp: '+7 495 120-44-10',
      max: 'anna_max',
      otherLabel: 'Viber',
      otherValue: '+7 495 120-44-10',
    })
    expect(links.map(link => link.kind)).toEqual(['telegram', 'whatsapp', 'max', 'other'])
    expect(links[0]?.href).toBe('https://t.me/anna_klimat')
    expect(links[1]?.href).toBe('https://wa.me/74951204410')
    expect(links[2]?.copyOnly).toBe(true)
    expect(links[3]?.label).toBe('Viber')
  })

  it('hides empty messengers', () => {
    expect(builderV2MessengerLinks({})).toEqual([])
  })

  it('reads messengers from record field names', () => {
    const fields = [
      { id: 'tg', name: 'Telegram' },
      { id: 'wa', name: 'WhatsApp' },
      { id: 'otherL', name: 'Другой мессенджер' },
      { id: 'otherV', name: 'Контакт другого мессенджера' },
    ]
    const links = builderV2MessengersFromRecord({ tg: 'user', wa: '+79001234567', otherL: 'Signal', otherV: 'u123' }, fields)
    expect(links).toHaveLength(3)
    expect(links[2]?.label).toBe('Signal')
  })
})
