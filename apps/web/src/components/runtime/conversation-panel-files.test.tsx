// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import type { Attachment } from '@tableapp/schema'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConversationPanel } from './conversation-panel'
import type { ConversationPage } from '@/lib/conversation-types'

const mocks = vi.hoisted(() => ({ read: vi.fn(), send: vi.fn(), mark: vi.fn() }))
vi.mock('@/app/conversation-actions', () => ({ readConversationAction: mocks.read, sendConversationAction: mocks.send,
  changeConversationMessageAction: vi.fn(), closeConversationAction: vi.fn(), conversationMessageHistoryAction: vi.fn(), markConversationReadAction: mocks.mark }))
const page: ConversationPage = { conversationId: 'thread', enabled: true, closed: false, staff: false, canManage: false, messages: [], notes: [], nextBefore: null }
const props = { slug: 'business', tableId: 'orders', rowId: 'order-a', configured: true }
const attachment = (id: string): Attachment => ({ id, key: `workspace/${id}.txt`, name: `${id}.txt`, mime: 'text/plain', size: 1, width: null, height: null })
const response = (id: string) => ({ json: async () => ({ ok: true, attachment: attachment(id) }) }) as Response
const pick = (container: HTMLElement, id: string) => fireEvent.change(container.querySelector<HTMLInputElement>('input[type="file"]')!, { target: { files: [new File(['x'], `${id}.txt`, { type: 'text/plain' })] } })
beforeEach(() => { mocks.read.mockResolvedValue({ ok: true, value: page }); mocks.mark.mockResolvedValue({ ok: true }) })
afterEach(() => { cleanup(); vi.resetAllMocks(); vi.unstubAllGlobals() })

describe('conversation attachment and message coordination', () => {
  it('locks attachment controls during sending and keeps sent files out of the next message', async () => {
    let finish!: (value: { ok: true }) => void
    const fetch = vi.fn().mockResolvedValueOnce(response('a')).mockResolvedValueOnce(response('b'))
    vi.stubGlobal('fetch', fetch)
    mocks.send.mockImplementationOnce(() => new Promise(resolve => { finish = resolve })).mockResolvedValue({ ok: true })
    const ui = render(<ConversationPanel {...props} />)
    await ui.findByLabelText('Сообщение')
    pick(ui.container, 'a')
    await ui.findByRole('link', { name: /a\.txt/ })
    fireEvent.click(ui.getByRole('button', { name: 'Отправить сообщение' }))
    await waitFor(() => expect(mocks.send).toHaveBeenCalledOnce())
    expect(ui.getByRole('button', { name: 'Прикрепить файл' }).hasAttribute('disabled')).toBe(true)
    expect(ui.getByTitle('Убрать файл').hasAttribute('disabled')).toBe(true)
    pick(ui.container, 'during-send')
    expect(fetch).toHaveBeenCalledOnce()
    await act(async () => { finish({ ok: true }) })
    expect(ui.queryByRole('link', { name: /a\.txt/ })).toBeNull()
    pick(ui.container, 'b')
    await ui.findByRole('link', { name: /b\.txt/ })
    fireEvent.click(ui.getByRole('button', { name: 'Отправить сообщение' }))
    await waitFor(() => expect(mocks.send).toHaveBeenCalledTimes(2))
    expect(mocks.send.mock.calls[0]![3].fileIds).toEqual(['a'])
    expect(mocks.send.mock.calls[1]![3].fileIds).toEqual(['b'])
  })

  it('does not submit a message while its attachment is still uploading', async () => {
    let finish!: (value: Response) => void
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { finish = resolve })))
    mocks.send.mockResolvedValue({ ok: true })
    const ui = render(<ConversationPanel {...props} />)
    const text = await ui.findByLabelText('Сообщение')
    fireEvent.change(text, { target: { value: 'Документ в приложении' } })
    pick(ui.container, 'a')
    fireEvent.submit(text.closest('form')!)
    expect(mocks.send).not.toHaveBeenCalled()
    await act(async () => { finish(response('a')) })
    fireEvent.click(ui.getByRole('button', { name: 'Отправить сообщение' }))
    await waitFor(() => expect(mocks.send).toHaveBeenCalledOnce())
    expect(mocks.send.mock.calls[0]![3].fileIds).toEqual(['a'])
  })

  it('ignores completion of a previous record send after another record draft is started', async () => {
    let finish!: (value: { ok: true }) => void
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response('new-record')))
    mocks.send.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const ui = render(<ConversationPanel {...props} />)
    fireEvent.change(await ui.findByLabelText('Сообщение'), { target: { value: 'Старый вопрос' } })
    fireEvent.click(ui.getByRole('button', { name: 'Отправить сообщение' }))
    await waitFor(() => expect(mocks.send).toHaveBeenCalledOnce())
    ui.rerender(<ConversationPanel {...props} rowId="order-b" />)
    const text = await ui.findByLabelText('Сообщение')
    fireEvent.change(text, { target: { value: 'Новый вопрос' } })
    pick(ui.container, 'new-record')
    await ui.findByRole('link', { name: /new-record\.txt/ })
    await act(async () => { finish({ ok: true }) })
    expect(ui.getByLabelText('Сообщение')).toHaveProperty('value', 'Новый вопрос')
    expect(ui.getByRole('link', { name: /new-record\.txt/ })).toBeTruthy()
  })
})
