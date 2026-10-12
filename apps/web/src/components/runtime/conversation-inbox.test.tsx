// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConversationInbox, parseConversationTarget } from './conversation-inbox'
import type { ConversationSummary } from '@/lib/conversation-types'

const list = vi.hoisted(() => vi.fn())
vi.mock('@/app/conversation-actions', () => ({ listConversationInboxAction: list }))
vi.mock('./conversation-panel', () => ({ ConversationPanel: ({ slug, rowId, business }: { slug: string; rowId: string; business: boolean }) => <p>{slug}:{rowId}:{business ? 'business' : 'client'}</p> }))
afterEach(() => { cleanup(); vi.resetAllMocks() })
const item: ConversationSummary = { id: 'thread', slug: 'salon', tableId: 'visits', rowId: 'visit', title: 'Стрижка · 15 октября', customer: 'Анна', appName: 'Салон', detailScreenId: 'visit-details', preview: 'Как подготовиться?', lastAt: '2026-10-13T10:00:00Z', unread: 2, closed: false }
describe('business and client inbox', () => {
  it('opens the same scoped conversation and its parent, with a mobile return to the list', async () => {
    list.mockResolvedValue({ ok: true, value: { items: [item], next: null } })
    const open = vi.fn(), ui = render(<ConversationInbox slug="salon" onOpenRecord={open} />)
    fireEvent.click(await ui.findByRole('button', { name: /Анна/ }))
    expect(ui.getByText('salon:visit:client')).toBeTruthy()
    expect(ui.getByLabelText('Непрочитанных сообщений: 2')).toBeTruthy()
    fireEvent.click(ui.getByRole('button', { name: 'Открыть обращение' })); expect(open).toHaveBeenCalledWith(item)
    fireEvent.click(ui.getByRole('button', { name: 'Все диалоги' })); expect(ui.queryByText('salon:visit:client')).toBeNull()
  })
  it('passes the platform identity explicitly and applies the unread filter on the server', async () => {
    list.mockResolvedValue({ ok: true, value: { items: [item], next: null } })
    const ui = render(<ConversationInbox business />)
    await ui.findByRole('button', { name: /Анна/ })
    expect(list).toHaveBeenCalledWith(expect.objectContaining({ unreadOnly: false }), true)
    fireEvent.click(ui.getByLabelText('Только непрочитанные'))
    await waitFor(() => expect(list).toHaveBeenCalledWith(expect.objectContaining({ unreadOnly: true }), true))
  })
  it('clears formerly loaded conversation metadata after access is revoked', async () => {
    list.mockResolvedValueOnce({ ok: true, value: { items: [item], next: null } }).mockResolvedValue({ ok: false, error: 'Доступ отозван' })
    const ui = render(<ConversationInbox business />)
    fireEvent.click(await ui.findByRole('button', { name: /Анна/ }))
    window.dispatchEvent(new Event('tableapp:messages-read'))
    await ui.findByRole('alert')
    expect(ui.queryByText('salon:visit:business')).toBeNull(); expect(ui.queryByText('Анна')).toBeNull()
  })
  it('rejects malformed navigation targets', () => {
    expect(parseConversationTarget('null')).toBeNull(); expect(parseConversationTarget('{"slug":[]}')).toBeNull()
    expect(parseConversationTarget(JSON.stringify({ slug: 'salon', tableId: 'visits', rowId: 'visit' }))).toEqual({ slug: 'salon', tableId: 'visits', rowId: 'visit' })
  })
  it('updates the selected record shortcut and returns to the list through the top-level tab', async () => {
    list.mockResolvedValue({ ok: true, value: { items: [item], next: null } })
    const ui = render(<ConversationInbox slug="salon" initialTarget={item} />)
    await ui.findByText('salon:visit:client')
    ui.rerender(<ConversationInbox slug="salon" initialTarget={{ ...item, rowId: 'another-visit' }} />)
    await ui.findByText('salon:another-visit:client')
    ui.rerender(<ConversationInbox slug="salon" />)
    await waitFor(() => expect(ui.queryByText('salon:another-visit:client')).toBeNull())
  })
})
