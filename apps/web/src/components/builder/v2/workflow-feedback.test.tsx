// @vitest-environment jsdom
import {StrictMode} from 'react'
import {openBuilderV2Url} from './browser-navigation'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { BuilderV2WorkflowFeedback, BuilderV2WorkflowNotice } from './workflow-feedback'
import { BuilderV2WorkflowHistory } from './workflow-history'
import { PrototypeDialog } from '../prototype/dialog'
import { readBuilderV2WorkflowRunsAction } from '@/app/builder-v2-workflow-actions'
const navigation = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('./browser-navigation',()=>({openBuilderV2Url:vi.fn()}))
vi.mock('next/navigation', () => ({ useRouter: () => navigation }))
vi.mock('@/app/builder-v2-workflow-actions', () => ({ readBuilderV2WorkflowRunsAction: vi.fn() }))
vi.mock('../prototype/icons', () => ({ ProtoIcon: () => null }))
beforeEach(() => { vi.clearAllMocks(); sessionStorage.clear(); HTMLDialogElement.prototype.showModal = function() { this.setAttribute('open', '') }; HTMLDialogElement.prototype.close = function() { this.removeAttribute('open') } })
afterEach(cleanup)
it('keeps the dialog outside a panel that can be hidden at a responsive breakpoint', () => {
  const onClose = vi.fn()
  const view = render(<section hidden><PrototypeDialog title="Настройка" onClose={onClose}><input aria-label="Название" /></PrototypeDialog></section>)
  const dialog = screen.getByRole('dialog', { name: 'Настройка' })
  expect(dialog.parentElement).toBe(document.body)
  expect(view.container.contains(dialog)).toBe(false)
  expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Название' }))
  fireEvent.click(screen.getByRole('button', { name: 'Закрыть окно' }))
  expect(onClose).toHaveBeenCalledTimes(1)
})
it('applies a committed destination once and carries its message to the new screen without URL data', () => {
  const effects = [{ type: 'notify' as const, message: 'Заявка сохранена' }, { type: 'open_screen' as const, screenId: 'detail', recordId: 'row_A' }]
  const view = render(<BuilderV2WorkflowFeedback appId="app_A" requestKey="request_A" effects={effects} />)
  view.rerender(<BuilderV2WorkflowFeedback appId="app_A" requestKey="request_A" effects={[...effects]} />)
  expect(navigation.push).toHaveBeenCalledTimes(1); expect(navigation.push).toHaveBeenCalledWith('/apps/app_A/preview?screen=detail&row=row_A')
  view.unmount(); render(<BuilderV2WorkflowNotice appId="app_A" />)
  expect(screen.getByRole('status').textContent).toBe('Заявка сохранена'); expect(sessionStorage.getItem('tableapp-v2-notice:app_A')).toBeNull()
})
it('shows rolled back steps without applying navigation or displaying a success notice', () => {
  render(<BuilderV2WorkflowFeedback appId="app_A" trace={[{ stepId: 'save', label: 'Сохранить форму', status: 'rolled_back' }, { stepId: 'stop', label: 'Проверить условие', status: 'failed', detail: 'Бюджет слишком мал' }]} />)
  fireEvent.click(screen.getByRole('button', { name: 'Посмотреть шаги' }))
  expect(screen.getByRole('dialog', { name: 'Как выполнилось действие' }).textContent).toContain('Отменено')
  expect(screen.queryByRole('status')).toBeNull(); expect(navigation.push).not.toHaveBeenCalled()
})
it('loads durable execution history on demand and can retry and inspect the failing step', async () => {
  vi.mocked(readBuilderV2WorkflowRunsAction).mockResolvedValueOnce({ ok: false, error: 'Нет соединения' }).mockResolvedValueOnce({ ok: true, next: null, runs: [{ id: 'run_A', createdAt: '2026-11-03T10:00:00Z', status: 'failed', workflowName: 'Сохранить заявку', error: 'Бюджет слишком мал', trace: [{ stepId: 'stop', label: 'Проверить условие', status: 'failed' }] }] })
  await act(async () => { render(<BuilderV2WorkflowHistory appId="app_A" onClose={vi.fn()} />) })
  expect(screen.getByRole('alert').textContent).toBe('Нет соединения')
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Повторить' })))
  expect(screen.getByText('Сохранить заявку')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Посмотреть шаги' }))
  expect(screen.getByRole('dialog', { name: 'Как выполнилось действие' }).textContent).toContain('Проверить условие')
  expect(navigation.push).not.toHaveBeenCalled()
})

it('returns a successful learning workflow to the editor while keeping its saved message',()=>{
 render(<BuilderV2WorkflowFeedback appId="app_A" editor requestKey="learning_save" effects={[{type:'notify',message:'Сохранено'},{type:'open_screen',screenId:'detail',recordId:'row_A'}]}/>)
 expect(navigation.push).toHaveBeenCalledWith('/apps/app_A?screen=detail&row=row_A')
 expect(sessionStorage.getItem('tableapp-v2-notice:app_A')).toContain('Сохранено')
})

it('copies only once in StrictMode, waits for success before navigation and ignores an identical replay',async()=>{
 const writeText=vi.fn<(...args:string[])=>Promise<void>>().mockResolvedValue(undefined);Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText}})
 const effects=[{type:'copy_value' as const,value:'0'},{type:'open_screen' as const,screenId:'detail',recordId:'row_A'}]
 const view=render(<StrictMode><BuilderV2WorkflowFeedback appId="app_A" requestKey="copy_once" effects={effects}/></StrictMode>)
 await act(async()=>{});expect(writeText).toHaveBeenCalledExactlyOnceWith('0');expect(screen.getByRole('status').textContent).toBe('Скопировано');expect(navigation.push).toHaveBeenCalledTimes(1)
 view.rerender(<StrictMode><BuilderV2WorkflowFeedback appId="app_A" requestKey="copy_once" effects={[...effects]}/></StrictMode>);await act(async()=>{});expect(writeText).toHaveBeenCalledTimes(1)
})
it('offers an explicit clipboard retry and never navigates or reports copied on a rejected browser write',async()=>{
 const writeText=vi.fn().mockRejectedValueOnce(new Error('blocked')).mockResolvedValue(undefined);Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText}})
 render(<BuilderV2WorkflowFeedback appId="app_A" requestKey="copy_retry" effects={[{type:'copy_value',value:'Проект 21'},{type:'open_url',url:'/features'}]}/>);await act(async()=>{})
 expect(screen.getByRole('alert').textContent).toContain('скопируйте вручную');expect((screen.getByRole('textbox',{name:'Значение для копирования'}) as HTMLTextAreaElement).value).toBe('Проект 21');expect(openBuilderV2Url).not.toHaveBeenCalled();expect(screen.queryByText('Скопировано')).toBeNull()
 const retry=screen.getByRole('button',{name:'Скопировать'});retry.focus()
 await act(async()=>fireEvent.click(retry))
 expect(document.activeElement).toBe(screen.getByRole('button',{name:'Скопировать ещё раз'}))
 expect(writeText).toHaveBeenCalledTimes(2);expect(openBuilderV2Url).toHaveBeenCalledExactlyOnceWith('/features');expect(screen.getByText('Скопировано')).toBeTruthy()
})
it('uses the verified private return destination instead of browser history',()=>{
 render(<BuilderV2WorkflowFeedback appId="app_A" requestKey="back" backHref="/apps/app_A/preview?screen=detail&row=row_A" effects={[{type:'go_back',screenId:'home'}]}/>)
 expect(navigation.push).toHaveBeenCalledWith('/apps/app_A/preview?screen=detail&row=row_A')
})
