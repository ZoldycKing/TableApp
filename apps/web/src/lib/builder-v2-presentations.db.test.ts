import {existsSync} from 'node:fs'
import {resolve} from 'node:path'
import {afterAll,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest'
import {and,eq} from 'drizzle-orm'
import {newId} from '@tableapp/schema'
import {builderV2Revision} from './builder-v2-revision'
import {configureBuilderV2BoardMove} from './builder-v2-board-policy'
const identity=vi.hoisted(()=>({email:null as string|null,member:null as import('./session').Member|null}))
vi.mock('@/lib/session',async original=>({...await original<typeof import('./session')>(),currentAccount:async()=>null,currentMember:async()=>identity.member}))
vi.mock('@/lib/app-session',async original=>({...await original<typeof import('./app-session')>(),currentStaffEmail:async()=>identity.email}))
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}))
vi.mock('@/lib/live',()=>({publishTable:vi.fn()}))
const env=resolve(import.meta.dirname,'../../../../.env');if(!process.env.DATABASE_URL&&existsSync(env))process.loadEnvFile(env)
describe.skipIf(!process.env.DATABASE_URL)('calendar and kanban: authorized windows and canonical status changes',()=>{
 let data:typeof import('@tableapp/db'),builder:typeof import('./builder-v2'),model:typeof import('@/components/builder/v2/model'),starter:typeof import('./builder-v2-starter'),publish:typeof import('@/app/builder-v2-publish-actions'),api:typeof import('@/app/builder-v2-published-actions'),privateApi:typeof import('@/app/builder-v2-data-actions'),moves:typeof import('@/app/builder-v2-board-actions'),pages:typeof import('./builder-v2-published-page')
 const userId=newId('user'),workspaceId=newId('workspace'),tableId=newId('table'),title=newId('field'),owner=newId('field'),date=newId('field'),when=newId('field'),status=newId('field'),secret=newId('field'),ids=Array.from({length:16},()=>newId('row'))
 const emailA=`a_${userId}@example.invalid`,emailB=`b_${userId}@example.invalid`,member={userId,workspaceId,email:`${userId}@example.invalid`,name:'Автор проверки',workspaceName:'V20 calendar board test',role:'owner' as const}
 const choices=Array.from({length:14},(_,i)=>({id:`status_${i}`,name:i===0?'Новый':i===1?'В работе':i===2?'Готово':`Этап ${i}`}))
 const rowData=(i:number)=>({[title]:`Задача ${String(i).padStart(2,'0')}`,[owner]:i<12?emailA:emailB,[date]:i<6||i===11||i>=12?'2026-11-03T21:00:00.000Z':i<8?'2026-11-05':i===8?null:i===9?'не дата':'2026-10-01',[when]:i===11?'2026-11-01T02:00:00Z':`2026-11-04T${String(20-i%6).padStart(2,'0')}:00:00Z`,[status]:i<3||i===10||i>=12?'status_0':i<6||i===9?'status_2':i===6?'status_1':i===7?'legacy_status':i===11?'status_13':null,[secret]:'Не передавать клиенту'})
 beforeAll(async()=>{
  data=await import('@tableapp/db');builder=await import('./builder-v2');model=await import('@/components/builder/v2/model');starter=await import('./builder-v2-starter');publish=await import('@/app/builder-v2-publish-actions');api=await import('@/app/builder-v2-published-actions');privateApi=await import('@/app/builder-v2-data-actions');moves=await import('@/app/builder-v2-board-actions');pages=await import('./builder-v2-published-page')
  await data.db.insert(data.users).values({id:userId,email:member.email});await data.db.insert(data.workspaces).values({id:workspaceId,ownerId:userId,name:member.workspaceName,slug:workspaceId,plan:'business'});await data.db.insert(data.workspaceMembers).values({workspaceId,userId,role:'owner'});await data.db.insert(data.tables).values({id:tableId,workspaceId,name:'Задачи',position:'a0'})
  await data.db.insert(data.fields).values([{id:title,tableId,name:'Название',type:'text',position:'a0'},{id:owner,tableId,name:'Ответственный',type:'email',position:'a1'},{id:date,tableId,name:'Дата',type:'date',position:'a2'},{id:when,tableId,name:'Время',type:'datetime',options:{timeZone:'America/New_York'},position:'a3'},{id:status,tableId,name:'Статус',type:'single_select',options:{choices},position:'a4'},{id:secret,tableId,name:'Закрытое поле',type:'text',position:'a5'}]);await data.db.update(data.tables).set({primaryFieldId:title}).where(eq(data.tables.id,tableId));await data.db.insert(data.rows).values(ids.map((id,i)=>({id,tableId,position:`a${String(i).padStart(3,'0')}`,data:rowData(i)})))
 })
 beforeEach(async()=>{vi.stubEnv('BUILDER_V2_ENABLED','true');identity.member=member;identity.email=emailA;await data.db.delete(data.apps).where(eq(data.apps.workspaceId,workspaceId));await data.db.delete(data.views).where(eq(data.views.tableId,tableId));await data.db.update(data.fields).set({options:{choices}}).where(eq(data.fields.id,status));for(let i=0;i<ids.length;i++)await data.db.update(data.rows).set({data:rowData(i),version:0,deletedAt:null}).where(eq(data.rows.id,ids[i]!));vi.clearAllMocks()})
 afterAll(async()=>{vi.unstubAllEnvs();if(!data)return;await data.db.delete(data.workspaces).where(and(eq(data.workspaces.id,workspaceId),eq(data.workspaces.ownerId,userId),eq(data.workspaces.name,member.workspaceName)));await data.db.delete(data.users).where(and(eq(data.users.id,userId),eq(data.users.email,member.email)));await data.sql.end()})
 async function fixture(layout:'calendar'|'kanban'|'list',options:{move?:boolean;dateTime?:boolean;filter?:boolean;hidden?:boolean;partial?:boolean}={}){
  const tables=(await builder.loadBuilderV2Catalog(workspaceId)).tables;let app=starter.buildBuilderV2Starter(builder.newBuilderV2App({id:newId('app'),workspaceId,name:'Задачи',slug:newId('app').replace('_','-'),email:member.email}),tables,tableId)
  app.roles.push({id:'worker',name:'Сотрудник'});app.authentication.members.push({email:emailA,roleIds:['worker'],company:''},{email:emailB,roleIds:['worker'],company:''});app.screens=app.screens.map(screen=>({...screen,audience:{kind:'roles',roleIds:['owner','worker']}}));app.policy.workflows=app.policy.workflows.map(grant=>({...grant,audience:{kind:'roles',roleIds:['owner','worker']}}))
  app.policy.tables=[{tableId,grants:[{audience:{kind:'roles',roleIds:['owner']},read:{fieldIds:tables[0]!.fields.map(field=>field.id),rows:{kind:'all'}}},{audience:{kind:'roles',roleIds:['worker']},read:{fieldIds:[title,date,when,...(options.hidden?[]:[status])],rows:{kind:'owned',fieldId:owner,property:'email'}}}]}]
  if (options.partial) app.policy.tables[0]!.grants.push({ audience: { kind: 'roles', roleIds: ['worker'] }, read: { fieldIds: [title], rows: { kind: 'all' } } })
  const home=app.homeScreenId!,node=app.nodes.find(node=>node.type==='collection')!;if(node.type!=='collection')throw new Error('Missing collection');const nodeId=node.id
  app=model.replaceNode(app,{...node,layout,titleFieldId:title,subtitleFieldId:null,...(layout==='calendar'?{dateFieldId:options.dateTime?when:date}:layout==='kanban'?{groupFieldId:status}:{listGroupFieldId:status})});app=model.updateNodeSource(app,nodeId,{pageSize:2,...(options.filter?{filter:{op:'eq',left:{kind:'row',fieldId:status},right:{kind:'literal',value:'status_0'}}}:{})})
  if(options.move)app=configureBuilderV2BoardMove(app,nodeId,['owner','worker'])
  await data.db.insert(data.apps).values({id:app.id,workspaceId,name:app.name,slug:app.slug,draft:app,theme:app.theme});const revision=builderV2Revision(app),result=await publish.publishBuilderV2Action(app.id,revision);if(!result.ok)throw new Error(result.error);return {app,revision,home,nodeId}
 }
 type Fixture=Awaited<ReturnType<typeof fixture>>
 const read=(f:Fixture,more:Record<string,unknown>={})=>api.readPublishedV2DataAction(f.app.slug,{revision:f.revision,screenId:f.home,nodeId:f.nodeId,...more})
 async function prepared(f:Fixture,id=ids[0]!,value:string|null='status_1',privateMode=false){const scope={screenId:f.home,nodeId:f.nodeId,itemId:id},initial=privateMode?await moves.inspectBuilderV2BoardMoveAction(f.app.id,scope):await moves.inspectPublishedV2BoardMoveAction(f.app.slug,{...scope,revision:f.revision});if(!initial.ok)throw new Error(initial.error);return {...scope,revision:initial.state.revision,fingerprint:initial.state.fingerprint,requestId:`board_${crypto.randomUUID().replaceAll('-','')}`,value}}
 async function statusOf(id=ids[0]!){return (await data.db.select().from(data.rows).where(eq(data.rows.id,id)))[0]!.data as Record<string,unknown>}
 it('pages select groups in choice order through the database and keeps missing or legacy choices last', async () => {
  const f = await fixture('list')
  identity.email = member.email
  const loaded: { id: string; label: string | undefined }[] = []
  let cursor: string | null = null
  for (let index = 0; index < 8; index++) {
   const result = await read(f, cursor ? { cursor } : {})
   if (!result.ok) throw new Error(result.error)
   expect(result.page.total).toBe(16)
   expect(result.page.rows).toHaveLength(2)
   loaded.push(...result.page.rows.map(row => ({ id: row.id, label: row.group?.label })))
   cursor = result.page.next
   expect(Boolean(cursor)).toBe(index < 7)
  }
  expect(loaded.map(row => row.id)).toEqual([0, 1, 2, 10, 12, 13, 14, 15, 6, 3, 4, 5, 9, 11, 7, 8].map(i => ids[i]))
  expect(loaded.slice(8).map(row => row.label)).toEqual(['В работе', 'Готово', 'Готово', 'Готово', 'Готово', 'Этап 13', 'Другой вариант', 'Без значения'])
 })
 it('does not disclose a group on rows where its field is hidden and still returns those rows', async () => {
  const f = await fixture('list', { partial: true })
  const loaded = new Map<string, string | undefined>()
  let cursor: string | null = null
  for (let index = 0; index < 8; index++) {
   const result = await read(f, cursor ? { cursor } : {})
   if (!result.ok) throw new Error(result.error)
   for (const row of result.page.rows) loaded.set(row.id, row.group?.label)
   cursor = result.page.next
  }
  expect(loaded.size).toBe(16)
  expect(loaded.get(ids[11]!)).toBe('Этап 13')
  for (const id of ids.slice(12)) expect(loaded.get(id)).toBe('Без значения')
  const hidden = await fixture('list', { hidden: true })
  const ungrouped = await read(hidden)
  expect(ungrouped).toMatchObject({ ok: true, page: { total: 12, rows: [{ id: ids[0] }, { id: ids[1] }] } })
  expect(ungrouped.ok && ungrouped.page.rows.every(row => row.group === undefined)).toBe(true)
 })
 it('counts only authorized rows for the whole month while paging one day and retaining undated records',async()=>{
  const f=await fixture('calendar'),request={calendarMonth:'2026-11',calendarDay:'2026-11-04'},first=await read(f,request);expect(first).toMatchObject({ok:true,page:{total:7,calendar:{days:{'2026-11-04':7,'2026-11-05':2},undated:2,timeZone:'Europe/Moscow'}}});if(!first.ok)throw new Error(first.error);expect(first.page.rows.map(row=>row.id)).toEqual(ids.slice(0,2));expect(JSON.stringify(first)).not.toContain(emailA);expect(JSON.stringify(first)).not.toContain('Не передавать')
  const next=await read(f,{...request,cursor:first.page.next});expect(next).toMatchObject({ok:true,page:{rows:[{id:ids[2]},{id:ids[3]}]}});expect(await read(f,{calendarMonth:'2026-11',calendarDay:'2026-11-05',cursor:first.page.next})).toMatchObject({ok:false});expect(await read(f,{calendarMonth:'undated'})).toMatchObject({ok:true,page:{total:2}})
  const own=await privateApi.readBuilderV2DataAction(f.app.id,f.app,{nodeId:f.nodeId,screenId:f.home,...request});expect(own).toMatchObject({ok:true,page:{total:11}})
 })
 it('uses the saved datetime timezone and orders agenda by time unless source sorts override it',async()=>{
  const f=await fixture('calendar',{dateTime:true}),oct=await read(f,{calendarMonth:'2026-10',calendarDay:'2026-10-31'});expect(oct).toMatchObject({ok:true,page:{total:1,rows:[{id:ids[11]}],calendar:{timeZone:'America/New_York'}}});expect(await read(f,{calendarMonth:'2026-11',calendarDay:'2026-11-04'})).toMatchObject({ok:true,page:{rows:[{id:ids[5]},{id:ids[4]}]}})
  f.app=model.updateNodeSource(f.app,f.nodeId,{sorts:[{fieldId:title,direction:'asc'}]});f.revision=builderV2Revision(f.app);await data.db.update(data.apps).set({draft:f.app}).where(eq(data.apps.id,f.app.id));expect(await publish.publishBuilderV2Action(f.app.id,f.revision)).toMatchObject({ok:true});expect(await read(f,{calendarMonth:'2026-11',calendarDay:'2026-11-04'})).toMatchObject({ok:true,page:{rows:[{id:ids[0]},{id:ids[1]}]}})
 })
 it('separates board continuations, counts all owned rows, and lazily loads late columns',async()=>{
  const f=await fixture('kanban'),result=await read(f);if(!result.ok)throw new Error(result.error);const columns=result.page.board!.columns,first=columns.find(column=>column.key==='c:status_0')!,late=columns.find(column=>column.key==='c:status_13')!
  expect(result.page.total).toBe(12);expect(first).toMatchObject({total:4,rows:[{id:ids[0]},{id:ids[1]}]});expect(columns.find(column=>column.key==='other')).toMatchObject({name:'Другой статус',total:1});expect(columns.find(column=>column.key==='empty')).toMatchObject({total:1});expect(JSON.stringify(result)).not.toContain('legacy_status')
  expect(await read(f,{boardColumn:first.key,cursor:first.next})).toMatchObject({ok:true,page:{rows:[{id:ids[2]},{id:ids[10]}]}});expect(await read(f,{boardColumn:late.key,cursor:late.next})).toMatchObject({ok:true,page:{rows:[{id:ids[11]}]}});expect(await read(f,{boardColumn:late.key,cursor:first.next})).toMatchObject({ok:false});expect(await read(f,{calendarMonth:'2026-11'})).toMatchObject({ok:false})
 })
 it('denies grouping on an unreadable status field and strips author role settings from the published model',async()=>{
  const denied=await fixture('kanban',{hidden:true});expect(await read(denied)).toMatchObject({ok:false});const f=await fixture('kanban',{move:true}),page=await pages.loadPublishedV2Page(f.app.slug,{screen:f.home});if(page.login)throw new Error('Login');expect(JSON.parse(JSON.stringify(page.app.nodes.find(node=>node.id===f.nodeId)))).not.toHaveProperty('kanbanMoveRoleIds');expect(JSON.stringify(page.app)).not.toContain(emailA)
 })
 it('moves only an opted-in owned record, even when ownership fields are hidden, and commits exactly once',async()=>{
  const f=await fixture('kanban',{move:true}),page=await read(f);if(!page.ok)throw new Error(page.error);expect(page.page.rows[0]).toMatchObject({canMove:true});expect(page.page.rows[0]!.values).not.toHaveProperty(owner)
  const request=await prepared(f),results=await Promise.all([moves.movePublishedV2BoardAction(f.app.slug,request),moves.movePublishedV2BoardAction(f.app.slug,request)]);expect(results.every(result=>result.ok)).toBe(true);expect(results.filter(result=>result.ok&&result.repeated)).toHaveLength(1);expect(await statusOf()).toMatchObject({[status]:'status_1'});expect(await data.db.select().from(data.appActionRuns).where(eq(data.appActionRuns.appId,f.app.id))).toHaveLength(1)
  expect(await moves.movePublishedV2BoardAction(f.app.slug,{...request,itemId:ids[12],requestId:`board_${crypto.randomUUID().replaceAll('-','')}`})).toMatchObject({ok:false});identity.email=emailB;expect(await moves.movePublishedV2BoardAction(f.app.slug,request)).toMatchObject({ok:false})
 })
 it('replays a successful move after the card leaves its source filter, but denies a fresh action there',async()=>{
  const f=await fixture('kanban',{move:true,filter:true}),request=await prepared(f);expect(await moves.movePublishedV2BoardAction(f.app.slug,request)).toMatchObject({ok:true});expect(await moves.movePublishedV2BoardAction(f.app.slug,request)).toMatchObject({ok:true,repeated:true});expect(await moves.inspectPublishedV2BoardMoveAction(f.app.slug,{screenId:f.home,nodeId:f.nodeId,itemId:ids[0],revision:f.revision})).toMatchObject({ok:false})
 })
 it('rejects stale record versions and changed choice metadata before writing',async()=>{
  const f=await fixture('kanban',{move:true}),request=await prepared(f);await data.db.update(data.rows).set({version:1}).where(eq(data.rows.id,ids[0]!));expect(await moves.movePublishedV2BoardAction(f.app.slug,request)).toMatchObject({ok:false,stale:true});expect(await statusOf()).toMatchObject({[status]:'status_0'})
  const fresh=await prepared(f);await data.db.update(data.fields).set({options:{choices:choices.slice(0,1)}}).where(eq(data.fields.id,status));expect(await moves.movePublishedV2BoardAction(f.app.slug,fresh)).toMatchObject({ok:false});expect(await statusOf()).toMatchObject({[status]:'status_0'})
 })
 it('requires explicit move permission, rejects transport overrides and supports private preview with the same checks',async()=>{
  const f=await fixture('kanban');expect(await moves.inspectPublishedV2BoardMoveAction(f.app.slug,{screenId:f.home,nodeId:f.nodeId,itemId:ids[0],revision:f.revision})).toMatchObject({ok:false})
  const allowed=await fixture('kanban',{move:true}),request=await prepared(allowed);for(const extra of [{tableId},{fieldId:status},{roleIds:['owner']},{value:'forged_choice'}])expect(await moves.movePublishedV2BoardAction(allowed.app.slug,{...request,...extra})).toMatchObject({ok:false});expect(await statusOf()).toMatchObject({[status]:'status_0'})
  const own=await prepared(allowed,ids[0]!,null,true);expect(await moves.moveBuilderV2BoardAction(allowed.app.id,own)).toMatchObject({ok:true});expect(await statusOf()).toMatchObject({[status]:null})
 })
 it('invalidates board cursors and pending writes when a saved view changes',async()=>{
  const f=await fixture('kanban',{move:true}),viewId=newId('view');await data.db.insert(data.views).values({id:viewId,tableId,name:'Отбор',type:'grid',position:'a0',config:{}});f.app=model.updateNodeSource(f.app,f.nodeId,{viewId});f.revision=builderV2Revision(f.app);await data.db.update(data.apps).set({draft:f.app}).where(eq(data.apps.id,f.app.id));expect(await publish.publishBuilderV2Action(f.app.id,f.revision)).toMatchObject({ok:true});const first=await read(f);if(!first.ok)throw new Error(first.error);const column=first.page.board!.columns[0]!,request=await prepared(f)
  await data.db.update(data.views).set({config:{filter:{id:'new-filter',conjunction:'and',conditions:[{id:'new-condition',fieldId:title,op:'is',value:'Missing'}]}}}).where(eq(data.views.id,viewId));expect(await read(f,{boardColumn:column.key,cursor:column.next})).toMatchObject({ok:false});expect(await moves.movePublishedV2BoardAction(f.app.slug,request)).toMatchObject({ok:false});expect(await statusOf()).toMatchObject({[status]:'status_0'})
 })
})
