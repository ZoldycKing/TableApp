// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const actions = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn() }))
vi.mock('@/app/conversation-actions', () => ({ getGeneralMessageAccessAction: actions.get, setGeneralMessageAccessAction: actions.set }))
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: ReactNode } & Record<string, unknown>) => <a href={href} {...rest}>{children}</a> }))
const { GeneralMessageAccess } = await import('./general-message-access')
const OPERATORS = [{ userId: 'usr_editor', name: 'Анна Петрова', email: 'anna@example.invalid', allowed: false }]
const TITLE = 'Кто отвечает на общие вопросы'
const LABEL = 'Разрешить отвечать: Анна Петрова'

beforeEach(() => {
  actions.get.mockReset().mockResolvedValue({ ok: true, operators: OPERATORS })
  actions.set.mockReset().mockResolvedValue({ ok: true })
})
afterEach(cleanup)

async function open() {
  render(<GeneralMessageAccess />)
  fireEvent.click(screen.getByRole('button', { name: TITLE }))
  return await screen.findByRole('checkbox', { name: LABEL }) as HTMLInputElement
}

describe('owner general question permissions', () => {
  it('loads eligible participants only when expanded and explains the separate record conversation rights', async () => {
    render(<GeneralMessageAccess />)
    expect(actions.get).not.toHaveBeenCalled()
    expect(screen.queryByRole('checkbox')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: TITLE }))
    const checkbox = await screen.findByRole('checkbox', { name: LABEL }) as HTMLInputElement
    expect(actions.get).toHaveBeenCalledOnce()
    expect(checkbox.checked).toBe(false)
    expect(screen.getByText('Владельцы бизнеса и выбранные участники команды. Доступ к перепискам по заказам и записям определяется отдельно.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: TITLE }))
    expect(screen.queryByRole('checkbox')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: TITLE }))
    expect(actions.get).toHaveBeenCalledOnce()
  })

  it('changes the displayed grant only after server confirmation and blocks repeated saves while pending', async () => {
    let finish!: (result: { ok: true }) => void
    actions.set.mockImplementation(() => new Promise<{ ok: true }>(resolve => { finish = resolve }))
    const checkbox = await open()
    fireEvent.click(checkbox)
    expect(actions.set).toHaveBeenCalledExactlyOnceWith('usr_editor', true)
    expect(checkbox.checked).toBe(false)
    expect(checkbox.disabled).toBe(true)
    expect(screen.getByRole('status').textContent).toBe('Сохраняем…')
    fireEvent.click(checkbox)
    expect(actions.set).toHaveBeenCalledOnce()
    await act(async () => finish({ ok: true }))
    expect(checkbox.checked).toBe(true)
    expect(checkbox.disabled).toBe(false)
    expect(screen.getByRole('status').textContent).toBe('Анна Петрова: доступ включён.')
  })

  it('keeps a granted permission checked after a refused revocation without showing false success', async () => {
    actions.get.mockResolvedValue({ ok: true, operators: [{ ...OPERATORS[0]!, allowed: true }] })
    actions.set.mockResolvedValue({ ok: false, error: 'Участник больше не входит в этот бизнес' })
    const checkbox = await open()
    fireEvent.click(checkbox)
    await screen.findByRole('alert')
    expect(actions.set).toHaveBeenCalledExactlyOnceWith('usr_editor', false)
    expect(checkbox.checked).toBe(true)
    await waitFor(() => expect(checkbox.disabled).toBe(false))
    expect(screen.getByRole('alert').textContent).toBe('Участник больше не входит в этот бизнес')
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('keeps a rejected network save unchanged and allows retry', async () => {
    actions.set.mockRejectedValueOnce(new Error('Network unavailable'))
    const checkbox = await open()
    fireEvent.click(checkbox)
    await screen.findByRole('alert')
    expect(checkbox.checked).toBe(false)
    await waitFor(() => expect(checkbox.disabled).toBe(false))
    expect(screen.getByRole('alert').textContent).toContain('Не удалось изменить доступ')
    fireEvent.click(checkbox)
    await waitFor(() => expect(checkbox.checked).toBe(true))
    expect(actions.set).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('retries a failed operator load without pretending the eligible list is empty', async () => {
    actions.get.mockResolvedValueOnce({ ok: false, error: 'Не удалось загрузить список' })
    render(<GeneralMessageAccess />)
    fireEvent.click(screen.getByRole('button', { name: TITLE }))
    expect((await screen.findByRole('alert')).textContent).toBe('Не удалось загрузить список')
    expect(screen.queryByText('Пока нет участников с ролью редактора. Владельцы бизнеса уже могут отвечать.')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Повторить загрузку' }))
    await screen.findByRole('checkbox', { name: LABEL })
    expect(actions.get).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('states that owners already answer when the server returns no eligible editors', async () => {
    actions.get.mockResolvedValue({ ok: true, operators: [] })
    render(<GeneralMessageAccess />)
    fireEvent.click(screen.getByRole('button', { name: TITLE }))
    expect(await screen.findByText('Пока нет участников с ролью редактора. Владельцы бизнеса уже могут отвечать.')).toBeTruthy()
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(actions.set).not.toHaveBeenCalled()
    expect(screen.getByRole('link', { name: 'Открыть команду' }).getAttribute('href')).toBe('/team')
  })
})
