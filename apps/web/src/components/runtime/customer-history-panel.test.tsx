// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CustomerHistoryPanel } from './customer-history-panel'
import { CustomerDirectory } from './customer-directory'
import { readCustomerDirectoryAction, readCustomerHistoryAction } from '@/app/customer-history-actions'
import type { CustomerHistoryPage } from '@/lib/customer-history-types'
vi.mock('@/app/customer-history-actions', () => ({ readCustomerDirectoryAction: vi.fn(), readCustomerHistoryAction: vi.fn() }))
afterEach(() => { cleanup(); vi.resetAllMocks() })
const page: CustomerHistoryPage = { customer: { name: 'Ирина', email: 'irina@example.invalid', phone: '+7 900 000-00-00' }, next: null,
  kinds: [{ id: 'booking', name: 'Запись на услуги' }, { id: 'sales', name: 'Каталог и заказы' }],
  items: [{ id: 'visit', tableId: 'visits', slug: 'salon', screenId: 'visit-detail', title: 'Стрижка', module: 'Запись на услуги', kind: 'booking', status: 'Завершено', when: '13.10.2026, 10:00' }] }

describe('customer history interface', () => {
  it('loads only when requested, opens the authorized record and reloads after a filter change', async () => {
    vi.mocked(readCustomerHistoryAction).mockResolvedValue({ ok: true, page })
    const open = vi.fn(), ui = render(<CustomerHistoryPanel tableId="clients" rowId="irina" slug="crm" onOpen={open} />)
    expect(readCustomerHistoryAction).not.toHaveBeenCalled()
    fireEvent.click(ui.getByRole('button', { name: 'История клиента' }))
    fireEvent.click(await ui.findByRole('button', { name: 'Стрижка' }))
    expect(open).toHaveBeenCalledWith(page.items[0])
    fireEvent.change(ui.getByLabelText('Тип обращения'), { target: { value: 'sales' } })
    await waitFor(() => expect(readCustomerHistoryAction).toHaveBeenLastCalledWith({ tableId: 'clients', rowId: 'irina', slug: 'crm', kind: 'sales', before: undefined }, false))
  })
  it('shows a readonly online profile and uses the explicit platform record link', async () => {
    vi.mocked(readCustomerHistoryAction).mockResolvedValue({ ok: true, page })
    const ui = render(<CustomerHistoryPanel tableId="clients" rowId="profile:irina" business profile />)
    await ui.findByText('Ирина')
    expect(ui.getByRole('link', { name: 'Стрижка' }).getAttribute('href')).toBe('/t/visits?r=visit')
    expect(readCustomerHistoryAction).toHaveBeenCalledWith(expect.objectContaining({ rowId: 'profile:irina' }), true)
    expect(ui.queryByRole('button', { name: /Изменить|Удалить/ })).toBeNull()
  })
  it('retains paging through an invisible candidate page and clears old data on permission failure', async () => {
    vi.mocked(readCustomerHistoryAction).mockResolvedValueOnce({ ok: true, page: { ...page, items: [], next: 'opaque' } })
      .mockResolvedValueOnce({ ok: true, page }).mockResolvedValueOnce({ ok: false, error: 'История клиента недоступна' })
    const ui = render(<CustomerHistoryPanel tableId="clients" rowId="irina" profile slug="crm" />)
    fireEvent.click(await ui.findByRole('button', { name: 'Загрузить ещё' }))
    await ui.findByText('Стрижка')
    expect(readCustomerHistoryAction).toHaveBeenLastCalledWith(expect.objectContaining({ before: 'opaque' }), false)
    fireEvent.click(ui.getByRole('button', { name: 'Обновить' }))
    await ui.findByRole('alert')
    expect(ui.queryByText('Стрижка')).toBeNull(); expect(ui.queryByText('Ирина')).toBeNull()
  })
  it('discards a late response after opening a different profile', async () => {
    let resolve!: (value: Awaited<ReturnType<typeof readCustomerHistoryAction>>) => void
    vi.mocked(readCustomerHistoryAction).mockReturnValueOnce(new Promise(done => { resolve = done })).mockResolvedValue({ ok: true, page: { ...page, customer: { ...page.customer, name: 'Анна' }, items: [] } })
    const ui = render(<CustomerHistoryPanel tableId="clients" rowId="profile:irina" profile slug="crm" />)
    ui.rerender(<CustomerHistoryPanel tableId="clients" rowId="profile:anna" profile slug="crm" />)
    await ui.findByText('Анна')
    resolve({ ok: true, page })
    await waitFor(() => expect(ui.queryByText('Ирина')).toBeNull())
  })
  it('deduplicates contact/profile aliases across pages, searches on the server, and exposes manual create separately', async () => {
    const contact = { id: 'irina', name: 'Ирина', email: 'irina@example.invalid', phone: null, profile: false }
    vi.mocked(readCustomerDirectoryAction).mockResolvedValueOnce({ ok: true, page: { items: [contact], next: 'directory-cursor' } })
      .mockResolvedValueOnce({ ok: true, page: { items: [contact, { id: 'profile:anna', name: 'Анна', email: 'anna@example.invalid', phone: null, profile: true }], next: null } })
      .mockResolvedValue({ ok: true, page: { items: [], next: null } })
    const create = vi.fn(), open = vi.fn(), ui = render(<CustomerDirectory tableId="clients" slug="crm" onCreate={create} onOpen={open} />)
    fireEvent.click(await ui.findByRole('button', { name: 'Загрузить ещё' }))
    fireEvent.click(await ui.findByRole('button', { name: /Анна/ }))
    expect(open).toHaveBeenCalledWith('profile:anna'); expect(ui.getAllByText('Ирина')).toHaveLength(1)
    fireEvent.click(ui.getByRole('button', { name: 'Добавить клиента' })); expect(create).toHaveBeenCalled()
    fireEvent.change(ui.getByLabelText('Поиск клиента'), { target: { value: 'Анна' } })
    fireEvent.click(ui.getByRole('button', { name: 'Найти' }))
    await waitFor(() => expect(readCustomerDirectoryAction).toHaveBeenLastCalledWith({ tableId: 'clients', slug: 'crm', query: 'Анна', before: undefined }))
    await ui.findByText('По этому запросу клиентов не найдено.')
  })
})
