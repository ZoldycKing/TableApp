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
    await waitFor(() => expect(ui.getByRole('button', { name: '10:00' }).getAttribute('aria-pressed')).toBe('true'))
    expect((ui.getByLabelText('Ваше имя') as HTMLInputElement).value).toBe('Ирина')
    expect((ui.getByLabelText('Дата') as HTMLInputElement).value).toBe('13.10.2026')
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
  it('retries a rejected availability request for the same date without losing contacts or filters', async () => {
    const { runtime, config, serviceId, masterId, slot } = fixture()
    mocks.availability.mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ ok: true, slots: [slot], masters: [{ id: masterId, name: 'Оля' }], timeZone: 'Europe/Moscow' })
    const ui = render(<BookingForm runtime={runtime} row={null} demo={false} pending={false}
      initialValues={{ [config.visit.service]: [serviceId], [config.visit.master]: [masterId], [config.visit.start]: slot.start }} onSubmit={vi.fn()} />)
    fireEvent.change(ui.getByLabelText('Ваше имя'), { target: { value: 'Ирина' } })
    fireEvent.change(ui.getByLabelText('Телефон'), { target: { value: '+7 900 000 00 00' } })
    expect((await ui.findByRole('alert')).textContent).toContain('Проверьте соединение')
    expect(ui.queryByRole('button', { name: '10:00' })).toBeNull()
    fireEvent.click(ui.getByRole('button', { name: 'Повторить загрузку времени' }))
    await waitFor(() => expect(ui.getByRole('button', { name: '10:00' }).getAttribute('aria-pressed')).toBe('true'))
    expect(mocks.availability).toHaveBeenCalledTimes(2)
    expect(mocks.availability.mock.calls[1]).toEqual(mocks.availability.mock.calls[0])
    expect((ui.getByLabelText('Дата') as HTMLInputElement).value).toBe('13.10.2026')
    expect((ui.getByLabelText('Услуга') as HTMLSelectElement).value).toBe(serviceId)
    expect((ui.getByLabelText('Мастер') as HTMLSelectElement).value).toBe(masterId)
    expect((ui.getByLabelText('Ваше имя') as HTMLInputElement).value).toBe('Ирина')
    expect((ui.getByLabelText('Телефон') as HTMLInputElement).value).toBe('+7 900 000 00 00')
  })
  it('rechecks availability after a booking conflict and removes the occupied choice while preserving entered details', async () => {
    const { runtime, config, serviceId, masterId, slot } = fixture()
    mocks.availability.mockResolvedValueOnce({ ok: true, slots: [slot], masters: [{ id: masterId, name: 'Оля' }], timeZone: 'Europe/Moscow' })
      .mockResolvedValue({ ok: true, slots: [], masters: [{ id: masterId, name: 'Оля' }], timeZone: 'Europe/Moscow' })
    const initialValues = { [config.visit.service]: [serviceId], [config.visit.master]: [masterId], [config.visit.start]: slot.start }
    const ui = render(<BookingForm runtime={runtime} row={null} demo={false} pending={false} initialValues={initialValues} onSubmit={vi.fn()} />)
    await waitFor(() => expect(ui.getByRole('button', { name: '10:00' }).getAttribute('aria-pressed')).toBe('true'))
    fireEvent.change(ui.getByLabelText('Ваше имя'), { target: { value: 'Ирина' } })
    fireEvent.change(ui.getByLabelText('Телефон'), { target: { value: '+7 900 000 00 00' } })
    ui.rerender(<BookingForm runtime={{ ...runtime }} row={null} demo={false} pending={false} initialValues={initialValues} availabilityRevision={1} onSubmit={vi.fn()} />)
    await waitFor(() => expect(ui.getByRole('status').textContent).toContain('свободного времени нет'))
    expect(ui.queryByRole('button', { name: '10:00' })).toBeNull()
    expect((ui.getByRole('button', { name: 'Подтвердить запись' }) as HTMLButtonElement).disabled).toBe(true)
    expect((ui.getByLabelText('Ваше имя') as HTMLInputElement).value).toBe('Ирина')
    expect((ui.getByLabelText('Телефон') as HTMLInputElement).value).toBe('+7 900 000 00 00')
    expect((ui.getByLabelText('Услуга') as HTMLSelectElement).value).toBe(serviceId)
    expect((ui.getByLabelText('Мастер') as HTMLSelectElement).value).toBe(masterId)
  })
  it('submits a deduped time without a master so the server can assign one', async () => {
    const { runtime, config, serviceId, masterId, slot } = fixture()
    const other = { ...slot, masterId: 'master_natasha', masterName: 'Наташа' }
    mocks.availability.mockResolvedValue({ ok: true, slots: [slot, other], masters: [{ id: masterId, name: 'Оля' }, { id: other.masterId, name: 'Наташа' }], timeZone: 'Europe/Moscow' })
    const submit = vi.fn()
    const ui = render(<BookingForm runtime={runtime} row={null} demo={false} pending={false} initialValues={{ [config.visit.service]: [serviceId] }} onSubmit={submit} />)
    expect(await ui.findAllByRole('button', { name: '10:00' })).toHaveLength(1)
    fireEvent.click(ui.getByRole('button', { name: '10:00' }))
    fireEvent.change(ui.getByLabelText('Ваше имя'), { target: { value: 'Ирина' } })
    fireEvent.change(ui.getByLabelText('Телефон'), { target: { value: '+7 900 000 00 00' } })
    fireEvent.submit(ui.getByRole('button', { name: 'Подтвердить запись' }).closest('form')!)
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ [config.visit.master]: [], [config.visit.start]: slot.start, [config.visit.service]: [serviceId] }))
  })
  it('restores a form draft and only reports a restored time after the server confirms it remains free', async () => {
    const { runtime, serviceId, masterId, slot } = fixture(), onDraftChange = vi.fn()
    mocks.availability.mockResolvedValue({ ok: true, slots: [slot], masters: [{ id: masterId, name: 'Оля' }], timeZone: 'Europe/Moscow' })
    const initialDraft = { serviceId, masterId, day: '2026-10-13', name: 'Ирина', phone: '+7 900 000 00 00', customerEmail: '', chosen: slot }
    const ui = render(<BookingForm runtime={runtime} row={null} demo={false} pending={false} initialDraft={initialDraft} onDraftChange={onDraftChange} onSubmit={vi.fn()} />)
    await waitFor(() => expect(onDraftChange).toHaveBeenLastCalledWith(initialDraft))
    fireEvent.change(ui.getByLabelText('Ваше имя'), { target: { value: 'Ирина Петрова' } })
    await waitFor(() => expect(onDraftChange).toHaveBeenLastCalledWith({ ...initialDraft, name: 'Ирина Петрова' }))
    ui.rerender(<BookingForm runtime={{ ...runtime }} row={null} demo={false} pending={false} initialDraft={{ ...initialDraft, name: 'Старое имя' }} onDraftChange={onDraftChange} onSubmit={vi.fn()} />)
    expect((ui.getByLabelText('Ваше имя') as HTMLInputElement).value).toBe('Ирина Петрова')
  })
})
