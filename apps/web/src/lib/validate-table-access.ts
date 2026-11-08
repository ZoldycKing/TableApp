import { db,tables } from '@tableapp/db'
import { and,eq,inArray } from 'drizzle-orm'
import type { TableAccess } from './table-permissions'

export async function validateTableAccess(workspaceId:string,role:string,input:unknown):Promise<{ok:true;access:TableAccess|null}|{ok:false;error:string}>{
  if(input==null)return {ok:true,access:null}
  if(role==='owner')return {ok:false,error:'Владельцу доступны все таблицы'}
  if(typeof input!=='object'||Array.isArray(input))return {ok:false,error:'Некорректные права на таблицы'}
  const entries=Object.entries(input)
  if(entries.length>1000||entries.some(([id,level])=>!id||id.length>128||!['none','view','edit'].includes(level)))return {ok:false,error:'Проверьте права на таблицы'}
  if(role==='viewer'&&entries.some(([,level])=>level==='edit'))return {ok:false,error:'Для редактирования сначала назначьте участнику роль «Редактор»'}
  if(entries.length){
    const found=await db.select({id:tables.id}).from(tables).where(and(eq(tables.workspaceId,workspaceId),inArray(tables.id,entries.map(([id])=>id))))
    if(found.length!==entries.length)return {ok:false,error:'Список таблиц изменился. Откройте настройки заново.'}
  }
  return {ok:true,access:Object.fromEntries(entries) as TableAccess}
}
