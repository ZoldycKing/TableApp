// @vitest-environment jsdom
import { useEffect } from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildTemplate } from '@/lib/templates/build'
import { salon } from '@/lib/templates/defs/salon'
import { buildBookingV2App } from '@/lib/templates/booking-v2'
import type { BookingAvailabilityResult } from '@/lib/builder-v2-booking-availability'
import { BookingJourneyProvider, useBookingJourney, type BookingIntent } from './booking-journey'
import { BookingDemoAvailability, BookingTimeFields } from './booking-time'

const mocked = vi.hoisted(() => ({ context: null as ReturnType<typeof import('./form-preview')['useBuilderV2FormContext']> }))
vi.mock('./form-preview', () => ({ useBuilderV2FormContext: () => mocked.context }))
afterEach(() => { cleanup(); mocked.context = null })

function seedFixture(available = true, owner = true) {
  const built = buildTemplate({ template: salon, workspaceId: 'wsp_time' }), app = buildBookingV2App(built, { id: 'app_time', workspaceId: 'wsp_time', name: 'Студия', slug: 'time', email: 'owner@example.com' }), b = app.booking!
  const change = vi.fn(), seed: BookingIntent = { masterId: 'master_olya', day: '2026-11-20', time: '09:00', client: 'Ирина', phone: '+79160000000', email: 'irina@example.com' }
  mocked.context = { app, scope: { formId: owner ? b.ownerCreateFormId! : b.createFormId, screenId: b.formScreenId, recordId: 'service_haircut' }, values: {}, errors: {}, disabled: false, key: 'test', onPending: vi.fn(), change, inspect: vi.fn(), state: { values: {}, labels: {}, fingerprint: 'test', fields: [b.visit.client,b.visit.phone,b.visit.email].map(fieldId => ({ fieldId, nodeId: fieldId, label: fieldId, required: false, readOnly: false, supported: true, type: 'text' })) } }
  const availability: BookingAvailabilityResult = { ok: true, timeZone: 'Europe/Moscow', service: { id: 'service_haircut', name: 'Стрижка', price: 2500, minutes: 60 }, masters: [{ id: 'master_olya', name: 'Оля' }], slots: available ? [{ masterId: 'master_olya', masterName: 'Оля', time: '09:00', start: '2026-11-20T06:00:00Z' }] : [] }
  function Seed() {
    const journey = useBookingJourney()!
    useEffect(() => journey.setIntent(seed), [])
    return journey.intent ? <BookingDemoAvailability value={() => availability}><BookingTimeFields app={app} editing={false} /></BookingDemoAvailability> : null
  }
  render(<BookingJourneyProvider><Seed /></BookingJourneyProvider>)
  return { b, change }
}
describe('calendar and client context in a new booking', () => {
  it('prefills the owner form with actual client contacts and the exact available slot', async () => {
    const { b, change } = seedFixture()
    await waitFor(() => expect(change).toHaveBeenCalledWith(b.visit.start,'2026-11-20T06:00:00Z'))
    expect(change).toHaveBeenCalledWith(b.visit.master,['master_olya'])
    expect(change).toHaveBeenCalledWith(b.visit.client,'Ирина')
    expect(change).toHaveBeenCalledWith(b.visit.phone,'+79160000000')
    expect(change).toHaveBeenCalledWith(b.visit.email,'irina@example.com')
    expect((screen.getByLabelText('Дата записи') as HTMLInputElement).value).toBe('2026-11-20')
  })
  it('does not silently select a different slot after the chosen time becomes unavailable', async () => {
    const { b, change } = seedFixture(false)
    await screen.findByText('Выбранное время занято или не подходит для этой услуги. Выберите другое свободное время или мастера.')
    expect(change.mock.calls.some(([fieldId]) => fieldId === b.visit.start)).toBe(false)
  })
  it('never copies owner contacts into the customer form', async () => {
    const { b, change } = seedFixture(true,false)
    await waitFor(() => expect(change).toHaveBeenCalledWith(b.visit.start,'2026-11-20T06:00:00Z'))
    expect(change.mock.calls.some(([fieldId]) => [b.visit.client,b.visit.phone,b.visit.email].includes(fieldId))).toBe(false)
  })
})
