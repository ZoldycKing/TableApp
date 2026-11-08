// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EmptyAccount } from './empty-account'

const mocks = vi.hoisted(() => ({ create: vi.fn(), signOut: vi.fn(), navigate: vi.fn() }))
vi.mock('@/app/business-navigation-actions', () => ({ createBusinessAction: mocks.create }))
vi.mock('@/app/auth-actions', () => ({ signOutMemberAction: mocks.signOut }))
const originalWindow = window
beforeEach(() => {
  sessionStorage.clear(); vi.clearAllMocks()
  mocks.create.mockResolvedValue({ ok: true, href: '/app', workspaceId: 'wsp_new' })
  vi.stubGlobal('window', new Proxy(originalWindow, { get(target, key) { return key === 'location' ? { assign: mocks.navigate } : Reflect.get(target, key, target) } }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('first workspace start', () => {
  it.each([['Загрузить таблицу', 'Продолжить к загрузке', '/import'], ['Выбрать шаблон', 'Продолжить к шаблонам', '/templates'], ['Создать пустую таблицу', 'Продолжить к таблицам', '/tables']])('keeps the selected route: %s', async (choice, submit, href) => {
    const ui = render(<EmptyAccount email="owner@example.invalid" />)
    expect(ui.queryByRole('textbox')).toBeNull()
    fireEvent.click(ui.getByRole('button', { name: choice }))
    expect(mocks.create).not.toHaveBeenCalled()
    const input = ui.getByRole('textbox', { name: 'Название рабочего пространства' })
    expect(document.activeElement).toBe(input)
    fireEvent.change(input, { target: { value: 'Моя команда' } })
    fireEvent.click(ui.getByRole('button', { name: submit }))
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith(href))
    expect(mocks.create).toHaveBeenCalledWith('Моя команда')
    expect(sessionStorage.getItem('tableapp:first-space:owner@example.invalid')).toBeNull()
  })
  it('preserves the name through back, a new route and reload, scoped to the account', () => {
    const ui = render(<EmptyAccount email="owner@example.invalid" />)
    fireEvent.click(ui.getByRole('button', { name: 'Загрузить таблицу' }))
    fireEvent.change(ui.getByRole('textbox'), { target: { value: 'Личные проекты' } })
    fireEvent.click(ui.getByRole('button', { name: 'Назад' }))
    expect(document.activeElement?.textContent).toBe('Загрузить таблицу')
    fireEvent.click(ui.getByRole('button', { name: 'Выбрать шаблон' }))
    ui.unmount()
    const restored = render(<EmptyAccount email="owner@example.invalid" />)
    expect((restored.getByRole('textbox') as HTMLInputElement).value).toBe('Личные проекты')
    expect(restored.getByRole('button', { name: 'Продолжить к шаблонам' })).toBeTruthy()
    restored.unmount()
    const other = render(<EmptyAccount email="other@example.invalid" />)
    expect(other.queryByRole('textbox')).toBeNull()
    expect(mocks.create).not.toHaveBeenCalled()
  })
  it('retains input and intent after a server rejection, then retries the same route', async () => {
    mocks.create.mockResolvedValueOnce({ ok: false, error: 'Соединение прервано' })
    const ui = render(<EmptyAccount email="owner@example.invalid" />)
    fireEvent.click(ui.getByRole('button', { name: 'Выбрать шаблон' }))
    fireEvent.change(ui.getByRole('textbox'), { target: { value: 'Проекты' } })
    fireEvent.click(ui.getByRole('button', { name: 'Продолжить к шаблонам' }))
    expect((await ui.findByRole('alert')).textContent).toBe('Соединение прервано')
    expect((ui.getByRole('textbox') as HTMLInputElement).value).toBe('Проекты')
    expect(mocks.navigate).not.toHaveBeenCalled()
    fireEvent.click(ui.getByRole('button', { name: 'Продолжить к шаблонам' }))
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith('/templates'))
  })
  it('allows only one creation while a request is pending', async () => {
    let finish!: (result: unknown) => void
    mocks.create.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const ui = render(<EmptyAccount email="owner@example.invalid" />)
    fireEvent.click(ui.getByRole('button', { name: 'Загрузить таблицу' }))
    fireEvent.change(ui.getByRole('textbox'), { target: { value: 'Команда' } })
    const button = ui.getByRole('button', { name: 'Продолжить к загрузке' })
    fireEvent.click(button); fireEvent.click(button)
    expect(mocks.create).toHaveBeenCalledOnce()
    await act(async () => finish({ ok: true, href: '/app' }))
    expect(mocks.navigate).toHaveBeenCalledOnce()
  })
})
