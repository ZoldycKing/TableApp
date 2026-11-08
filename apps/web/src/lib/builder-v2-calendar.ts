import {APP_TIME_ZONE,calendarDay,dateInstant} from '@tableapp/schema'

const formatters=new Map<string,Intl.DateTimeFormat>()
function formatter(zone:string):{zone:string;format:Intl.DateTimeFormat}{
  let format=formatters.get(zone)
  if(!format){try{format=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'})}catch{return formatter(APP_TIME_ZONE)};if(formatters.size>=16)formatters.delete(formatters.keys().next().value!);formatters.set(zone,format)}
  return {zone,format}
}
/** Same policy as table cells: civil dates remain dates, stored instants use the field zone. */
export function builderCalendarDate(value:unknown,_type:'date'|'datetime',timeZone=APP_TIME_ZONE):string|null{
  if(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value))return calendarDay(value)
  const {zone,format}=formatter(timeZone),instant=dateInstant(value,zone)
  if(instant===null)return null
  const parts=format.formatToParts(new Date(instant)),part=(name:string)=>parts.find(part=>part.type===name)?.value
  return `${part('year')!.padStart(4,'0')}-${part('month')}-${part('day')}`
}
export function builderCalendarTime(value:unknown,timeZone=APP_TIME_ZONE):string|null{
  const {zone,format}=formatter(timeZone),instant=dateInstant(value,zone)
  if(instant===null)return null
  const parts=format.formatToParts(new Date(instant));return `${parts.find(part=>part.type==='hour')?.value}:${parts.find(part=>part.type==='minute')?.value}`
}
export function builderCalendarDay(value:string):boolean{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||Number(value.slice(0,4))<1)return false
  const date=new Date(value+'T12:00:00Z')
  return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value
}
export const builderCalendarMonth=(value:string)=>/^\d{4}-\d{2}$/.test(value)&&builderCalendarDay(`${value}-01`)
export const builderCalendarToday=(timeZone=APP_TIME_ZONE,asOf=Date.now())=>builderCalendarDate(new Date(asOf).toISOString(),'datetime',timeZone)!
export function shiftBuilderMonth(month:string,delta:number){const date=new Date(month+'-01T12:00:00Z');date.setUTCMonth(date.getUTCMonth()+delta);const next=date.toISOString().slice(0,7);return builderCalendarMonth(next)?next:month}
