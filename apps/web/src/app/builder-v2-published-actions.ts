'use server'
import {appDefinitionInputError,appV2IdSchema} from '@tableapp/schema/app-v2'
import {readPublishedV2ClientDealStats,readPublishedV2Data,readPublishedV2LowStockCount,readPublishedV2PurchaseCosts,readPublishedV2Record,readPublishedV2RelatedRows,readPublishedV2ReorderHints} from '@/lib/builder-v2-published-data'
import {inspectPublishedV2Button,inspectPublishedV2FormRequest,submitPublishedV2} from '@/lib/builder-v2-published-write'
import {validBuilderCollectionQuery} from '@/lib/builder-v2-collection-query'
import {RowWriteError} from '@/lib/row-mutations'
import {PlanLimitError} from '@/lib/limits'
import type {BuilderV2DataRecord,BuilderV2DataResult,BuilderV2RecordResult} from '@/lib/builder-v2-data-types'
import type {BuilderV2FormOptionsResult,BuilderV2FormResult} from '@/lib/builder-v2-form-types'
import type {BuilderV2ActionResult,BuilderV2ButtonInspection} from '@/lib/builder-v2-button-types'
import {inspectPublishedV2Delete,submitPublishedV2Delete} from '@/lib/builder-v2-published-delete'
import type {BuilderV2DeleteInspection} from '@/lib/builder-v2-delete-types'

const hash=(value:unknown)=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value)
const id=(value:unknown)=>appV2IdSchema.safeParse(value).success
function input(value:unknown,keys:string[],ids:string[]){
  if(appDefinitionInputError(value)||!value||typeof value!=='object'||Array.isArray(value))return null
  const parsed=value as Record<string,unknown>
  if(Object.keys(parsed).some(key=>!keys.includes(key))||ids.some(key=>!id(parsed[key]))||['recordId','itemId'].some(key=>parsed[key]!==undefined&&!id(parsed[key]))||!hash(parsed.revision))return null
  return parsed
}
function failure(error:unknown,write=false){return error instanceof RowWriteError||error instanceof PlanLimitError?{ok:false as const,error:error.message,...(error instanceof RowWriteError?{stale:error.code==='conflict'}:{})}:{ok:false as const,error:write?'Не удалось подтвердить результат. Повторите запрос.':'Не удалось загрузить данные. Попробуйте ещё раз.',...(write?{uncertain:true}:{})}}
const publicResult=(result:BuilderV2ActionResult):BuilderV2ActionResult=>({...result,...(result.trace?{trace:result.trace.map(step=>({...step,label:step.label.split(':')[0]!}))}:{})})
function form(value:unknown,submit=false){
  const raw=value as Record<string,unknown>|null,mode=submit?'check':raw?.mode
  const parsed=input(value,['revision','screenId','formId','recordId',...(submit?['requestId','confirmation']:['mode']),...(mode==='check'?['values','fingerprint']:mode==='options'?['fieldId','search','after']:[])],['screenId','formId'])
  if(!parsed||!['initial','check','options'].includes(String(mode)))return null
  if(mode==='check'&&(!hash(parsed.fingerprint)||!parsed.values||typeof parsed.values!=='object'||Array.isArray(parsed.values)||Object.keys(parsed.values).length>500||Object.keys(parsed.values).some(key=>!id(key))))return null
  if(mode==='options'&&(!id(parsed.fieldId)||typeof parsed.search!=='string'||parsed.search.length>200||parsed.after!==undefined&&(typeof parsed.after!=='string'||parsed.after.length>2000)))return null
  if(submit&&(typeof parsed.requestId!=='string'||!/^submit_[a-f0-9]{32}$/.test(parsed.requestId)))return null
  if(submit&&parsed.confirmation!==undefined&&!hash(parsed.confirmation))return null
  return parsed
}
export async function readPublishedV2DataAction(slug:string,value:unknown):Promise<BuilderV2DataResult>{
  const parsed=input(value,['revision','nodeId','screenId','recordId','search','cursor','calendarMonth','calendarDay','boardColumn'],['nodeId','screenId'])
  if(!parsed||!validBuilderCollectionQuery(parsed)||parsed.search!==undefined&&(typeof parsed.search!=='string'||parsed.search.length>200)||parsed.cursor!==undefined&&(typeof parsed.cursor!=='string'||parsed.cursor.length>2000))return {ok:false,error:'Обновите список'}
  try{return {ok:true,page:await readPublishedV2Data(slug,parsed as Parameters<typeof readPublishedV2Data>[1])}}catch(error){return failure(error)}
}
export async function readPublishedV2RecordAction(slug:string,value:unknown):Promise<BuilderV2RecordResult>{
  const parsed=input(value,['revision','screenId','recordId'],['screenId','recordId']);if(!parsed)return {ok:false,error:'Запись недоступна'}
  try{return {ok:true,...await readPublishedV2Record(slug,parsed as Parameters<typeof readPublishedV2Record>[1])}}catch(error){return failure(error)}
}
export async function readPublishedV2RelatedRowsAction(slug:string,value:unknown):Promise<{ok:true;rows:BuilderV2DataRecord[]}|{ok:false;error:string}>{
  if(appDefinitionInputError(value)||!value||typeof value!=='object'||Array.isArray(value))return {ok:false,error:'Записи недоступны'}
  const parsed=value as Record<string,unknown>
  if(!hash(parsed.revision)||!id(parsed.tableId)||!Array.isArray(parsed.recordIds)||parsed.recordIds.length>100||parsed.recordIds.some(item=>!id(item))||Object.keys(parsed).some(key=>!['revision','tableId','recordIds'].includes(key)))return {ok:false,error:'Записи недоступны'}
  try{return {ok:true,...await readPublishedV2RelatedRows(slug,{revision:String(parsed.revision),tableId:String(parsed.tableId),recordIds:parsed.recordIds as string[]})}}catch(error){return failure(error)}
}
export async function readPublishedV2PurchaseCostsAction(slug:string,value:unknown):Promise<{ok:true;costs:Record<string,number>}|{ok:false;error:string}>{
  if(appDefinitionInputError(value)||!value||typeof value!=='object'||Array.isArray(value))return {ok:false,error:'Цены недоступны'}
  const parsed=value as Record<string,unknown>
  if(!hash(parsed.revision)||!Array.isArray(parsed.productIds)||parsed.productIds.length>100||parsed.productIds.some(item=>!id(item))||Object.keys(parsed).some(key=>!['revision','productIds'].includes(key)))return {ok:false,error:'Цены недоступны'}
  try{return {ok:true,...await readPublishedV2PurchaseCosts(slug,{revision:String(parsed.revision),productIds:parsed.productIds as string[]})}}catch(error){return failure(error)}
}
export async function readPublishedV2ReorderHintsAction(slug:string,value:unknown):Promise<{ok:true;hints:Record<string,{supplier:string;price:number}>}|{ok:false;error:string}>{
  if(appDefinitionInputError(value)||!value||typeof value!=='object'||Array.isArray(value))return {ok:false,error:'Подсказки недоступны'}
  const parsed=value as Record<string,unknown>
  if(!hash(parsed.revision)||!Array.isArray(parsed.productIds)||parsed.productIds.length>100||parsed.productIds.some(item=>!id(item))||Object.keys(parsed).some(key=>!['revision','productIds'].includes(key)))return {ok:false,error:'Подсказки недоступны'}
  try{return {ok:true,...await readPublishedV2ReorderHints(slug,{revision:String(parsed.revision),productIds:parsed.productIds as string[]})}}catch(error){return failure(error)}
}
export async function readPublishedV2LowStockCountAction(slug:string,value:unknown):Promise<{ok:true;count:number}|{ok:false;error:string}>{
  if(appDefinitionInputError(value)||!value||typeof value!=='object'||Array.isArray(value))return {ok:false,error:'Счётчик недоступен'}
  const parsed=value as Record<string,unknown>
  if(!hash(parsed.revision)||Object.keys(parsed).some(key=>key!=='revision'))return {ok:false,error:'Счётчик недоступен'}
  try{return {ok:true,...await readPublishedV2LowStockCount(slug,{revision:String(parsed.revision)})}}catch(error){return failure(error)}
}
export async function readPublishedV2ClientDealStatsAction(slug:string,value:unknown):Promise<
  {ok:true;stats:Record<string,{deals:number;sum:number;lastContact:string}>;openDeals:number;pipeline:number}|{ok:false;error:string}
>{
  if(appDefinitionInputError(value)||!value||typeof value!=='object'||Array.isArray(value))return {ok:false,error:'Сделки недоступны'}
  const parsed=value as Record<string,unknown>
  if(!hash(parsed.revision)||Object.keys(parsed).some(key=>key!=='revision'))return {ok:false,error:'Сделки недоступны'}
  try{return {ok:true,...await readPublishedV2ClientDealStats(slug,{revision:String(parsed.revision)})}}catch(error){return failure(error)}
}
export async function inspectPublishedV2FormAction(slug:string,value:unknown):Promise<BuilderV2FormResult|BuilderV2FormOptionsResult>{
  const parsed=form(value);if(!parsed)return {ok:false,error:'Обновите форму'}
  try{return await inspectPublishedV2FormRequest(slug,parsed as Parameters<typeof inspectPublishedV2FormRequest>[1])}catch(error){return failure(error)}
}
export async function submitPublishedV2FormAction(slug:string,value:unknown):Promise<BuilderV2ActionResult>{
  const parsed=form(value,true);if(!parsed)return {ok:false,error:'Проверьте значения формы'}
  try{return publicResult(await submitPublishedV2(slug,'form',parsed as Parameters<typeof submitPublishedV2>[2]))}catch(error){return failure(error,true)}
}
export async function inspectPublishedV2ButtonAction(slug:string,value:unknown):Promise<BuilderV2ButtonInspection>{
  const parsed=input(value,['revision','screenId','nodeId','recordId','itemId'],['screenId','nodeId']);if(!parsed)return {ok:false,error:'Обновите действие'}
  try{return await inspectPublishedV2Button(slug,parsed as Parameters<typeof inspectPublishedV2Button>[1])}catch(error){return failure(error)}
}
export async function submitPublishedV2ButtonAction(slug:string,value:unknown):Promise<BuilderV2ActionResult>{
  const parsed=input(value,['revision','screenId','nodeId','recordId','itemId','requestId','fingerprint','confirmation'],['screenId','nodeId']);if(!parsed||parsed.confirmation!==undefined&&!hash(parsed.confirmation)||!hash(parsed.fingerprint)||typeof parsed.requestId!=='string'||!/^button_[a-f0-9]{32}$/.test(parsed.requestId))return {ok:false,error:'Обновите действие'}
  try{return publicResult(await submitPublishedV2(slug,'button',parsed as Parameters<typeof submitPublishedV2>[2]))}catch(error){return failure(error,true)}
}
export async function inspectPublishedV2DeleteAction(slug:string,value:unknown):Promise<BuilderV2DeleteInspection>{
  const parsed=input(value,['revision','screenId','nodeId','recordId'],['screenId','nodeId','recordId']);if(!parsed)return {ok:false,error:'Обновите запись'}
  try{return await inspectPublishedV2Delete(slug,parsed as Parameters<typeof inspectPublishedV2Delete>[1])}catch(error){return failure(error)}
}
export async function submitPublishedV2DeleteAction(slug:string,value:unknown):Promise<BuilderV2ActionResult>{
  const parsed=input(value,['revision','screenId','nodeId','recordId','requestId','fingerprint','confirmed'],['screenId','nodeId','recordId'])
  if(!parsed||parsed.confirmed!==true||!hash(parsed.fingerprint)||typeof parsed.requestId!=='string'||!/^delete_[a-f0-9]{32}$/.test(parsed.requestId))return {ok:false,error:'Подтвердите удаление записи'}
  try{return publicResult(await submitPublishedV2Delete(slug,parsed as Parameters<typeof submitPublishedV2Delete>[1]))}catch(error){return failure(error,true)}
}
