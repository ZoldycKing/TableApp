// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { inspectBuilderV2DeleteAction, submitBuilderV2DeleteAction } from '@/app/builder-v2-delete-actions'
import { BuilderV2WorkingDelete } from './working-delete'

vi.mock('@/app/builder-v2-delete-actions', () => ({ inspectBuilderV2DeleteAction: vi.fn(), submitBuilderV2DeleteAction: vi.fn() }))
vi.mock('../prototype/icons', () => ({ ProtoIcon: () => null }))
beforeEach(() => { vi.clearAllMocks(); HTMLDialogElement.prototype.showModal = function() { this.setAttribute('open', '') }; HTMLDialogElement.prototype.close = function() { this.removeAttribute('open') } })
afterEach(cleanup)
const props = { appId: 'app_test', scope: { screenId: 'detail', nodeId: 'remove', recordId: 'row_A' }, initial: { recordLabel: 'Проект Альфа', tableName: 'Проекты', revision: 'a'.repeat(64), fingerprint: 'b'.repeat(64) }, listHref: '/apps/app_test/preview?screen=list' }
const open = () => { fireEvent.click(screen.getByRole('button', { name: 'Удалить запись' })); return within(screen.getByRole('dialog', { name: 'Удалить запись?' })) }
it('does not send a request before confirmation, cancellation restores focus and success links to the list', async () => {
  vi.mocked(submitBuilderV2DeleteAction).mockResolvedValue({ ok: true, rowId: 'row_A', tableId: 'projects', repeated: false })
  render(<BuilderV2WorkingDelete {...props} />)
  const trigger = screen.getByRole('button', { name: 'Удалить запись' }); trigger.focus()
  let dialog = open(); expect(submitBuilderV2DeleteAction).not.toHaveBeenCalled()
  fireEvent.click(dialog.getByRole('button', { name: 'Отмена' })); expect(document.activeElement).toBe(trigger)
  dialog = open(); await act(async () => fireEvent.click(dialog.getByRole('button', { name: 'Удалить запись' })))
  expect(submitBuilderV2DeleteAction).toHaveBeenCalledWith(props.appId, expect.objectContaining({ ...props.scope, confirmed: true, fingerprint: props.initial.fingerprint }))
  expect(screen.getByRole('heading', { name: 'Запись удалена' })).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Посмотреть список' }).getAttribute('href')).toBe(props.listHref)
})
it('retains the same confirmed request after a lost response and a later refusal', async () => {
  vi.mocked(submitBuilderV2DeleteAction).mockRejectedValueOnce(new Error('Lost response')).mockResolvedValueOnce({ ok: false, error: 'Временно нет доступа' }).mockResolvedValueOnce({ ok: true, rowId: 'row_A', tableId: 'projects', repeated: true })
  render(<BuilderV2WorkingDelete {...props} />); const dialog = open()
  await act(async () => fireEvent.click(dialog.getByRole('button', { name: 'Удалить запись' })))
  expect((dialog.getByRole('button', { name: 'Отмена' }) as HTMLButtonElement).disabled).toBe(true)
  await act(async () => fireEvent.click(dialog.getByRole('button', { name: 'Повторить удаление' })))
  await act(async () => fireEvent.click(dialog.getByRole('button', { name: 'Повторить удаление' })))
  const calls = vi.mocked(submitBuilderV2DeleteAction).mock.calls
  expect(calls).toHaveLength(3); expect(calls.every(call => JSON.stringify(call[1]) === JSON.stringify(calls[0]![1]))).toBe(true)
  expect(screen.getByRole('status').textContent).toContain('больше не показывается')
})
it('blocks concurrent clicks and requires a fresh inspection and another confirmation after stale data', async () => {
  let finish!: (result: import('@/lib/builder-v2-submit-types').BuilderV2SubmitResult) => void
  vi.mocked(submitBuilderV2DeleteAction).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  vi.mocked(inspectBuilderV2DeleteAction).mockResolvedValue({ ok: true, state: { ...props.initial, recordLabel: 'Новое имя', fingerprint: 'c'.repeat(64) } })
  render(<BuilderV2WorkingDelete {...props} />); const dialog = open(), button = dialog.getByRole('button', { name: 'Удалить запись' })
  await act(async () => { fireEvent.click(button); fireEvent.click(button) }); expect(submitBuilderV2DeleteAction).toHaveBeenCalledTimes(1)
  await act(async () => finish({ ok: false, stale: true, error: 'Запись изменилась' }))
  expect(dialog.queryByRole('button', { name: 'Удалить запись' })).toBeNull()
  await act(async () => fireEvent.click(dialog.getByRole('button', { name: 'Обновить запись' })))
  expect(screen.queryByRole('dialog')).toBeNull(); expect(screen.getByRole('heading', { name: 'Новое имя' })).toBeTruthy()
  expect(submitBuilderV2DeleteAction).toHaveBeenCalledTimes(1)
})
