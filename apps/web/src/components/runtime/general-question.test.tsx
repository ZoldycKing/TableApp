// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GENERAL_CONVERSATION_TABLE } from '@/lib/conversation-types'
import { GeneralQuestion } from './general-question'

const send = vi.hoisted(() => vi.fn())
vi.mock('@/app/conversation-actions', () => ({ sendConversationAction: send }))
afterEach(() => { cleanup(); vi.resetAllMocks() })

function show(authenticated = true) {
  const onLogin = vi.fn(), onSent = vi.fn(), onCancel = vi.fn(), changes = vi.fn()
  function Form({ signedIn }: { signedIn: boolean }) {
    const [body, setBody] = useState('')
    return <GeneralQuestion slug="salon" businessName="Студия «Лилия»" authenticated={signedIn} body={body} onBodyChange={value => { changes(value); setBody(value) }} requestId="question-retry-key" onLogin={onLogin} onSent={onSent} onCancel={onCancel} />
  }
  const ui = render(<Form signedIn={authenticated} />)
  return { ...ui, onLogin, onSent, onCancel, changes, authenticate: () => ui.rerender(<Form signedIn />) }
}

describe('general question form', () => {
  it('does not create a conversation on open or login and requires an explicit send after verification', async () => {
    const ui = show(false)
    expect(send).not.toHaveBeenCalled()
    const input = ui.getByRole('textbox', { name: 'Ваш вопрос' })
    fireEvent.change(input, { target: { value: 'Есть ли парковка рядом?' } })
    fireEvent.click(ui.getByRole('button', { name: 'Задать вопрос' }))
    expect(ui.onLogin).toHaveBeenCalledOnce()
    expect(send).not.toHaveBeenCalled()
    ui.authenticate()
    expect((ui.getByRole('textbox') as HTMLTextAreaElement).value).toBe('Есть ли парковка рядом?')
    expect(send).not.toHaveBeenCalled()
    send.mockResolvedValue({ ok: true, value: { id: 'message' } })
    fireEvent.click(ui.getByRole('button', { name: 'Отправить вопрос' }))
    await waitFor(() => expect(ui.onSent).toHaveBeenCalledWith({ slug: 'salon', tableId: GENERAL_CONVERSATION_TABLE, rowId: 'self' }))
    expect(send).toHaveBeenCalledWith('salon', GENERAL_CONVERSATION_TABLE, 'self', { body: 'Есть ли парковка рядом?', requestId: 'question-retry-key' }, false)
  })
  it('retains the controlled draft and request key after a failed send, then retries without duplication', async () => {
    send.mockResolvedValueOnce({ ok: false, error: 'Связь прервалась' }).mockResolvedValue({ ok: true, value: { id: 'message' } })
    const ui = show()
    fireEvent.change(ui.getByRole('textbox'), { target: { value: 'Можно прийти с ребёнком?' } })
    fireEvent.click(ui.getByRole('button', { name: 'Отправить вопрос' }))
    await ui.findByRole('alert')
    expect((ui.getByRole('textbox') as HTMLTextAreaElement).value).toBe('Можно прийти с ребёнком?')
    expect(ui.onSent).not.toHaveBeenCalled()
    fireEvent.click(ui.getByRole('button', { name: 'Отправить вопрос' }))
    await waitFor(() => expect(ui.onSent).toHaveBeenCalledOnce())
    expect(send.mock.calls[0]).toEqual(send.mock.calls[1])
  })
  it('prevents duplicate pending sends and leaves an empty question unsent', async () => {
    let finish!: (value: { ok: false; error: string }) => void
    send.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const ui = show()
    expect(ui.getByRole('button', { name: 'Отправить вопрос' }).hasAttribute('disabled')).toBe(true)
    fireEvent.change(ui.getByRole('textbox'), { target: { value: 'Во сколько вы закрываетесь?' } })
    const form = ui.getByRole('textbox').closest('form')!
    fireEvent.submit(form)
    fireEvent.submit(form)
    expect(send).toHaveBeenCalledOnce()
    expect(ui.getByRole('textbox').hasAttribute('disabled')).toBe(true)
    await act(async () => finish({ ok: false, error: 'Не отправлено' }))
    fireEvent.click(ui.getByRole('button', { name: 'Отмена' }))
    expect(ui.onCancel).toHaveBeenCalledOnce()
  })
})
