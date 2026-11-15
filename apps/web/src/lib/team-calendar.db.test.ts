import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { newId, instantToWallClock } from '@tableapp/schema'
import type { AppV2 } from '@tableapp/schema/app-v2'
import { buildTemplate } from './templates/build'
import { salon } from './templates/defs/salon'
import { buildBookingV2App } from './templates/booking-v2'
import { builderV2Revision } from './builder-v2-revision'

const identity=vi.hoisted(()=>({email:'owner@example.com',member:null as import('./session').Member|null}))
vi.mock('@/lib/app-session',()=>({currentStaffEmail:async()=>identity.email}))
vi.mock('@/lib/session',()=>({currentAccount:async()=>null,currentMember:async()=>identity.member}))
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}))
describe.skipIf(!process.env.DATABASE_URL)('configurable team calendar reads',()=>{
  const userId=newId('user'),workspaceId=newId('workspace'),built=buildTemplate({template:salon,workspaceId})
  const starter=buildBookingV2App(built,{id:newId('app'),workspaceId,name:'Календарь без сценария салона',slug:`calendar-${workspaceId.replaceAll('_','-')}`,email:'owner@example.com'})
  const booking=starter.booking!,node=starter.nodes.find(node=>node.type==='team_calendar')!
  const app:AppV2={...starter,homeScreenId:booking.listScreenId!}
  delete app.booking
  const master=built.rows.find(row=>row.tableId===booking.tables.masters)!,masterValues=master.data as Record<string,unknown>
  app.authentication.members.push({email:String(masterValues[booking.master.email]),roleIds:['staff'],company:''})
  const member={userId,workspaceId,email:'owner@example.com',name:'Проверка календаря',workspaceName:'Календарь',role:'owner'as const}
  let data:typeof import('@tableapp/db'),actions:typeof import('@/app/team-calendar-actions')
  const request=()=>({screenId:booking.listScreenId!,nodeId:node.id,day:instantToWallClock(new Date(),'Europe/Moscow')!.date,week:true,revision:builderV2Revision(app)})
  beforeAll(async()=>{
    data=await import('@tableapp/db');actions=await import('@/app/team-calendar-actions')
    await data.db.insert(data.users).values({id:userId,email:`${userId}@example.invalid`})
    await data.db.insert(data.workspaces).values({id:workspaceId,ownerId:userId,name:'Isolated calendar',slug:workspaceId,plan:'business'})
    await data.db.insert(data.workspaceMembers).values({userId,workspaceId,role:'owner'})
    await data.db.insert(data.tables).values(built.tables)
    await data.db.insert(data.fields).values(built.fields)
    await data.db.insert(data.views).values(built.views)
    await data.db.insert(data.rows).values(built.rows.map(row=>({...row,createdBy:userId,updatedBy:userId})))
    await data.db.insert(data.apps).values({id:app.id,workspaceId,name:app.name,slug:app.slug,draft:app,published:app,theme:app.theme,accessMode:'allowlist'})
  })
  beforeEach(()=>{identity.email='owner@example.com';identity.member=member})
  afterAll(async()=>{if(data){await data.db.delete(data.workspaces).where(eq(data.workspaces.id,workspaceId));await data.db.delete(data.users).where(eq(data.users.id,userId))}})
  it('reads three tables without a booking adapter and returns only calendar information',async()=>{
    const result=await actions.readPublishedTeamCalendarAction(app.slug,request())
    expect(result.ok,JSON.stringify(result)).toBe(true)
    if(!result.ok)return
    expect(result.data.masters).toHaveLength(3);expect(result.data.shifts).toHaveLength(21)
    expect(result.data.masters.map(row=>row.id)).toEqual(built.rows.filter(row=>row.tableId===booking.tables.masters).map(row=>row.id))
    expect(result.data.shifts.some(shift=>shift.windows?.some(window=>window.start===540&&window.end===780))).toBe(true)
    expect(result.data.visits.length).toBeGreaterThan(0)
    expect(result.data.visits.some(visit=>visit.service.includes('стрижка'))).toBe(true)
    expect(JSON.stringify(result)).not.toMatch(/example\.com|\+7|прошлый раз|fingerprint|revision/)
  })
  it('applies staff ownership and withholds unreadable working hours',async()=>{
    identity.email=String(masterValues[booking.master.email])
    const result=await actions.readPublishedTeamCalendarAction(app.slug,request())
    expect(result.ok,JSON.stringify(result)).toBe(true)
    if(!result.ok)return
    expect(result.data.masters.map(row=>row.id)).toEqual([master.id])
    expect(result.data.visits.every(visit=>visit.masterId===master.id)).toBe(true)
    expect(result.data.shifts.every(shift=>shift.windows===null)).toBe(true)
  })
  it('rejects guest access, unrelated screens, fabricated data and stale publication',async()=>{
    const query=request()
    expect(await actions.readPublishedTeamCalendarAction(app.slug,{...query,screenId:booking.catalogScreenId})).toMatchObject({ok:false})
    expect(await actions.readPublishedTeamCalendarAction(app.slug,{...query,tableId:'foreign'})).toMatchObject({ok:false})
    expect(await actions.readPublishedTeamCalendarAction(app.slug,{...query,revision:'old'})).toMatchObject({ok:false})
    expect(await actions.readPublishedTeamCalendarAction(app.slug,{...query,day:'2026-02-30'})).toMatchObject({ok:false})
    identity.email=''
    expect(await actions.readPublishedTeamCalendarAction(app.slug,query)).toMatchObject({ok:false})
  })
  it('loads an author preview only for the verified workspace and real screen placement',async()=>{
    const{revision,...query}=request()
    const result=await actions.readBuilderTeamCalendarAction(app.id,app,query)
    expect(result,JSON.stringify(result)).toMatchObject({ok:true})
    expect(await actions.readBuilderTeamCalendarAction(app.id,{...app,workspaceId:'foreign'},query)).toMatchObject({ok:false})
    expect(await actions.readBuilderTeamCalendarAction(app.id,app,{...query,screenId:booking.catalogScreenId})).toMatchObject({ok:false})
  })
  it('serializes the same configurable node and permitted date metadata for the published page',async()=>{
    const page=await(await import('./builder-v2-published-page')).loadPublishedV2Page(app.slug,{screen:booking.listScreenId!})
    expect(page.login).toBe(false)
    if(page.login)return
    expect(page.app.nodes.find(item=>item.id===node.id)?.type).toBe('team_calendar')
    expect(page.tables.find(table=>table.id===booking.tables.visits)?.fields.find(field=>field.id===booking.visit.start)?.timeZone).toBe('Europe/Moscow')
    expect(page.app.policy.tables).toEqual([])
  })
  it('respects a saved view and does not calculate event positions from a hidden date field',async()=>{
    const current=structuredClone(app),calendar=current.nodes.find(node=>node.type==='team_calendar')!
    if(calendar.type!=='team_calendar'||!calendar.data)throw Error('missing calendar')
    const viewId=newId('view')
    await data.db.insert(data.views).values({id:viewId,tableId:booking.tables.visits,name:'Только Оля',type:'grid',position:'z1',config:{filter:{id:'master_filter',conjunction:'and',conditions:[{id:'master_condition',fieldId:booking.visit.master,op:'has_any_of',value:[master.id]}]}}})
    calendar.data.viewId=viewId
    try{
      await data.db.update(data.apps).set({published:current}).where(eq(data.apps.id,app.id))
      const filtered=await actions.readPublishedTeamCalendarAction(app.slug,{...request(),revision:builderV2Revision(current)})
      expect(filtered.ok,JSON.stringify(filtered)).toBe(true)
      if(filtered.ok){expect(filtered.data.visits.length).toBeGreaterThan(0);expect(filtered.data.visits.every(visit=>visit.masterId===master.id)).toBe(true)}
      const rule=current.policy.tables.find(rule=>rule.tableId===booking.tables.visits)!
      for(const grant of rule.grants)if(grant.read)grant.read.fieldIds=grant.read.fieldIds.filter(id=>id!==booking.visit.start)
      await data.db.update(data.apps).set({published:current}).where(eq(data.apps.id,app.id))
      const denied=await actions.readPublishedTeamCalendarAction(app.slug,{...request(),revision:builderV2Revision(current)})
      expect(denied.ok,JSON.stringify(denied)).toBe(true)
      if(denied.ok)expect(denied.data.visits).toEqual([])
    }finally{await data.db.update(data.apps).set({published:app}).where(eq(data.apps.id,app.id))}
  })
})
