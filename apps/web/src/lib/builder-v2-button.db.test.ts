import {existsSync} from 'node:fs'
import {resolve} from 'node:path'
import {afterAll,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest'
import {and,desc,eq,inArray,isNull} from 'drizzle-orm'
import {newId,positionBetween} from '@tableapp/schema'
import type {AppV2,AppV2Step} from '@tableapp/schema/app-v2'
import type {BuilderV2ButtonState} from './builder-v2-button-types'
import {builderV2Revision} from './builder-v2-revision'
const identity=vi.hoisted(()=>({member:null as import('./session').Member|null}))
vi.mock('@/lib/session',async original=>({...await original<typeof import('./session')>(),currentMember:async()=>identity.member}))
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}))
vi.mock('@/lib/live',()=>({publishTable:vi.fn()}))
const env=resolve(import.meta.dirname,'../../../../.env');if(!process.env.DATABASE_URL&&existsSync(env))process.loadEnvFile(env)
describe.skipIf(!process.env.DATABASE_URL)('private button workflows use canonical definitions and the shared atomic engine',()=>{
  let data:typeof import('@tableapp/db'),actions:typeof import('@/app/builder-v2-button-actions'),builder:typeof import('./builder-v2'),model:typeof import('@/components/builder/v2/model'),configure:typeof import('./builder-v2-button-action'),starter:typeof import('./builder-v2-starter'),live:typeof import('./live')
  const userId=newId('user'),other=newId('user'),workspaceId=newId('workspace'),foreignWorkspace=newId('workspace'),tableId=newId('table'),audits=newId('table'),title=newId('field'),done=newId('field'),owner=newId('field'),note=newId('field'),parent=newId('field')
  const member={userId,workspaceId,email:`${userId}@example.invalid`,name:'Автор кнопки',workspaceName:'V12 buttons',role:'owner' as const}
  beforeAll(async()=>{
    data=await import('@tableapp/db');actions=await import('@/app/builder-v2-button-actions');builder=await import('./builder-v2');model=await import('@/components/builder/v2/model');configure=await import('./builder-v2-button-action');starter=await import('./builder-v2-starter');live=await import('./live')
    await data.db.insert(data.users).values([{id:userId,email:member.email},{id:other,email:`${other}@example.invalid`}])
    await data.db.insert(data.workspaces).values([{id:workspaceId,ownerId:userId,name:member.workspaceName,slug:workspaceId,plan:'business'},{id:foreignWorkspace,ownerId:other,name:'V12 foreign',slug:foreignWorkspace}])
    await data.db.insert(data.workspaceMembers).values([{workspaceId,userId,role:'owner'},{workspaceId,userId:other,role:'editor'},{workspaceId:foreignWorkspace,userId:other,role:'owner'}])
    await data.db.insert(data.tables).values([{id:tableId,workspaceId,name:'Заявки',position:'a0'},{id:audits,workspaceId,name:'История',position:'a1'}])
    await data.db.insert(data.fields).values([{id:title,tableId,name:'Название',type:'text',position:'a0'},{id:done,tableId,name:'Готово',type:'checkbox',position:'a1'},{id:owner,tableId,name:'Автор',type:'email',position:'a2'},{id:note,tableId:audits,name:'Событие',type:'text',position:'a0'},{id:parent,tableId:audits,name:'Заявка',type:'relation',options:{tableId},position:'a1'}])
    for(const [id,primaryFieldId] of [[tableId,title],[audits,note]])await data.db.update(data.tables).set({primaryFieldId}).where(eq(data.tables.id,id!))
  })
  beforeEach(()=>{identity.member=member;vi.clearAllMocks()})
  afterAll(async()=>{vi.unstubAllEnvs();if(!data)return;await data.db.delete(data.workspaces).where(inArray(data.workspaces.id,[workspaceId,foreignWorkspace]));await data.db.delete(data.users).where(inArray(data.users.id,[userId,other]));await data.sql.end()})
  async function fixture(contextual=true,transform?:(steps:AppV2Step[],detailId:string)=>AppV2Step[]){
    const tables=(await builder.loadBuilderV2Catalog(workspaceId)).tables
    let app=starter.buildBuilderV2Starter(builder.newBuilderV2App({id:newId('app'),workspaceId,name:'Рабочие заявки',slug:newId('app').replace('_','-'),email:member.email}),tables,tableId)
    const detailId=app.screens.find(screen=>screen.contextTableId===tableId)!.id,screenId=contextual?detailId:app.homeScreenId!,added=model.addNode(app,screenId,'button',tables,null,'');app=configure.configureBuilderV2Button(added.app,added.id,['owner'])
    const node=app.nodes.find(node=>node.id===added.id)!,flow=configure.builderV2ButtonAction(app,node)!.flow
    const steps:AppV2Step[]=contextual?[{id:'check',type:'require',condition:{op:'not_empty',value:{kind:'row',fieldId:title}},message:'Укажите название'},{id:'complete',type:'update_row',tableId,target:{kind:'current'},values:{[done]:{kind:'literal',value:true}}},{id:'audit',type:'create_row',tableId:audits,values:{[note]:{kind:'result',stepId:'complete',fieldId:title},[parent]:{kind:'record_ids',tableId,record:{kind:'result',stepId:'complete'}}}},{id:'branch',type:'branch',condition:{op:'eq',left:{kind:'row',fieldId:done},right:{kind:'literal',value:true}},then:[{id:'yes',type:'notify',message:{kind:'literal',value:'Заявка завершена'}}],else:[{id:'no',type:'notify',message:{kind:'literal',value:'Ещё в работе'}}]},{id:'open',type:'open_screen',screenId:detailId,record:{kind:'current'}}]:[{id:'notice',type:'notify',message:{kind:'literal',value:'Готово'}}]
    app=configure.configureBuilderV2ButtonWorkflow(app,node.id,{...flow,name:'Завершить заявку',steps:transform?transform(steps,detailId):steps})
    const rowId=newId('row');if(contextual){
      // Row IDs can end in zero and are not valid fractional positions.
      const [last]=await data.db.select({position:data.rows.position}).from(data.rows).where(eq(data.rows.tableId,tableId)).orderBy(desc(data.rows.position)).limit(1)
      await data.db.insert(data.rows).values({id:rowId,tableId,position:positionBetween(last?.position??null,null),data:{[title]:'Ремонт', [done]:false,[owner]:member.email}})
    }
    await data.db.insert(data.apps).values({id:app.id,workspaceId,name:app.name,slug:app.slug,theme:app.theme,draft:app})
    return {app,nodeId:node.id,detailId,rowId,scope:{nodeId:node.id,screenId,...(contextual?{recordId:rowId}:{})}}
  }
  async function input(f:Awaited<ReturnType<typeof fixture>>){const result=await actions.inspectBuilderV2ButtonAction(f.app.id,f.scope);if(!result.ok)throw new Error(result.error);const state=result.state as BuilderV2ButtonState;return {...f.scope,requestId:`button_${crypto.randomUUID().replaceAll('-','')}`,revision:state.revision,fingerprint:state.fingerprint}}
  const row=(id:string)=>data.db.select().from(data.rows).where(eq(data.rows.id,id)).then(rows=>rows[0]!)
  const logs=(appId:string)=>data.db.select().from(data.builderWorkflowRuns).where(eq(data.builderWorkflowRuns.appId,appId))
  const receipts=(appId:string)=>data.db.select().from(data.builderActionRuns).where(eq(data.builderActionRuns.appId,appId))
  const active=()=>data.db.select().from(data.rows).where(and(eq(data.rows.tableId,audits),isNull(data.rows.deletedAt)))
  it('executes an author list action only for the selected row and replays after it leaves the filter',async()=>{
    const f=await fixture(true,steps=>[steps[1]!]),tables=(await builder.loadBuilderV2Catalog(workspaceId)).tables,collection=f.app.nodes.find(node=>node.type==='collection')!;if(collection.type!=='collection')throw new Error('No collection')
    const base=structuredClone(f.app),button=base.nodes.find(node=>node.id===f.nodeId)!;if(button.type!=='button')throw new Error('No button')
    button.events.press=null;base.screens.find(screen=>screen.id===f.detailId)!.rootIds=base.screens.find(screen=>screen.id===f.detailId)!.rootIds.filter(id=>id!==f.nodeId)
    const list=base.nodes.find(node=>node.id===collection.id)!;if(list.type!=='collection')throw new Error('No list');list.itemIds.push(button.id)
    let app=configure.configureBuilderV2Button(base,button.id,['owner']),flow=configure.builderV2ButtonAction(app,app.nodes.find(node=>node.id===button.id)!)!.flow
    app=configure.configureBuilderV2ButtonWorkflow(app,button.id,{...flow,steps:[{id:'finish-list-row',type:'update_row',tableId,target:{kind:'current'},values:{[done]:{kind:'literal',value:true}}}]});app.authentication.members.find(entry=>entry.email===member.email)!.company='team-alpha';app=model.updateNodeSource(app,collection.id,{filter:{op:'and',conditions:[{op:'eq',left:{kind:'row',fieldId:done},right:{kind:'literal',value:false}},{op:'eq',left:{kind:'user',property:'company'},right:{kind:'literal',value:'team-alpha'}}]}})
    await data.db.update(data.apps).set({draft:app}).where(eq(data.apps.id,app.id))
    const {readBuilderV2NodeData}=await import('./builder-v2-data'),visible=await readBuilderV2NodeData(app,member,{screenId:app.homeScreenId!,nodeId:collection.id});expect(visible.rows.some(row=>row.id===f.rowId)).toBe(true)
    const scope={screenId:app.homeScreenId!,nodeId:button.id,itemId:f.rowId},checked=await actions.inspectBuilderV2ButtonAction(app.id,scope);if(!checked.ok)throw new Error(checked.error)
    const request={...scope,revision:checked.state.revision,fingerprint:checked.state.fingerprint,requestId:`button_${crypto.randomUUID().replaceAll('-','')}`}
    expect(await actions.submitBuilderV2ButtonAction(app.id,request)).toMatchObject({ok:true,rowId:f.rowId});expect(await actions.submitBuilderV2ButtonAction(app.id,request)).toMatchObject({ok:true,repeated:true})
    expect(await actions.inspectBuilderV2ButtonAction(app.id,scope)).toMatchObject({ok:false});expect(await logs(app.id)).toHaveLength(1)
  })

  it('runs the canonical author itemPress chain and refuses foreign or missing list items',async()=>{
    const f=await fixture(),items=await import('./builder-v2-item-action'),list=f.app.nodes.find(node=>node.type==='collection')!;if(list.type!=='collection')throw new Error('No list')
    let app=items.configureBuilderV2ItemAction(f.app,list.id,['owner']),flow=configure.builderV2NodeAction(app,app.nodes.find(node=>node.id===list.id)!)!.flow
    app=items.configureBuilderV2ItemWorkflow(app,list.id,{...flow,steps:[{id:'finish-row',type:'update_row',tableId,target:{kind:'current'},values:{[done]:{kind:'literal',value:true}}}]});app=model.updateNodeSource(app,list.id,{filter:{op:'eq',left:{kind:'row',fieldId:done},right:{kind:'literal',value:false}}})
    await data.db.update(data.apps).set({draft:app}).where(eq(data.apps.id,app.id));const scope={screenId:app.homeScreenId!,nodeId:list.id,itemId:f.rowId},checked=await actions.inspectBuilderV2ButtonAction(app.id,scope);if(!checked.ok)throw new Error(checked.error)
    expect(await actions.inspectBuilderV2ButtonAction(app.id,{screenId:scope.screenId,nodeId:list.id})).toMatchObject({ok:false})
    expect(await actions.inspectBuilderV2ButtonAction(app.id,{...scope,itemId:newId('row')})).toMatchObject({ok:false})
    const request={...scope,revision:checked.state.revision,fingerprint:checked.state.fingerprint,requestId:`button_${crypto.randomUUID().replaceAll('-','')}`}
    expect(await actions.submitBuilderV2ButtonAction(app.id,request)).toMatchObject({ok:true,rowId:f.rowId});expect(await actions.submitBuilderV2ButtonAction(app.id,request)).toMatchObject({ok:true,repeated:true});expect((await row(f.rowId)).data).toMatchObject({[done]:true})
  })

  it('confirms an author chain as a whole, preserves cancellation and returns a receipt after the row is deleted',async()=>{
    const f=await fixture(true,steps=>[steps[1]!,{id:'remove',type:'delete_row',tableId,target:{kind:'current'},confirm:true},{id:'notice',type:'notify',message:{kind:'literal',value:'Удалено'}}]),request=await input(f),pending=await actions.submitBuilderV2ButtonAction(f.app.id,request)
    expect(pending).toMatchObject({ok:false,confirmation:{records:[{recordLabel:'Ремонт',tableName:'Заявки'}]}});expect((await row(f.rowId))).toMatchObject({deletedAt:null,data:{[done]:false}});expect(await receipts(f.app.id)).toHaveLength(0);expect(await logs(f.app.id)).toHaveLength(0)
    if(pending.ok||!pending.confirmation)throw new Error('No confirmation')
    const confirmed={...request,confirmation:pending.confirmation.fingerprint},first=await actions.submitBuilderV2ButtonAction(f.app.id,confirmed);expect(first).toMatchObject({ok:true,effects:expect.arrayContaining([{type:'open_screen',screenId:f.app.homeScreenId}])})
    expect(await actions.submitBuilderV2ButtonAction(f.app.id,confirmed)).toMatchObject({...first,repeated:true});expect((await row(f.rowId)).deletedAt).not.toBeNull();expect(await logs(f.app.id)).toHaveLength(1)
  })
  it('updates, creates a related row, chooses the branch, navigates and replays one outcome for concurrent requests',async()=>{
    const f=await fixture(),request=await input(f),before=(await active()).length
    const results=await Promise.all([actions.submitBuilderV2ButtonAction(f.app.id,request),actions.submitBuilderV2ButtonAction(f.app.id,request)])
    if(!results[0]?.ok||!results[1]?.ok)throw new Error(JSON.stringify(results))
    expect(results.map(result=>result.ok&&result.repeated).sort()).toEqual([false,true]);expect(results[0].effects).toEqual(results[1].effects)
    expect(results[0].effects).toEqual([{type:'notify',message:'Заявка завершена'},{type:'open_screen',screenId:f.detailId,recordId:f.rowId}])
    expect((await row(f.rowId)).data).toMatchObject({[done]:true});expect(await active()).toHaveLength(before+1)
    expect((await active()).find(item=>(item.data as Record<string,unknown>)[parent]?.toString()===f.rowId)?.data).toMatchObject({[note]:'Ремонт',[parent]:[f.rowId]})
    expect(await data.db.select().from(data.rowChanges).where(eq(data.rowChanges.rowId,f.rowId))).toHaveLength(1)
    expect(await logs(f.app.id)).toHaveLength(1);expect(await receipts(f.app.id)).toHaveLength(1);expect(live.publishTable).toHaveBeenCalledTimes(2)
    expect(await actions.submitBuilderV2ButtonAction(f.app.id,{...request,fingerprint:'b'.repeat(64)})).toMatchObject({ok:false})
  })
  it('rolls back both tables and their histories on a late failure, while retaining a failed execution log',async()=>{
    const f=await fixture(true,steps=>[...steps,{id:'fail',type:'require',condition:{op:'eq',left:{kind:'literal',value:1},right:{kind:'literal',value:2}},message:'Проверка не пройдена'}]),request=await input(f),before=(await active()).length
    const result=await actions.submitBuilderV2ButtonAction(f.app.id,request)
    expect(result).toMatchObject({ok:false,error:'Проверка не пройдена',trace:expect.arrayContaining([expect.objectContaining({stepId:'complete',status:'rolled_back'}),expect.objectContaining({stepId:'fail',status:'failed'})])})
    expect((await row(f.rowId)).data).toMatchObject({[done]:false});expect(await active()).toHaveLength(before);expect(await receipts(f.app.id)).toHaveLength(0);expect(await logs(f.app.id)).toMatchObject([{status:'failed'}]);expect(live.publishTable).not.toHaveBeenCalled()
    expect(await data.db.select().from(data.rowChanges).where(eq(data.rowChanges.rowId,f.rowId))).toHaveLength(0)
  })
  it('checks each table grant and keeps current-row ownership constraints',async()=>{
    const f=await fixture(),app=structuredClone(f.app)
    app.policy.tables=app.policy.tables.map(rule=>rule.tableId===audits?{...rule,grants:rule.grants.filter(grant=>!grant.create)}:rule)
    await data.db.update(data.apps).set({draft:app}).where(eq(data.apps.id,app.id))
    expect(await actions.submitBuilderV2ButtonAction(app.id,await input(f))).toMatchObject({ok:false})
    expect((await row(f.rowId)).data).toMatchObject({[done]:false})
    app.policy.tables=app.policy.tables.map(rule=>rule.tableId===tableId?{...rule,grants:rule.grants.map(grant=>grant.update?{...grant,update:{...grant.update,rows:{kind:'owned' as const,fieldId:owner,property:'email' as const}}}:grant)}:rule)
    await data.db.update(data.apps).set({draft:app}).where(eq(data.apps.id,app.id));await data.db.update(data.rows).set({data:{[title]:'Чужая заявка',[done]:false,[owner]:'someone@example.invalid'}}).where(eq(data.rows.id,f.rowId))
    expect(await actions.submitBuilderV2ButtonAction(app.id,await input(f))).toMatchObject({ok:false});expect((await row(f.rowId)).data).toMatchObject({[done]:false})
  })
  it('rejects stale context or definitions before writing, and refuses a forged context',async()=>{
    const f=await fixture(),request=await input(f)
    await data.db.update(data.rows).set({version:1}).where(eq(data.rows.id,f.rowId))
    expect(await actions.submitBuilderV2ButtonAction(f.app.id,request)).toMatchObject({ok:false,stale:true})
    expect(await actions.inspectBuilderV2ButtonAction(f.app.id,{...f.scope,recordId:newId('row')})).toMatchObject({ok:false})
    const current=await input(f);await data.db.update(data.apps).set({draft:{...f.app,name:'Обновлено'}}).where(eq(data.apps.id,f.app.id))
    expect(await actions.submitBuilderV2ButtonAction(f.app.id,current)).toMatchObject({ok:false,stale:true});expect(await logs(f.app.id)).toHaveLength(0)
  })
  it('supports pure messages without inventing a table or row, and replays the receipt',async()=>{
    const f=await fixture(false),request=await input(f),first=await actions.submitBuilderV2ButtonAction(f.app.id,request),second=await actions.submitBuilderV2ButtonAction(f.app.id,request)
    expect(first).toMatchObject({ok:true,repeated:false,effects:[{type:'notify',message:'Готово'}]});expect(second).toMatchObject({ok:true,repeated:true})
    expect(first).not.toHaveProperty('rowId');expect(await receipts(f.app.id)).toMatchObject([{tableId:null,rowId:null}]);expect(await logs(f.app.id)).toHaveLength(1)
    expect(await actions.inspectBuilderV2ButtonAction(f.app.id,{...f.scope,recordId:newId('row')})).toMatchObject({ok:false})
  })
  it('creates from a normal screen and passes the result to a record screen',async()=>{
    const f=await fixture(false,(_steps,detailId)=>[{id:'create',type:'create_row',tableId,values:{[title]:{kind:'literal',value:'Новая заявка'},[done]:{kind:'literal',value:false}}},{id:'open',type:'open_screen',screenId:detailId,record:{kind:'result',stepId:'create'}}])
    const result=await actions.submitBuilderV2ButtonAction(f.app.id,await input(f));if(!result.ok||!result.rowId)throw new Error(JSON.stringify(result))
    expect((await row(result.rowId)).data).toMatchObject({[title]:'Новая заявка',[done]:false});expect(result.effects).toEqual([{type:'open_screen',screenId:f.detailId,recordId:result.rowId}])
  })
  it('refuses unsupported branches, wrong roles, forged inputs, restricted workspace users and rollout-off execution',async()=>{
    const f=await fixture(),request=await input(f)
    for(const extra of [{actor:{roleIds:['owner']}},{values:{[done]:true}},{workflow:f.app.workflows[0]}])expect(await actions.submitBuilderV2ButtonAction(f.app.id,{...request,...extra})).toMatchObject({ok:false})
    for(const value of [{...member,userId:other,email:`${other}@example.invalid`},{...member,role:'viewer' as const},{...member,workspaceId:foreignWorkspace},{...member,role:'editor' as const,tableAccess:{[tableId]:'edit' as const}}]){identity.member=value;expect(await actions.submitBuilderV2ButtonAction(f.app.id,request)).toMatchObject({ok:false})}
    identity.member=member;vi.stubEnv('NODE_ENV','production');vi.stubEnv('TABLEAPP_BUILDER_V2','0');expect(await actions.submitBuilderV2ButtonAction(f.app.id,request)).toMatchObject({ok:false});vi.unstubAllEnvs()
    const app=structuredClone(f.app),flow=app.workflows.find(flow=>flow.id===(app.nodes.find(node=>node.id===f.nodeId) as Extract<AppV2['nodes'][number],{type:'button'}>).events.press)!
    flow.steps.push({id:'unsupported',type:'branch',condition:{op:'eq',left:{kind:'literal',value:1},right:{kind:'literal',value:1}},then:[],else:[{id:'delete',type:'delete_row',tableId,target:{kind:'current'},confirm:false}]})
    await data.db.update(data.apps).set({draft:app}).where(eq(data.apps.id,app.id));expect(await actions.inspectBuilderV2ButtonAction(app.id,f.scope)).toMatchObject({ok:false});expect((await row(f.rowId)).data).toMatchObject({[done]:false});expect(await logs(app.id)).toHaveLength(0)
  })
})
