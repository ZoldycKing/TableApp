import {dateInstant,fieldTimeZone,type Field} from '@tableapp/schema'
import type {AppV2Node} from '@tableapp/schema/app-v2'
import {builderCalendarDate,builderCalendarToday} from './builder-v2-calendar'
import {validBuilderCollectionQuery} from './builder-v2-collection-query'
import {builderV2Revision} from './builder-v2-revision'
import {historyCursor,readHistoryCursor} from './history-cursor'
import {RowWriteError} from './row-mutations'
import type {BuilderV2DataPage,BuilderV2DataRecord,BuilderV2DataRequest} from './builder-v2-data-types'

export function builderCollectionWindowField(node:AppV2Node,fields:readonly Field[]){
  if(node.type!=='collection'||!['calendar','kanban'].includes(node.layout))return null
  const field=fields.find(field=>field.id===(node.layout==='calendar'?node.dateFieldId:node.groupFieldId))
  if(!field||(node.layout==='calendar'?!['date','datetime'].includes(field.type):field.type!=='single_select'))throw new RowWriteError('invalid',node.layout==='calendar'?'Выберите поле даты для календаря':'Выберите поле статуса для канбана')
  return field
}

/** Bounded previews, complete authorized counts, and separate opaque continuation for each column/day. */
export async function readBuilderCollectionWindow<T extends {id:string;data:Record<string,unknown>}>(options:{node:Extract<AppV2Node,{type:'collection'}>;field:Field;request:BuilderV2DataRequest;binding:string;pageSize:number;iterate:(asOf:number)=>AsyncIterable<T>;output:(row:T)=>BuilderV2DataRecord;compare:(a:T,b:T)=>number;preserveSort?:boolean}):Promise<BuilderV2DataPage>{
  const {node,field,request,pageSize,output}=options
  if(!validBuilderCollectionQuery(request))throw new RowWriteError('invalid','Выберите день или колонку заново')
  const timeZone=fieldTimeZone(field),today=builderCalendarToday(timeZone),month=request.calendarMonth??today.slice(0,7),day=month==='undated'?null:request.calendarDay??(today.startsWith(month)?today:`${month}-01`)
  if(node.layout==='calendar'&&request.boardColumn!==undefined||node.layout==='kanban'&&(request.calendarMonth!==undefined||request.calendarDay!==undefined))throw new RowWriteError('invalid','Параметры не относятся к этому виду списка')
  const choices=field.type==='single_select'?field.options.choices:[],definitions=node.layout==='kanban'?[...choices.map(choice=>({key:`c:${choice.id}`,name:choice.name})),{key:'empty',name:'Без статуса'},{key:'other',name:'Другой статус'}]:[]
  if(request.boardColumn!==undefined&&!definitions.some(column=>column.key===request.boardColumn))throw new RowWriteError('invalid','Колонка больше недоступна')
  const choiceKeys=new Set(choices.map(choice=>choice.id))
  const identity=(column?:string)=>builderV2Revision([options.binding,node.layout,node.layout==='calendar'?[month,day]:column??null,field]),binding=identity(request.boardColumn)
  let state:{lastId:string|null;asOf:number}|null
  try{state=readHistoryCursor(request.cursor,binding) as typeof state}catch{throw new RowWriteError('conflict','Данные изменились. Обновите этот вид списка.')}
  const compare=(a:T,b:T)=>node.layout==='calendar'&&field.type==='datetime'&&!options.preserveSort?((dateInstant(a.data[field.id],timeZone)??0)-(dateInstant(b.data[field.id],timeZone)??0)||options.compare(a,b)):options.compare(a,b)
  if(state&&(state.lastId!==null&&typeof state.lastId!=='string'||!Number.isFinite(state.asOf)||state.asOf<0||state.asOf>Date.now()+60000))throw new RowWriteError('conflict','Обновите список')
  const asOf=state?.asOf??Date.now(),groups=new Map(definitions.map((definition,index)=>[definition.key,{...definition,total:0,top:[] as T[],limit:request.boardColumn?pageSize:index<12?Math.min(pageSize,6):0}])),days:Record<string,number>={}
  const top:T[]=[];let total=0,undated=0,anchor:T|undefined
  // The anchor is selected from the same complete, authorized stream as every other row.
  // Collect just the bounded page plus its anchor, then compare against it on the second pass.
  const selected=(row:T)=>{
    if(node.layout==='calendar'){const date=builderCalendarDate(row.data[field.id],field.type as 'date'|'datetime',timeZone);return month==='undated'?!date:date===day}
    const value=row.data[field.id],key=value===null||value===undefined||value===''?'empty':choiceKeys.has(value as string)?`c:${String(value)}`:'other'
    return request.boardColumn===undefined||key===request.boardColumn
  }
  if(state?.lastId){for await(const row of options.iterate(asOf))if(row.id===state.lastId&&selected(row)){anchor=row;break}if(!anchor)throw new RowWriteError('conflict','Данные изменились. Обновите список')}
  const push=(bucket:T[],row:T,limit:number)=>{if(!limit||anchor&&compare(row,anchor)<=0)return;bucket.push(row);bucket.sort(compare);if(bucket.length>limit+1)bucket.pop()}
  for await(const row of options.iterate(asOf)){
    if(node.layout==='calendar'){
      const date=builderCalendarDate(row.data[field.id],field.type as 'date'|'datetime',timeZone)
      if(!date)undated++;else if(date.startsWith(month+'-'))days[date]=(days[date]??0)+1
      if(selected(row)){total++;push(top,row,pageSize)}
    }else{
      const value=row.data[field.id],key=value===null||value===undefined||value===''?'empty':choiceKeys.has(value as string)?`c:${String(value)}`:'other',group=groups.get(key)!
      group.total++;if(request.boardColumn===undefined||request.boardColumn===key)push(group.top,row,group.limit)
    }
  }
  const token=(last:T|undefined,column?:string)=>historyCursor({lastId:last?.id??null,asOf},identity(column))
  if(node.layout==='calendar'){const result=top.slice(0,pageSize);return {kind:'collection',rows:result.map(output),value:null,total,next:top.length>pageSize?token(result.at(-1)):null,calendar:{month,day,days,undated,timeZone}}}
  const columns=[...groups.values()].filter(group=>(request.boardColumn===undefined||group.key===request.boardColumn)&&(group.key!=='other'||group.total>0)).map(group=>{const result=group.top.slice(0,group.limit);return {key:group.key,name:group.name,total:group.total,rows:result.map(output),next:group.total>(anchor?0:result.length)&&(group.limit===0||group.top.length>group.limit)?token(result.at(-1),group.key):null}})
  return {kind:'collection',rows:columns.flatMap(column=>column.rows),value:null,total:[...groups.values()].reduce((sum,group)=>sum+group.total,0),next:null,board:{columns}}
}
