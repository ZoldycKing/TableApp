'use server'
import { appDefinitionInputError, appV2IdSchema } from '@tableapp/schema/app-v2'
import { authorizeApp } from '@/lib/authorize'
import { builderV2Enabled } from '@/lib/builder-v2'
import { inspectBuilderV2Button, submitBuilderV2Button } from '@/lib/builder-v2-button'
import { RowWriteError } from '@/lib/row-mutations'
import { PlanLimitError } from '@/lib/limits'
import type { BuilderV2ActionResult, BuilderV2ButtonInspection, BuilderV2ButtonRequest, BuilderV2ButtonScope } from '@/lib/builder-v2-button-types'
function parse(value:unknown,submit:boolean):Record<string,unknown>|null {
  if(appDefinitionInputError(value)||!value||typeof value!=='object'||Array.isArray(value))return null
  const input=value as Record<string,unknown>,keys=['screenId','nodeId','recordId','itemId',...(submit?['revision','fingerprint','requestId','confirmation']:[])]
  if(Object.keys(input).some(key=>!keys.includes(key))||['screenId','nodeId'].some(key=>!appV2IdSchema.safeParse(input[key]).success)||['recordId','itemId'].some(key=>input[key]!==undefined&&!appV2IdSchema.safeParse(input[key]).success))return null
  if(submit&&(typeof input.requestId!=='string'||!/^button_[a-f0-9]{32}$/.test(input.requestId)||['revision','fingerprint'].some(key=>typeof input[key]!=='string'||!/^[a-f0-9]{64}$/.test(input[key] as string))))return null
  if(submit&&input.confirmation!==undefined&&(typeof input.confirmation!=='string'||!/^[a-f0-9]{64}$/.test(input.confirmation)))return null
  return input
}
export async function inspectBuilderV2ButtonAction(appId:string,input:unknown):Promise<BuilderV2ButtonInspection> {
  const auth=await authorizeApp(appId);if(!auth.ok)return auth
  if(!builderV2Enabled())return {ok:false,error:'Рабочие действия пока недоступны'}
  const request=parse(input,false);if(!request)return {ok:false,error:'Откройте действие из редактора'}
  try{return await inspectBuilderV2Button(appId,auth.member,request as BuilderV2ButtonScope)}catch(error){return {ok:false,error:error instanceof RowWriteError?error.message:'Не удалось загрузить действие. Попробуйте ещё раз.'}}
}
export async function submitBuilderV2ButtonAction(appId:string,input:unknown):Promise<BuilderV2ActionResult> {
  const auth=await authorizeApp(appId);if(!auth.ok)return auth
  if(!builderV2Enabled())return {ok:false,error:'Рабочие действия пока недоступны'}
  const request=parse(input,true);if(!request)return {ok:false,error:'Обновите действие перед выполнением'}
  try{return await submitBuilderV2Button(appId,auth.member,request as BuilderV2ButtonRequest)}catch(error){return error instanceof RowWriteError||error instanceof PlanLimitError?{ok:false,error:error.message,...(error instanceof RowWriteError?{stale:error.code==='conflict'}:{})}:{ok:false,uncertain:true,error:'Не удалось подтвердить результат. Повторите запрос.'}}
}
