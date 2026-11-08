// @vitest-environment jsdom
import {StrictMode} from 'react'
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {PublishedV2Runtime} from './published-runtime'
import {BuilderV2ScreenEnter} from './screen-enter'
import {workflowValueLabel} from './workflow-values'
import {BuilderV2EnterNavigation} from './enter-navigation'
import {BuilderV2EnterSettings} from './enter-settings'
import {BuilderV2WorkflowFeedback} from './workflow-feedback'
import {appV2Fixture,fixtureTables} from './fixture.test-utils'
import {configureBuilderV2Enter} from '@/lib/builder-v2-enter-action'
import {submitBuilderV2EnterAction,submitPublishedV2EnterAction,inspectPublishedV2EnterAction} from '@/app/builder-v2-enter-actions'
import type {BuilderV2EnterResult} from '@/lib/builder-v2-enter-types'
import {openBuilderV2Url} from './browser-navigation'
const routing=vi.hoisted(()=>({push:vi.fn(),replace:vi.fn(),back:vi.fn(),refresh:vi.fn()}))
const body=vi.hoisted(()=>({mounts:0}))
vi.mock('next/navigation',()=>({useRouter:()=>routing}))
vi.mock('./view',async()=>{const React=await import('react');return {AppV2Renderer:()=>{React.useEffect(()=>{body.mounts++},[]);return null}}})
vi.mock('@/app/builder-v2-data-actions',()=>({readBuilderV2DataAction:vi.fn()}))
vi.mock('@/app/builder-v2-published-actions',()=>({inspectPublishedV2DeleteAction:vi.fn(),submitPublishedV2DeleteAction:vi.fn(),readPublishedV2DataAction:vi.fn(),readPublishedV2RecordAction:vi.fn(),inspectPublishedV2FormAction:vi.fn(),submitPublishedV2FormAction:vi.fn(),inspectPublishedV2ButtonAction:vi.fn(),submitPublishedV2ButtonAction:vi.fn()}))
vi.mock('./browser-navigation',()=>({openBuilderV2Url:vi.fn()}))
vi.mock('../prototype/icons',()=>({ProtoIcon:()=>null}))
vi.mock('@/app/builder-v2-enter-actions',()=>({submitBuilderV2EnterAction:vi.fn(),submitPublishedV2EnterAction:vi.fn(),inspectPublishedV2EnterAction:vi.fn(),inspectBuilderV2EnterAction:vi.fn()}))
vi.mock('@/app/builder-v2-workflow-actions',()=>({readBuilderV2WorkflowRunsAction:vi.fn()}))
const state={revision:'a'.repeat(64),fingerprint:'b'.repeat(64),recordLabel:null,tableName:null,actionName:'При открытии',stepCount:1},props={appId:'app_a',slug:'orders',scope:{screenId:'home'},initial:state,automatic:true}
beforeEach(()=>{vi.clearAllMocks();HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','')};HTMLDialogElement.prototype.close=function(){this.removeAttribute('open')}})
afterEach(cleanup)
it('executes once under StrictMode and keeps the same visit after a data refresh or an initial-state change',async()=>{
 vi.mocked(submitPublishedV2EnterAction).mockResolvedValue({ok:true,repeated:false,effects:[{type:'notify',message:'Добрый день'}]});const done=vi.fn(),view=render(<StrictMode><BuilderV2ScreenEnter {...props} onDone={done}/></StrictMode>);await act(async()=>{})
 expect(submitPublishedV2EnterAction).toHaveBeenCalledTimes(1);expect(done).toHaveBeenCalledTimes(1);expect(screen.getByText('Добрый день')).toBeTruthy()
 view.rerender(<StrictMode><BuilderV2ScreenEnter {...props} initial={{...state,fingerprint:'c'.repeat(64)}} onDone={done}/></StrictMode>);await act(async()=>{});expect(submitPublishedV2EnterAction).toHaveBeenCalledTimes(1)
})
it('retries an unconfirmed response with the same request and does not let a later stale refusal create a new attempt',async()=>{
 vi.mocked(submitPublishedV2EnterAction).mockRejectedValueOnce(new Error('Lost response')).mockResolvedValueOnce({ok:false,stale:true,error:'Нет подтверждения'}).mockResolvedValueOnce({ok:true,repeated:true})
 render(<BuilderV2ScreenEnter {...props}/>);await act(async()=>{});const first=vi.mocked(submitPublishedV2EnterAction).mock.calls[0]![1]
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Повторить запрос'})));await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Повторить запрос'})))
 expect(submitPublishedV2EnterAction).toHaveBeenCalledTimes(3);expect(submitPublishedV2EnterAction).toHaveBeenLastCalledWith('orders',first);expect(inspectPublishedV2EnterAction).not.toHaveBeenCalled()
})
it('does not run a private author check automatically or apply late results after the screen has been left',async()=>{
 let resolve!:(value:BuilderV2EnterResult)=>void;vi.mocked(submitBuilderV2EnterAction).mockImplementation(()=>new Promise(done=>{resolve=done}));const done=vi.fn(),view=render(<BuilderV2ScreenEnter appId="app_a" scope={props.scope} initial={state} onDone={done}/>)
 expect(submitBuilderV2EnterAction).not.toHaveBeenCalled();await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Выполнить проверку'})));view.unmount();await act(async()=>resolve({ok:true,repeated:false}));expect(done).not.toHaveBeenCalled()
})
it('requires deletion confirmation and permits cancelling without submitting an approval',async()=>{
 vi.mocked(submitPublishedV2EnterAction).mockResolvedValue({ok:false,error:'Подтвердите удаление',confirmation:{fingerprint:'d'.repeat(64),records:[{recordLabel:'Заказ',tableName:'Заказы'}]}})
 render(<BuilderV2ScreenEnter {...props}/>);await act(async()=>{});expect(screen.getByRole('dialog')).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'Отмена'}));expect(screen.getByText('Действие отменено.')).toBeTruthy();expect(submitPublishedV2EnterAction).toHaveBeenCalledTimes(1)
})
it('blocks redirect cycles and long automatic chains, while user navigation starts a fresh chain',()=>{
 const chain=new BuilderV2EnterNavigation();expect(chain.visit('a')).toBe(false);chain.prepare(true);expect(chain.visit('b')).toBe(false);chain.prepare(true);expect(chain.visit('a')).toBe(true);chain.prepare();expect(chain.visit('c')).toBe(false)
 for(let i=0;i<7;i++){chain.prepare(true);expect(chain.visit('new-'+i)).toBe(false)}chain.prepare(true);expect(chain.visit('new-8')).toBe(true)
})
it('does not submit a blocked entry and keeps external navigation and copying behind a real click',async()=>{
 const copy=vi.fn(async()=>{});Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:copy}});render(<BuilderV2ScreenEnter {...props} blocked/>);await act(async()=>{});expect(submitPublishedV2EnterAction).not.toHaveBeenCalled();cleanup()
 render(<BuilderV2WorkflowFeedback appId="app_a" requestKey="enter_x" requireGesture effects={[{type:'copy_value',value:'Телефон'},{type:'open_url',url:'https://example.test'}]}/>);await act(async()=>{});expect(copy).not.toHaveBeenCalled();expect(openBuilderV2Url).not.toHaveBeenCalled();await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Скопировать'})));expect(copy).toHaveBeenCalledWith('Телефон');expect(openBuilderV2Url).toHaveBeenCalledTimes(1)
})
it('offers a short screen setting and opens the existing workflow editor only when requested',()=>{
 expect(workflowValueLabel({tables:[],inputs:[],rowTableId:null,available:[]},{kind:'literal',value:'work'},{id:'status',name:'Статус',type:'single_select',choices:[{id:'work',name:'В работе'}]})).toBe('В работе');const app=configureBuilderV2Enter(appV2Fixture(),'home',['owner']),configure=vi.fn();render(<BuilderV2EnterSettings app={app} screenId="home" tables={fixtureTables} onConfigure={configure} onWorkflow={()=>null} onOpen={vi.fn()} canOpen/>);expect(screen.queryByRole('dialog')).toBeNull();fireEvent.click(screen.getByRole('button',{name:/Настроить шаги/}));expect(screen.getByRole('dialog',{name:'Шаги действия'})).toBeTruthy()
})

it('refreshes the record body and form context without remounting its already completed screen event',async()=>{
 body.mounts=0;const app=appV2Fixture(),data={login:false as const,app,actor:{authenticated:true,roleIds:['owner'],id:'user_a',email:'a@example.invalid',name:null,company:''},revision:state.revision,screenId:'detail',recordId:'row_a',record:{id:'row_a',tableId:'requests',values:{r_title:'До'},display:{r_title:'До'}},title:'До',buttons:{},rowActions:{},tables:fixtureTables,enter:state}
 vi.mocked(submitPublishedV2EnterAction).mockResolvedValue({ok:true,repeated:false});const view=render(<PublishedV2Runtime data={data}/>);await act(async()=>{});expect(submitPublishedV2EnterAction).toHaveBeenCalledTimes(1);expect(routing.refresh).toHaveBeenCalledTimes(1)
 view.rerender(<PublishedV2Runtime data={{...data,title:'После',record:{...data.record,values:{r_title:'После'},display:{r_title:'После'}},enter:{...state,fingerprint:'f'.repeat(64)}}}/>);await act(async()=>{});expect(body.mounts).toBe(2);expect(submitPublishedV2EnterAction).toHaveBeenCalledTimes(1)
})
