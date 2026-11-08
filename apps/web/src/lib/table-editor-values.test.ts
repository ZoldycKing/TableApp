import { describe,expect,it } from 'vitest'
import { normalizeFieldOptions,type Field } from '@tableapp/schema'
import { clipboardText,clipboardValue,groupEditorCells,parseEditorValue,parseTsv,planGridPaste,toTsv } from './table-editor-values'
const field=(type:Field['type'],id='f',options:Record<string,unknown>={})=>({id,tableId:'t',name:id,type,options:normalizeFieldOptions(type,options),description:null,position:'a0'}) as Field
describe('spreadsheet clipboard values',()=>{
  it('round trips quoted multiline TSV without adding an empty last record',()=>{
    const values=[['Название','Текст с\tтабуляцией'],['Строка\nвторая','Он сказал "да"']]
    expect(parseTsv(toTsv(values)+'\r\n')).toEqual(values)
    expect(()=>parseTsv('"не закрыто')).toThrow('кавычки')
  })
  it('accepts Russian numbers and refuses malformed numbers instead of clearing them',()=>{
    expect(parseEditorValue(field('number'),'1 234,50')).toBe(1234.5)
    expect(()=>parseEditorValue(field('number'),'не число')).toThrow('число')
  })
  it('maps visible relation and choice labels to stable IDs and rejects ambiguity',()=>{
    const relation=field('relation','r',{tableId:'products',allowMultiple:false})
    const titles={products:[{id:'p1',title:'Блокнот'}]}
    expect(clipboardValue(relation,'Блокнот',titles)).toEqual(['p1'])
    expect(clipboardText(relation,['p1'],titles)).toBe('Блокнот')
    expect(()=>clipboardValue(relation,'Блокнот',{products:[...titles.products,{id:'p2',title:'Блокнот'}]})).toThrow('несколько')
    expect(()=>clipboardValue(relation,'Нет товара',titles)).toThrow('нет варианта')
  })
  it('plans the whole rectangle before any mutation and includes original values',()=>{
    const rows=[{id:'r1',position:'a0',data:{name:'Первый',price:5}},{id:'r2',position:'a1',data:{name:'Второй',price:7}}]
    const fields=[field('text','name'),field('number','price')]
    const cells=planGridPaste([['Новый','12,5'],['Другой','8']],rows,fields,0,0,{})
    expect(groupEditorCells(cells)).toEqual([{id:'r1',data:{name:'Новый',price:12.5},base:{name:'Первый',price:5}},{id:'r2',data:{name:'Другой',price:8},base:{name:'Второй',price:7}}])
    expect(()=>planGridPaste([['Новый','12'],['Другой','ошибка']],rows,fields,0,0,{})).toThrow('число')
    expect(()=>planGridPaste([['1'],['2'],['3']],rows,fields,0,0,{})).toThrow('пределы')
  })
  it('fills a selected rectangle from one value and blocks computed targets',()=>{
    const rows=[{id:'r1',position:'a0',data:{}},{id:'r2',position:'a1',data:{}}]
    expect(planGridPaste([['9']],rows,[field('number')],0,0,{}, {rows:2,columns:1}).map(cell=>cell.value)).toEqual([9,9])
    expect(()=>planGridPaste([['9']],rows,[field('formula','total',{expression:'1+1'})],0,0,{})).toThrow('автоматически')
  })
})
