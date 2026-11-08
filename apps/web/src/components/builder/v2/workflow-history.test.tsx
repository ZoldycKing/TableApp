// @vitest-environment jsdom
import {act,cleanup,fireEvent,render,screen,within} from '@testing-library/react'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {readBuilderV2WorkflowRunsAction,type BuilderV2WorkflowHistory as Result} from '@/app/builder-v2-workflow-actions'
import {BuilderV2WorkflowHistory} from './workflow-history'
vi.mock('@/app/builder-v2-workflow-actions',()=>({readBuilderV2WorkflowRunsAction:vi.fn()}))
vi.mock('next/navigation',()=>({useRouter:()=>({push:vi.fn()})}))
vi.mock('../prototype/icons',()=>({ProtoIcon:()=>null}))
beforeEach(()=>{vi.resetAllMocks();HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','')};HTMLDialogElement.prototype.close=function(){this.removeAttribute('open')}})
afterEach(cleanup)
const run={id:'run_one',createdAt:'2026-11-04T00:00:00Z',workflowName:'Сохранить проект',status:'failed' as const,error:'Проверка не пройдена',trace:[{stepId:'save',label:'Изменить запись',status:'rolled_back' as const},{stepId:'check',label:'Проверить условие',status:'failed' as const}],actor:{name:'Анна',email:'anna@example.invalid'}}
it('shows the app user, error and steps without offering to rerun a failed action',async()=>{
 vi.mocked(readBuilderV2WorkflowRunsAction).mockResolvedValue({ok:true,runs:[run],next:null})
 await act(async()=>render(<BuilderV2WorkflowHistory appId="app_one" initialSource="published" onClose={()=>{}}/>))
 expect(readBuilderV2WorkflowRunsAction).toHaveBeenCalledWith('app_one',undefined,'published');expect(screen.getByText(/anna@example.invalid/)).toBeTruthy()
 fireEvent.click(screen.getByRole('button',{name:'Посмотреть шаги'}));const dialog=screen.getByRole('dialog',{name:'Как выполнилось действие'});expect(within(dialog).getByRole('alert').textContent).toBe('Проверка не пройдена');expect(dialog.textContent).toContain('Изменить запись');expect(screen.queryByRole('button',{name:'Запустить снова'})).toBeNull()
})
it('discards a late response from the previous source when the author switches tabs',async()=>{
 let finish!:(value:Result)=>void;vi.mocked(readBuilderV2WorkflowRunsAction).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve})).mockResolvedValueOnce({ok:true,runs:[run],next:null})
 await act(async()=>render(<BuilderV2WorkflowHistory appId="app_one" onClose={()=>{}}/>))
 await act(async()=>fireEvent.click(screen.getByRole('tab',{name:'В приложении'})))
 await act(async()=>finish({ok:true,runs:[{...run,id:'old',workflowName:'Устаревшая проверка'}],next:null}))
 expect(screen.getByText('Сохранить проект')).toBeTruthy();expect(screen.queryByText('Устаревшая проверка')).toBeNull()
})
it('reloads the first page after an expired cursor rather than repeating the same cursor',async()=>{
 vi.mocked(readBuilderV2WorkflowRunsAction).mockResolvedValueOnce({ok:true,runs:[run],next:'cursor'}).mockResolvedValueOnce({ok:false,error:'Обновите список запусков',reset:true}).mockResolvedValueOnce({ok:true,runs:[],next:null})
 await act(async()=>render(<BuilderV2WorkflowHistory appId="app_one" initialSource="published" onClose={()=>{}}/>))
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Показать ещё'})));expect(screen.getByRole('alert').textContent).toContain('Обновите')
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Обновить список'})));expect(readBuilderV2WorkflowRunsAction).toHaveBeenLastCalledWith('app_one',undefined,'published');expect(screen.getByText(/Пока никто/)).toBeTruthy()
})
