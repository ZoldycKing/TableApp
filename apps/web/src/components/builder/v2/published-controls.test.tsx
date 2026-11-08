// @vitest-environment jsdom
import {act,cleanup,fireEvent,render,screen,within} from '@testing-library/react'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import type {BuilderV2FormState} from '@/lib/builder-v2-form-types'
import {inspectBuilderV2FormAction,submitBuilderV2FormAction} from '@/app/builder-v2-form-actions'
import {PublishedV2Context,type PublishedV2Transport} from './published-context'
import {PublishedV2Delete} from './published-delete'
import {configureBuilderV2Button} from '@/lib/builder-v2-button-action'
import {BuilderV2DeleteActionSettings} from './delete-action-settings'
import {PublishedV2Button} from './published-button'
import {AppV2Renderer} from './view'
import {appV2Fixture,fixtureActor,fixtureTables} from './fixture.test-utils'
vi.mock('@/app/builder-v2-form-actions',()=>({inspectBuilderV2FormAction:vi.fn(),inspectWorkingBuilderV2FormAction:vi.fn(),submitBuilderV2FormAction:vi.fn()}))
vi.mock('@/app/builder-v2-workflow-actions',()=>({readBuilderV2WorkflowRunsAction:vi.fn()}))
vi.mock('@/app/builder-v2-data-actions',()=>({readBuilderV2DataAction:vi.fn()}))
vi.mock('../prototype/icons',()=>({ProtoIcon:()=>null}))
vi.mock('next/navigation',()=>({useRouter:()=>({push:vi.fn(),refresh:vi.fn()})}))
beforeEach(()=>{vi.useFakeTimers();vi.clearAllMocks();HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','')};HTMLDialogElement.prototype.close=function(){this.removeAttribute('open')}});afterEach(()=>{cleanup();vi.useRealTimers()})
const tick=()=>act(async()=>{await vi.advanceTimersByTimeAsync(350)})
const initial:BuilderV2FormState={values:{r_title:'',r_amount:0},labels:{},fingerprint:'a'.repeat(64),fields:[{nodeId:'title_input',fieldId:'r_title',label:'Название',type:'text',required:true,readOnly:false,supported:true},{nodeId:'amount_input',fieldId:'r_amount',label:'Сумма, ₽',type:'number',required:false,readOnly:false,supported:true}]}
function transport():PublishedV2Transport{return {slug:'test-published',revision:'b'.repeat(64),readData:vi.fn(),readRecord:vi.fn(),inspectForm:vi.fn(async()=>({ok:true as const,state:{...initial,revision:'b'.repeat(64)}})),submitForm:vi.fn(async()=>({ok:true as const,repeated:false})),inspectButton:vi.fn(),submitButton:vi.fn(async()=>({ok:true as const,repeated:false})),inspectDelete:vi.fn(),submitDelete:vi.fn(),navigate:vi.fn(),back:vi.fn(),refresh:vi.fn(),tableName:()=> 'Заявки',buttonState:()=>({revision:'b'.repeat(64),fingerprint:'a'.repeat(64),actionName:'Завершить',stepCount:1,tableName:'Заявки',recordLabel:'Тест'})}}
it('uses the public transport for form preflight and writes without sending the app definition',async()=>{
 const runtime=transport(),app=appV2Fixture();render(<PublishedV2Context.Provider value={runtime}><AppV2Renderer app={app} tables={fixtureTables} actor={fixtureActor} screenId="new" live/></PublishedV2Context.Provider>);await tick()
 fireEvent.change(screen.getByLabelText('Название',{exact:true}),{target:{value:'Своё дело'}})
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Сохранить'})))
 expect(runtime.submitForm).toHaveBeenCalledWith(expect.objectContaining({screenId:'new',formId:'create_form',revision:runtime.revision,values:{r_title:'Своё дело',r_amount:0}}))
 expect(vi.mocked(runtime.submitForm).mock.calls[0]![0]).not.toHaveProperty('app');expect(inspectBuilderV2FormAction).not.toHaveBeenCalled();expect(submitBuilderV2FormAction).not.toHaveBeenCalled()
 fireEvent.click(screen.getByRole('button',{name:'Посмотреть список'}));expect(runtime.navigate).toHaveBeenCalledWith(app.homeScreenId)
})
it('refreshes a published record after saving an edit without requiring another click',async()=>{
 const runtime=transport(),app=appV2Fixture(),form=app.nodes.find(node=>node.id==='create_form')
 if(form?.type!=='form')throw new Error('Missing fixture form')
 form.mode='edit';app.screens.find(page=>page.id==='new')!.contextTableId='requests'
 render(<PublishedV2Context.Provider value={runtime}><AppV2Renderer app={app} tables={fixtureTables} actor={fixtureActor} screenId="new" record={{id:'row_a',tableId:'requests',values:{}}} live/></PublishedV2Context.Provider>);await tick()
 fireEvent.change(screen.getByLabelText('Название',{exact:true}),{target:{value:'Готовый заказ'}})
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Сохранить'})))
 expect(runtime.submitForm).toHaveBeenCalledWith(expect.objectContaining({recordId:'row_a'}))
 expect(runtime.refresh).toHaveBeenCalledWith('Изменения сохранены.')
 expect(screen.queryByRole('button',{name:'Обновить запись'})).toBeNull()
})
it('keeps the same request key after an unknown button response and prevents a second success submission',async()=>{
 const runtime=transport(),app=appV2Fixture(),node=app.nodes.find(node=>node.type==='button')!;if(node.type!=='button')throw new Error('Missing fixture button')
 vi.mocked(runtime.submitButton).mockRejectedValueOnce(new Error('connection lost')).mockResolvedValue({ok:true as const,repeated:true})
 render(<PublishedV2Context.Provider value={runtime}><PublishedV2Button node={node} screenId="detail" recordId="record-a"/></PublishedV2Context.Provider>)
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:node.label})));expect(screen.getByRole('alert').textContent).toContain('не выполнится дважды')
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Повторить запрос'})))
 const calls=vi.mocked(runtime.submitButton).mock.calls;expect(calls[0]![0]).toEqual(calls[1]![0]);expect(screen.queryByRole('button',{name:node.label})).toBeNull();expect(calls).toHaveLength(2)
})

it('opens a named deletion confirmation, cancels without writing and reuses the request after an uncertain response',async()=>{
 const runtime=transport(),node=appV2Fixture().nodes.find(node=>node.type==='button')!;if(node.type!=='button')throw new Error('Missing button')
 vi.mocked(runtime.inspectDelete).mockResolvedValue({ok:true,state:{revision:runtime.revision,fingerprint:'d'.repeat(64),recordLabel:'Мой проект',tableName:'Проекты'}})
 vi.mocked(runtime.submitDelete).mockRejectedValueOnce(new Error('connection lost')).mockResolvedValue({ok:true,repeated:true})
 render(<PublishedV2Context.Provider value={runtime}><PublishedV2Delete node={{...node,label:'Удалить'}} screenId="detail" recordId="mine"/></PublishedV2Context.Provider>)
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Удалить'})))
 expect(screen.getByRole('dialog').textContent).toContain('Мой проект');expect(runtime.submitDelete).not.toHaveBeenCalled()
 fireEvent.click(screen.getByRole('button',{name:'Отмена'}));expect(screen.queryByRole('dialog')).toBeNull();expect(document.activeElement).toBe(screen.getByRole('button',{name:'Удалить'}));expect(runtime.submitDelete).not.toHaveBeenCalled()
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Удалить'})))
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Удалить запись'})))
 expect((screen.getByRole('button',{name:'Отмена'}) as HTMLButtonElement).disabled).toBe(true)
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Повторить удаление'})))
 const calls=vi.mocked(runtime.submitDelete).mock.calls;expect(calls).toHaveLength(2);expect(calls[0]![0]).toEqual(calls[1]![0]);expect(calls[0]![0]).toMatchObject({confirmed:true,recordId:'mine'})
 expect(screen.queryByRole('dialog')).toBeNull();expect(runtime.submitButton).not.toHaveBeenCalled()
})

for(const layout of ['list','cards','table'] as const)it(`binds each ${layout} row button to its own item and refreshes after commit`,async()=>{
 const runtime=transport(),app=appV2Fixture(),list=app.nodes.find(node=>node.id==='request_list')!,button=app.nodes.find(node=>node.id==='complete_button')!;if(list.type!=='collection'||button.type!=='button')throw new Error('Bad fixture')
 app.screens[0]!.rootIds=[list.id];app.screens.find(screen=>screen.id==='detail')!.rootIds=app.screens.find(screen=>screen.id==='detail')!.rootIds.filter(id=>id!==button.id);list.itemIds=[button.id];list.layout=layout
 const configured=configureBuilderV2Button(app,button.id,['owner']),state=runtime.buttonState(button.id)!;runtime.buttonState=()=>undefined;runtime.invalidate=vi.fn()
 vi.mocked(runtime.readData).mockResolvedValue({ok:true,page:{kind:'collection',rows:['row_a','row_b'].map(id=>({id,tableId:'requests',values:{r_title:id},display:{r_title:id},visibleNodeIds:[button.id]})),total:2,next:null,value:null}})
 vi.mocked(runtime.inspectButton).mockResolvedValue({ok:true,state})
 render(<PublishedV2Context.Provider value={runtime}><AppV2Renderer app={configured} tables={fixtureTables} actor={fixtureActor} screenId="home" live/></PublishedV2Context.Provider>);await tick()
 expect(runtime.inspectButton).not.toHaveBeenCalled();const controls=screen.getAllByRole('button',{name:new RegExp('^'+button.label)});controls[1]!.focus()
 await act(async()=>fireEvent.click(controls[1]!))
 expect(runtime.inspectButton).toHaveBeenCalledWith({screenId:'home',nodeId:button.id,itemId:'row_b'});expect(runtime.submitButton).toHaveBeenCalledWith(expect.objectContaining({itemId:'row_b',fingerprint:state.fingerprint}));expect(runtime.invalidate).toHaveBeenCalledWith('Действие выполнено')
 expect((controls[0] as HTMLButtonElement).disabled).toBe(false);expect(document.activeElement).toBe(screen.getByRole('region',{name:'Заявки'}))
})
it('uses server visibility decisions for list items and reloads source data after invalidation',async()=>{
 const runtime=transport(),app=appV2Fixture(),list=app.nodes.find(node=>node.id==='request_list')!,button=app.nodes.find(node=>node.id==='complete_button')!;if(list.type!=='collection'||button.type!=='button')throw new Error('Bad fixture')
 app.screens[0]!.rootIds=[list.id];list.itemIds=[button.id];runtime.buttonState=()=>undefined
 const make=(visible:boolean)=>({ok:true as const,page:{kind:'collection' as const,rows:[{id:'row_a',tableId:'requests',values:{r_title:'Строка'},display:{r_title:'Строка'},visibleNodeIds:visible?[button.id]:[]}],total:1,next:null,value:null}})
 vi.mocked(runtime.readData).mockResolvedValueOnce(make(false)).mockResolvedValueOnce(make(true))
 const view=render(<PublishedV2Context.Provider value={runtime}><AppV2Renderer app={app} tables={fixtureTables} actor={fixtureActor} screenId="home" live/></PublishedV2Context.Provider>);await tick();expect(screen.queryByRole('button',{name:new RegExp('^'+button.label)})).toBeNull()
 view.rerender(<PublishedV2Context.Provider value={{...runtime,dataVersion:1}}><AppV2Renderer app={app} tables={fixtureTables} actor={fixtureActor} screenId="home" live/></PublishedV2Context.Provider>);await tick();expect(screen.getByRole('button',{name:new RegExp('^'+button.label)})).toBeTruthy();expect(runtime.readData).toHaveBeenCalledTimes(2)
})

it('offers only workflows with the same list-row and screen context',()=>{
 const app=appV2Fixture(),node=app.nodes.find(node=>node.id==='complete_button')!,list=app.nodes.find(node=>node.id==='request_list')!;if(node.type!=='button'||list.type!=='collection')throw new Error('Bad fixture')
 app.workflows.find(flow=>flow.id==='complete')!.input.screenTableId='requests'
 node.events.press=null;app.screens.find(screen=>screen.id==='detail')!.rootIds=app.screens.find(screen=>screen.id==='detail')!.rootIds.filter(id=>id!==node.id);list.itemIds=[node.id]
 render(<BuilderV2DeleteActionSettings app={app} node={node} screenId="home" onConfigure={vi.fn()} onConfigureChain={vi.fn()} onWorkflow={vi.fn()} onOpen={vi.fn()}/>)
 expect(screen.queryByRole('option',{name:app.workflows.find(flow=>flow.id==='complete')!.name})).toBeNull()
 expect(screen.getByRole('option',{name:app.workflows.find(flow=>flow.id==='open_request')!.name})).toBeTruthy()
})

for(const layout of ['list','cards','table'] as const)it(`runs the ${layout} row chain on its exact item and ignores nested buttons`,async()=>{
 const runtime=transport(),app=appV2Fixture(),list=app.nodes.find(node=>node.id==='request_list')!,button=app.nodes.find(node=>node.id==='complete_button')!
 if(list.type!=='collection'||button.type!=='button')throw new Error('Bad fixture')
 app.screens[0]!.rootIds=[list.id];list.layout=layout;list.itemIds=['request_title',button.id]
 runtime.rowAction=id=>id===list.id?{name:'Обработать'}:undefined;const state=runtime.buttonState(button.id)!;runtime.buttonState=()=>undefined
 vi.mocked(runtime.readData).mockResolvedValue({ok:true,page:{kind:'collection',rows:[{id:'row_a',tableId:'requests',values:{r_title:'Заказ Анны'},display:{r_title:'Заказ Анны'},visibleNodeIds:['request_title',button.id]}],total:1,next:null,value:null}})
 vi.mocked(runtime.inspectButton).mockResolvedValue({ok:true,state});vi.mocked(runtime.submitButton).mockResolvedValue({ok:true,repeated:false,effects:[{type:'notify',message:'Готово'}]})
 render(<PublishedV2Context.Provider value={runtime}><AppV2Renderer app={app} tables={fixtureTables} actor={fixtureActor} screenId="home" live/></PublishedV2Context.Provider>);await tick()
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:`${button.label}: Заказ Анны`})))
 expect(runtime.inspectButton).toHaveBeenCalledTimes(1);expect(runtime.inspectButton).toHaveBeenLastCalledWith({screenId:'home',nodeId:button.id,itemId:'row_a'})
 await act(async()=>fireEvent.click(screen.getByText('Заказ Анны',{selector:'strong'})))
 expect(runtime.inspectButton).toHaveBeenCalledTimes(2);expect(runtime.inspectButton).toHaveBeenLastCalledWith({screenId:'home',nodeId:list.id,itemId:'row_a'})
 expect(runtime.navigate).not.toHaveBeenCalled();expect(document.querySelector('button button')).toBeNull()
})
it('offers a native whole-row button, guards double clicks and preserves the parent record',async()=>{
 const runtime=transport(),app=appV2Fixture(),list=app.nodes.find(node=>node.id==='request_list')!;if(list.type!=='collection')throw new Error('Bad fixture')
 app.screens.find(s=>s.id==='detail')!.rootIds=[list.id];runtime.rowAction=()=>({name:'Обработать'});const state=runtime.buttonState(list.id)!;runtime.buttonState=()=>undefined
 vi.mocked(runtime.readData).mockResolvedValue({ok:true,page:{kind:'collection',rows:[{id:'child',tableId:'requests',values:{r_title:'Дочерняя строка'},display:{r_title:'Дочерняя строка'}}],total:1,next:null,value:null}})
 vi.mocked(runtime.inspectButton).mockResolvedValue({ok:true,state})
 render(<PublishedV2Context.Provider value={runtime}><AppV2Renderer app={app} tables={fixtureTables} actor={fixtureActor} record={{id:'parent',tableId:'requests',values:{}}} screenId="detail" live/></PublishedV2Context.Provider>);await tick()
 const trigger=screen.getByRole('button',{name:'Обработать: Дочерняя строка'});expect(trigger.textContent).toContain('Дочерняя строка')
 await act(async()=>{fireEvent.click(trigger);fireEvent.click(trigger)})
 expect(runtime.submitButton).toHaveBeenCalledTimes(1);expect(runtime.inspectButton).toHaveBeenCalledWith({screenId:'detail',nodeId:list.id,recordId:'parent',itemId:'child'})
})
for(const failure of ['denied','network'] as const)it(`unlocks a row after ${failure} preflight without inventing an uncertain mutation`,async()=>{
 const runtime=transport(),node=appV2Fixture().nodes.find(node=>node.type==='button')!;if(node.type!=='button')throw new Error('No button');const state=runtime.buttonState(node.id)!;runtime.buttonState=()=>undefined
 if(failure==='network')vi.mocked(runtime.inspectButton).mockRejectedValueOnce(new Error('offline'))
 else vi.mocked(runtime.inspectButton).mockResolvedValueOnce({ok:false,error:'Нет доступа'})
 vi.mocked(runtime.inspectButton).mockResolvedValueOnce({ok:true,state})
 render(<PublishedV2Context.Provider value={runtime}><PublishedV2Button node={node} screenId="home" itemId="row_a"/></PublishedV2Context.Provider>)
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:node.label})))
 expect(runtime.submitButton).not.toHaveBeenCalled();expect(screen.queryByRole('button',{name:'Повторить запрос'})).toBeNull()
 expect((screen.getByRole('button',{name:node.label}) as HTMLButtonElement).disabled).toBe(false)
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:node.label})));expect(runtime.inspectButton).toHaveBeenCalledTimes(2);expect(runtime.submitButton).toHaveBeenCalledTimes(1)
})

const deleteChallenge={fingerprint:'e'.repeat(64),records:[{recordLabel:'Заказ Анны',tableName:'Заявки'}]}
it('cancels a named chain confirmation and preserves the confirmed request across an unknown response',async()=>{
 const runtime=transport(),node=appV2Fixture().nodes.find(node=>node.type==='button')!;if(node.type!=='button')throw new Error('No button')
 vi.mocked(runtime.submitButton).mockResolvedValueOnce({ok:false,error:'Подтвердите удаление',confirmation:deleteChallenge}).mockResolvedValueOnce({ok:false,error:'Подтвердите удаление',confirmation:deleteChallenge}).mockRejectedValueOnce(new Error('lost')).mockResolvedValueOnce({ok:true,repeated:true,effects:[{type:'notify',message:'Удалено'}]})
 render(<PublishedV2Context.Provider value={runtime}><PublishedV2Button node={node} screenId="detail" recordId="row_a"/></PublishedV2Context.Provider>)
 const trigger=screen.getByRole('button',{name:node.label});trigger.focus()
 await act(async()=>fireEvent.click(trigger));expect(screen.getByRole('dialog').textContent).toContain('Заказ Анны');expect(runtime.submitButton).toHaveBeenCalledTimes(1)
 fireEvent.click(screen.getByRole('button',{name:'Отмена'}));expect(screen.queryByRole('dialog')).toBeNull();expect(runtime.submitButton).toHaveBeenCalledTimes(1);expect(document.activeElement).toBe(trigger)
 await act(async()=>fireEvent.click(trigger));await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Удалить и продолжить'})))
 expect((screen.getByRole('button',{name:'Отмена'}) as HTMLButtonElement).disabled).toBe(true)
 await act(async()=>fireEvent.click(within(screen.getByRole('dialog')).getByRole('button',{name:'Повторить запрос'})))
 const calls=vi.mocked(runtime.submitButton).mock.calls;expect(calls[2]![0]).toEqual(calls[3]![0]);expect(calls[2]![0]).toMatchObject({confirmation:deleteChallenge.fingerprint});expect(calls[0]![0].requestId).not.toBe(calls[1]![0].requestId);expect(screen.queryByRole('dialog')).toBeNull()
})
it('freezes form values during confirmation and submits the exact same values after approval',async()=>{
 const runtime=transport(),app=appV2Fixture();vi.mocked(runtime.submitForm).mockResolvedValueOnce({ok:false,error:'Подтвердите удаление',confirmation:deleteChallenge}).mockResolvedValueOnce({ok:true,repeated:false,effects:[{type:'notify',message:'Готово'}]})
 render(<PublishedV2Context.Provider value={runtime}><AppV2Renderer app={app} tables={fixtureTables} actor={fixtureActor} screenId="new" live/></PublishedV2Context.Provider>);await tick()
 fireEvent.change(screen.getByLabelText('Название',{exact:true}),{target:{value:'Заказ Анны'}})
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Сохранить'})));expect(screen.getByRole('dialog')).toBeTruthy();expect((screen.getByLabelText('Название',{exact:true}) as HTMLInputElement).disabled).toBe(true)
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Удалить и продолжить'})))
 const calls=vi.mocked(runtime.submitForm).mock.calls;expect(calls[1]![0]).toEqual({...calls[0]![0],confirmation:deleteChallenge.fingerprint});expect(screen.queryByRole('dialog')).toBeNull();expect(screen.getByRole('status').textContent).toBe('Готово')
})
