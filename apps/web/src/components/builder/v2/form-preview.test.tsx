// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { inspectBuilderV2FormAction, inspectWorkingBuilderV2FormAction, submitBuilderV2FormAction } from '@/app/builder-v2-form-actions'
import type { BuilderV2Form, BuilderV2FormState, BuilderV2FormResult } from '@/lib/builder-v2-form-types'
import { appV2Fixture, fixtureActor, fixtureTables } from './fixture.test-utils'
import { AppV2Renderer } from './view'
import { BookingJourneyProvider, useBookingJourney } from './booking-journey'
import { useEffect, useState } from 'react'

const navigation=vi.hoisted(()=>({push:vi.fn()}))
vi.mock('next/navigation',()=>({useRouter:()=>navigation}))
vi.mock('@/app/builder-v2-form-actions', () => ({ inspectBuilderV2FormAction: vi.fn(), inspectWorkingBuilderV2FormAction: vi.fn(), submitBuilderV2FormAction: vi.fn() }))
vi.mock('@/app/builder-v2-data-actions', () => ({ readBuilderV2DataAction: vi.fn() }))
vi.mock('../prototype/icons', () => ({ ProtoIcon: () => null }))
beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks() })
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals() })
const tick = () => act(async () => { await vi.advanceTimersByTimeAsync(350) })
const initial: BuilderV2FormState = { values: { r_title: '', r_amount: 0 }, labels: {}, fingerprint: 'a'.repeat(64), fields: [{ nodeId: 'title_input', fieldId: 'r_title', label: 'Название', type: 'text', required: true, readOnly: false, supported: true }, { nodeId: 'amount_input', fieldId: 'r_amount', label: 'Сумма, ₽', type: 'number', required: false, readOnly: false, supported: true }] }
const props = () => ({ app: appV2Fixture(), screenId: 'new', tables: fixtureTables, actor: fixtureActor, live: true })

it('uses calendar defaults only for writable fields of the selected create form',async()=>{
  const appProps=props(),state={...initial,values:{r_title:'Не менять',r_amount:0},fields:initial.fields.map(field=>({...field,readOnly:field.fieldId==='r_title'}))}
  vi.mocked(inspectBuilderV2FormAction).mockResolvedValue({ok:true,state})
  function Seed(){const journey=useBookingJourney(),[ready,setReady]=useState(false);useEffect(()=>{journey?.setCalendarForm({screenId:'new',tableId:'requests',values:{r_title:'Подмена',r_amount:15,foreign:'Недоступно'}});setReady(true)},[]);return ready?<AppV2Renderer {...appProps}/>:null}
  render(<BookingJourneyProvider><Seed/></BookingJourneyProvider>);await tick()
  expect(screen.getByText('Не менять')).toBeTruthy()
  expect(screen.queryByText('Подмена')).toBeNull()
  expect((screen.getByLabelText('Сумма, ₽',{exact:true})as HTMLInputElement).value).toBe('15')
})

it('preserves typed decimal input and sends the parsed decimal and checks the form without executing a submit workflow', async () => {
  vi.mocked(inspectBuilderV2FormAction).mockResolvedValueOnce({ ok: true, state: initial }).mockResolvedValueOnce({ ok: true, state: { ...initial, values: { r_title: 'Заказ', r_amount: 12.5 } } })
  const appProps = props(); render(<AppV2Renderer {...appProps} />); await tick()
  fireEvent.change(screen.getByLabelText('Название', { exact: true }), { target: { value: 'Заказ' } })
  fireEvent.change(screen.getByLabelText('Сумма, ₽', { exact: true }), { target: { value: '12,' } })
  expect((screen.getByLabelText('Сумма, ₽') as HTMLInputElement).value).toBe('12,')
  fireEvent.change(screen.getByLabelText('Сумма, ₽'), { target: { value: '12,5' } })
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Проверить форму' })))
  expect(inspectBuilderV2FormAction).toHaveBeenLastCalledWith(appProps.app.id, appProps.app, { mode: 'check', formId: 'create_form', screenId: 'new', fingerprint: initial.fingerprint, values: { r_title: 'Заказ', r_amount: 12.5 } })
  expect(screen.getByRole('status').textContent).toContain('в таблицу не добавлена')
  expect(submitBuilderV2FormAction).not.toHaveBeenCalled()
  // The fixture contains a real submit workflow. Preflight never invokes it.
  expect(appProps.app.workflows.find(flow => flow.id === 'create')!.steps).toHaveLength(3)
})
it('shows field errors, focuses the first error and keeps typed values for correction', async () => {
  vi.mocked(inspectBuilderV2FormAction).mockResolvedValueOnce({ ok: true, state: initial }).mockResolvedValueOnce({ ok: false, error: 'Проверьте отмеченные поля', errors: { title_input: 'Введите название' } })
  render(<AppV2Renderer {...props()} />); await tick()
  fireEvent.change(screen.getByLabelText('Сумма, ₽'), { target: { value: '42' } })
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Проверить форму' })))
  expect(screen.getByRole('alert').textContent).toBe('Проверьте отмеченные поля')
  expect(document.activeElement).toBe(screen.getByLabelText('Название', { exact: true }))
  expect(screen.getByLabelText('Название', { exact: true }).getAttribute('aria-invalid')).toBe('true')
  expect((screen.getByLabelText('Сумма, ₽') as HTMLInputElement).value).toBe('42')
})
it('uses named read-only relation values and never includes locked fields in the posted values', async () => {
  const appProps = props(), form = appProps.app.nodes.find(node => node.id === 'create_form') as BuilderV2Form
  appProps.app.screens.find(screen => screen.id === 'new')!.contextTableId = 'requests'
  form.childIds.push('parent_input'); appProps.app.nodes.push({ id: 'parent_input', type: 'input', name: 'Клиент', label: 'Клиент', fieldId: 'parent', required: true, initialValue: { kind: 'record_ids', tableId: 'requests', record: { kind: 'screen' } }, readOnly: true, visibleTo: null, visibleWhen: null })
  const state = { ...initial, values: { ...initial.values, parent: ['client_A'] }, labels: { parent: 'Анна' }, fields: [...initial.fields, { nodeId: 'parent_input', fieldId: 'parent', label: 'Клиент', type: 'relation' as const, required: true, readOnly: true, supported: true }] }
  vi.mocked(inspectBuilderV2FormAction).mockResolvedValue({ ok: true, state })
  render(<AppV2Renderer {...appProps} record={{ id: 'client_A', tableId: 'requests', values: {} }} />); await tick()
  expect(screen.getByText('Анна')).toBeTruthy(); expect(screen.queryByText('client_A')).toBeNull()
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Проверить форму' })))
  const posted = vi.mocked(inspectBuilderV2FormAction).mock.calls.at(-1)![2] as { values: Record<string, unknown> }
  expect(posted.values).toEqual({ r_title: '', r_amount: 0 }); expect(posted.values).not.toHaveProperty('parent')
})
it('discards an old form response after the selected record changes', async () => {
  let finish!: (result: BuilderV2FormResult) => void
  vi.mocked(inspectBuilderV2FormAction).mockImplementationOnce(() => new Promise(resolve => { finish = resolve })).mockResolvedValueOnce({ ok: true, state: { ...initial, values: { r_title: 'Новая запись', r_amount: 2 } } })
  const appProps = props(), view = render(<AppV2Renderer {...appProps} record={{ id: 'A', tableId: 'requests', values: {} }} />)
  await tick(); view.rerender(<AppV2Renderer {...appProps} record={{ id: 'B', tableId: 'requests', values: {} }} />); await tick()
  await act(async () => finish({ ok: true, state: { ...initial, values: { r_title: 'Старая запись', r_amount: 1 } } }))
  expect((screen.getByLabelText('Название', { exact: true }) as HTMLInputElement).value).toBe('Новая запись')
})

it('keeps a date after server normalization and posts an unchecked checkbox as false', async () => {
  const appProps = props(), form = appProps.app.nodes.find(node => node.id === 'create_form') as BuilderV2Form
  const extra = [{ id: 'due_input', fieldId: 'due', label: 'Готов к' }, { id: 'done_input', fieldId: 'done', label: 'Готово' }]
  form.childIds.push(...extra.map(input => input.id)); appProps.app.nodes.push(...extra.map(input => ({ ...input, type: 'input' as const, name: input.label, required: false, initialValue: null, visibleTo: null, visibleWhen: null })))
  const state: BuilderV2FormState = { ...initial, values: { ...initial.values, due: null, done: false }, fields: [...initial.fields, { nodeId: 'due_input', fieldId: 'due', label: 'Готов к', type: 'date', timeZone: 'Europe/Moscow', required: false, readOnly: false, supported: true }, { nodeId: 'done_input', fieldId: 'done', label: 'Готово', type: 'checkbox', required: false, readOnly: false, supported: true }] }
  vi.mocked(inspectBuilderV2FormAction).mockResolvedValueOnce({ ok: true, state }).mockResolvedValueOnce({ ok: true, state: { ...state, values: { ...state.values, due: '2026-11-07T21:00:00.000Z' } } })
  render(<AppV2Renderer {...appProps} />); await tick()
  fireEvent.change(screen.getByLabelText('Готов к'), { target: { value: '2026-11-08' } })
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Проверить форму' })))
  const request = vi.mocked(inspectBuilderV2FormAction).mock.calls.at(-1)![2] as { values: Record<string, unknown> }
  expect(request.values).toMatchObject({ due: '2026-11-08', done: false })
  // Date fields use the RU text mask; ISO in → dd.mm.yyyy on screen, ISO out on submit.
  expect((screen.getByLabelText('Готов к') as HTMLInputElement).value).toBe('08.11.2026')
})

const workingProps = () => ({ ...props(), workingForm: { formId: 'create_form', tableName: 'Заявки', listHref: '/apps/app_pilot/preview?screen=home' } })
const savedState = { ...initial, revision: 'b'.repeat(64) }

it('retries an uncertain save with exactly the same key and values and locks editing until resolved', async () => {
  vi.mocked(inspectWorkingBuilderV2FormAction).mockResolvedValue({ ok: true, state: savedState })
  vi.mocked(submitBuilderV2FormAction).mockRejectedValueOnce(new Error('Lost response')).mockResolvedValueOnce({ ok: false, error: 'Действие временно недоступно' }).mockResolvedValueOnce({ ok: true, tableId: 'requests', rowId: 'created', repeated: true })
  render(<AppV2Renderer {...workingProps()} />); await tick()
  fireEvent.change(screen.getByLabelText('Название', { exact: true }), { target: { value: 'Моя заявка' } })
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Сохранить' })))
  const first = vi.mocked(submitBuilderV2FormAction).mock.calls[0]![1]
  expect((screen.getByLabelText('Название', { exact: true }) as HTMLInputElement).disabled).toBe(true)
  expect(screen.getByRole('alert').textContent).toContain('Не удалось подтвердить')
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Повторить сохранение' })))
  expect((screen.getByLabelText('Название', { exact: true }) as HTMLInputElement).disabled).toBe(true)
  expect(screen.getByRole('alert').textContent).toContain('временно недоступно')
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Повторить сохранение' })))
  expect(submitBuilderV2FormAction).toHaveBeenLastCalledWith('app_pilot', first)
  expect(vi.mocked(submitBuilderV2FormAction).mock.calls.every(call => JSON.stringify(call[1]) === JSON.stringify(first))).toBe(true)
  expect(screen.getByRole('status').textContent).toContain('Запись сохранена')
  expect(screen.getByRole('link', { name: 'Посмотреть список' }).getAttribute('href')).toContain('screen=home')
  expect(inspectBuilderV2FormAction).not.toHaveBeenCalled()
  expect(screen.queryByRole('button', { name: 'Сохранить' })).toBeNull()
})

it('blocks two simultaneous clicks and starts a new submission only after Add another', async () => {
  vi.mocked(inspectWorkingBuilderV2FormAction).mockResolvedValue({ ok: true, state: savedState })
  let finish!: (result: import('@/lib/builder-v2-submit-types').BuilderV2SubmitResult) => void
  vi.mocked(submitBuilderV2FormAction).mockImplementationOnce(() => new Promise(resolve => { finish = resolve })).mockResolvedValue({ ok: true, rowId: 'second', tableId: 'requests', repeated: false })
  render(<AppV2Renderer {...workingProps()} />); await tick()
  const button = screen.getByRole('button', { name: 'Сохранить' })
  await act(async () => { fireEvent.click(button); fireEvent.click(button) })
  expect(submitBuilderV2FormAction).toHaveBeenCalledTimes(1)
  await act(async () => finish({ ok: true, rowId: 'first', tableId: 'requests', repeated: false }))
  fireEvent.click(screen.getByRole('button', { name: 'Добавить ещё' })); await tick()
  expect((screen.getByLabelText('Название', { exact: true }) as HTMLInputElement).value).toBe('')
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Сохранить' })))
  const calls = vi.mocked(submitBuilderV2FormAction).mock.calls.map(call => call[1] as { requestId: string })
  expect(calls).toHaveLength(2); expect(calls[0]!.requestId).not.toBe(calls[1]!.requestId)
})

it('keeps form values after a definitive field error and requires refresh for stale settings', async () => {
  vi.mocked(inspectWorkingBuilderV2FormAction).mockResolvedValue({ ok: true, state: savedState })
  vi.mocked(submitBuilderV2FormAction).mockResolvedValueOnce({ ok: false, error: 'Проверьте поля', errors: { title_input: 'Введите название' } }).mockResolvedValueOnce({ ok: false, stale: true, error: 'Настройки изменились' })
  render(<AppV2Renderer {...workingProps()} />); await tick()
  fireEvent.change(screen.getByLabelText('Сумма, ₽'), { target: { value: '0' } })
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Сохранить' })))
  expect(document.activeElement).toBe(screen.getByLabelText('Название', { exact: true }))
  expect((screen.getByLabelText('Сумма, ₽') as HTMLInputElement).value).toBe('0')
  fireEvent.change(screen.getByLabelText('Название', { exact: true }), { target: { value: 'Исправлено' } })
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Сохранить' })))
  expect((screen.getByRole('button', { name: 'Сохранить' }) as HTMLButtonElement).disabled).toBe(true)
  expect(screen.getByRole('button', { name: 'Обновить форму' })).toBeTruthy()
})
it('uses the existing row in edit mode, links to its card and reloads current values for another edit', async () => {
  const appProps = workingProps(), form = appProps.app.nodes.find(node => node.id === 'create_form') as BuilderV2Form
  form.mode = 'edit'; appProps.app.screens.find(screen => screen.id === 'new')!.contextTableId = 'requests'
  vi.mocked(inspectWorkingBuilderV2FormAction).mockResolvedValueOnce({ ok: true, state: { ...savedState, values: { r_title: 'Старое имя', r_amount: 100 } } }).mockResolvedValueOnce({ ok: true, state: { ...savedState, values: { r_title: 'Новое имя', r_amount: 0 } } })
  vi.mocked(submitBuilderV2FormAction).mockResolvedValue({ ok: true, rowId: 'row_A', tableId: 'requests', repeated: false })
  render(<AppV2Renderer {...appProps} workingForm={{ ...appProps.workingForm, recordHref: '/apps/app_pilot/preview?screen=detail&row=row_A' }} record={{ id: 'row_A', tableId: 'requests', values: {} }} />); await tick()
  expect((screen.getByLabelText('Название', { exact: true }) as HTMLInputElement).value).toBe('Старое имя')
  fireEvent.change(screen.getByLabelText('Название', { exact: true }), { target: { value: 'Новое имя' } })
  fireEvent.change(screen.getByLabelText('Сумма, ₽'), { target: { value: '0' } })
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Сохранить' })))
  expect(submitBuilderV2FormAction).toHaveBeenCalledWith('app_pilot', expect.objectContaining({ recordId: 'row_A', values: { r_title: 'Новое имя', r_amount: 0 } }))
  expect(screen.getByRole('status').textContent).toBe('Изменения сохранены.')
  expect(screen.getByRole('link', { name: 'Открыть запись' }).getAttribute('href')).toContain('row=row_A')
  expect(screen.queryByRole('button', { name: 'Добавить ещё' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Изменить ещё' })); await tick()
  expect((screen.getByLabelText('Название', { exact: true }) as HTMLInputElement).value).toBe('Новое имя')
})
it('does not render or submit a saved form revision which differs from the page definition', async () => {
  vi.mocked(inspectWorkingBuilderV2FormAction).mockResolvedValue({ ok: true, state: savedState })
  const appProps = workingProps()
  render(<AppV2Renderer {...appProps} workingForm={{ ...appProps.workingForm, revision: 'c'.repeat(64) }} />); await tick()
  expect(screen.getByRole('alert').textContent).toContain('Настройки изменились')
  expect((screen.getByRole('button', { name: 'Сохранить' }) as HTMLButtonElement).disabled).toBe(true)
  expect(submitBuilderV2FormAction).not.toHaveBeenCalled()
})

it('returns a learning edit form to the editor after a committed Back step',async()=>{
 const p=workingProps(),app=p.app,form=app.nodes.find(node=>node.id==='create_form')!;if(form.type!=='form')throw new Error('Missing form')
 form.mode='edit';const page=app.screens.find(screen=>screen.id==='new')!;page.contextTableId='requests'
 vi.mocked(inspectWorkingBuilderV2FormAction).mockResolvedValue({ok:true,state:{...savedState,values:{r_title:'Проект',r_amount:0}}})
 vi.mocked(submitBuilderV2FormAction).mockResolvedValue({ok:true,repeated:false,rowId:'row_A',tableId:'requests',effects:[{type:'go_back',screenId:'home'}]})
 render(<AppV2Renderer {...p} record={{id:'row_A',tableId:'requests',values:{r_title:'Проект'}}} workingForm={{...p.workingForm,learning:true,listHref:'/apps/app_pilot?screen=home',recordHref:'/apps/app_pilot/preview?screen=detail&row=row_A'}}/>);await tick()
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Сохранить'})))
 expect(navigation.push).toHaveBeenCalledWith('/apps/app_pilot?screen=home')
})


it('waits for uploads before saving and keeps edits made while a file is uploading',async()=>{
 const p=workingProps(),form=p.app.nodes.find(node=>node.id==='create_form') as BuilderV2Form
 form.childIds.push('photo_input');p.app.nodes.push({id:'photo_input',type:'input',name:'Фото',label:'Фото',fieldId:'photos',required:false,initialValue:null,visibleTo:null,visibleWhen:null})
 const state={...savedState,values:{...savedState.values,photos:[]},fields:[...savedState.fields,{nodeId:'photo_input',fieldId:'photos',label:'Фото',type:'image' as const,required:false,readOnly:false,supported:true,maxCount:2}]}
 vi.mocked(inspectWorkingBuilderV2FormAction).mockResolvedValue({ok:true,state});vi.mocked(submitBuilderV2FormAction).mockResolvedValue({ok:true,rowId:'saved',tableId:'requests',repeated:false})
 let finish!:(value:unknown)=>void;const fetch=vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')).mockImplementation(()=>new Promise(resolve=>{finish=resolve}));vi.stubGlobal('fetch',fetch);URL.createObjectURL=vi.fn(()=> 'blob:test');URL.revokeObjectURL=vi.fn()
 const view=render(<AppV2Renderer {...p}/>);await tick();await act(async()=>fireEvent.change(view.container.querySelector('input[type=file]')!,{target:{files:[new File(['photo'],'photo.png',{type:'image/png'})]}}))
 expect(screen.getByRole('alert').textContent).toContain('Проверьте соединение');expect((screen.getByRole('button',{name:'Сохранить'}) as HTMLButtonElement).disabled).toBe(true);await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Повторить загрузку'})));fireEvent.submit(screen.getByRole('form'));expect(submitBuilderV2FormAction).not.toHaveBeenCalled()
 fireEvent.change(screen.getByLabelText('Название',{exact:true}),{target:{value:'Название во время загрузки'}})
 const file={id:'att_photo',key:'workspace/photo.png',name:'photo.png',mime:'image/png',size:5,width:null,height:null};await act(async()=>finish({ok:true,status:200,json:async()=>({ok:true,attachment:file})}))
 expect((screen.getByRole('button',{name:'Сохранить'}) as HTMLButtonElement).disabled).toBe(false);expect((screen.getByLabelText('Название',{exact:true}) as HTMLInputElement).value).toBe('Название во время загрузки')
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Сохранить'})));expect(submitBuilderV2FormAction).toHaveBeenCalledWith('app_pilot',expect.objectContaining({values:{r_title:'Название во время загрузки',r_amount:0,photos:[file]}}))
 const body=(fetch.mock.calls[0] as unknown as [string,{body:FormData}])[1].body;expect(JSON.parse(String(body.get('context')))).toMatchObject({kind:'working',appId:'app_pilot',formId:'create_form',fieldId:'photos',fingerprint:state.fingerprint,revision:state.revision})
})
