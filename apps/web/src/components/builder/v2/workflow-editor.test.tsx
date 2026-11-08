// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { BuilderV2WorkflowEditor } from './workflow-editor'
import { appV2Fixture, fixtureTables } from './fixture.test-utils'
import type { BuilderV2Form } from '@/lib/builder-v2-form-types'
import type { BuilderV2Workflow } from '@/lib/builder-v2-workflow-types'
vi.mock('../prototype/icons', () => ({ ProtoIcon: () => null }))
beforeEach(() => { HTMLDialogElement.prototype.showModal = function() { this.setAttribute('open', '') }; HTMLDialogElement.prototype.close = function() { this.removeAttribute('open') } })
afterEach(cleanup)
const props = () => { const app = appV2Fixture(); return { app, form: app.nodes.find(node => node.id === 'create_form') as BuilderV2Form, tables: fixtureTables, onSave: vi.fn<(flow: BuilderV2Workflow) => string | null>().mockReturnValue(null), onClose: vi.fn() } }
it('edits a local sequence and its branches without changing the app until Save', () => {
  const input = props(), original = JSON.stringify(input.app)
  render(<BuilderV2WorkflowEditor {...input} />)
  expect(screen.queryByRole('button', { name: 'Удалить шаг 1' })).toBeNull()
  fireEvent.change(screen.getByRole('combobox', { name: /^Добавить шаг$/ }), { target: { value: 'branch' } })
  const yes = within(screen.getByRole('region', { name: 'Если да' }))
  fireEvent.change(yes.getByRole('combobox', { name: 'Добавить шаг в ветку' }), { target: { value: 'notify' } })
  fireEvent.change(yes.getByRole('textbox', { name: 'Значение' }), { target: { value: 'Условие выполнено' } })
  expect(input.onSave).not.toHaveBeenCalled(); expect(JSON.stringify(input.app)).toBe(original)
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить шаги' }))
  const saved = input.onSave.mock.calls[0]![0], branch = saved.steps.at(-1)
  expect(branch).toMatchObject({ type: 'branch', then: [expect.objectContaining({ type: 'notify', message: { kind: 'literal', value: 'Условие выполнено' } })], else: [] })
  expect(saved.steps[0]!.id).toBe('new_request'); expect(input.onClose).toHaveBeenCalledTimes(1)
})
it('shows a compact overview and only opens the chosen settings', () => {
  const input = props()
  render(<BuilderV2WorkflowEditor {...input} />)
  expect(screen.queryByRole('combobox', { name: 'Источник значения' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Настроить: шаг 2' }))
  expect(screen.getByRole('combobox', { name: 'Источник значения' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Готово: шаг 2' }))
  expect(screen.queryByRole('combobox', { name: 'Источник значения' })).toBeNull()
  expect(input.onSave).not.toHaveBeenCalled()
})
it('edits button workflows without form sources or a protected form-save step',()=>{
  const input=props(),workflow=input.app.workflows.find(flow=>flow.id==='complete')!
  render(<BuilderV2WorkflowEditor app={input.app} workflow={workflow} tables={input.tables} onSave={input.onSave} onClose={input.onClose}/>)
  expect(screen.queryByText('Сохранить форму')).toBeNull();expect(screen.getByRole('button',{name:'Удалить шаг 1'})).toBeTruthy()
  fireEvent.change(screen.getByRole('combobox',{name:/^Добавить шаг$/}),{target:{value:'update_row'}})
  expect(screen.getByRole('combobox',{name:'Какую запись'})).toBeTruthy()
  const sources=screen.getByRole('combobox',{name:'Источник значения'})
  expect(sources.textContent).toContain('Открытая запись');expect(sources.textContent).not.toContain('Из формы:')
  expect(input.onSave).not.toHaveBeenCalled()
})
it('keeps validation errors in the dialog and cancels without committing a local reorder', () => {
  const input = props(); input.onSave.mockReturnValue('Результат ещё недоступен на этом шаге')
  render(<BuilderV2WorkflowEditor {...input} />)
  fireEvent.click(screen.getByRole('button', { name: 'Поднять шаг 2' }))
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить шаги' }))
  expect(screen.getByRole('alert').textContent).toContain('Результат ещё недоступен')
  expect(input.onClose).not.toHaveBeenCalled(); expect(input.app.workflows.find(flow => flow.id === 'create')!.steps[0]!.id).toBe('new_request')
  fireEvent.click(screen.getByRole('button', { name: 'Отмена' })); expect(input.onClose).toHaveBeenCalledTimes(1)
})

it('configures copy, links and back as short local steps and keeps value bindings intact',()=>{
 const input=props();render(<BuilderV2WorkflowEditor {...input}/>)
 fireEvent.change(screen.getByRole('combobox',{name:/^Добавить шаг$/}),{target:{value:'copy_value'}})
 fireEvent.change(screen.getByRole('combobox',{name:'Источник значения'}),{target:{value:JSON.stringify({kind:'form',formId:'create_form',fieldId:'r_amount'})}})
 fireEvent.change(screen.getByRole('combobox',{name:/^Добавить шаг$/}),{target:{value:'open_url'}})
 fireEvent.change(screen.getByRole('textbox',{name:'Значение'}),{target:{value:'/features'}})
 fireEvent.change(screen.getByRole('combobox',{name:/^Добавить шаг$/}),{target:{value:'go_back'}})
 expect(screen.getByText(/При входе по прямой ссылке/)).toBeTruthy();expect(input.onSave).not.toHaveBeenCalled()
 fireEvent.click(screen.getByRole('button',{name:'Сохранить шаги'}))
 expect(input.onSave.mock.calls[0]![0].steps.slice(-3)).toMatchObject([{type:'copy_value',value:{kind:'form',formId:'create_form',fieldId:'r_amount'}},{type:'open_url',value:{kind:'literal',value:'/features'}},{type:'go_back'}])
})

it('distinguishes the selected list row from the open parent card in value sources',()=>{
 const input=props(),base=input.app.workflows.find(flow=>flow.id==='complete')!,workflow={...base,input:{rowTableId:'tasks',screenTableId:'requests',formId:null},steps:[{id:'copy-task',type:'copy_value' as const,value:{kind:'row' as const,fieldId:'t_title'}}]}
 render(<BuilderV2WorkflowEditor app={input.app} workflow={workflow} itemContext tables={input.tables} onSave={input.onSave} onClose={input.onClose}/>);fireEvent.click(screen.getByRole('button',{name:'Настроить: шаг 1'}))
 expect(screen.getByRole('combobox',{name:'Источник значения'}).textContent).toContain('Строка списка: t_title');expect(screen.getByRole('combobox',{name:'Источник значения'}).textContent).toContain('Открытая карточка: r_title')
})

it('adds a deletion target with mandatory confirmation and leaves the draft untouched until save',()=>{
 const input=props(),original=JSON.stringify(input.app);render(<BuilderV2WorkflowEditor {...input}/>)
 fireEvent.change(screen.getByRole('combobox',{name:'Добавить шаг'}),{target:{value:'delete_row'}})
 expect(screen.getByText(/Без подтверждения всё действие/)).toBeTruthy();expect(screen.queryByRole('checkbox')).toBeNull()
 fireEvent.click(screen.getByRole('button',{name:'Сохранить шаги'}));expect(input.onSave.mock.calls[0]![0].steps.at(-1)).toMatchObject({type:'delete_row',tableId:'requests',target:{kind:'result',stepId:'new_request'},confirm:true});expect(JSON.stringify(input.app)).toBe(original)
})
