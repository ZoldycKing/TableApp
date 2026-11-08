import {expect,it,vi} from 'vitest'
import {normalizeFieldOptions,type Field} from '@tableapp/schema'
import {readBuilderV2Chart,type BuilderV2ChartNode} from './builder-v2-chart'
vi.mock('./row-mutations',()=>({RowWriteError:class extends Error{constructor(readonly code:string,message:string){super(message)}}}))
const field=(id:string,type:Field['type'],options:unknown={})=>({id,tableId:'tasks',name:id,type,options:normalizeFieldOptions(type,options),position:'a0',description:null}) as Field
const fields=[field('category','text'),field('amount','number'),field('date','datetime',{timeZone:'America/New_York'}),field('status','single_select',{choices:[{id:'new',name:'Новый'}]})]
const node:BuilderV2ChartNode={id:'chart',name:'Итоги',type:'chart',visibleTo:null,visibleWhen:null,sourceId:'source',chartType:'bar',groupFieldId:'category',operation:'sum',fieldId:'amount',dateGrouping:'month',limit:3}
const read=(rows:Record<string,unknown>[],patch:Partial<BuilderV2ChartNode>={})=>readBuilderV2Chart({...node,...patch},fields,(async function*(){for(const data of rows)yield {data}})())
it('aggregates all rows and combines remaining averages by their numeric counts, keeping empty values explicit',async()=>{
 const rows=[{category:'A',amount:100},{category:'B',amount:90},{category:'C',amount:80},{category:'D',amount:10},{category:'D',amount:20},{category:'E',amount:30},{category:'E',amount:null}],sum=await read(rows),avg=await read(rows,{operation:'avg'})
 expect(sum).toMatchObject({kind:'chart',rows:[],next:null,total:7,chart:{groupCount:5,remainderGroups:2,points:[{label:'A',value:100},{label:'B',value:90},{label:'C',value:80},{label:'Остальные',value:60,count:4}]}});expect(avg.chart!.points.at(-1)).toMatchObject({label:'Остальные',value:20,count:4});expect(await read([{category:'A',amount:null}],{operation:'avg'})).toMatchObject({chart:{points:[{value:null}]}})
})
it('rejects a negative donut before positive remainder values can conceal a negative category',async()=>{
 await expect(read([{category:'A',amount:100},{category:'B',amount:80},{category:'C',amount:60},{category:'D',amount:20},{category:'E',amount:-10}],{chartType:'donut'})).rejects.toThrow('отрицательные')
 expect(await read([{category:'A',amount:-20},{category:'B',amount:50}])).toMatchObject({chart:{points:[{value:50},{value:-20}]}})
})
it('uses saved date zones and true chronological buckets, while reporting undated rows separately',async()=>{
 const result=await read([{date:'2026-11-01T02:00:00Z',amount:20},{date:'2026-11-01T05:00:00Z',amount:30},{date:null,amount:40}],{chartType:'line',groupFieldId:'date',dateGrouping:'day'})
 expect(result).toMatchObject({chart:{totalRows:3,undated:1,timeZone:'America/New_York',points:[{date:'2026-10-31',value:20},{date:'2026-11-01',value:30}]}})
 const rows=Array.from({length:61},(_,i)=>({date:new Date(Date.UTC(2026,0,i+1)).toISOString(),amount:1}));await expect(read(rows,{chartType:'line',groupFieldId:'date',dateGrouping:'day'})).rejects.toThrow('60 дат');expect((await read(rows,{chartType:'line',groupFieldId:'date',dateGrouping:'month'})).chart!.points.length).toBeLessThan(5)
})
it('labels unknown choices safely, bounds grouping memory and rejects invalid numeric metadata and overflow',async()=>{
 const result=await read([{status:'new'},{status:'secret-legacy'},{status:null}],{operation:'count',fieldId:null,groupFieldId:'status'});expect(result.chart!.points.map(point=>point.label)).toEqual(expect.arrayContaining(['Новый','Другой вариант','Без значения']));expect(JSON.stringify(result)).not.toContain('secret-legacy')
 await expect(read(Array.from({length:1001},(_,i)=>({category:String(i),amount:1})))).rejects.toThrow('Слишком много категорий');await expect(read([{category:'A',amount:1}],{fieldId:'category'})).rejects.toThrow('числовое');await expect(read([{category:'A',amount:1e308},{category:'A',amount:1e308}])).rejects.toThrow('велика')
})

it('fills missing periods with zero for counts and sums, while leaving missing averages undefined',async()=>{
 const rows=[{date:'2026-11-01T12:00:00Z',amount:20},{date:'2026-11-03T12:00:00Z',amount:40}],base={chartType:'line' as const,groupFieldId:'date',dateGrouping:'day' as const}
 expect((await read(rows,{...base,operation:'count',fieldId:null})).chart!.points).toMatchObject([{date:'2026-11-01',value:1},{date:'2026-11-02',value:0,count:0},{date:'2026-11-03',value:1}]);expect((await read(rows,base)).chart!.points[1]).toMatchObject({value:0});expect((await read(rows,{...base,operation:'avg'})).chart!.points[1]).toMatchObject({value:null})
 await expect(read([{date:'2026-01-01T12:00:00Z',amount:1},{date:'2026-12-31T12:00:00Z',amount:1}],base)).rejects.toThrow('60 дат')
})
