import { describe, expect, it, vi } from 'vitest'
import { withInitialValues } from './initial-values'
import { templateExample } from './templates/presentation'
import { planSalonPriceUpgrade } from './templates/salon-price-upgrade'

describe('visit price snapshots', () => {
  const example = templateExample('salon')
  const price = example.field('visits', 'price'), service = example.field('visits', 'service')
  const fields = example.byTable.get(example.table('visits').id)!
  const selected = ['service-row']
  it('fills the current price once and preserves it when the price list changes', async () => {
    const read = vi.fn().mockResolvedValueOnce(2500).mockResolvedValueOnce(3000)
    const saved = await withInitialValues(fields, { [service.id]: selected, [price.id]: null }, read)
    expect(saved[price.id]).toBe(2500)
    expect(await withInitialValues(fields, { ...saved, note: 'edited later' }, read)).toMatchObject({ [price.id]: 2500 })
    expect(read).toHaveBeenCalledTimes(1)
    expect((await withInitialValues(fields, { [service.id]: selected }, read))[price.id]).toBe(3000)
  })
  it('preserves manual amounts, zero and the price when the service is replaced', async () => {
    const read = vi.fn()
    for (const amount of [0, 2000]) {
      expect((await withInitialValues(fields, { [service.id]: ['replacement'], [price.id]: amount }, read))[price.id]).toBe(amount)
    }
    expect(read).not.toHaveBeenCalled()
  })
  it('does not invent a price for an unavailable or ambiguous service', async () => {
    for (const ids of [[], ['a', 'b']]) expect((await withInitialValues(fields, { [service.id]: ids }, vi.fn()))[price.id]).toBeUndefined()
    expect((await withInitialValues(fields, { [service.id]: selected }, async () => undefined))[price.id]).toBeUndefined()
  })
  it('seeds every example with the real service price and stores an editable numeric field', () => {
    expect(price.type).toBe('number')
    for (const row of example.rows.filter(row => row.tableId === example.table('visits').id)) {
      const linked = example.rows.find(candidate => candidate.id === (row.data[service.id] as string[])[0])!
      expect(row.data[price.id]).toBe(linked.data[example.field('services', 'price').id])
    }
  })
  it('legacy migration freezes visible prices and preserves field and row IDs', () => {
    if (price.type !== 'number') throw new Error('wrong fixture')
    const legacy = fields.map(field => field.id === price.id ? { ...field, type: 'lookup' as const, options: price.options.initialFrom! } : field)
    const visits = example.rows.filter(row => row.tableId === example.table('visits').id)
    const services = example.rows.filter(row => row.tableId === example.table('services').id)
    const plan = planSalonPriceUpgrade(legacy, services, visits)!
    expect(plan.field.id).toBe(price.id)
    expect(plan.data.map(row => row.id)).toEqual(visits.map(row => row.id))
    expect(plan.data.map(row => row.data[price.id])).toEqual(visits.map(row => row.data[price.id]))
    expect(plan.note).toContain('не восстановление')
    const sourcePrice = example.field('services', 'price')
    if (sourcePrice.type !== 'number') throw new Error('wrong source price')
    const customized = planSalonPriceUpgrade(legacy, services, visits, { ...sourcePrice, options: { ...sourcePrice.options, currency: 'EUR', precision: 2 } })!
    expect(customized.field.options).toMatchObject({ currency: 'EUR', precision: 2 })
    expect(planSalonPriceUpgrade(fields, services, visits)).toBeNull()
    expect(() => planSalonPriceUpgrade(legacy, [], visits)).toThrow('Цена услуги отсутствует')
  })
})
