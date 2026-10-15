// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const actions = vi.hoisted(() => ({ request: vi.fn(), consume: vi.fn(), push: vi.fn() }))
vi.mock('@/app/auth-actions', () => ({ requestAppLoginAction: actions.request, consumeAppCodeAction: actions.consume }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: actions.push }) }))
vi.mock('@/components/resend-code', () => ({ ResendCode: ({ busy, onResend }: { busy: boolean; onResend: () => Promise<unknown> }) => <button type="button" disabled={busy} onClick={() => void onResend()}>Повторить код</button> }))
const { AppLogin } = await import('./app-login')

beforeEach(() => {
  actions.request.mockReset().mockResolvedValue({ ok: true, delivered: true, hint: null, via: 'sent' })
  actions.consume.mockReset().mockResolvedValue({ ok: true })
  actions.push.mockReset()
})
afterEach(cleanup)

async function requestCode() {
  fireEvent.change(screen.getByRole('textbox', { name: 'Ваша почта' }), { target: { value: 'new@example.invalid' } })
  fireEvent.click(screen.getByRole('button', { name: 'Получить код' }))
  await screen.findByRole('textbox', { name: 'Код из письма' })
}

describe('question login copy and explicit purpose', () => {
  it('uses the question intent on first request and resend, then returns to the question without creating an order', async () => {
    const onDone = vi.fn(), onCancel = vi.fn()
    render(<AppLogin slug="salon" appName="Салон" accent="blue" initialError={null} purpose="question" onDone={onDone} onCancel={onCancel} />)
    expect(screen.getByRole('heading').textContent).toBe('Написать бизнесу')
    expect(screen.queryByText(/данные для заказа/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Вернуться к вопросу' }))
    expect(onCancel).toHaveBeenCalledOnce()
    await requestCode()
    expect(actions.request).toHaveBeenCalledExactlyOnceWith('salon', 'new@example.invalid', 'question')
    expect(screen.queryByText(/Заказ пока не создан/)).toBeNull()
    expect(screen.getByText(/После подтверждения сможете написать вопрос бизнесу/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Повторить код' }))
    await waitFor(() => expect(actions.request).toHaveBeenCalledTimes(2))
    expect(actions.request).toHaveBeenLastCalledWith('salon', 'new@example.invalid', 'question')
    fireEvent.change(screen.getByRole('textbox', { name: 'Код из письма' }), { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: 'Подтвердить и написать' }))
    expect((await screen.findByRole('status')).textContent).toBe('Почта подтверждена. Возвращаемся к вопросу…')
    expect(actions.consume).toHaveBeenCalledExactlyOnceWith('salon', '123456')
    expect(onDone).toHaveBeenCalledOnce()
    expect(actions.push).not.toHaveBeenCalled()
  })

  it('keeps the original checkout purpose, explanation and cancellation label', async () => {
    render(<AppLogin slug="shop" appName="Магазин" accent="blue" initialError={null} onDone={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByRole('heading').textContent).toBe('Подтвердите почту')
    expect(screen.getByRole('button', { name: 'Вернуться к выбору' })).toBeTruthy()
    await requestCode()
    expect(actions.request).toHaveBeenCalledExactlyOnceWith('shop', 'new@example.invalid')
    expect(screen.getByText(/Заказ пока не создан/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Подтвердить и продолжить' })).toBeTruthy()
  })
})
