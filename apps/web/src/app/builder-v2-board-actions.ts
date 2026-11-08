'use server'
import {appDefinitionInputError,appV2IdSchema} from '@tableapp/schema/app-v2'
import {authorizeApp} from '@/lib/authorize'
import {builderV2Enabled} from '@/lib/builder-v2'
import {inspectBuilderV2BoardMove,inspectPublishedV2BoardMove,moveBuilderV2Board,movePublishedV2Board} from '@/lib/builder-v2-board-move'
import {RowWriteError} from '@/lib/row-mutations'
import type {BuilderV2BoardScope,BuilderV2BoardRequest,BuilderV2BoardInspection} from '@/lib/builder-v2-board-types'
import type {BuilderV2ActionResult} from '@/lib/builder-v2-button-types'
const hash=(value:unknown)=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value)
function parse(value:unknown,published:boolean,submit:boolean){
  if(appDefinitionInputError(value)||!value||typeof value!=='object'||Array.isArray(value))return null
  const input=value as Record<string,unknown>,keys=['screenId','nodeId','itemId','recordId',...(published||submit?['revision']:[]),...(submit?['requestId','fingerprint','value']:[])]
  if(Object.keys(input).some(key=>!keys.includes(key))||['screenId','nodeId','itemId'].some(key=>!appV2IdSchema.safeParse(input[key]).success)||input.recordId!==undefined&&!appV2IdSchema.safeParse(input.recordId).success||(published||submit)&&!hash(input.revision))return null
  if(submit&&(!hash(input.fingerprint)||typeof input.requestId!=='string'||!/^board_[a-f0-9]{32}$/.test(input.requestId)||input.value!==null&&(typeof input.value!=='string'||!input.value.length||input.value.length>200)))return null
  return input
}
function failure(error:unknown,write=false){return error instanceof RowWriteError?{ok:false as const,error:error.message,stale:error.code==='conflict'}:{ok:false as const,error:write?'Не удалось подтвердить смену статуса. Повторите запрос.':'Не удалось проверить запись. Попробуйте ещё раз.',...(write?{uncertain:true}:{})}}
export async function inspectBuilderV2BoardMoveAction(appId:string,value:unknown):Promise<BuilderV2BoardInspection>{const auth=await authorizeApp(appId);if(!auth.ok)return auth;if(!builderV2Enabled())return {ok:false,error:'Смена статуса пока недоступна'};const parsed=parse(value,false,false);if(!parsed)return {ok:false,error:'Выберите запись в канбане'};try{return await inspectBuilderV2BoardMove(appId,auth.member,parsed as BuilderV2BoardScope)}catch(error){return failure(error)}}
export async function moveBuilderV2BoardAction(appId:string,value:unknown):Promise<BuilderV2ActionResult>{const auth=await authorizeApp(appId);if(!auth.ok)return auth;if(!builderV2Enabled())return {ok:false,error:'Смена статуса пока недоступна'};const parsed=parse(value,false,true);if(!parsed)return {ok:false,error:'Обновите канбан перед сменой статуса'};try{return await moveBuilderV2Board(appId,auth.member,parsed as BuilderV2BoardRequest)}catch(error){return failure(error,true)}}
export async function inspectPublishedV2BoardMoveAction(slug:string,value:unknown):Promise<BuilderV2BoardInspection>{const parsed=parse(value,true,false);if(!parsed)return {ok:false,error:'Выберите запись в канбане'};try{return await inspectPublishedV2BoardMove(slug,parsed as BuilderV2BoardScope&{revision:string})}catch(error){return failure(error)}}
export async function movePublishedV2BoardAction(slug:string,value:unknown):Promise<BuilderV2ActionResult>{const parsed=parse(value,true,true);if(!parsed)return {ok:false,error:'Обновите канбан перед сменой статуса'};try{const result=await movePublishedV2Board(slug,parsed as BuilderV2BoardRequest);return {...result,...(result.trace?{trace:result.trace.map(step=>({...step,label:step.label.split(':')[0]!}))}:{})}}catch(error){return failure(error,true)}}
