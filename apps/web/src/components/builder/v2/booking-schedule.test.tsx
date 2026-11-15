// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildTemplate } from '@/lib/templates/build'
import { salon } from '@/lib/templates/defs/salon'
import { buildBookingV2App } from '@/lib/templates/booking-v2'
import { BookingScheduleDemoContext, BookingScheduleForm } from './booking-schedule'
import type { BookingScheduleRequest } from '@/lib/builder-v2-booking-schedule'

const built = buildTemplate({ template: salon, workspaceId: 'wsp_schedule' })
const app = buildBookingV2App(built, { id: 'app_schedule', workspaceId: 'wsp_schedule', name: 'Schedule', slug: 'schedule', email: 'owner@example.com' })
const config = app.booking!, formId = app.nodes.find(node => node.type === 'form' && app.screens.find(screen => screen.id === config.setupScreenId)!.rootIds.includes(node.id))!.id
afterEach(cleanup)

describe('clear working-hours setup inside the app', () => {
  const read = async () => ({ ok: true as const, state: { revision: 'demo', fingerprint: 'first', masters: [{ id: 'row_olya', name: 'Оля' }], values: {} } })
  it('shows named masters and all weekdays, and submits one request for the selected days', async () => {
    const save = vi.fn(async (_request: BookingScheduleRequest) => ({ ok: true as const, repeated: false })), done = vi.fn()
    render(<div data-app-frame><BookingScheduleDemoContext value={{ read, save }}><BookingScheduleForm app={app} formId={formId} screenId={config.setupScreenId} onSaved={done} /></BookingScheduleDemoContext></div>)
    await screen.findByRole('option', { name: 'Оля' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByText('Найти запись')).toBeNull()
    expect(screen.queryByLabelText('Период')).toBeNull()
    expect(screen.getByRole('form').closest('[data-app-frame]')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Мастер'), { target: { value: 'row_olya' } })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Пятница' }))
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить рабочие часы' }))
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    expect(save.mock.calls[0]![0]).toMatchObject({ input: { masterId: 'row_olya', weekdays: [1, 2, 3, 4], start: '09:00', end: '18:00' } })
    expect(done).toHaveBeenCalledTimes(1)
  })
  it('keeps the same request after a lost response, preventing duplicate periods on retry', async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error('Network')).mockResolvedValue({ ok: true, repeated: true })
    render(<BookingScheduleDemoContext value={{ read, save }}><BookingScheduleForm app={app} formId={formId} screenId={config.setupScreenId} onSaved={vi.fn()} /></BookingScheduleDemoContext>)
    await screen.findByRole('option', { name: 'Оля' })
    fireEvent.change(screen.getByLabelText('Мастер'), { target: { value: 'row_olya' } })
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить рабочие часы' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Повторить сохранение' }))
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2))
    expect(save.mock.calls[0]![0]).toEqual(save.mock.calls[1]![0])
  })
})
