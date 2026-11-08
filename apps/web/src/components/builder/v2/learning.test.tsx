// @vitest-environment jsdom
import { cleanup, fireEvent, render, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { BuilderLearningProgress } from '@/lib/builder-learning-types'
import { BuilderLearningBar, BuilderLearningDialog } from './learning'
vi.mock('../prototype/icons', () => ({ ProtoIcon: () => null }))
const progress: BuilderLearningProgress = { version: 1, revision: '2026-11-03T00:00:00.000Z', list: 'pending', record: 'pending', save:'pending', access: 'pending', publish: 'pending', paused: false, target: { nodeId: 'list', screenId: 'home', tableId: 'projects', name: 'Проекты', cardScreenId: 'card' } }
const callbacks = () => ({ onAction: vi.fn(), onPause: vi.fn(), onSkip: vi.fn(), onHelp: vi.fn(), onRetry: vi.fn() })
beforeEach(() => { HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }; HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') } })
afterEach(cleanup)
it('shows one task, offers skip independently and removes paused prompts without forgetting progress', () => {
  const handlers = callbacks(), ui = render(<BuilderLearningBar progress={progress} busy={false} loading={false} error="" {...handlers} />)
  expect(ui.getByRole('region', { name: 'Первые шаги' }).textContent).toContain('1 из 5')
  fireEvent.click(ui.getByRole('button', { name: 'Выбрать поля для экрана' }))
  expect(handlers.onAction).toHaveBeenCalledTimes(1)
  fireEvent.click(ui.getByRole('button', { name: 'Пропустить шаг' }))
  expect(handlers.onSkip).toHaveBeenCalledTimes(1)
  ui.rerender(<BuilderLearningBar progress={{ ...progress, list: 'skipped' }} busy={false} loading={false} error="" {...handlers} />)
  expect(ui.getByRole('region').textContent).toContain('2 из 5')
  ui.rerender(<BuilderLearningBar progress={{ ...progress, paused: true }} busy={false} loading={false} error="" {...handlers} />)
  expect(ui.queryByRole('region')).toBeNull()
})
it('opens short contextual help over an unchanged editor and restores focus when closed', () => {
  const close = vi.fn()
  const ui = render(<><label>Несохранённое название<input defaultValue="Мой список" /></label><button type="button">Помощь</button></>)
  const input = ui.getByRole('textbox') as HTMLInputElement
  fireEvent.change(input, { target: { value: 'Моя новая подпись' } })
  ui.getByRole('button', { name: 'Помощь' }).focus()
  ui.rerender(<><label>Несохранённое название<input defaultValue="Мой список" /></label><button type="button">Помощь</button><BuilderLearningDialog mode="list" progress={progress} listScreen={{ screenName: 'Мои проекты', tableName: 'Проекты' }} busy={false} error="" onClose={close} onContinue={() => {}} onRetryStep={() => {}} /></>)
  const dialog = ui.getByRole('dialog', { name: 'Экран «Мои проекты»' })
  expect(dialog.textContent).toContain('таблицы «Проекты»')
  expect(dialog.textContent).toContain('Главное поле')
  expect(input.value).toBe('Моя новая подпись')
  fireEvent.click(within(dialog).getByRole('button', { name: 'Закрыть подсказку' }))
  expect(close).toHaveBeenCalledTimes(1)
  ui.rerender(<><label>Несохранённое название<input defaultValue="Мой список" /></label><button type="button">Помощь</button></>)
  expect(document.activeElement).toBe(ui.getByRole('button', { name: 'Помощь' }))
  expect(input.value).toBe('Моя новая подпись')
})
it('marks a skipped step honestly and lets the person return to it without replaying completed steps', () => {
  const retry = vi.fn(), ui = render(<BuilderLearningDialog mode="overview" progress={{ ...progress, list: 'done', record: 'skipped', paused: true }} busy={false} error="" onClose={() => {}} onContinue={() => {}} onRetryStep={retry} />)
  expect(ui.getByText('Выполнено')).toBeTruthy(); expect(ui.getByText('Пропущено')).toBeTruthy()
  expect(ui.getAllByRole('button', { name: 'Вернуться' })).toHaveLength(1)
  fireEvent.click(ui.getByRole('button', { name: 'Вернуться' }))
  expect(retry).toHaveBeenCalledWith('record')
})
it('continues with access and publication without requiring a list that has since been removed',()=>{
  const handlers=callbacks(),done={...progress,list:'done' as const,record:'done' as const,save:'done' as const,target:null}
  const ui=render(<BuilderLearningBar progress={done} busy={false} loading={false} error="" {...handlers}/>)
  expect(ui.getByRole('region').textContent).toContain('4 из 5');fireEvent.click(ui.getByRole('button',{name:'Настроить доступ'}));expect(handlers.onAction).toHaveBeenCalledTimes(1)
  ui.rerender(<BuilderLearningBar progress={{...done,access:'done'}} busy={false} loading={false} error="" {...handlers}/>)
  expect(ui.getByRole('region').textContent).toContain('5 из 5');expect(ui.getByRole('button',{name:'Открыть публикацию'})).toBeTruthy()
  ui.rerender(<BuilderLearningBar progress={{...done,access:'done',publish:'skipped'}} busy={false} loading={false} error="" {...handlers}/>)
  expect(ui.getByRole('region').textContent).toContain('пропущенным');expect(ui.queryByText(/Вы настроили список, проверили доступ и опубликовали/)).toBeNull()
})
