'use client'
import { createContext, useContext } from 'react'
import { APP_TIME_ZONE, dateInstant } from '@tableapp/schema'
import { canOpenAppV2Screen, type AppV2, type AppV2Actor, type AppV2Node } from '@tableapp/schema/app-v2'
import type { BuilderV2Table } from '@/lib/builder-v2'
import type { TeamCalendarRequest, TeamCalendarResult } from '@/lib/team-calendar-model'
import { TeamCalendarView } from './booking-calendar'
import { usePublishedV2 } from './published-context'
import { useBookingJourney } from './booking-journey'

export const TeamCalendarDemoContext = createContext<((node:Extract<AppV2Node,{type:'team_calendar'}>,request:TeamCalendarRequest)=>TeamCalendarResult)|null>(null)
export function BuilderV2TeamCalendar({app,node,screenId,recordId,tables,actor,editing=false,onNavigate}:{
  app:AppV2;node:Extract<AppV2Node,{type:'team_calendar'}>;screenId:string;recordId?:string;tables:readonly BuilderV2Table[];actor:AppV2Actor;editing?:boolean;onNavigate?:(screenId:string,rowId?:string)=>void
}){
  const published=usePublishedV2(),demo=useContext(TeamCalendarDemoContext),journey=useBookingJourney(),config=node.data
  if(!config)return <p role="status">Выберите таблицы и поля в настройках «Календаря команды».</p>
  const loader=async(query:{screenId:string;day:string;week:boolean}):Promise<TeamCalendarResult>=>{
    const request={...query,nodeId:node.id,...(recordId?{recordId}:{})}
    if(demo)return demo(node,request)
    const actions=await import('@/app/team-calendar-actions')
    return published?actions.readPublishedTeamCalendarAction(published.slug,{...request,revision:published.revision}):actions.readBuilderTeamCalendarAction(app.id,app,request)
  }
  const allowed=(id:string|null)=>Boolean(id&&canOpenAppV2Screen(app,actor,id))
  const manage=actor.authenticated&&actor.roleIds.some(id=>node.actions.manageRoleIds.includes(id))
  const navigate=(id:string|null,row?:string)=>{if(!editing&&id&&allowed(id))onNavigate?.(id,row)}
  const timeZone=tables.find(table=>table.id===config.tableId)?.fields.find(field=>field.id===config.startFieldId)?.timeZone??APP_TIME_ZONE
  return <TeamCalendarView key={node.id} calendarKey={node.id} app={app} screenId={screenId} timeZone={timeZone} loader={loader} loaderKey={JSON.stringify([app.id,app.workspaceId,node.id,node.data,node.actions.manageRoleIds,actor,recordId])} title={node.name||'Расписание'} resourceLabel={node.resourceLabel} resourcesLabel={node.resourcesLabel} showMetrics={node.showMetrics} showWorkingHours={Boolean(config.hours)} showAmounts={Boolean(config.amountFieldId)} showNoShows={Boolean(config.statusValues.noShow)} editing={editing}
    onOpenVisit={id=>navigate(node.actions.itemScreenId,id)}
    onAdd={manage&&allowed(node.actions.createScreenId)?()=>navigate(node.actions.createScreenId):undefined}
    onCreate={manage&&allowed(node.actions.createScreenId)?intent=>{
      if(app.booking?.tables.visits===config.tableId)journey?.setIntent(intent)
      else{const start=intent.day&&intent.time?dateInstant(`${intent.day}T${intent.time}`,timeZone):null;journey?.setCalendarForm({screenId:node.actions.createScreenId!,tableId:config.tableId,values:{...(intent.masterId?{[config.resourceFieldId]:[intent.masterId]}:{}),...(start!==null?{[config.startFieldId]:new Date(start).toISOString()}:{})}})}
      navigate(node.actions.createScreenId)
    }:undefined}
    onConfigure={manage&&allowed(node.actions.configureScreenId)?()=>navigate(node.actions.configureScreenId):undefined}
    onOpenPeriod={manage&&allowed(node.actions.periodScreenId)?id=>navigate(node.actions.periodScreenId,id):undefined}/>
}
