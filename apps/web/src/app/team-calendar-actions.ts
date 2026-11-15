'use server'
import { db } from '@tableapp/db'
import { appV2TeamCalendarRequestSchema as query, appV2PublishedTeamCalendarRequestSchema as publishedQuery } from '@tableapp/schema/app-v2'
import { readAppDefinition, validateAppV2Definition } from '@tableapp/schema/app-definition'
import { authorizeApp } from '@/lib/authorize'
import { loadBuilderV2Catalog, loadBuilderV2Draft } from '@/lib/builder-v2'
import { builderV2MemberActor } from '@/lib/builder-v2-actor'
import { builderV2ScreenNodes } from '@/lib/builder-v2-data-types'
import { publishedV2Context, withPublishedV2Read } from '@/lib/builder-v2-published'
import { readTeamCalendar } from '@/lib/team-calendar-read'
import type { TeamCalendarResult } from '@/lib/team-calendar-model'
import { restrictedTables, tablePermission } from '@/lib/table-permissions'
import { RowWriteError } from '@/lib/row-mutations'

const failure=(error:unknown):TeamCalendarResult=>({ok:false,error:error instanceof RowWriteError?error.message:'Не удалось загрузить календарь. Попробуйте ещё раз.'})
export async function readPublishedTeamCalendarAction(slug:string,input:unknown):Promise<TeamCalendarResult>{
  const parsed=publishedQuery.safeParse(input)
  if(!parsed.success)return{ok:false,error:'Проверьте дату и настройки календаря.'}
  try{return await withPublishedV2Read(async tx=>{
    const{app,actor,revision}=await publishedV2Context(slug,tx)
    if(revision!==parsed.data.revision)throw new RowWriteError('conflict','Приложение обновлено. Обновите страницу.')
    const node=app.nodes.find(node=>node.id===parsed.data.nodeId)
    if(node?.type!=='team_calendar')throw new RowWriteError('denied','Календарь недоступен.')
    return{ok:true,data:await readTeamCalendar(tx,app,actor,node,parsed.data,true)}
  })}catch(error){return failure(error)}
}
export async function readBuilderTeamCalendarAction(appId:string,definition:unknown,input:unknown):Promise<TeamCalendarResult>{
  const auth=await authorizeApp(appId,false)
  if(!auth.ok)return auth
  const parsed=query.safeParse(input),read=readAppDefinition(definition),stored=await loadBuilderV2Draft(appId,auth.member.workspaceId)
  if(!parsed.success||!read.ok||read.formatVersion!==2||!stored||read.app.id!==stored.app.id||read.app.workspaceId!==auth.member.workspaceId||read.app.slug!==stored.app.slug)return{ok:false,error:'Календарь недоступен этому пространству.'}
  const{catalog}=await loadBuilderV2Catalog(auth.member.workspaceId),checked=validateAppV2Definition(read.app,catalog)
  if(!checked.ok)return{ok:false,error:checked.issues[0]!.message}
  const app=checked.app,node=builderV2ScreenNodes(app,parsed.data.screenId).find(node=>node.id===parsed.data.nodeId)
  if(node?.type!=='team_calendar'||!node.data)return{ok:false,error:'Выберите таблицы календаря.'}
  const tables=[node.data.tableId,node.data.resources.tableId,...(node.data.hours?[node.data.hours.tableId]:[])]
  if(restrictedTables(auth.member)||tables.some(id=>tablePermission(auth.member,id)==='none'))return{ok:false,error:'Таблица календаря недоступна.'}
  try{return await db.transaction(async tx=>({ok:true,data:await readTeamCalendar(tx,app,builderV2MemberActor(app,auth.member),node,parsed.data,false)}),{isolationLevel:'repeatable read',accessMode:'read only'})}catch(error){return failure(error)}
}
