import {expect,it,vi} from 'vitest'
import {normalizeFieldOptions,type Field} from '@tableapp/schema'
import {appV2Fixture} from '../../../../packages/schema/src/app-v2/fixture.test-utils'
import {builderCalendarDate,builderCalendarDay,builderCalendarTime} from './builder-v2-calendar'
vi.mock('./row-mutations',()=>({RowWriteError:class extends Error{constructor(readonly code:string,message:string){super(message)}}}))
import {readBuilderCollectionWindow} from './builder-v2-collection-window'

const field=(type:Field['type'],options:unknown={})=>({id:'field',tableId:'requests',name:'Поле',type,options:normalizeFieldOptions(type,options),position:'a0',description:null}) as Field
function fixture(layout:'calendar'|'kanban'){
 const node=appV2Fixture().nodes.find(node=>node.id==='request_list')!;if(node.type!=='collection')throw new Error('No list');node.layout=layout
 const rows=Array.from({length:13},(_,i)=>({id:`r${String(i).padStart(2,'0')}`,data:{field:i<7?'2026-11-03T21:00:00Z':i<9?'2026-11-05':null}}))
 return {node,field:field('date'),request:{nodeId:node.id,calendarMonth:'2026-11',calendarDay:'2026-11-04'},binding:'actor:revision',pageSize:2,iterate:async function*(){yield* rows},output:(row:typeof rows[number])=>({id:row.id,tableId:'requests',values:row.data,display:{}}),compare:(a:typeof rows[number],b:typeof rows[number])=>a.id.localeCompare(b.id)}
}
it('uses the existing civil-date, stored-instant and saved-zone policies, including DST',()=>{
 expect(builderCalendarDate('2026-11-03T21:00:00Z','date')).toBe('2026-11-04')
 expect(builderCalendarDate('2026-11-04','date','America/New_York')).toBe('2026-11-04')
 expect(builderCalendarDate('2026-11-01T02:00:00Z','datetime','America/New_York')).toBe('2026-10-31')
 expect(builderCalendarDate('2026-03-08T02:30','datetime','America/New_York')).toBeNull()
 expect(builderCalendarDate('2026-02-30','date')).toBeNull();expect(builderCalendarDay('2024-02-29')).toBe(true);expect(builderCalendarDay('2026-02-29')).toBe(false)
 expect(builderCalendarTime('2026-11-01T02:00:00Z','America/New_York')).toBe('22:00')
})
it('counts the full month while paging only the selected day, and isolates each day cursor',async()=>{
 const options=fixture('calendar'),first=await readBuilderCollectionWindow(options)
 expect(first).toMatchObject({total:7,calendar:{days:{'2026-11-04':7,'2026-11-05':2},undated:4},rows:[{id:'r00'},{id:'r01'}]});expect(first.next).toBeTruthy()
 const second=await readBuilderCollectionWindow({...options,request:{...options.request,cursor:first.next!}});expect(second.rows.map(row=>row.id)).toEqual(['r02','r03'])
 await expect(readBuilderCollectionWindow({...options,request:{...options.request,calendarDay:'2026-11-05',cursor:first.next!}})).rejects.toThrow()
 const empty=await readBuilderCollectionWindow({...options,request:{nodeId:options.node.id,calendarMonth:'undated'}});expect(empty.total).toBe(4)
})
it('builds bounded column previews and exact totals, with independent continuation and a lazy column',async()=>{
 const options=fixture('kanban'),choices=Array.from({length:14},(_,i)=>({id:`s${i}`,name:`Статус ${i}`})),rows=Array.from({length:9},(_,i)=>({id:`r${i}`,data:{field:i<7?'s0':i===7?'s13':null}}))
 const next={...options,field:field('single_select',{choices}),request:{nodeId:options.node.id},iterate:async function*(){yield* rows}},first=await readBuilderCollectionWindow(next)
 expect(first.board!.columns.find(column=>column.key==='c:s0')).toMatchObject({total:7,rows:[{id:'r0'},{id:'r1'}]})
 const column=first.board!.columns.find(column=>column.key==='c:s0')!,page=await readBuilderCollectionWindow({...next,request:{...next.request,boardColumn:column.key,cursor:column.next!}})
 expect(page.board!.columns[0]!.rows.map(row=>row.id)).toEqual(['r2','r3'])
 const lazy=first.board!.columns.find(column=>column.key==='c:s13')!;expect(lazy.rows).toEqual([]);expect(lazy.next).toBeTruthy()
 expect((await readBuilderCollectionWindow({...next,request:{...next.request,boardColumn:lazy.key,cursor:lazy.next!}})).rows.map(row=>row.id)).toEqual(['r7'])
 await expect(readBuilderCollectionWindow({...next,request:{...next.request,boardColumn:'c:s13',cursor:column.next!}})).rejects.toThrow()
 await expect(readBuilderCollectionWindow({...next,request:{...next.request,boardColumn:'c:forged'}})).rejects.toThrow()
})
