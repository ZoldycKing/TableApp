// @vitest-environment jsdom
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import type {Attachment} from '@tableapp/schema'
import type {BuilderV2FormField} from '@/lib/builder-v2-form-types'
import {workflowDefaultValue,workflowSources,type WorkflowScope} from './workflow-values'
import {BuilderV2AttachmentInput} from './attachment-input'
vi.mock('../prototype/icons',()=>({ProtoIcon:()=>null}))
beforeEach(()=>{URL.createObjectURL=vi.fn(()=> 'blob:test-photo');URL.revokeObjectURL=vi.fn()})
afterEach(cleanup)
const field:BuilderV2FormField={nodeId:'photo_input',fieldId:'photos',label:'Фотографии',type:'image',required:false,readOnly:false,supported:true,maxCount:2}
const attachment:Attachment={id:'att_photo',key:'workspace/photo.png',name:'photo.png',mime:'image/png',size:3,width:null,height:null}
const photo=()=>new File(['png'],'photo.png',{type:'image/png'})
it('keeps a selected file pending until upload finishes, returns metadata and releases local previews on unmount',async()=>{
 let resolve!:(file:Attachment)=>void;const upload=vi.fn(()=>new Promise<Attachment>(done=>{resolve=done})),change=vi.fn(),pending=vi.fn(),view=render(<BuilderV2AttachmentInput id="photos" field={field} value={[]} disabled={false} upload={upload} onChange={change} onPending={pending}/>)
 const picker=view.container.querySelector('input[type=file]')!;await act(async()=>fireEvent.change(picker,{target:{files:[photo()]}}));expect(screen.getByRole('status').textContent).toContain('photo.png');expect(pending).toHaveBeenLastCalledWith('photos',true)
 await act(async()=>resolve(attachment));expect(change).toHaveBeenCalledWith([attachment]);view.rerender(<BuilderV2AttachmentInput id="photos" field={field} value={[attachment]} disabled={false} upload={upload} onChange={change} onPending={pending}/>);expect(view.container.querySelector('img')?.src).toBe('blob:test-photo');expect(screen.getByText('photo.png')).toBeTruthy();expect(pending).toHaveBeenLastCalledWith('photos',false)
 fireEvent.click(screen.getByRole('button',{name:'Убрать файл photo.png'}));expect(change).toHaveBeenLastCalledWith([]);view.unmount();expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-photo')
})
it('keeps failed files visible and blocks saving until retry succeeds or the selection is removed',async()=>{
 const upload=vi.fn().mockRejectedValueOnce(new Error('Нет соединения')).mockResolvedValueOnce(attachment),pending=vi.fn(),change=vi.fn(),view=render(<BuilderV2AttachmentInput id="photos" field={field} value={[]} disabled={false} upload={upload} onChange={change} onPending={pending}/>)
 await act(async()=>fireEvent.change(view.container.querySelector('input')!,{target:{files:[photo()]}}));expect(screen.getByRole('alert').textContent).toBe('Нет соединения');expect(pending).toHaveBeenLastCalledWith('photos',true);expect(change).not.toHaveBeenCalled()
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Повторить загрузку'})));expect(upload).toHaveBeenCalledTimes(2);expect(change).toHaveBeenCalledWith([attachment]);expect(pending).toHaveBeenLastCalledWith('photos',false)
})
it('rejects too many or wrong-type files before upload, retains existing files and aborts an obsolete form',async()=>{
 const upload=vi.fn((_file:File,_signal:AbortSignal)=>new Promise<Attachment>(()=>{})),change=vi.fn(),view=render(<BuilderV2AttachmentInput id="photos" field={field} value={[attachment]} disabled={false} upload={upload} onChange={change} onPending={vi.fn()}/>)
 await act(async()=>fireEvent.change(view.container.querySelector('input')!,{target:{files:[photo(),photo()]}}));expect(screen.getByRole('alert').textContent).toContain('ещё 1');expect(upload).not.toHaveBeenCalled()
 await act(async()=>fireEvent.change(view.container.querySelector('input')!,{target:{files:[new File(['x'],'note.txt',{type:'text/plain'})]}}));expect(screen.getByRole('alert').textContent).toContain('PNG');expect(upload).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:/Убрать не загруженный файл/}))
 await act(async()=>fireEvent.change(view.container.querySelector('input')!,{target:{files:[photo()]}}));const signal=upload.mock.calls[0]![1] as AbortSignal;view.unmount();expect(signal.aborted).toBe(true);expect(change).not.toHaveBeenCalled()
})
it('shows read-only attachments without removal controls and never uploads from layout preview',()=>{
 const view=render(<BuilderV2AttachmentInput id="photos" field={{...field,readOnly:true}} value={[attachment]} disabled slug="work" onChange={vi.fn()} onPending={vi.fn()}/>);expect(screen.queryByRole('button')).toBeNull();expect(view.container.querySelector('img')?.getAttribute('src')).toContain('?v2App=work')
 view.rerender(<BuilderV2AttachmentInput id="photos" field={field} value={[]} disabled={false} onChange={vi.fn()} onPending={vi.fn()}/>);expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true);expect(screen.getByText('Загрузка доступна в рабочей форме.')).toBeTruthy()
})
it('relabels a single-photo control to replace and swaps the file on pick',async()=>{
 const single={...field,maxCount:1},next:Attachment={...attachment,id:'att_next',key:'workspace/next.png',name:'next.png'}
 const upload=vi.fn().mockResolvedValue(next),change=vi.fn(),view=render(<BuilderV2AttachmentInput id="photos" field={single} value={[attachment]} disabled={false} upload={upload} onChange={change} onPending={vi.fn()}/>)
 expect(screen.getByRole('button',{name:'Заменить фото'})).toBeTruthy()
 await act(async()=>fireEvent.change(view.container.querySelector('input')!,{target:{files:[photo()]}}))
 expect(change).toHaveBeenCalledWith([])
 expect(upload).toHaveBeenCalledTimes(1)
 expect(change).toHaveBeenLastCalledWith([next])
})

it('offers attachment values from the same form field without text, user names or unrelated file cells',()=>{
 const fields=[{id:'title',name:'Название',type:'text' as const},{id:'photos',name:'Фото',type:'image' as const},{id:'other',name:'Другое фото',type:'image' as const}],form={id:'form',type:'form' as const,name:'Новая запись',tableId:'orders',mode:'create' as const,childIds:[],submitLabel:'Сохранить',events:{submit:null},visibleTo:null,visibleWhen:null}
 const scope:WorkflowScope={tables:[{id:'orders',name:'Заказы',primaryFieldId:'title',fields,views:[]}],form,inputs:fields.map(field=>({id:'input_'+field.id,type:'input',fieldId:field.id,name:field.name,label:field.name,required:false,initialValue:null,visibleTo:null,visibleWhen:null})),rowTableId:null,available:[]}
 expect(workflowSources(scope,fields[1])).toEqual([{binding:{kind:'form',formId:'form',fieldId:'photos'},label:'Из формы: Фото',field:fields[1]}]);expect(workflowDefaultValue({...scope,form:undefined,inputs:[]},fields[1]!)).toEqual({kind:'literal',value:[]})
})
