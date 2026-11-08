import {fieldTimeZone,type Field} from '@tableapp/schema'
import type {AppV2Node} from '@tableapp/schema/app-v2'
import type {BuilderV2ChartData,BuilderV2ChartPoint,BuilderV2DataPage} from './builder-v2-data-types'
import {builderCalendarDate,builderCalendarDay} from './builder-v2-calendar'
import {RowWriteError} from './row-mutations'
export const BUILDER_CHART_GROUP_TYPES=['text','long_text','single_select','checkbox','date','datetime'] as const
export const BUILDER_CHART_NUMBER_TYPES=['number','formula','rollup','count'] as const
export type BuilderV2ChartNode=Extract<AppV2Node,{type:'chart'}>
export function builderV2ChartFields(node:BuilderV2ChartNode,fields:readonly Field[]){
 const group=fields.find(field=>field.id===node.groupFieldId),value=node.operation==='count'?undefined:fields.find(field=>field.id===node.fieldId)
 if(!group||!(BUILDER_CHART_GROUP_TYPES as readonly string[]).includes(group.type))throw new RowWriteError('invalid','Выберите поле категорий для диаграммы')
 if(node.chartType==='line'&&!['date','datetime'].includes(group.type))throw new RowWriteError('invalid','Для линии выберите поле даты')
 if(node.chartType==='donut'&&node.operation==='avg')throw new RowWriteError('invalid','Среднее показывайте столбцами или линией')
 if(node.operation!=='count'&&(!value||!(BUILDER_CHART_NUMBER_TYPES as readonly string[]).includes(value.type)))throw new RowWriteError('invalid','Выберите числовое поле для диаграммы')
 return {group,value}
}
type Bucket={key:string;label:string;rows:number;numbers:number;sum:number;date?:string}
/** The complete authorized stream is aggregated on the server; no underlying rows are returned. */
export async function readBuilderV2Chart<T extends {data:Record<string,unknown>}>(node:BuilderV2ChartNode,fields:readonly Field[],records:AsyncIterable<T>):Promise<BuilderV2DataPage>{
 const {group,value}=builderV2ChartFields(node,fields),dateGroup=['date','datetime'].includes(group.type),timeZone=fieldTimeZone(group),buckets=new Map<string,Bucket>(),choices=new Map(group.type==='single_select'?group.options.choices.map(choice=>[choice.id,choice.name]):[])
 const dateLabel=new Intl.DateTimeFormat('ru-RU',node.dateGrouping==='month'?{month:'short',year:'numeric',timeZone:'UTC'}:{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'})
 let totalRows=0,numericRows=0,undated=0
 const identity=(raw:unknown):{key:string;label:string;date?:string}=>{
  if(dateGroup){const day=builderCalendarDate(raw,group.type as 'date'|'datetime',timeZone);if(!day||!builderCalendarDay(day))return {key:'empty',label:'Без даты'};const date=node.dateGrouping==='month'?day.slice(0,7):day;return {key:`date:${date}`,date,label:dateLabel.format(new Date((node.dateGrouping==='month'?date+'-01':date)+'T12:00:00Z'))}}
  if(group.type==='single_select')return raw===null||raw===undefined||raw===''?{key:'empty',label:'Без значения'}:typeof raw==='string'&&choices.has(raw)?{key:`choice:${raw}`,label:choices.get(raw)!}:{key:'other',label:'Другой вариант'}
  if(group.type==='checkbox')return typeof raw==='boolean'?{key:String(raw),label:raw?'Да':'Нет'}:{key:'empty',label:'Без значения'}
  const text=typeof raw==='string'?raw.trim():'';return text?{key:`text:${text}`,label:text.slice(0,160)}:{key:'empty',label:'Без значения'}
 }
 for await(const row of records){
  const raw=row.data[group.id],category=identity(raw)
  if(value&&!Object.hasOwn(row.data,value.id))continue
  const number=value?row.data[value.id]:null;if(typeof number==='number'&&Number.isFinite(number))numericRows++
  totalRows++;if(dateGroup&&!category.date){undated++;if(node.chartType==='line')continue}
  let bucket=buckets.get(category.key);if(!bucket){if(buckets.size>=1000)throw new RowWriteError('invalid','Слишком много категорий. Уточните отбор или выберите другое поле.');bucket={...category,rows:0,numbers:0,sum:0};buckets.set(category.key,bucket)}bucket.rows++
  if(typeof number==='number'&&Number.isFinite(number)){bucket.numbers++;bucket.sum+=number;if(!Number.isFinite(bucket.sum))throw new RowWriteError('invalid','Сумма слишком велика для диаграммы. Уточните отбор.')}
 }
 const amount=(bucket:Bucket)=>node.operation==='count'?bucket.rows:node.operation==='sum'?bucket.sum:bucket.numbers?bucket.sum/bucket.numbers:null
 let ordered=[...buckets.values()],remainderGroups=0
 if(node.chartType==='donut'&&ordered.some(bucket=>(amount(bucket)??0)<0))throw new RowWriteError('invalid','В круговой диаграмме есть отрицательные значения. Выберите столбцы.')
 if(node.chartType==='line'){
  ordered.sort((a,b)=>a.date!.localeCompare(b.date!))
  const filled:Bucket[]=[],last=ordered.at(-1)?.date;let current=ordered[0]?.date
  while(current&&last&&current<=last){
    if(filled.length>=60)throw new RowWriteError('invalid',node.dateGrouping==='day'?'На линии больше 60 дат. Выберите месяцы или уточните отбор.':'На линии больше 60 месяцев. Уточните отбор.')
    const key=`date:${current}`,instant=new Date((node.dateGrouping==='month'?current+'-01':current)+'T12:00:00Z')
    filled.push(buckets.get(key)??{key,date:current,label:dateLabel.format(instant),rows:0,numbers:0,sum:0})
    if(current===last)break
    if(node.dateGrouping==='month')instant.setUTCMonth(instant.getUTCMonth()+1);else instant.setUTCDate(instant.getUTCDate()+1)
    current=instant.toISOString().slice(0,node.dateGrouping==='month'?7:10)
  }
  ordered=filled
 }else{
  ordered.sort((a,b)=>(amount(b)??-Infinity)-(amount(a)??-Infinity)||a.label.localeCompare(b.label,'ru-RU')||a.key.localeCompare(b.key))
  if(ordered.length>node.limit){const rest=ordered.slice(node.limit);remainderGroups=rest.length;ordered=[...ordered.slice(0,node.limit),rest.reduce<Bucket>((all,bucket)=>({...all,rows:all.rows+bucket.rows,numbers:all.numbers+bucket.numbers,sum:all.sum+bucket.sum}),{key:'remainder',label:'Остальные',rows:0,numbers:0,sum:0})]}
 }
 const points:BuilderV2ChartPoint[]=ordered.map((bucket,index)=>({key:`group_${index}`,label:bucket.label,value:amount(bucket),count:bucket.rows,...(bucket.date?{date:bucket.date}:{})}))
 if(points.some(point=>point.value!==null&&!Number.isFinite(point.value)))throw new RowWriteError('invalid','Числа слишком велики для диаграммы. Уточните отбор.')
 if(node.chartType==='donut'&&points.some(point=>(point.value??0)<0))throw new RowWriteError('invalid','В круговой диаграмме есть отрицательные значения. Выберите столбцы.')
 const chart:BuilderV2ChartData={points,groupLabel:group.name,valueLabel:node.operation==='count'?'Количество записей':node.operation==='sum'&&value!.name.trim().toLocaleLowerCase('ru-RU')==='сумма'?value!.name:`${node.operation==='sum'?'Сумма':'Среднее'}: ${value!.name}`,totalRows,numericRows,groupCount:buckets.size,remainderGroups,undated,...(dateGroup?{timeZone}:{})}
 return {kind:'chart',rows:[],value:null,total:totalRows,next:null,chart}
}
