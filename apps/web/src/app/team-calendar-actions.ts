'use server'
import { db } from '@tableapp/db'
import { appV2TeamCalendarRequestSchema as query, appV2PublishedTeamCalendarRequestSchema as publishedQuery, appV2TeamCalendarMoveSchema as moveQuery, appV2PublishedTeamCalendarMoveSchema as publishedMoveQuery } from '@tableapp/schema/app-v2'
import { readAppDefinition } from '@tableapp/schema/app-definition'
import { validateAppV2 } from '@tableapp/schema/app-v2'
import { authorizeApp } from '@/lib/authorize'
import { loadBuilderV2Catalog, loadBuilderV2Draft } from '@/lib/builder-v2'
import { builderV2MemberActor } from '@/lib/builder-v2-actor'
import { builderV2ScreenNodes } from '@/lib/builder-v2-data-types'
import { publishedV2Context, publishedV2Definition, withPublishedV2Read } from '@/lib/builder-v2-published'
import { readTeamCalendar } from '@/lib/team-calendar-read'
import { moveTeamCalendarEvent } from '@/lib/team-calendar-move'
import type { TeamCalendarResult } from '@/lib/team-calendar-model'
import { restrictedTables, tablePermission } from '@/lib/table-permissions'
import { RowWriteError, writeRows } from '@/lib/row-mutations'

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
  const{catalog}=await loadBuilderV2Catalog(auth.member.workspaceId)
  const app=read.app
  const node=builderV2ScreenNodes(app,parsed.data.screenId).find(node=>node.id===parsed.data.nodeId)
  if(node?.type!=='team_calendar'||!node.data)return{ok:false,error:'Выберите таблицы календаря.'}
  const own=validateAppV2(app,catalog).filter(issue=>issue.path===`nodes.${node.id}`||issue.path.startsWith(`nodes.${node.id}.`))
  if(own.length)return{ok:false,error:own[0]!.message}
  const tables=[node.data.tableId,node.data.resources.tableId,...(node.data.hours?[node.data.hours.tableId]:[])]
  if(restrictedTables(auth.member)||tables.some(id=>tablePermission(auth.member,id)==='none'))return{ok:false,error:'Таблица календаря недоступна.'}
  try{return await db.transaction(async tx=>({ok:true,data:await readTeamCalendar(tx,app,builderV2MemberActor(app,auth.member),node,parsed.data,false)}),{isolationLevel:'repeatable read',accessMode:'read only'})}catch(error){return failure(error)}
}
const moved=(error:unknown)=>({ok:false as const,error:error instanceof RowWriteError?error.message:'Не удалось перенести запись. Попробуйте ещё раз.'})
export async function movePublishedTeamCalendarAction(slug:string,input:unknown){
  const parsed=publishedMoveQuery.safeParse(input)
  if(!parsed.success)return{ok:false as const,error:'Проверьте время и мастера.'}
  try{
    const definition=await publishedV2Definition(slug)
    if(!definition)throw new RowWriteError('missing','Приложение недоступно.')
    return await writeRows(definition.app.workspaceId,async context=>{
      const {app,actor,revision}=await publishedV2Context(slug,context.tx,true)
      if(revision!==parsed.data.revision)throw new RowWriteError('conflict','Приложение обновлено. Обновите страницу.')
      const node=app.nodes.find(node=>node.id===parsed.data.nodeId)
      if(node?.type!=='team_calendar')throw new RowWriteError('denied','Календарь недоступен.')
      return moveTeamCalendarEvent(context,app,actor,node,parsed.data,true)
    })
  }catch(error){return moved(error)}
}
export async function moveBuilderTeamCalendarAction(appId:string,definition:unknown,input:unknown){
  const auth=await authorizeApp(appId,false)
  if(!auth.ok)return auth
  const parsed=moveQuery.safeParse(input),read=readAppDefinition(definition),stored=await loadBuilderV2Draft(appId,auth.member.workspaceId)
  if(!parsed.success||!read.ok||read.formatVersion!==2||!stored||read.app.id!==stored.app.id||read.app.workspaceId!==auth.member.workspaceId||read.app.slug!==stored.app.slug)return{ok:false as const,error:'Календарь недоступен этому пространству.'}
  const {catalog}=await loadBuilderV2Catalog(auth.member.workspaceId)
  const app=read.app
  const node=builderV2ScreenNodes(app,parsed.data.screenId).find(node=>node.id===parsed.data.nodeId)
  if(node?.type!=='team_calendar'||!node.data)return{ok:false as const,error:'Выберите таблицы календаря.'}
  const own=validateAppV2(app,catalog).filter(issue=>issue.path===`nodes.${node.id}`||issue.path.startsWith(`nodes.${node.id}.`))
  if(own.length)return{ok:false as const,error:own[0]!.message}
  try{return await writeRows(auth.member.workspaceId,async context=>moveTeamCalendarEvent(context,app,builderV2MemberActor(app,auth.member),node,parsed.data,false))}catch(error){return moved(error)}
}
