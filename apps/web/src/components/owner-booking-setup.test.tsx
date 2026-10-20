// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { templateExample } from '@/lib/templates/presentation'
import { OwnerBookingSetup } from './owner-booking-setup'

const mocks = vi.hoisted(() => ({ save: vi.fn(), refresh: vi.fn() }))
vi.mock('@/app/owner-booking-actions', () => ({ setupOwnerBookingMasterAction: mocks.save }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))
afterEach(() => { cleanup(); sessionStorage.clear(); vi.resetAllMocks() })

describe('owner schedule form', () => {
  it('restores input across steps, submits edited time and keeps it after a server rejection', async () => {
    const example = templateExample('salon')
    const tables = Object.fromEntries(example.built.tables.map(table => [table.id, { ...table,
      fields: example.fields.filter(field => field.tableId === table.id), rows: example.rows.filter(row => row.tableId === table.id),
    }]))
    const props = { app: example.app, tables, userId: 'synthetic-owner' }
    let ui = render(<OwnerBookingSetup {...props} />)
    fireEvent.change(ui.getByRole('textbox', { name: 'Имя мастера' }), { target: { value: 'Новый мастер' } })
    fireEvent.change(ui.getByRole('textbox', { name: 'Почта мастера' }), { target: { value: 'master@example.invalid' } })
    fireEvent.click(ui.getByRole('checkbox', { name: 'Женская стрижка · 60 мин' }))
    fireEvent.input(ui.getByLabelText('Конец смены'), { target: { value: '08:00' } })
    ui.unmount()
    ui = render(<OwnerBookingSetup {...props} />)
    await waitFor(() => expect((ui.getByRole('textbox', { name: 'Имя мастера' }) as HTMLInputElement).value).toBe('Новый мастер'))
    mocks.save.mockResolvedValueOnce({ ok: false, error: 'Конец смены раньше начала' }).mockResolvedValueOnce({ ok: true })
    fireEvent.click(ui.getByRole('button', { name: 'Сохранить мастера и график' }))
    expect((await ui.findByRole('alert')).textContent).toBe('Конец смены раньше начала')
    expect(mocks.save.mock.calls[0]![1].end).toBe('08:00')
    expect((ui.getByRole('textbox', { name: 'Имя мастера' }) as HTMLInputElement).value).toBe('Новый мастер')
    fireEvent.input(ui.getByLabelText('Конец смены'), { target: { value: '18:00' } })
    fireEvent.click(ui.getByRole('button', { name: 'Сохранить мастера и график' }))
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce())
    expect((ui.getByRole('textbox', { name: 'Имя мастера' }) as HTMLInputElement).value).toBe('')
  })
})
