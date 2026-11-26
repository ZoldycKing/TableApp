// @vitest-environment jsdom
import { useEffect } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildTemplate } from '@/lib/templates/build'
import { salon } from '@/lib/templates/defs/salon'
import { buildBookingV2App } from '@/lib/templates/booking-v2'
import type { BookingAvailabilityResult } from '@/lib/builder-v2-booking-availability'
import { BookingJourneyProvider, useBookingJourney, type BookingIntent } from './booking-journey'
import { BookingDemoAvailability, BookingTimeFields } from './booking-time'
import { BookingPeopleDemoContext } from './booking-people-data'

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
    return journey.intent ? <BookingPeopleDemoContext value={() => ({ ok: true, data: { timeZone: 'Europe/Moscow', day: '2026-11-20', masters: [], clients: [], visits: [], shifts: [] } })}><BookingDemoAvailability value={() => availability}><BookingTimeFields app={app} editing={false} /></BookingDemoAvailability></BookingPeopleDemoContext> : null
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
    expect(screen.getByText('Оля · 20.11.2026 · 09:00')).toBeTruthy()
    expect(screen.queryByText('Когда вам удобно?')).toBeNull()
    expect(screen.queryByLabelText('Дата записи')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Изменить' }))
    expect((screen.getByLabelText('Дата записи') as HTMLInputElement).value).toBe('20.11.2026')
    expect(document.querySelector('input[type="date"]')).toBeNull()
    expect((screen.getByLabelText('Мастер') as HTMLSelectElement).value).toBe('master_olya')
  })
  it('does not silently select a different slot after the chosen time becomes unavailable', async () => {
    const { b, change } = seedFixture(false)
    await screen.findByText('Выбранное время занято или не подходит для этой услуги. Выберите другое свободное время или мастера.')
    expect(change.mock.calls.some(([fieldId]) => fieldId === b.visit.start)).toBe(false)
  })
  it('asks for a service before listing free time on a blank owner form', () => {
    const built = buildTemplate({ template: salon, workspaceId: 'wsp_blank' })
    const app = buildBookingV2App(built, { id: 'app_blank', workspaceId: 'wsp_blank', name: 'Студия', slug: 'blank', email: 'owner@example.com' })
    const booking = app.booking!
    mocked.context = { app, scope: { formId: booking.ownerCreateFormId!, screenId: booking.formScreenId }, values: {}, errors: {}, disabled: false, key: 'blank', onPending: vi.fn(), change: vi.fn(), inspect: vi.fn(), state: { values: {}, labels: {}, fingerprint: 'blank', fields: [] } }
    render(<BookingDemoAvailability value={() => ({ ok: true, timeZone: 'Europe/Moscow', service: { id: 's', name: 'Стрижка', price: 1, minutes: 60 }, masters: [], slots: [] })}><BookingTimeFields app={app} editing={false} /></BookingDemoAvailability>)
    expect(screen.getByText('Выберите услугу, чтобы увидеть свободное время.')).toBeTruthy()
  })
  it('lists each start once for any master and only that master afterwards', async () => {
    const built = buildTemplate({ template: salon, workspaceId: 'wsp_slots' })
    const app = buildBookingV2App(built, { id: 'app_slots', workspaceId: 'wsp_slots', name: 'Студия', slug: 'slots', email: 'owner@example.com' })
    const booking = app.booking!
    const change = vi.fn()
    mocked.context = { app, scope: { formId: booking.ownerCreateFormId!, screenId: booking.formScreenId, recordId: 'service_haircut' }, values: {}, errors: {}, disabled: false, key: 'slots', onPending: vi.fn(), change, inspect: vi.fn(), state: { values: {}, labels: {}, fingerprint: 'slots', fields: [] } }
    const slots = [
      { masterId: 'master_natasha', masterName: 'Наташа', time: '11:00', start: '2026-11-20T08:00:00.000Z' },
      { masterId: 'master_olya', masterName: 'Оля', time: '11:00', start: '2026-11-20T08:00:00.000Z' },
      { masterId: 'master_natasha', masterName: 'Наташа', time: '09:30', start: '2026-11-20T06:30:00.000Z' },
      { masterId: 'master_olya', masterName: 'Оля', time: '18:00', start: '2026-11-20T15:00:00.000Z' },
    ]
    render(<BookingDemoAvailability value={() => ({ ok: true, timeZone: 'Europe/Moscow', service: { id: 'service_haircut', name: 'Стрижка', price: 2500, minutes: 60 }, masters: [{ id: 'master_olya', name: 'Оля' }, { id: 'master_natasha', name: 'Наташа' }], slots })}><BookingTimeFields app={app} editing={false} /></BookingDemoAvailability>)
    expect(await screen.findByRole('heading', { name: 'Утро' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Вечер' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'День' })).toBeNull()
    expect(screen.getAllByRole('button', { name: '11:00' })).toHaveLength(1)
    expect(screen.queryByRole('button', { name: /Оля|Наташа/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '11:00' }))
    expect(change).toHaveBeenCalledWith(booking.visit.master, [])
    expect(change).toHaveBeenCalledWith(booking.visit.start, '2026-11-20T08:00:00.000Z')
    fireEvent.change(screen.getByLabelText('Мастер'), { target: { value: 'master_olya' } })
    expect(await screen.findByRole('button', { name: '18:00' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '11:00' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '09:30' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Оля|Наташа/ })).toBeNull()
  })
  it('never copies owner contacts into the customer form', async () => {
    const { b, change } = seedFixture(true,false)
    await waitFor(() => expect(change).toHaveBeenCalledWith(b.visit.start,'2026-11-20T06:00:00Z'))
    expect(change.mock.calls.some(([fieldId]) => [b.visit.client,b.visit.phone,b.visit.email].includes(fieldId))).toBe(false)
  })
})
