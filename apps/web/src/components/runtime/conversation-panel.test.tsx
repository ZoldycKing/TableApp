// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConversationPanel } from './conversation-panel'
import { GENERAL_CONVERSATION_TABLE, type ConversationPage } from '@/lib/conversation-types'

const mocks = vi.hoisted(() => ({ read: vi.fn(), send: vi.fn(), edit: vi.fn(), close: vi.fn(), history: vi.fn(), mark: vi.fn().mockResolvedValue({ ok: true }) }))
vi.mock('@/app/conversation-actions', () => ({ readConversationAction: mocks.read, sendConversationAction: mocks.send,
  changeConversationMessageAction: mocks.edit, closeConversationAction: mocks.close, conversationMessageHistoryAction: mocks.history, markConversationReadAction: mocks.mark }))
vi.mock('@/components/file-upload', () => ({
  FileUpload: () => <span>Загрузка документа</span>,
  fileUrl: (key: string, business = false) => `/api/files/${key}${business ? '?business=1' : ''}`,
  isImage: () => false,
  isAttachmentAvailable: () => true,
}))
afterEach(() => { cleanup(); vi.clearAllMocks() })
const empty: ConversationPage = { conversationId: null, enabled: true, closed: false, staff: false, canManage: false, messages: [], notes: [], nextBefore: null }
const props = { slug: 'business', tableId: 'orders', rowId: 'own-order', configured: true }
describe('conversation inside a record card', () => {
  it('offers a protected document link in a message', async () => {
    mocks.read.mockResolvedValue({ ok: true, value: { ...empty, conversationId: 'thread', messages: [{ id: 'message', sequence: 1, body: 'Документ по заказу', author: 'Client', mine: true, version: 0, createdAt: '2026-10-12T10:00:00Z', edited: false, deleted: false,
      files: [{ id: 'attachment', key: 'workspace/receipt.txt', name: 'Акт.txt', mime: 'text/plain', size: 10, width: null, height: null }], canModerate: true, canViewRevisions: true }] } })
    const ui = render(<ConversationPanel {...props} />)
    expect((await ui.findByRole('link', { name: 'Акт.txt' })).getAttribute('href')).toBe('/api/files/workspace/receipt.txt')
    await waitFor(() => expect(mocks.mark).toHaveBeenCalledWith('business', 'orders', 'own-order', 1, false))
  })
  it('uses the owner circuit explicitly on the business page', async () => {
    mocks.read.mockResolvedValue({ ok: true, value: { ...empty, staff: true, canManage: true, conversationId: 'thread' } })
    mocks.send.mockResolvedValue({ ok: true, value: { id: 'message' } })
    const ui = render(<ConversationPanel {...props} business />)
    const input = await ui.findByLabelText('Сообщение')
    expect(mocks.read).toHaveBeenCalledWith('business', 'orders', 'own-order', undefined, true)
    fireEvent.change(input, { target: { value: 'Ответ владельца' } }); fireEvent.click(ui.getByRole('button', { name: 'Отправить сообщение' }))
    await waitFor(() => expect(mocks.send).toHaveBeenCalledWith('business', 'orders', 'own-order', expect.objectContaining({ body: 'Ответ владельца' }), true))
  })
  it('keeps the message and retry UUID on failure, then rotates it after a successful send', async () => {
    mocks.read.mockResolvedValue({ ok: true, value: empty }); mocks.send.mockResolvedValueOnce({ ok: false, error: 'Повторите отправку' }).mockResolvedValue({ ok: true, value: { id: 'message' } })
    const ui = render(<ConversationPanel {...props} />)
    const input = await ui.findByLabelText('Сообщение')
    fireEvent.change(input, { target: { value: 'Вопрос про доставку' } }); fireEvent.click(ui.getByRole('button', { name: 'Отправить сообщение' }))
    await ui.findByText('Повторите отправку'); expect((input as HTMLTextAreaElement).value).toBe('Вопрос про доставку')
    fireEvent.click(ui.getByRole('button', { name: 'Отправить сообщение' }))
    await waitFor(() => expect((input as HTMLTextAreaElement).value).toBe(''))
    expect(mocks.send.mock.calls[0]![3].requestId).toBe(mocks.send.mock.calls[1]![3].requestId)
    fireEvent.change(input, { target: { value: 'Следующий вопрос' } }); fireEvent.click(ui.getByRole('button', { name: 'Отправить сообщение' }))
    await waitFor(() => expect(mocks.send).toHaveBeenCalledTimes(3))
    expect(mocks.send.mock.calls[2]![3].requestId).not.toBe(mocks.send.mock.calls[0]![3].requestId)
    expect(mocks.send.mock.calls[2]!.slice(0, 3)).toEqual(['business', 'orders', 'own-order'])
  })
  it('provides separate staff notes and keeps a closed discussion readable', async () => {
    mocks.read.mockResolvedValue({ ok: true, value: { ...empty, staff: true, canManage: true, conversationId: 'thread', notes: [{ id: 'note', body: 'Внутренняя подробность', author: 'Мастер', createdAt: '2026-10-12T10:00:00Z' }] } })
    mocks.send.mockResolvedValue({ ok: true, value: { id: 'note' } }); mocks.close.mockResolvedValue({ ok: true, value: { id: 'thread' } })
    const ui = render(<ConversationPanel {...props} />)
    await ui.findByText('Внутренняя подробность'); fireEvent.click(ui.getByLabelText('Внутренняя заметка — только сотрудникам'))
    fireEvent.change(ui.getByLabelText('Заметка'), { target: { value: 'Служебное уточнение' } }); fireEvent.click(ui.getByRole('button', { name: 'Сохранить заметку' }))
    await waitFor(() => expect(mocks.send).toHaveBeenCalledWith('business', 'orders', 'own-order', expect.objectContaining({ internal: true, fileIds: [] }), false))
    mocks.read.mockResolvedValue({ ok: true, value: { ...empty, closed: true, conversationId: 'thread', staff: true, canManage: true } })
    fireEvent.click(ui.getByRole('button', { name: 'Завершить обсуждение' }))
    await ui.findByText('Обсуждение завершено. Сообщения и документы сохранены в истории.')
    expect(ui.queryByRole('button', { name: 'Отправить сообщение' })).toBeNull()
    expect(ui.getByRole('button', { name: 'Возобновить обсуждение' })).toBeTruthy()
  })
  it('hides loaded content on access revocation and clears drafts when opening another record', async () => {
    mocks.read.mockResolvedValueOnce({ ok: true, value: { ...empty, conversationId: 'thread', messages: [{ id: 'message', sequence: 1, body: 'Доступная история', author: 'Client', mine: true, version: 0, createdAt: '2026-10-12T10:00:00Z', edited: false, deleted: false, files: [], canModerate: true, canViewRevisions: true }] } })
      .mockResolvedValue({ ok: false, error: 'Переписка недоступна' })
    mocks.edit.mockResolvedValue({ ok: true, value: { id: 'message' } })
    const ui = render(<ConversationPanel {...props} />)
    await ui.findByText('Доступная история'); fireEvent.click(ui.getByRole('button', { name: 'Изменить' }))
    fireEvent.change(ui.getByLabelText('Новый текст сообщения'), { target: { value: 'Изменённый текст' } }); fireEvent.click(ui.getByRole('button', { name: 'Сохранить правку' }))
    await ui.findByText('Переписка недоступна'); expect(ui.queryByText('Доступная история')).toBeNull()
    mocks.read.mockResolvedValue({ ok: true, value: empty }); ui.rerender(<ConversationPanel {...props} rowId="another-order" />)
    expect((await ui.findByLabelText('Сообщение') as HTMLTextAreaElement).value).toBe('')
  })
  it('uses general question copy and the protected general target while retaining message tools', async () => {
    mocks.read.mockResolvedValue({ ok: true, value: empty })
    mocks.send.mockResolvedValue({ ok: true, value: { id: 'question' } })
    const ui = render(<ConversationPanel slug="salon" tableId={GENERAL_CONVERSATION_TABLE} rowId="self" configured />)
    await ui.findByLabelText('Сообщение')
    expect(ui.getByRole('region', { name: 'Вопрос бизнесу' })).toBeTruthy()
    expect(ui.getByRole('heading', { name: 'Вопрос бизнесу' })).toBeTruthy()
    expect(ui.queryByText(/относятся к этому обращению/)).toBeNull()
    expect(ui.getByText('Загрузка документа')).toBeTruthy()
    fireEvent.change(ui.getByLabelText('Сообщение'), { target: { value: 'Вы открыты в воскресенье?' } })
    fireEvent.click(ui.getByRole('button', { name: 'Отправить сообщение' }))
    await waitFor(() => expect(mocks.send).toHaveBeenCalledWith('salon', GENERAL_CONVERSATION_TABLE, 'self', expect.objectContaining({ body: 'Вы открыты в воскресенье?', internal: false }), false))
  })
  it('lets a client resume a closed general conversation with a new message', async () => {
    mocks.read.mockResolvedValueOnce({ ok: true, value: { ...empty, conversationId: 'question', closed: true } })
      .mockResolvedValue({ ok: true, value: { ...empty, conversationId: 'question' } })
    mocks.send.mockResolvedValue({ ok: true, value: { id: 'follow-up' } })
    const ui = render(<ConversationPanel slug="salon" tableId={GENERAL_CONVERSATION_TABLE} rowId="self" configured />)
    await ui.findByText('Предыдущий вопрос закрыт. Новое сообщение возобновит переписку.')
    expect(ui.queryByRole('button', { name: 'Возобновить обсуждение' })).toBeNull()
    fireEvent.change(ui.getByLabelText('Сообщение'), { target: { value: 'И ещё вопрос: можно перенести визит?' } })
    fireEvent.click(ui.getByRole('button', { name: 'Отправить сообщение' }))
    await waitFor(() => expect(mocks.send).toHaveBeenCalledWith('salon', GENERAL_CONVERSATION_TABLE, 'self', expect.objectContaining({ body: 'И ещё вопрос: можно перенести визит?' }), false))
    await waitFor(() => expect(ui.queryByText('Предыдущий вопрос закрыт. Новое сообщение возобновит переписку.')).toBeNull())
    expect(mocks.close).not.toHaveBeenCalled()
  })
  it('keeps a general client dialog readable without a composer when the business disables messages', async () => {
    mocks.read.mockResolvedValue({ ok: true, value: { ...empty, conversationId: 'question', enabled: false } })
    const ui = render(<ConversationPanel slug="salon" tableId={GENERAL_CONVERSATION_TABLE} rowId="self" configured />)
    await ui.findByText('Бизнес пока не принимает новые сообщения. История переписки сохранена.')
    expect(ui.queryByLabelText('Сообщение')).toBeNull()
    expect(ui.queryByRole('button', { name: 'Отправить сообщение' })).toBeNull()
    ui.rerender(<ConversationPanel {...props} />)
    expect(await ui.findByLabelText('Сообщение')).toBeTruthy()
  })
})
