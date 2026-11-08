import {appDefinitionInputError,appV2IdSchema} from '@tableapp/schema/app-v2'
import type {BuilderV2ButtonState,BuilderV2ActionResult} from './builder-v2-button-types'
export type BuilderV2EnterScope={screenId:string;recordId?:string}
export type BuilderV2EnterRequest=BuilderV2EnterScope&{revision:string;fingerprint:string;requestId:string;confirmation?:string}
export type BuilderV2EnterState=BuilderV2ButtonState
export type BuilderV2EnterInspection={ok:true;state:BuilderV2EnterState}|{ok:false;error:string;stale?:boolean}
export type BuilderV2EnterResult=BuilderV2ActionResult
export function parseBuilderV2Enter(value:unknown,submit=false):BuilderV2EnterRequest|null{
  if(appDefinitionInputError(value)||!value||typeof value!=='object'||Array.isArray(value))return null
  const input=value as Record<string,unknown>,hash=(value:unknown)=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value)
  if(Object.keys(input).some(key=>!['screenId','recordId','revision',...(submit?['fingerprint','requestId','confirmation']:[])].includes(key))||!appV2IdSchema.safeParse(input.screenId).success||input.recordId!==undefined&&!appV2IdSchema.safeParse(input.recordId).success)return null
  if(!hash(input.revision)||submit&&(!hash(input.fingerprint)||typeof input.requestId!=='string'||!/^enter_[a-f0-9]{32}$/.test(input.requestId)||input.confirmation!==undefined&&!hash(input.confirmation)))return null
  return input as BuilderV2EnterRequest
}
