import { describe, expect, it } from 'vitest'
import { DEMO_CLIENT_PAGE, DEMO_CLIENT_TOTAL, demoClientById, prokatDemoCard, prokatDemoClients } from './prokat-clients-demo'

describe('prokat clients demo', () => {
  const clients = prokatDemoClients()

  it('is deterministic and dense enough for a first page', () => {
    expect(clients).toHaveLength(DEMO_CLIENT_TOTAL)
    expect(prokatDemoClients()).toBe(clients)
    expect(new Set(clients.map(client => client.id)).size).toBe(DEMO_CLIENT_TOTAL)
    expect(clients.slice(0, DEMO_CLIENT_PAGE).filter(client => client.next)).toHaveLength(4)
  })

  it('keeps sums in the agreed range and phones in one format', () => {
    for (const client of clients) {
      expect(client.paid).toBeGreaterThanOrEqual(1800)
      expect(client.paid).toBeLessThanOrEqual(32400)
      expect(client.phone).toMatch(/^\+7 9\d\d \d{3}-\d\d-\d\d$/)
      expect(client.lastDate).toMatch(/^\d\d\.\d\d\.2026$/)
    }
  })

  it('lists the first page by most recent visit', () => {
    const keys = clients.slice(0, DEMO_CLIENT_PAGE).map(client => client.lastKey)
    expect(keys).toEqual([...keys].sort((a, b) => b - a))
  })

  it('builds a card with an order on step 4 of 5, three past orders and five fields', () => {
    const card = prokatDemoCard(demoClientById('demo-client-1')!)
    expect(card.active!.steps).toHaveLength(5)
    expect(card.active!.steps.findIndex(step => step.state === 'cur')).toBe(3)
    expect(card.past).toHaveLength(3)
    expect(card.fields).toHaveLength(5)
    expect(card.messages.map(message => message.kind)).toEqual(['sys', 'in', 'note', 'out', 'in'])
    expect(prokatDemoCard({ id: 'demo-client-1', name: 'Алина Морозова' })).toEqual(card)
  })
})
