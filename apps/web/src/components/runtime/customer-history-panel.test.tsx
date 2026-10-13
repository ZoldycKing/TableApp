// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CustomerHistoryPanel } from './customer-history-panel'
import { CustomerDirectory } from './customer-directory'
import { readCustomerDirectoryAction, readCustomerHistoryAction } from '@/app/customer-history-actions'
import { listConversationInboxAction } from '@/app/conversation-actions'
import { CustomerMessages } from './customer-messages'
import type { CustomerHistoryPage } from '@/lib/customer-history-types'
vi.mock('@/app/customer-history-actions', () => ({ readCustomerDirectoryAction: vi.fn(), readCustomerHistoryAction: vi.fn() }))
vi.mock('@/app/conversation-actions', () => ({ listConversationInboxAction: vi.fn() }))
vi.mock('./conversation-panel', () => ({ ConversationPanel: () => <p>Чат клиента</p> }))
afterEach(() => { cleanup(); vi.resetAllMocks() })
const page: CustomerHistoryPage = { customer: { name: 'Ирина', email: 'irina@example.invalid', phone: '+7 900 000-00-00' }, next: null,
  kinds: [{ id: 'booking', name: 'Запись на услуги' }, { id: 'sales', name: 'Каталог и заказы' }],
  items: [{ id: 'visit', tableId: 'visits', slug: 'salon', screenId: 'visit-detail', title: 'Стрижка', module: 'Запись на услуги', kind: 'booking', status: 'Завершено', when: '13.10.2026, 10:00' }] }
const thread = { id: 'chat', slug: 'salon', tableId: 'visits', rowId: 'visit', title: 'Вопрос по записи', customer: 'Ирина', appName: 'Салон', detailScreenId: 'visit-detail', preview: 'Можно прийти на десять минут раньше?', lastAt: '2026-10-13T10:00:00Z', unread: 1, closed: false }

describe('customer history interface', () => {
  it('separates bookings from messages, loads only this customer’s messages on demand and opens the existing chat', async () => {
    vi.mocked(readCustomerHistoryAction).mockResolvedValue({ ok: true, page: { ...page, kinds: page.kinds.slice(0, 1) } })
    vi.mocked(listConversationInboxAction).mockResolvedValue({ ok: true, value: { items: [thread], next: null } })
    const open = vi.fn(), ui = render(<CustomerHistoryPanel tableId="clients" rowId="profile:irina" slug="salon" profile onOpenMessage={open} />)
    await ui.findByRole('button', { name: 'Записи' })
    expect(readCustomerHistoryAction).toHaveBeenCalledWith(expect.objectContaining({ ordersOnly: true }), false)
    expect(ui.queryByLabelText('Тип обращения')).toBeNull()
    expect(listConversationInboxAction).not.toHaveBeenCalled()
    fireEvent.click(ui.getByRole('button', { name: 'Обращения' }))
    fireEvent.click(await ui.findByRole('button', { name: 'Открыть чат: Вопрос по записи' }))
    expect(listConversationInboxAction).toHaveBeenCalledWith({ slug: 'salon', customer: { tableId: 'clients', rowId: 'profile:irina' }, before: undefined }, false)
    expect(open).toHaveBeenCalledWith(thread)
    fireEvent.click(ui.getByRole('button', { name: 'Записи' }))
    expect(ui.getByRole('button', { name: 'Стрижка' })).toBeTruthy()
    expect(ui.queryByText(thread.preview)).toBeNull()
  })
  it('discards late messages when a different customer is opened', async () => {
    let resolve!: (value: Awaited<ReturnType<typeof listConversationInboxAction>>) => void
    vi.mocked(listConversationInboxAction).mockReturnValueOnce(new Promise(done => { resolve = done })).mockResolvedValue({ ok: true, value: { items: [], next: null } })
    const ui = render(<CustomerMessages tableId="clients" rowId="profile:irina" slug="salon" business={false} />)
    ui.rerender(<CustomerMessages tableId="clients" rowId="profile:anna" slug="salon" business={false} />)
    await ui.findByText('Клиент пока не писал.')
    resolve({ ok: true, value: { items: [thread], next: null } })
    await waitFor(() => expect(ui.queryByText(thread.preview)).toBeNull())
  })
  it('keeps message pagination through hidden pages and clears loaded previews when access fails', async () => {
    vi.mocked(listConversationInboxAction).mockResolvedValueOnce({ ok: true, value: { items: [], next: 'page-2' } }).mockResolvedValueOnce({ ok: true, value: { items: [thread], next: 'page-3' } }).mockResolvedValueOnce({ ok: false, error: 'Сообщения недоступны' })
    const ui = render(<CustomerMessages tableId="clients" rowId="profile:irina" slug="salon" business={false} />)
    fireEvent.click(await ui.findByRole('button', { name: 'Загрузить ещё обращения' }))
    await ui.findByText(thread.preview)
    fireEvent.click(ui.getByRole('button', { name: 'Загрузить ещё обращения' }))
    await ui.findByRole('alert')
    expect(ui.queryByText(thread.preview)).toBeNull()
  })
  it('shows a failed page load even when a chat was opened while that request was pending', async () => {
    let reject!: (error: Error) => void
    vi.mocked(listConversationInboxAction).mockResolvedValueOnce({ ok: true, value: { items: [thread], next: 'page-2' } }).mockReturnValueOnce(new Promise((_resolve, fail) => { reject = fail }))
    const ui = render(<CustomerMessages tableId="clients" rowId="profile:irina" slug="salon" business={false} />)
    fireEvent.click(await ui.findByRole('button', { name: 'Загрузить ещё обращения' }))
    fireEvent.click(ui.getByRole('button', { name: 'Открыть чат: Вопрос по записи' }))
    expect(ui.getByText('Чат клиента')).toBeTruthy()
    reject(new Error('Connection failed'))
    await ui.findByRole('alert')
    expect(ui.queryByText('Чат клиента')).toBeNull()
    expect(ui.queryByText(thread.preview)).toBeNull()
  })
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
