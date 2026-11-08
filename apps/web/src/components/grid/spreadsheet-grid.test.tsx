// @vitest-environment jsdom
import { act,cleanup,fireEvent,render,waitFor } from '@testing-library/react'
import { afterEach,describe,expect,it,vi } from 'vitest'
import { normalizeFieldOptions,type Field } from '@tableapp/schema'
import { SpreadsheetGrid } from './spreadsheet-grid'
import type { EditorLeaveGuard,EditorResult } from '@/lib/table-editor-values'
vi.mock('@/components/file-upload',()=>({AttachmentPreview:()=>null,FileUpload:()=>null}))
const name={id:'name',tableId:'t',name:'Название',type:'text',options:normalizeFieldOptions('text',{}),description:null,position:'a0'} as Field
const price={...name,id:'price',name:'Цена',type:'number',options:normalizeFieldOptions('number',{})} as Field
const rows=[{id:'r1',position:'a0',data:{name:'Первый',price:5}},{id:'r2',position:'a1',data:{name:'Второй',price:7}}]
const props={fields:[name,price],groups:[{key:'',value:null,rows}],isGrouped:false,onSetCell:vi.fn(async()=>({ok:true as const})),onAddRow:vi.fn(),onDeleteRow:vi.fn(),onRenameField:vi.fn()}
const paste=(grid:HTMLElement,text:string)=>fireEvent.paste(grid,{clipboardData:{getData:()=>text}})
afterEach(()=>{cleanup();vi.clearAllMocks()})
describe('spreadsheet interactions',()=>{
  it('virtualizes long lists while keeping keyboard selection and copy across unmounted rows', () => {
    const many = Array.from({length:200}, (_,index) => ({id:`row-${index}`,position:String(index),data:{name:`Строка ${index+1}`,price:index}}))
    const ui = render(<SpreadsheetGrid {...props} groups={[{key:'',value:null,rows:many}]}/>), grid=ui.getByRole('grid')
    expect(ui.getAllByRole('row').length).toBeLessThan(40)
    for(let i=0;i<199;i++)fireEvent.keyDown(grid,{key:'ArrowDown',shiftKey:true})
    expect(grid.getAttribute('aria-activedescendant')).toBe('gridcell-row-199-name')
    expect(ui.container.querySelector('#gridcell-row-199-name')).toBeTruthy()
    const copy=vi.fn();fireEvent.copy(grid,{clipboardData:{setData:copy}})
    expect(copy).toHaveBeenCalledWith('text/plain',many.map(row=>row.data.name).join('\n'))
    fireEvent.scroll(grid,{target:{scrollTop:3500}})
    expect(ui.getAllByRole('row').length).toBeLessThan(40)
    expect(ui.container.querySelector('#gridcell-row-199-name')).toBeTruthy()
  })
  it('copies a rectangular keyboard selection and submits one atomic range',async()=>{
    const batch=vi.fn(async(_cells:unknown)=>({ok:true as const})),write=vi.fn()
    const view=render(<SpreadsheetGrid {...props} onBatchChange={batch}/>),grid=view.getByRole('grid')
    fireEvent.keyDown(grid,{key:'ArrowRight',shiftKey:true});fireEvent.keyDown(grid,{key:'ArrowDown',shiftKey:true})
    fireEvent.copy(grid,{clipboardData:{setData:write}})
    expect(write).toHaveBeenCalledWith('text/plain','Первый\t5\nВторой\t7')
    paste(grid,'Новый\t10\nДругой\t20')
    await waitFor(()=>expect(batch).toHaveBeenCalledTimes(1))
    expect(batch.mock.calls[0]![0]).toEqual([{rowId:'r1',fieldId:'name',value:'Новый',base:'Первый'},{rowId:'r1',fieldId:'price',value:10,base:5},{rowId:'r2',fieldId:'name',value:'Другой',base:'Второй'},{rowId:'r2',fieldId:'price',value:20,base:7}])
    expect(props.onSetCell).not.toHaveBeenCalled()
  })
  it('validates the whole paste before sending any cell',()=>{
    const batch=vi.fn(),view=render(<SpreadsheetGrid {...props} onBatchChange={batch}/>)
    paste(view.getByRole('grid'),'Новый\tне число')
    expect(view.getByRole('alert').textContent).toContain('число');expect(batch).not.toHaveBeenCalled();expect(props.onSetCell).not.toHaveBeenCalled()
  })
  it('retains a rejected paste on screen and retries exactly the same IDs and bases',async()=>{
    const batch=vi.fn<(cells:unknown)=>Promise<EditorResult>>().mockResolvedValueOnce({ok:false,error:'Конфликт правки'}).mockResolvedValue({ok:true})
    const view=render(<SpreadsheetGrid {...props} onBatchChange={batch}/>);paste(view.getByRole('grid'),'Мой ввод\t10')
    await waitFor(()=>expect(view.getByRole('alert').textContent).toContain('Конфликт'))
    expect(view.getByText('Мой ввод')).toBeTruthy()
    fireEvent.click(view.getByRole('button',{name:'Повторить вставку'}))
    await waitFor(()=>expect(batch).toHaveBeenCalledTimes(2));expect(batch.mock.calls[1]).toEqual(batch.mock.calls[0])
  })
  it('leaves invalid numeric input visible and refuses draft saving',async()=>{
    let guard:EditorLeaveGuard|null=null
    const saveDraft=vi.fn(async()=>true),draft={id:'new',position:'a2',data:{price:5}}
    const view=render(<SpreadsheetGrid {...props} draftRow={draft} selectedRowId="new" onSaveDraft={saveDraft} registerLeaveGuard={value=>{guard=value}}/>)
    fireEvent.keyDown(view.getByRole('grid'),{key:'ArrowRight'});fireEvent.keyDown(view.getByRole('grid'),{key:'Enter'})
    const input=view.getByRole('textbox',{name:'Цена'});fireEvent.change(input,{target:{value:'не число'}})
    await act(async()=>{input.focus();expect(await guard!.save()).toBe(false)})
    expect((input as HTMLInputElement).value).toBe('не число');expect(saveDraft).not.toHaveBeenCalled();expect(props.onSetCell).not.toHaveBeenCalled()
  })
  it('starts typing in the selected cell and commits with its original base',async()=>{
    const view=render(<SpreadsheetGrid {...props}/>),grid=view.getByRole('grid')
    fireEvent.keyDown(grid,{key:'Н'})
    const input=view.getByRole('textbox',{name:'Название'});expect((input as HTMLInputElement).value).toBe('Н')
    fireEvent.change(input,{target:{value:'Новое название'}});fireEvent.keyDown(input,{key:'Tab'})
    await waitFor(()=>expect(props.onSetCell).toHaveBeenCalledWith('r1','name','Новое название','Первый'))
    await waitFor(()=>expect(grid.getAttribute('aria-activedescendant')).toBe('gridcell-r1-price'))
  })
  it('restores a range by IDs and reports its scroll bookmark',()=>{
    const bookmark={anchor:{rowId:'r1',fieldId:'name'},focus:{rowId:'r2',fieldId:'price'},scrollLeft:77,scrollTop:25}
    const remember=vi.fn(),view=render(<SpreadsheetGrid {...props} bookmark={bookmark} onBookmarkChange={remember}/>)
    expect(view.container.querySelectorAll('td[aria-selected="true"]')).toHaveLength(4)
    expect(view.getByRole('grid').scrollLeft).toBe(77)
    fireEvent.scroll(view.getByRole('grid'),{target:{scrollLeft:120,scrollTop:50}})
    expect(remember).toHaveBeenLastCalledWith({...bookmark,scrollLeft:120,scrollTop:50})
  })
})
