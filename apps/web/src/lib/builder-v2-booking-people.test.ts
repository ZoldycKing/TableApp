import { describe, expect, it } from 'vitest'
import type { AppV2Actor } from '@tableapp/schema/app-v2'
import { buildTemplate } from './templates/build'
import { salon } from './templates/defs/salon'
import { buildBookingV2App } from './templates/booking-v2'
import { bookingTeamSnapshot } from './builder-v2-booking-people'
import type { BookingData } from './booking'

function fixture() {
  const built = buildTemplate({ template: salon, workspaceId: 'wsp_people' })
  const app = buildBookingV2App(built, { id: 'app_people', workspaceId: 'wsp_people', name: 'Студия', slug: 'people', email: 'owner@example.com' }), b = app.booking!
  const owner: AppV2Actor = { authenticated: true, id: 'owner', roleIds: ['owner'], email: 'owner@example.com', company: '' }
  const of = (id: string) => built.rows.filter(row => row.tableId === id).map(row => ({ id: row.id, data: row.data as Record<string, unknown> }))
  const data: BookingData = { timeZone: 'Europe/Moscow', services: of(b.tables.services), masters: of(b.tables.masters), schedule: of(b.tables.schedule), visits: [] }
  const visit = (id: string, name: string, email: string, phone = '') => ({ id, data: { [b.visit.client]: name, [b.visit.phone]: phone, [b.visit.email]: email, [b.visit.note]: 'Private note', [b.visit.master]: [data.masters[0]!.id], [b.visit.service]: [data.services[0]!.id], [b.visit.start]: '2026-11-16T09:00:00Z', [b.visit.minutes]: 60, [b.visit.price]: 2500, [b.visit.status]: b.statuses.completed } })
  return { app, b, owner, data, visit }
}
describe('administrator people directory', () => {
  it('denies customers, unauthenticated owners and masters even on a public master screen', () => {
    const f = fixture()
    for (const role of ['staff','client']) expect(bookingTeamSnapshot(f.app, { ...f.owner, roleIds: [role] }, f.data, f.b.mastersScreenId).ok).toBe(false)
    expect(bookingTeamSnapshot(f.app, { ...f.owner, authenticated: false }, f.data, f.b.masterScreenId).ok).toBe(false)
    expect(bookingTeamSnapshot(f.app, f.owner, f.data, f.b.catalogScreenId).ok).toBe(false)
    f.app.screens.find(screen => screen.id === f.b.mastersScreenId)!.audience = { kind: 'roles', roleIds: ['client'] }
    expect(bookingTeamSnapshot(f.app, f.owner, f.data, f.b.mastersScreenId).ok).toBe(false)
  })
  it('groups repeat visits by email, never by a matching name, and preserves actual history', () => {
    const f = fixture()
    f.data.visits = [f.visit('row_a','Ирина','irina@example.com'),f.visit('row_b','Ирина',' IRINA@example.com '),f.visit('row_c','Ирина','other@example.com'),f.visit('row_d','Ирина',''),f.visit('row_e','Ирина','')]
    const result = bookingTeamSnapshot(f.app, f.owner, f.data, f.b.mastersScreenId)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.clients).toHaveLength(4)
    expect(result.data.visits.filter(visit => visit.clientId === 'row_a')).toHaveLength(2)
    expect(result.data.visits[0]).toMatchObject({ status: 'completed', price: 2500, note: 'Private note' })
  })
  it('uses a complete phone when email is missing and never groups short/incomplete contacts', () => {
    const f = fixture()
    f.data.visits = [f.visit('row_a','Ирина','', '+7 (916) 555-11-22'),f.visit('row_b','Ирина','', '+79165551122'),f.visit('row_c','Ирина','', '123'),f.visit('row_d','Ирина','', '123')]
    const result = bookingTeamSnapshot(f.app, f.owner, f.data, f.b.mastersScreenId)
    expect(result.ok && result.data.clients).toHaveLength(3)
  })
  it('honors field/row policy before deriving contacts, notes, money or service names', () => {
    const f = fixture()
    f.data.visits = [f.visit('row_a','Ирина','private@example.com','+7 private')]
    const grant = f.app.policy.tables.find(rule => rule.tableId === f.b.tables.visits)!.grants[0]!.read!
    grant.fieldIds = grant.fieldIds.filter(id => ![f.b.visit.email,f.b.visit.phone,f.b.visit.note,f.b.visit.price].includes(id))
    const result = bookingTeamSnapshot(f.app, f.owner, f.data, f.b.visitScreenId)
    expect(JSON.stringify(result)).not.toContain('private')
    expect(result.ok && result.data.visits[0]!.price).toBeNull()
    grant.rows = { kind: 'owned', fieldId: f.b.visit.email, property: 'email' }
    expect(bookingTeamSnapshot(f.app, f.owner, f.data, f.b.visitScreenId)).toMatchObject({ ok: true, data: { clients: [], visits: [] } })
  })
})
