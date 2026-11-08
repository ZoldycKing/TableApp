import { describe,expect,it } from 'vitest'
import { normalizeFieldOptions,type Field } from '@tableapp/schema'
import { memberTableFields,projectMemberData,readableTableIds,tablePermission } from './table-permissions'
import { memberTableView } from './member-table-view'
const field=(id:string,name:string,type:Field['type'],options:unknown={})=>({id,name,tableId:'t',type,options:normalizeFieldOptions(type,options),description:null,position:'a0'}) as Field
describe('cabinet table permissions',()=>{
  it('preserves old roles, gives owners full access and never elevates viewers',()=>{
    expect(tablePermission({role:'editor'},'t')).toBe('edit')
    expect(tablePermission({role:'viewer'},'t')).toBe('view')
    expect(tablePermission({role:'owner',tableAccess:{}},'t')).toBe('edit')
    expect(tablePermission({role:'viewer',tableAccess:{t:'edit'}},'t')).toBe('view')
    expect(tablePermission({role:'unexpected'},'t')).toBe('none')
  })
  it('denies unlisted and newly added tables after choosing a table allowlist',()=>{
    const member={role:'editor',tableAccess:{t:'edit',read:'view',secret:'none'} as const}
    expect(tablePermission(member,'new')).toBe('none')
    expect(readableTableIds(member)).toEqual(['t','read'])
    expect(readableTableIds({role:'editor',tableAccess:{}})).toEqual([])
  })
  it('removes hidden relationships and transitive computed dependencies from row data',()=>{
    const fields=[field('title','Название','text'),field('private','Финансы','relation',{tableId:'secret'}),field('lookup','Подстановка','lookup',{relationFieldId:'private',targetFieldId:'amount'}),field('calc','Расчёт','formula',{expression:'{Подстановка} + 1'}),field('chain','Итого','formula',{expression:'{Расчёт} + 2'}),field('price','Цена','number',{initialFrom:{relationFieldId:'private',targetFieldId:'amount'}})]
    const allowed=memberTableFields(fields,{role:'editor',tableAccess:{t:'edit'}})
    expect(allowed.map(column=>column.id)).toEqual(['title'])
    expect(projectMemberData({title:'Товар',private:['secret-row'],lookup:9999,calc:10000,chain:10002},allowed)).toEqual({title:'Товар'})
  })
  it('removes hidden saved conditions and their literal values',async()=>{
    const {defaultViewConfig,viewSchema}=await import('@tableapp/schema')
    const columns=[field('title','Название','text'),field('secret','Секрет','text')]
    const config=defaultViewConfig('grid','filter')
    config.filter.conditions=[{id:'condition',fieldId:'secret',op:'is',value:'PRIVATE_VALUE'}]
    const view=viewSchema.parse({id:'v',tableId:'t',name:'Все записи',type:'grid',position:'a0',config})
    expect(JSON.stringify(memberTableView(view,columns,[columns[0]!]))).not.toContain('PRIVATE_VALUE')
  })
})
