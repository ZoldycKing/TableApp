// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { projectRuntime } from '@/lib/runtime-project'
import { ANONYMOUS, visibleScreensFor } from '@/lib/app-roles'
import { templateExample } from '@/lib/templates/presentation'
import { BookingForm } from './booking-form'

const mocks = vi.hoisted(() => ({ availability: vi.fn() }))
vi.mock('@/app/booking-actions', () => ({ bookingAvailabilityAction: mocks.availability }))
afterEach(() => { cleanup(); mocks.availability.mockReset() })
function fixture() {
  const example = templateExample('salon'), config = example.app.booking!, now = new Date()
  const runtime = projectRuntime({ ...example.app, screens: visibleScreensFor(example.app, ANONYMOUS) }, ANONYMOUS,
    Object.fromEntries(example.views.map(view => [view.id, view])), example.built.tables, example.byTable,
    example.built.rows.map(row => ({ ...row, version: 0, createdAt: now, updatedAt: now, createdBy: null, updatedBy: null })),
    new Map(example.built.tables.map(table => [table.id, table.primaryFieldId])))
  const serviceId = example.rows.find(row => row.tableId === config.tables.services)!.id, masterId = example.rows.find(row => row.tableId === config.tables.masters)!.id
  const slot = { start: '2026-10-13T07:00:00.000Z', time: '10:00', masterId, masterName: 'Оля' }
  return { runtime, config, serviceId, masterId, slot }
}
describe('appointment form return and asynchronous availability', () => {
  it('restores contacts, service, date and a still-free slot when returning from email confirmation', async () => {
    const { runtime, config, serviceId, masterId, slot } = fixture()
    mocks.availability.mockResolvedValue({ ok: true, slots: [slot], masters: [{ id: masterId, name: 'Оля' }], timeZone: 'Europe/Moscow' })
    const initialValues = { [config.visit.client]: 'Ирина', [config.visit.phone]: '+7 900 000 00 00', [config.visit.service]: [serviceId], [config.visit.master]: [masterId], [config.visit.start]: slot.start }
    const submit = vi.fn()
    const ui = render(<BookingForm runtime={runtime} row={null} demo={false} pending={false} initialValues={initialValues} onSubmit={submit} />)
    await waitFor(() => expect(ui.getByRole('button', { name: '10:00 Оля' }).getAttribute('aria-pressed')).toBe('true'))
    expect((ui.getByLabelText('Ваше имя') as HTMLInputElement).value).toBe('Ирина')
    expect((ui.getByLabelText('Дата') as HTMLInputElement).value).toBe('2026-10-13')
    fireEvent.submit(ui.getByRole('button', { name: 'Подтвердить запись' }).closest('form')!)
    expect(submit).toHaveBeenCalledWith(initialValues)
    expect(ui.queryByLabelText('Почта клиента для кабинета')).toBeNull()
  })
  it('does not restore a slot that another customer has already booked', async () => {
    const { runtime, config, serviceId, masterId, slot } = fixture()
    mocks.availability.mockResolvedValue({ ok: true, slots: [], masters: [{ id: masterId, name: 'Оля' }], timeZone: 'Europe/Moscow' })
    const submit = vi.fn(), ui = render(<BookingForm runtime={runtime} row={null} demo={false} pending={false}
      initialValues={{ [config.visit.service]: [serviceId], [config.visit.master]: [masterId], [config.visit.start]: slot.start }} onSubmit={submit} />)
    await waitFor(() => expect(ui.getByRole('status').textContent).toContain('свободного времени нет'))
    expect((ui.getByRole('button', { name: 'Подтвердить запись' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.submit(ui.getByRole('button', { name: 'Подтвердить запись' }).closest('form')!)
    expect(submit).not.toHaveBeenCalled()
  })
})
