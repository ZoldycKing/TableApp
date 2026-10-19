// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ save: vi.fn(), refresh: vi.fn() }))
vi.mock('@/app/business-actions', () => ({ saveBusinessProfileAction: mocks.save }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))
const { BusinessSettings } = await import('./business-settings')
const profile = { name: 'Магазин', location: 'Москва', phone: '+7 900 000-00-00' }

beforeEach(() => {
  mocks.save.mockReset()
  mocks.refresh.mockReset()
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })

function attemptUnload() {
  const event = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(event)
  return event.defaultPrevented
}

function renderSettings(canEdit = true) {
  const visit = vi.fn((event: React.MouseEvent<HTMLAnchorElement>) => event.preventDefault())
  const result = render(<><BusinessSettings profile={profile} canEdit={canEdit} /><a href="/import" onClick={visit}>Загрузить файл</a></>)
  return { ...result, visit }
}

describe('business profile explicit save and navigation', () => {
  it('blocks a same-tab link when the user declines losing unsaved data', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { visit } = renderSettings()
    expect(attemptUnload()).toBe(false)
    fireEvent.change(screen.getByLabelText('Название бизнеса'), { target: { value: 'Новый магазин' } })
    expect(attemptUnload()).toBe(true)
    fireEvent.click(screen.getByRole('link', { name: 'Загрузить файл' }))
    expect(confirm).toHaveBeenCalledOnce()
    expect(visit).not.toHaveBeenCalled()
    expect((screen.getByLabelText('Название бизнеса') as HTMLInputElement).value).toBe('Новый магазин')
    expect(mocks.save).not.toHaveBeenCalled()
  })

  it('allows confirmed navigation without a second beforeunload warning', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { visit } = renderSettings()
    fireEvent.change(screen.getByLabelText('Название бизнеса'), { target: { value: 'Новый магазин' } })
    fireEvent.click(screen.getByRole('link', { name: 'Загрузить файл' }))
    expect(visit).toHaveBeenCalledOnce()
    expect(attemptUnload()).toBe(false)
    expect(mocks.save).not.toHaveBeenCalled()
  })

  it('preserves entered values and the leave guard after a network failure', async () => {
    mocks.save.mockRejectedValue(new Error('offline'))
    renderSettings()
    fireEvent.change(screen.getByLabelText('Название бизнеса'), { target: { value: 'Новый магазин' } })
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить данные бизнеса' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Введённые данные остались в форме')
    expect((screen.getByLabelText('Название бизнеса') as HTMLInputElement).value).toBe('Новый магазин')
    expect(attemptUnload()).toBe(true)
    expect(mocks.refresh).not.toHaveBeenCalled()
  })

  it('shows a server rejection and keeps the unsaved fields', async () => {
    mocks.save.mockResolvedValue({ ok: false, error: 'Нет доступа к изменению бизнеса' })
    renderSettings()
    fireEvent.change(screen.getByLabelText('Телефон бизнеса (необязательно)'), { target: { value: '12345' } })
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить данные бизнеса' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Нет доступа к изменению бизнеса')
    expect((screen.getByLabelText('Телефон бизнеса (необязательно)') as HTMLInputElement).value).toBe('12345')
    expect(attemptUnload()).toBe(true)
    expect(mocks.refresh).not.toHaveBeenCalled()
  })

  it('clears dirty only after successful real save and refreshes from persisted data', async () => {
    mocks.save.mockResolvedValue({ ok: true })
    renderSettings()
    fireEvent.change(screen.getByLabelText('Название бизнеса'), { target: { value: '  Новый магазин  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить данные бизнеса' }))
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce())
    expect(mocks.save).toHaveBeenCalledExactlyOnceWith({ ...profile, name: 'Новый магазин' })
    expect((screen.getByLabelText('Название бизнеса') as HTMLInputElement).value).toBe('Новый магазин')
    expect(screen.getByRole('status').textContent).toBe('Данные бизнеса сохранены')
    expect(attemptUnload()).toBe(false)
    expect((screen.getByRole('button', { name: 'Сохранить данные бизнеса' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('does not replace a local dirty draft when refreshed server props arrive', () => {
    const { rerender } = render(<BusinessSettings profile={profile} />)
    fireEvent.change(screen.getByLabelText('Название бизнеса'), { target: { value: 'Локальный черновик' } })
    rerender(<BusinessSettings profile={{ ...profile, name: 'Обновлено другим участником' }} />)
    expect((screen.getByLabelText('Название бизнеса') as HTMLInputElement).value).toBe('Локальный черновик')
    expect(attemptUnload()).toBe(true)
  })

  it('read-only forms cannot save or install an unsaved-data guard', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { visit } = renderSettings(false)
    const name = screen.getByLabelText('Название бизнеса') as HTMLInputElement
    expect(name.disabled).toBe(true)
    fireEvent.change(name, { target: { value: 'Попытка изменения' } })
    fireEvent.submit(name.closest('form')!)
    fireEvent.click(screen.getByRole('link', { name: 'Загрузить файл' }))
    expect(confirm).not.toHaveBeenCalled()
    expect(visit).toHaveBeenCalledOnce()
    expect(attemptUnload()).toBe(false)
    expect(mocks.save).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Сохранить данные бизнеса' })).toBeNull()
  })
})
