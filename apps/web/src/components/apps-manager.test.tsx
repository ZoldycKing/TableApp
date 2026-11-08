// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { appSchema } from '@tableapp/schema'
import { AppsManager } from './apps-manager'

const mocks = vi.hoisted(() => ({ change: vi.fn(), update: vi.fn(), publish: vi.fn(), refresh: vi.fn() }))
vi.mock('@/app/app-actions', () => ({ changeAppSlugAction: mocks.change, updateAppDraftAction: mocks.update, publishAppAction: mocks.publish, deleteAppAction: vi.fn(), unpublishAppAction: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => mocks }))
vi.mock('./app-access-settings', () => ({ AppAccessSettings: () => <label>Тест прав<input aria-label="Рабочие права" /></label> }))
afterEach(() => { cleanup(); vi.resetAllMocks() })
const app = appSchema.parse({ id: 'app-1', workspaceId: 'space', name: 'Shop', slug: 'shop', theme: {}, screens: [] })
const row = { app, publishedAt: null, origin: 'https://example.invalid' }

describe('application settings permissions and address policy', () => {
  it('distinguishes the published application from pending draft changes', () => {
    const ui = render(<AppsManager apps={[{ ...row, publishedAt: '2026-10-19T10:00:00Z', hasUnpublishedChanges: true }]} tables={[]} />)
    expect(ui.getByText('Опубликовано · есть изменения')).toBeTruthy()
    expect(ui.getByText('Пользователи видят предыдущую опубликованную версию.')).toBeTruthy()
    expect(ui.getByRole('link', { name: 'Открыть приложение' }).getAttribute('href')).toBe('/a/shop')
    expect(ui.getByRole('link', { name: 'Проверить изменения' }).getAttribute('href')).toBe('/apps/app-1')
    expect(ui.getByRole('button', { name: 'Удалить' }).closest('details')!.hasAttribute('open')).toBe(false)
    expect(mocks.publish).not.toHaveBeenCalled()
  })
  it('uses the published snapshot even when the publication date is absent', () => {
    const ui = render(<AppsManager apps={[{ ...row, published: true }]} tables={[]} />)
    expect(ui.getByText('Опубликовано')).toBeTruthy()
    expect(ui.getByRole('link', { name: 'Открыть приложение' })).toBeTruthy()
    fireEvent.click(ui.getByText('Публикация, ссылка и доступ'))
    expect(ui.getByRole('button', { name: 'Снять с публикации' })).toBeTruthy()
    expect(ui.getByRole('textbox', { name: 'Адрес' }).matches(':disabled')).toBe(true)
  })
  it('does not change the address on blur and requires the explicit save action', async () => {
    mocks.change.mockResolvedValue({ ok: true })
    const ui = render(<AppsManager apps={[row]} tables={[]} />)
    fireEvent.click(ui.getByText('Публикация, ссылка и доступ'))
    const address = ui.getByRole('textbox', { name: 'Адрес' })
    fireEvent.change(address, { target: { value: 'new-shop' } })
    fireEvent.blur(address)
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.change).not.toHaveBeenCalled()
    expect(ui.getByText('После публикации: https://example.invalid/a/new-shop')).toBeTruthy()
    fireEvent.click(ui.getByRole('button', { name: 'Сохранить адрес' }))
    await waitFor(() => expect(mocks.change).toHaveBeenCalledWith('app-1', 'new-shop', 'shop'))
  })
  it('keeps a formerly published address disabled even after unpublishing', () => {
    const ui = render(<AppsManager apps={[{ ...row, addressLocked: true }]} tables={[]} />)
    fireEvent.click(ui.getByText('Публикация, ссылка и доступ'))
    expect(ui.getByRole('textbox', { name: 'Адрес' }).matches(':disabled')).toBe(true)
    expect(ui.queryByRole('button', { name: 'Сохранить адрес' })).toBeNull()
    expect(ui.getByText(/Адрес закреплён после первой публикации/)).toBeTruthy()
  })
  it('renders viewing controls without active publication, deletion or access editing', () => {
    const ui = render(<AppsManager apps={[{ ...row, publishedAt: '2026-10-16T10:00:00Z' }]} tables={[]} canEdit={false} />)
    expect(ui.queryByRole('button', { name: /Опубликовать|Удалить|Снять с публикации/ })).toBeNull()
    fireEvent.click(ui.getByText('Публикация, ссылка и доступ'))
    expect(ui.getByRole('textbox', { name: 'Название' }).matches(':disabled')).toBe(true)
    expect(ui.getByRole('textbox', { name: 'Рабочие права' }).matches(':disabled')).toBe(true)
    expect(ui.getByRole('link', { name: 'Просмотреть настройки' })).toBeTruthy()
    expect(mocks.publish).not.toHaveBeenCalled()
  })
  it('shows a connection error without crashing or discarding the proposed address', async () => {
    mocks.change.mockRejectedValue(new Error('offline'))
    const ui = render(<AppsManager apps={[row]} tables={[]} />)
    fireEvent.click(ui.getByText('Публикация, ссылка и доступ'))
    const address = ui.getByRole('textbox', { name: 'Адрес' }) as HTMLInputElement
    fireEvent.change(address, { target: { value: 'new-shop' } })
    fireEvent.click(ui.getByRole('button', { name: 'Сохранить адрес' }))
    expect(await ui.findByText(/Не удалось связаться с сервером/)).toBeTruthy()
    expect(address.value).toBe('new-shop')
  })
})
