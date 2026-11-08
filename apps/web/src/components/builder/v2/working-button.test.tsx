// @vitest-environment jsdom
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {BuilderV2WorkingButton} from './working-button'
import {inspectBuilderV2ButtonAction,submitBuilderV2ButtonAction} from '@/app/builder-v2-button-actions'
vi.mock('@/app/builder-v2-button-actions',()=>({inspectBuilderV2ButtonAction:vi.fn(),submitBuilderV2ButtonAction:vi.fn()}))
vi.mock('next/navigation',()=>({useRouter:()=>({push:vi.fn()})}))
vi.mock('next/link',()=>({default:({children,...props}:React.AnchorHTMLAttributes<HTMLAnchorElement>)=><a {...props}>{children}</a>}))
const initial={revision:'a'.repeat(64),fingerprint:'b'.repeat(64),recordLabel:'Ремонт',tableName:'Заявки',actionName:'Завершить заявку',stepCount:3}
const props={appId:'app',scope:{screenId:'detail',nodeId:'complete',recordId:'row_A'},initial,returnHref:'/apps/app/preview?screen=detail&row=row_A'}
beforeEach(()=>{vi.clearAllMocks();HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','')};HTMLDialogElement.prototype.close=function(){this.removeAttribute('open')}});afterEach(cleanup)
it('blocks double clicks, retains the exact request after a lost response and applies success only once',async()=>{
  let reject!:(error:Error)=>void
  vi.mocked(submitBuilderV2ButtonAction).mockImplementationOnce(()=>new Promise((_resolve,rejectPromise)=>{reject=rejectPromise})).mockResolvedValueOnce({ok:false,error:'Доступ временно недоступен'}).mockResolvedValueOnce({ok:true,repeated:true,effects:[{type:'notify',message:'Заявка завершена'}]})
  render(<BuilderV2WorkingButton {...props}/>);fireEvent.click(screen.getByRole('button',{name:'Завершить заявку'}));fireEvent.click(screen.getByRole('button',{name:'Выполняем…'}))
  expect(submitBuilderV2ButtonAction).toHaveBeenCalledTimes(1)
  await act(async()=>reject(new Error('Lost response')))
  await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Повторить запрос'})))
  expect(screen.queryByRole('button',{name:'Обновить действие'})).toBeNull()
  await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Повторить запрос'})))
  expect(vi.mocked(submitBuilderV2ButtonAction).mock.calls.every(call=>JSON.stringify(call)===JSON.stringify(vi.mocked(submitBuilderV2ButtonAction).mock.calls[0]))).toBe(true)
  expect(screen.getByRole('status').textContent).toBe('Заявка завершена');expect(screen.queryByRole('button',{name:'Завершить заявку'})).toBeNull();expect(inspectBuilderV2ButtonAction).not.toHaveBeenCalled()
})
it('requires refresh after a stale result and starts a new confirmed version on the next explicit click',async()=>{
  vi.mocked(submitBuilderV2ButtonAction).mockResolvedValueOnce({ok:false,stale:true,error:'Запись изменилась'}).mockResolvedValueOnce({ok:true,repeated:false})
  vi.mocked(inspectBuilderV2ButtonAction).mockResolvedValueOnce({ok:true,state:{...initial,fingerprint:'c'.repeat(64),recordLabel:'Новый ремонт'}})
  render(<BuilderV2WorkingButton {...props}/>);await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Завершить заявку'})))
  await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Обновить действие'})))
  expect(screen.getByText('Новый ремонт')).toBeTruthy();expect(submitBuilderV2ButtonAction).toHaveBeenCalledTimes(1)
  await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Завершить заявку'})))
  const calls=vi.mocked(submitBuilderV2ButtonAction).mock.calls
  expect(calls[1]![1]).toMatchObject({fingerprint:'c'.repeat(64)});expect((calls[1]![1] as {requestId:string}).requestId).not.toBe((calls[0]![1] as {requestId:string}).requestId)
  expect(screen.getByRole('status').textContent).toBe('Действие выполнено')
})
it('shows a definite failed chain without success and allows a fresh retry',async()=>{
  vi.mocked(submitBuilderV2ButtonAction).mockResolvedValueOnce({ok:false,error:'Укажите название',trace:[{stepId:'stop',label:'Проверить условие',status:'failed'}]}).mockResolvedValueOnce({ok:true,repeated:false})
  render(<BuilderV2WorkingButton {...props}/>);await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Завершить заявку'})))
  expect(screen.getByRole('alert').textContent).toBe('Укажите название');expect(screen.getByRole('button',{name:'Посмотреть шаги'})).toBeTruthy();expect(screen.queryByRole('status')).toBeNull()
  await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Завершить заявку'})))
  const calls=vi.mocked(submitBuilderV2ButtonAction).mock.calls;expect((calls[1]![1] as {requestId:string}).requestId).not.toBe((calls[0]![1] as {requestId:string}).requestId)
})

it('waits for explicit confirmation of the whole author chain and lets the author cancel',async()=>{
 const confirmation={fingerprint:'d'.repeat(64),records:[{recordLabel:'Ремонт',tableName:'Заявки'}]}
 vi.mocked(submitBuilderV2ButtonAction).mockResolvedValueOnce({ok:false,error:'Подтвердите',confirmation}).mockResolvedValueOnce({ok:false,error:'Подтвердите',confirmation}).mockResolvedValueOnce({ok:true,repeated:false,effects:[{type:'notify',message:'Удалено'}]})
 render(<BuilderV2WorkingButton {...props}/>);await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Завершить заявку'})))
 expect(screen.getByRole('dialog').textContent).toContain('Ремонт');fireEvent.click(screen.getByRole('button',{name:'Отмена'}));expect(submitBuilderV2ButtonAction).toHaveBeenCalledTimes(1)
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Завершить заявку'})));await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Удалить и продолжить'})))
 expect(vi.mocked(submitBuilderV2ButtonAction).mock.calls[2]![1]).toMatchObject({confirmation:confirmation.fingerprint});expect(screen.queryByRole('dialog')).toBeNull()
})
