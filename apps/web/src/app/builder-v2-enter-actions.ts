'use server'
import {authorizeApp} from '@/lib/authorize'
import {builderV2Enabled} from '@/lib/builder-v2'
import {inspectBuilderV2Enter,inspectPublishedV2Enter,submitBuilderV2Enter} from '@/lib/builder-v2-enter'
import {parseBuilderV2Enter,type BuilderV2EnterInspection,type BuilderV2EnterResult} from '@/lib/builder-v2-enter-types'
import {RowWriteError} from '@/lib/row-mutations'
import {PlanLimitError} from '@/lib/limits'

function failure(error:unknown,write=false){return error instanceof RowWriteError||error instanceof PlanLimitError?{ok:false as const,error:error.message,...(error instanceof RowWriteError?{stale:error.code==='conflict'}:{})}:{ok:false as const,error:write?'Не удалось подтвердить результат. Повторите запрос.':'Не удалось загрузить действие. Попробуйте ещё раз.',...(write?{uncertain:true}:{})}}
export async function inspectBuilderV2EnterAction(appId:string,value:unknown):Promise<BuilderV2EnterInspection>{
  const auth=await authorizeApp(appId);if(!auth.ok)return auth
  const parsed=parseBuilderV2Enter(value);if(!parsed||!builderV2Enabled())return {ok:false,error:'Обновите действие экрана'}
  try{const result=await inspectBuilderV2Enter(appId,auth.member,parsed);return result.state.revision===parsed.revision?result:{ok:false,stale:true,error:'Настройки изменились. Вернитесь в редактор.'}}catch(error){return failure(error)}
}
export async function submitBuilderV2EnterAction(appId:string,value:unknown):Promise<BuilderV2EnterResult>{
  const auth=await authorizeApp(appId);if(!auth.ok)return auth
  const parsed=parseBuilderV2Enter(value,true);if(!parsed||!builderV2Enabled())return {ok:false,error:'Обновите действие экрана'}
  try{return await submitBuilderV2Enter(appId,auth.member,parsed)}catch(error){return failure(error,true)}
}
export async function inspectPublishedV2EnterAction(slug:string,value:unknown):Promise<BuilderV2EnterInspection>{
  const parsed=parseBuilderV2Enter(value);if(!parsed||!builderV2Enabled())return {ok:false,error:'Обновите страницу'}
  try{return await inspectPublishedV2Enter(slug,parsed)}catch(error){return failure(error)}
}
export async function submitPublishedV2EnterAction(slug:string,value:unknown):Promise<BuilderV2EnterResult>{
  const parsed=parseBuilderV2Enter(value,true);if(!parsed||!builderV2Enabled())return {ok:false,error:'Обновите страницу'}
  try{const result=await submitBuilderV2Enter('',slug,parsed);return {...result,...(result.trace?{trace:result.trace.map(item=>({...item,label:item.label.split(':')[0]!}))}:{})}}catch(error){return failure(error,true)}
}
