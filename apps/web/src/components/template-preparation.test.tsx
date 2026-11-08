// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TemplatePreparation } from './template-preparation'

const mocks = vi.hoisted(() => ({ clear: vi.fn(), refresh: vi.fn() }))
vi.mock('@/app/template-actions', () => ({ clearTemplateSamplesAction: mocks.clear }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))
beforeEach(() => { vi.clearAllMocks(); mocks.clear.mockResolvedValue({ ok: true }) })
afterEach(cleanup)
describe('starting with your own template data', () => {
  it('explains the recoverable app boundary and permits leaving the examples', () => {
    render(<TemplatePreparation appId="app" sampleCount={13} canEdit />)
    fireEvent.click(screen.getByRole('button', { name: 'Начать со своих данных' }))
    expect(screen.getByText(/Убрать учебные примеры/).textContent).toContain('Ваши записи')
    expect(screen.getByText(/Убрать учебные примеры/).textContent).toContain('восстановить')
    expect(mocks.clear).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Оставить примеры' }))
    expect(screen.queryByRole('button', { name: 'Убрать примеры' })).toBeNull()
  })
  it('locks double clicks, then confirms the next action without leaving setup', async () => {
    let finish!: (result: { ok: true }) => void
    mocks.clear.mockReturnValue(new Promise(resolve => { finish = resolve }))
    render(<TemplatePreparation appId="app" sampleCount={13} canEdit />)
    fireEvent.click(screen.getByRole('button', { name: 'Начать со своих данных' }))
    const button = screen.getByRole('button', { name: 'Убрать примеры' })
    fireEvent.click(button); fireEvent.click(button)
    expect(mocks.clear).toHaveBeenCalledExactlyOnceWith('app')
    finish({ ok: true })
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Добавьте свои данные'))
    expect(mocks.refresh).toHaveBeenCalledOnce()
  })
  it('keeps a failed action retryable and offers no deletion to a viewer', async () => {
    mocks.clear.mockResolvedValueOnce({ ok: false, error: 'Связи изменились. Повторите действие.' })
    const view = render(<TemplatePreparation appId="app" sampleCount={13} canEdit />)
    fireEvent.click(screen.getByRole('button', { name: 'Начать со своих данных' }))
    fireEvent.click(screen.getByRole('button', { name: 'Убрать примеры' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Связи изменились'))
    fireEvent.click(screen.getByRole('button', { name: 'Убрать примеры' }))
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce())
    view.unmount()
    render(<TemplatePreparation appId="app" sampleCount={13} canEdit={false} />)
    expect(screen.queryByRole('button')).toBeNull()
  })
})
