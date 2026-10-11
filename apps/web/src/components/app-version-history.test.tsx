// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppVersionHistory } from './app-version-history'
import { clearUnsaved, markUnsaved } from '@/lib/unsaved'

const mocks = vi.hoisted(() => ({ list: vi.fn(), preview: vi.fn(), restore: vi.fn(), refresh: vi.fn() }))
vi.mock('@/app/app-version-actions', () => ({ listAppVersionsAction: mocks.list, previewAppRestoreAction: mocks.preview, restoreAppVersionAction: mocks.restore }))
vi.mock('next/navigation', () => ({ useRouter: () => mocks }))
afterEach(() => { cleanup(); clearUnsaved('history-test'); vi.resetAllMocks() })
const version = { id: 'version-1', number: 1, kind: 'published', createdAt: '2026-10-12T10:00:00Z' }
async function open() {
  mocks.list.mockResolvedValue({ ok: true, versions: [version], hasMore: false })
  const ui = render(<AppVersionHistory appId="app-1" canRestore revision="initial" />)
  fireEvent.click(ui.getByRole('button', { name: /История настроек/ }))
  await ui.findByText('Версия 1 · Публикация')
  await waitFor(() => expect(ui.getByRole('button', { name: 'Посмотреть изменения' }).hasAttribute('disabled')).toBe(false))
  return ui
}
describe('configuration history review', () => {
  it('shows concrete changes before restoring and blocks restoration while the editor is saving', async () => {
    mocks.preview.mockResolvedValue({ ok: true, expectedHash: 'digest', version: 1, name: 'Salon', screenCount: 1, screens: ['Catalog'], intake: [], changes: ['Название: «New» → «Salon»'], unchanged: false })
    mocks.restore.mockResolvedValue({ ok: true })
    const ui = await open()
    fireEvent.click(ui.getByRole('button', { name: 'Посмотреть изменения' }))
    expect(await ui.findByText('Название: «New» → «Salon»')).toBeTruthy()
    await waitFor(() => expect(ui.getByRole('button', { name: 'Восстановить в черновик' }).hasAttribute('disabled')).toBe(false))
    expect(mocks.restore).not.toHaveBeenCalled()
    markUnsaved('history-test')
    fireEvent.click(ui.getByRole('button', { name: 'Восстановить в черновик' }))
    expect(await ui.findByText(/Дождитесь сохранения/)).toBeTruthy()
    expect(mocks.restore).not.toHaveBeenCalled()
    clearUnsaved('history-test')
    await waitFor(() => expect(ui.getByRole('button', { name: 'Восстановить в черновик' }).hasAttribute('disabled')).toBe(false))
    fireEvent.click(ui.getByRole('button', { name: 'Восстановить в черновик' }))
    await waitFor(() => expect(mocks.restore).toHaveBeenCalledWith('app-1', version.id, 'digest'))
    expect(await ui.findByText(/Версия восстановлена в черновик/)).toBeTruthy()
    expect(mocks.refresh).toHaveBeenCalledOnce()
  })
  it('explains an incompatible version and keeps the restore button unavailable', async () => {
    mocks.preview.mockResolvedValue({ ok: false, error: 'Эта версия использует другие таблицы' })
    const ui = await open()
    fireEvent.click(ui.getByRole('button', { name: 'Посмотреть изменения' }))
    expect(await ui.findByText('Эта версия использует другие таблицы')).toBeTruthy()
    expect(ui.queryByRole('button', { name: 'Восстановить в черновик' })).toBeNull()
  })
})
