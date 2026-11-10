'use client'
import {createContext,useContext,type ReactNode} from 'react'
import type {BuilderV2DataRequest,BuilderV2DataResult,BuilderV2RecordResult} from '@/lib/builder-v2-data-types'
import type {BuilderV2FormRequest,BuilderV2FormResult,BuilderV2FormOptionsResult} from '@/lib/builder-v2-form-types'
import type {BuilderV2ButtonRequest,BuilderV2ButtonScope,BuilderV2ButtonInspection,BuilderV2ActionResult} from '@/lib/builder-v2-button-types'
import type {BuilderV2SubmitRequest} from '@/lib/builder-v2-submit-types'
import type {BuilderV2ButtonState} from '@/lib/builder-v2-button-types'
import type {BuilderV2DeleteScope,BuilderV2DeleteRequest,BuilderV2DeleteInspection} from '@/lib/builder-v2-delete-types'
export type PublishedV2Transport={slug:string;revision:string;dataVersion?:number;rowAction?:(id:string)=>{name:string}|undefined;invalidate?:(message:string)=>void;readData:(request:BuilderV2DataRequest)=>Promise<BuilderV2DataResult>;readRecord:(request:{screenId:string;recordId:string})=>Promise<BuilderV2RecordResult>;inspectForm:(request:BuilderV2FormRequest)=>Promise<BuilderV2FormResult|BuilderV2FormOptionsResult>;submitForm:(request:BuilderV2SubmitRequest)=>Promise<BuilderV2ActionResult>;inspectButton:(request:BuilderV2ButtonScope)=>Promise<BuilderV2ButtonInspection>;submitButton:(request:BuilderV2ButtonRequest)=>Promise<BuilderV2ActionResult>;inspectDelete:(request:BuilderV2DeleteScope)=>Promise<BuilderV2DeleteInspection>;submitDelete:(request:BuilderV2DeleteRequest)=>Promise<BuilderV2ActionResult>;navigate:(screenId:string,recordId?:string,options?:{automatic?:boolean})=>void;refresh:(message?:string)=>void;back:(fallbackScreenId:string,options?:{automatic?:boolean})=>void;tableName:(tableId:string)=>string;buttonState:(nodeId:string)=>BuilderV2ButtonState|undefined;setHeaderAccessory?:(node:ReactNode)=>void}
export const PublishedV2Context=createContext<PublishedV2Transport|null>(null)
export const usePublishedV2=()=>useContext(PublishedV2Context)
