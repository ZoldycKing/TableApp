import {existsSync} from 'node:fs'
import {resolve} from 'node:path'
import {afterAll,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest'
import {and,eq,inArray,notInArray} from 'drizzle-orm'
import {newId} from '@tableapp/schema'
import {appV2Schema,type AppV2,type AppV2Node,type AppV2Step} from '@tableapp/schema/app-v2'
import {builderV2Revision} from './builder-v2-revision'
import {syncBuilderV2CardAccess} from './builder-v2-read-access'
const identity=vi.hoisted(()=>({email:null as string|null,member:null as import('./session').Member|null}))
vi.mock('@/lib/session',async original=>({...await original<typeof import('./session')>(),currentAccount:async()=>null,currentMember:async()=>identity.member}))
vi.mock('@/lib/app-session',async original=>({...await original<typeof import('./app-session')>(),currentStaffEmail:async()=>identity.email}))
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}))
vi.mock('@/lib/live',()=>({publishTable:vi.fn()}))
const env=resolve(import.meta.dirname,'../../../../.env');if(!process.env.DATABASE_URL&&existsSync(env))process.loadEnvFile(env)
describe.skipIf(!process.env.DATABASE_URL)('published v2 snapshots, two app-only identities, read scopes and atomic writes',()=>{
  let data:typeof import('@tableapp/db'),api:typeof import('@/app/builder-v2-published-actions'),publish:typeof import('@/app/builder-v2-publish-actions'),builder:typeof import('./builder-v2'),model:typeof import('@/components/builder/v2/model'),starter:typeof import('./builder-v2-starter'),forms:typeof import('./builder-v2-form-action'),buttons:typeof import('./builder-v2-button-action'),pages:typeof import('./builder-v2-published-page')
  const userId=newId('user'),workspaceId=newId('workspace'),projects=newId('table'),tasks=newId('table'),audits=newId('table'),title=newId('field'),owner=newId('field'),amount=newId('field'),done=newId('field'),secret=newId('field'),double=newId('field'),leak=newId('field'),links=newId('field'),count=newId('field'),lookup=newId('field'),taskTitle=newId('field'),taskOwner=newId('field'),taskSecret=newId('field'),taskParent=newId('field'),note=newId('field'),auditOwner=newId('field'),auditParent=newId('field'),a=newId('row'),b=newId('row'),ta=newId('row'),tb=newId('row')
  const emailA=`a_${userId}@example.invalid`,emailB=`b_${userId}@example.invalid`,member={userId,workspaceId,email:`${userId}@example.invalid`,name:'Автор публикации',workspaceName:'V13 published check',role:'owner' as const},baseIds=[a,b,ta,tb]
  const projectData=(who:'a'|'b')=>({[title]:who==='a'?'Проект Альфа':'Проект Бета',[owner]:who==='a'?emailA:emailB,[amount]:who==='a'?10:20,[done]:false,[secret]:who==='a'?900:800,[links]:who==='a'?[ta,tb]:[tb]})
  beforeAll(async()=>{
    data=await import('@tableapp/db');api=await import('@/app/builder-v2-published-actions');publish=await import('@/app/builder-v2-publish-actions');builder=await import('./builder-v2');model=await import('@/components/builder/v2/model');starter=await import('./builder-v2-starter');forms=await import('./builder-v2-form-action');buttons=await import('./builder-v2-button-action');pages=await import('./builder-v2-published-page')
    await data.db.insert(data.users).values({id:userId,email:member.email});await data.db.insert(data.workspaces).values({id:workspaceId,ownerId:userId,name:member.workspaceName,slug:workspaceId,plan:'business'});await data.db.insert(data.workspaceMembers).values({workspaceId,userId,role:'owner'})
    await data.db.insert(data.tables).values([{id:projects,workspaceId,name:'Проекты',position:'a0'},{id:tasks,workspaceId,name:'Задачи',position:'a1'},{id:audits,workspaceId,name:'Внутренний журнал',position:'a2'}])
    await data.db.insert(data.fields).values([{id:title,tableId:projects,name:'Название',type:'text',position:'a0'},{id:owner,tableId:projects,name:'Владелец',type:'email',position:'a1'},{id:amount,tableId:projects,name:'Сумма',type:'number',position:'a2'},{id:done,tableId:projects,name:'Готово',type:'checkbox',position:'a3'},{id:secret,tableId:projects,name:'Секрет',type:'number',position:'a4'},{id:double,tableId:projects,name:'Удвоенная сумма',type:'formula',options:{expression:'{Сумма} * 2'},position:'a5'},{id:leak,tableId:projects,name:'Закрытый расчёт',type:'formula',options:{expression:'{Секрет} * 2'},position:'a6'},{id:links,tableId:projects,name:'Задачи',type:'relation',options:{tableId:tasks,allowMultiple:true},position:'a7'},{id:count,tableId:projects,name:'Число задач',type:'count',options:{relationFieldId:links},position:'a8'},{id:lookup,tableId:projects,name:'Закрытая связь',type:'lookup',options:{relationFieldId:links,targetFieldId:taskSecret},position:'a9'},
      {id:taskTitle,tableId:tasks,name:'Название',type:'text',position:'a0'},{id:taskOwner,tableId:tasks,name:'Владелец',type:'email',position:'a1'},{id:taskSecret,tableId:tasks,name:'Секрет задачи',type:'number',position:'a2'},{id:taskParent,tableId:tasks,name:'Проект',type:'relation',options:{tableId:projects},position:'a3'},
      {id:note,tableId:audits,name:'Событие',type:'text',position:'a0'},{id:auditOwner,tableId:audits,name:'Владелец',type:'email',position:'a1'},{id:auditParent,tableId:audits,name:'Проект',type:'relation',options:{tableId:projects},position:'a2'}])
    for(const [id,primaryFieldId]of[[projects,title],[tasks,taskTitle],[audits,note]])await data.db.update(data.tables).set({primaryFieldId}).where(eq(data.tables.id,id!))
    await data.db.insert(data.rows).values([{id:a,tableId:projects,position:'a0',data:projectData('a')},{id:b,tableId:projects,position:'a1',data:projectData('b')},{id:ta,tableId:tasks,position:'a0',data:{[taskTitle]:'Задача Альфа',[taskOwner]:emailA,[taskSecret]:111,[taskParent]:[a]}},{id:tb,tableId:tasks,position:'a1',data:{[taskTitle]:'Задача Бета',[taskOwner]:emailB,[taskSecret]:222,[taskParent]:[b]}}])
  })
  beforeEach(async()=>{identity.email=emailA;identity.member=member;vi.unstubAllEnvs();await data.db.delete(data.apps).where(eq(data.apps.workspaceId,workspaceId));await data.db.delete(data.rows).where(and(inArray(data.rows.tableId,[projects,tasks,audits]),notInArray(data.rows.id,baseIds)));for(const [id,values]of[[a,projectData('a')],[b,projectData('b')]] as const)await data.db.update(data.rows).set({data:values,version:0,deletedAt:null}).where(eq(data.rows.id,id));await data.db.update(data.rows).set({data:{[taskTitle]:'Задача Альфа',[taskOwner]:emailA,[taskSecret]:111,[taskParent]:[a]},version:0,deletedAt:null}).where(eq(data.rows.id,ta));vi.clearAllMocks()})
  afterAll(async()=>{vi.unstubAllEnvs();if(!data)return;await data.db.delete(data.workspaces).where(eq(data.workspaces.id,workspaceId));await data.db.delete(data.users).where(eq(data.users.id,userId));await data.sql.end()})
  async function fixture(options:{publish?:boolean;flow?:(steps:AppV2Step[])=>AppV2Step[]}={}){
    const tables=(await builder.loadBuilderV2Catalog(workspaceId)).tables;let app=starter.buildBuilderV2Starter(builder.newBuilderV2App({id:newId('app'),workspaceId,name:'Личные проекты',slug:newId('app').replace('_','-'),email:member.email}),tables,projects)
    app.roles.push({id:'worker',name:'Участник'});app.authentication.members.push({email:emailA,roleIds:['worker'],company:''},{email:emailB,roleIds:['worker'],company:''});app.screens=app.screens.map(screen=>({...screen,audience:{kind:'roles',roleIds:['owner','worker']}}))
    const owned=(fieldId:string)=>({kind:'owned' as const,fieldId,property:'email' as const}),audience={kind:'roles' as const,roleIds:['worker']}
    app.policy.tables=tables.map(table=>({tableId:table.id,grants:[{audience:{kind:'roles' as const,roleIds:['owner']},read:{fieldIds:table.fields.map(field=>field.id),rows:{kind:'all' as const}}},...(table.id===projects?[{audience,read:{fieldIds:[title,amount,done,double,leak,links,count,lookup],rows:owned(owner)},create:{fieldIds:[title,amount,done],owner:{fieldId:owner,property:'email' as const}},update:{fieldIds:[title,amount,done],rows:owned(owner)}}]:table.id===tasks?[{audience,read:{fieldIds:[taskTitle,taskParent],rows:owned(taskOwner)},create:{fieldIds:[taskTitle,taskParent],owner:{fieldId:taskOwner,property:'email' as const}}}]:[{audience,read:{fieldIds:[note,auditParent],rows:owned(auditOwner)},create:{fieldIds:[note,auditParent],owner:{fieldId:auditOwner,property:'email' as const}}}])]}))
    app.policy.workflows=app.policy.workflows.map(grant=>({...grant,audience:{kind:'roles',roleIds:['owner','worker']}}))
    const home=app.homeScreenId!,detail=app.screens.find(screen=>screen.contextTableId===projects)!.id,collection=app.nodes.find(node=>node.type==='collection'&&app.sources.find(source=>source.id===node.sourceId)?.tableId===projects)!.id
    const button=model.addNode(app,detail,'button',tables,null,'');app=buttons.configureBuilderV2Button(button.app,button.id,['owner','worker']);const flow=buttons.builderV2ButtonAction(app,app.nodes.find(node=>node.id===button.id)!)!.flow
    const steps:AppV2Step[]=[{id:'complete',type:'update_row',tableId:projects,target:{kind:'current'},values:{[done]:{kind:'literal',value:true}}},{id:'audit',type:'create_row',tableId:audits,values:{[note]:{kind:'result',stepId:'complete',fieldId:title},[auditParent]:{kind:'record_ids',tableId:projects,record:{kind:'row'}}}},{id:'notice',type:'notify',message:{kind:'literal',value:'Готово'}},{id:'open',type:'open_screen',screenId:detail,record:{kind:'current'}}]
    app=buttons.configureBuilderV2ButtonWorkflow(app,button.id,{...flow,name:'Завершить проект',steps:options.flow?options.flow(steps):steps})
    const metric=model.addNode(app,home,'metric',tables,null,projects);app=metric.app
    const addForm=(screenId:string,tableId:string,keep:string[],mode:'create'|'edit')=>{const added=model.addNode(app,screenId,'form',tables,null,tableId);app=added.app;for(const node of [...app.nodes])if(node.type==='input'&&(app.nodes.find(item=>item.id===added.id) as Extract<AppV2Node,{type:'form'}>).childIds.includes(node.id)&&!keep.includes(node.fieldId))app=model.removeNode(app,node.id);for(const fieldId of keep)if(!app.nodes.some(node=>node.type==='input'&&node.fieldId===fieldId&&(app.nodes.find(item=>item.id===added.id) as Extract<AppV2Node,{type:'form'}>).childIds.includes(node.id)))app=model.addNode(app,screenId,'input',tables,added.id,'',fieldId).app;const form=app.nodes.find(node=>node.id===added.id)!;if(form.type!=='form')throw new Error('Missing form');app=model.replaceNode(app,{...form,mode});app=forms.configureBuilderV2FormSave(app,form.id,['owner','worker']);return form.id}
    app=model.newScreen(app,'Новый проект');const createScreen=app.screens.at(-1)!.id;app.screens.at(-1)!.audience={kind:'roles',roleIds:['owner','worker']};const createForm=addForm(createScreen,projects,[title,amount,done],'create'),editForm=addForm(detail,projects,[title,amount,done],'edit'),childForm=addForm(detail,tasks,[taskTitle,taskParent],'create')
    const parsed=appV2Schema.safeParse(app);if(!parsed.success)throw new Error(JSON.stringify(parsed.error.issues.slice(0,4)))
    await data.db.insert(data.apps).values({id:app.id,workspaceId,name:app.name,slug:app.slug,draft:app,theme:app.theme})
    if(options.publish!==false){const published=await publish.publishBuilderV2Action(app.id,builderV2Revision(app));if(!published.ok)throw new Error(published.error)}
    return {app,revision:builderV2Revision(app),home,detail,collection,metricId:metric.id,buttonId:button.id,createForm,createScreen,editForm,childForm}
  }
  const read=(f:Awaited<ReturnType<typeof fixture>>,more:Record<string,unknown>={})=>api.readPublishedV2DataAction(f.app.slug,{revision:f.revision,screenId:f.home,nodeId:f.collection,...more})
  const record=(f:Awaited<ReturnType<typeof fixture>>,id:string=a)=>api.readPublishedV2RecordAction(f.app.slug,{revision:f.revision,screenId:f.detail,recordId:id})
  it('counts only accessible line items and omits a total from fields the role cannot read', async () => {
    const f = await fixture({ publish: false })
    const collection = f.app.nodes.find(node => node.id === f.collection)
    if (collection?.type !== 'collection') throw new Error('Missing fixture list')
    const app = model.replaceNode(f.app, { ...collection, recordGroup: { fieldId: title, amountFieldId: secret } })
    const revision = builderV2Revision(app)
    await data.db.update(data.rows).set({ data: { ...projectData('b'), [title]: 'Проект Альфа' } }).where(eq(data.rows.id, b))
    await data.db.insert(data.rows).values({ id: newId('row'), tableId: projects, position: 'a2', data: { ...projectData('a'), [secret]: 7 } })
    await data.db.update(data.apps).set({ draft: app }).where(eq(data.apps.id, app.id))
    expect(await publish.publishBuilderV2Action(app.id, revision)).toMatchObject({ ok: true })

    const worker = await read({ ...f, app, revision }, { search: 'Альфа' })
    expect(worker).toMatchObject({ ok: true, page: { total: 1, rows: [{ id: a, summary: { count: 2, amount: null } }] } })
    if (worker.ok) expect(worker.page.rows[0]?.values).not.toHaveProperty(secret)
    identity.email = member.email
    expect(await read({ ...f, app, revision })).toMatchObject({ ok: true, page: { total: 1, rows: [{ id: a, summary: { count: 3, amount: 1707 } }] } })
  })
  it('projects only a permitted workbench queue when opening a record directly', async () => {
    const f = await fixture({ publish: false })
    const collection = f.app.nodes.find(node => node.id === f.collection)
    if (collection?.type !== 'collection') throw new Error('Missing fixture list')
    const app = syncBuilderV2CardAccess(model.replaceNode(f.app, { ...collection, recordGroup: { fieldId: title, amountFieldId: amount } }))
    await data.db.update(data.apps).set({ draft: app }).where(eq(data.apps.id, app.id))
    expect(await publish.publishBuilderV2Action(app.id, builderV2Revision(app))).toMatchObject({ ok: true })
    const opened = await pages.loadPublishedV2Page(app.slug, { screen: f.detail, row: a })
    if (opened.login) throw new Error('Unexpected login')
    expect(opened.sectionId).toBe(f.home)
    expect(opened.app.screens.find(screen => screen.id === f.home)?.rootIds).toEqual([collection.id])
    expect(opened.app.nodes.some(node => node.id === f.metricId)).toBe(false)
    expect(await read({ ...f, revision: opened.revision })).toMatchObject({ ok: true, page: { total: 1, rows: [{ id: a }] } })

    const hidden: AppV2 = { ...app, nodes: app.nodes.map(node => node.id === collection.id ? { ...node, visibleTo: { kind: 'roles', roleIds: ['owner'] } } : node) }
    await data.db.update(data.apps).set({ published: hidden }).where(eq(data.apps.id, app.id))
    const restricted = await pages.loadPublishedV2Page(app.slug, { screen: f.detail, row: a })
    if (restricted.login) throw new Error('Unexpected login')
    expect(restricted.sectionId).toBeUndefined()
    expect(restricted.app.nodes.some(node => node.id === collection.id)).toBe(false)
    expect(await read({ ...f, revision: restricted.revision })).toMatchObject({ ok: false })
  })
  it('totals all accessible order lines even when the first page has one row', async () => {
    await data.db.update(data.fields).set({ name: 'Сумма позиции, ₽' }).where(eq(data.fields.id, amount))
    try {
      const f = await fixture({ publish: false })
      const tables = (await builder.loadBuilderV2Catalog(workspaceId)).tables
      const added = model.addNode(f.app, f.detail, 'collection', tables, null, projects)
      const list = added.app.nodes.find(node => node.id === added.id)
      if (list?.type !== 'collection') throw new Error('Missing fixture list')
      const app = model.updateNodeSource(model.replaceNode(added.app, { ...list, subtitleFieldId: amount }), list.id, {
        screenTableId: projects, pageSize: 1, searchFieldIds: [], filter: { op: 'eq', left: { kind: 'row', fieldId: title }, right: { kind: 'screen_row', fieldId: title } },
      })
      await data.db.update(data.rows).set({ data: { ...projectData('b'), [title]: 'Проект Альфа' } }).where(eq(data.rows.id, b))
      await data.db.insert(data.rows).values({ id: newId('row'), tableId: projects, position: 'a2', data: { ...projectData('a'), [amount]: 7 } })
      const revision = builderV2Revision(app)
      await data.db.update(data.apps).set({ draft: app }).where(eq(data.apps.id, app.id))
      expect(await publish.publishBuilderV2Action(app.id, revision)).toMatchObject({ ok: true })
      const response = await api.readPublishedV2DataAction(app.slug, { revision, screenId: f.detail, nodeId: list.id, recordId: a })
      expect(response).toMatchObject({ ok: true, page: { total: 2, orderSummary: { amount: 17, scoped: true } } })
      if (response.ok) expect(response.page.rows).toHaveLength(1)
    } finally {
      await data.db.update(data.fields).set({ name: 'Сумма' }).where(eq(data.fields.id, amount))
    }
  })
  const token=(kind:'button'|'submit')=>`${kind}_${crypto.randomUUID().replaceAll('-','')}`
  async function buttonInput(f:Awaited<ReturnType<typeof fixture>>,id:string=a){const scope={revision:f.revision,screenId:f.detail,nodeId:f.buttonId,recordId:id},state=await api.inspectPublishedV2ButtonAction(f.app.slug,scope);if(!state.ok)throw new Error(state.error);return {...scope,requestId:token('button'),fingerprint:state.state.fingerprint}}
  async function formInput(f:Awaited<ReturnType<typeof fixture>>,kind:'create'|'edit'|'child'='create'){const scope={revision:f.revision,screenId:kind==='create'?f.createScreen:f.detail,formId:kind==='create'?f.createForm:kind==='edit'?f.editForm:f.childForm,...(kind!=='create'?{recordId:a}:{})},initial=await api.inspectPublishedV2FormAction(f.app.slug,{...scope,mode:'initial'});if(!initial.ok||!('state'in initial))throw new Error(JSON.stringify(initial));return {...scope,requestId:token('submit'),fingerprint:initial.state.fingerprint,values:kind==='child'?{[taskTitle]:'Новая задача'}:{[title]:'Новый проект',[amount]:0,[done]:false}}}
  async function listFixture(related=false){
    const f=await fixture({publish:false}),tables=(await builder.loadBuilderV2Catalog(workspaceId)).tables;let app=f.app,screenId=f.home,collectionId=f.collection
    if(related){screenId=f.detail;const list=model.addNode(app,screenId,'collection',tables,null,tasks);app=list.app;collectionId=list.id;app=model.updateNodeSource(app,collectionId,{screenTableId:projects,filter:{op:'includes',left:{kind:'row',fieldId:taskParent},right:{kind:'screen_row_id'}}})}
    else app=model.updateNodeSource(app,collectionId,{filter:{op:'eq',left:{kind:'row',fieldId:done},right:{kind:'literal',value:false}}})
    const added=model.addNode(app,screenId,'button',tables,collectionId,'');app=buttons.configureBuilderV2Button(added.app,added.id,['owner','worker']);const flow=buttons.builderV2ButtonAction(app,app.nodes.find(node=>node.id===added.id)!)!.flow
    const steps:AppV2Step[]=related?[{id:'rename-task',type:'update_row',tableId:tasks,target:{kind:'current'},values:{[taskTitle]:{kind:'literal',value:'Задача завершена'}}},{id:'parent-audit',type:'create_row',tableId:audits,values:{[note]:{kind:'screen_row',fieldId:title},[auditParent]:{kind:'record_ids',tableId:projects,record:{kind:'screen'}}}}]:[{id:'finish-item',type:'update_row',tableId:projects,target:{kind:'current'},values:{[done]:{kind:'literal',value:true}}}]
    app=buttons.configureBuilderV2ButtonWorkflow(app,added.id,{...flow,name:'Завершить строку',steps:[...steps,{id:'item-notice',type:'notify',message:{kind:'literal',value:'Готово'}}]})
    const node=app.nodes.find(node=>node.id===added.id)!;app=model.replaceNode(app,{...node,visibleWhen:{op:'eq',left:{kind:'row',fieldId:related?taskTitle:done},right:{kind:'literal',value:related?'Задача Альфа':false}}})
    await data.db.update(data.apps).set({draft:app}).where(eq(data.apps.id,app.id));const published=await publish.publishBuilderV2Action(app.id,builderV2Revision(app));if(!published.ok)throw new Error(published.error)
    return {...f,app,revision:builderV2Revision(app),screenId,collectionId,itemButton:added.id}
  }
  async function itemInput(f:Awaited<ReturnType<typeof listFixture>>,itemId:string,recordId?:string){
    const scope={revision:f.revision,screenId:f.screenId,nodeId:f.itemButton,itemId,...(recordId?{recordId}:{})},checked=await api.inspectPublishedV2ButtonAction(f.app.slug,scope)
    if(!checked.ok)throw new Error(checked.error);return {...scope,fingerprint:checked.state.fingerprint,requestId:token('button')}
  }
  it('executes one list row, deduplicates after the row leaves its filter, and keeps conditional definitions server-side',async()=>{
    const f=await listFixture(),page=await pages.loadPublishedV2Page(f.app.slug,{screen:f.home});if(page.login)throw new Error('Unexpected login')
    expect(page.buttons[f.itemButton]).toBeUndefined();expect(page.app.nodes.find(node=>node.id===f.itemButton)?.visibleWhen).toBeNull()
    const read=await api.readPublishedV2DataAction(f.app.slug,{revision:f.revision,screenId:f.home,nodeId:f.collectionId});expect(read).toMatchObject({ok:true,page:{rows:[expect.objectContaining({id:a,visibleNodeIds:expect.arrayContaining([f.itemButton])})]}})
    const request=await itemInput(f,a),first=await api.submitPublishedV2ButtonAction(f.app.slug,request);expect(first).toMatchObject({ok:true,rowId:a})
    expect(await api.submitPublishedV2ButtonAction(f.app.slug,request)).toMatchObject({...first,repeated:true})
    const {requestId:_,fingerprint:__,...scope}=request;expect(await api.inspectPublishedV2ButtonAction(f.app.slug,scope)).toMatchObject({ok:false})
    expect(await api.readPublishedV2DataAction(f.app.slug,{revision:f.revision,screenId:f.home,nodeId:f.collectionId})).toMatchObject({ok:true,page:{total:0}})
    expect((await data.db.select().from(data.rows).where(eq(data.rows.id,b)))[0]!.data).toMatchObject({[done]:false});expect(await data.db.select().from(data.appActionRuns).where(eq(data.appActionRuns.appId,f.app.id))).toHaveLength(1)
    identity.email=emailB;expect(await api.submitPublishedV2ButtonAction(f.app.slug,request)).toMatchObject({ok:false})
  })
  it('keeps a related list item separate from the screen record and rejects a row outside that parent',async()=>{
    const f=await listFixture(true),created=await api.submitPublishedV2FormAction(f.app.slug,await formInput(f));if(!created.ok||!created.rowId)throw new Error('Missing own second parent')
    expect(await api.inspectPublishedV2ButtonAction(f.app.slug,{revision:f.revision,screenId:f.detail,nodeId:f.itemButton,itemId:ta,recordId:created.rowId})).toMatchObject({ok:false})
    expect(await api.inspectPublishedV2ButtonAction(f.app.slug,{revision:f.revision,screenId:f.detail,nodeId:f.itemButton,itemId:tb,recordId:a})).toMatchObject({ok:false})
    const request=await itemInput(f,ta,a);expect(await api.submitPublishedV2ButtonAction(f.app.slug,request)).toMatchObject({ok:true,rowId:ta,tableId:tasks})
    const audit=await data.db.select().from(data.rows).where(eq(data.rows.tableId,audits));expect(audit).toMatchObject([{data:{[note]:'Проект Альфа',[auditParent]:[a]}}]);expect(await record(f)).toMatchObject({ok:true,record:{values:{[title]:'Проект Альфа',[done]:false}}})
  })
  it('rechecks list filters, row versions and strict scope inputs before mutation',async()=>{
    const f=await listFixture(),request=await itemInput(f,a)
    expect(await api.submitPublishedV2ButtonAction(f.app.slug,{...request,itemId:b})).toMatchObject({ok:false})
    expect(await api.submitPublishedV2ButtonAction(f.app.slug,{...request,tableId:projects})).toMatchObject({ok:false})
    expect(await api.inspectPublishedV2ButtonAction(f.app.slug,{revision:f.revision,screenId:f.home,nodeId:f.itemButton})).toMatchObject({ok:false})
    await data.db.update(data.rows).set({version:1}).where(eq(data.rows.id,a));expect(await api.submitPublishedV2ButtonAction(f.app.slug,request)).toMatchObject({ok:false,stale:true})
    expect((await data.db.select().from(data.rows).where(eq(data.rows.id,a)))[0]!.data).toMatchObject({[done]:false})
  })
  it('rechecks a changed saved view and hides conditional controls without returning their conditions',async()=>{
    const f=await listFixture(),viewId=newId('view');await data.db.insert(data.views).values({id:viewId,tableId:projects,name:'Отбор',type:'grid',position:'a0',config:{filter:{id:'view-filter',conjunction:'and',conditions:[{id:'only-positive',fieldId:amount,op:'gt',value:0}]}}})
    f.app=model.updateNodeSource(f.app,f.collectionId,{viewId});f.revision=builderV2Revision(f.app);await data.db.update(data.apps).set({draft:f.app}).where(eq(data.apps.id,f.app.id));expect(await publish.publishBuilderV2Action(f.app.id,f.revision)).toMatchObject({ok:true})
    const request=await itemInput(f,a)
    await data.db.update(data.views).set({config:{filter:{id:'view-filter',conjunction:'and',conditions:[{id:'larger',fieldId:amount,op:'gt',value:100}]}}}).where(eq(data.views.id,viewId))
    expect(await api.submitPublishedV2ButtonAction(f.app.slug,request)).toMatchObject({ok:false});expect((await data.db.select().from(data.rows).where(eq(data.rows.id,a)))[0]!.data).toMatchObject({[done]:false})
    await data.db.update(data.views).set({config:{}}).where(eq(data.views.id,viewId))
    const node=f.app.nodes.find(node=>node.id===f.itemButton)!;f.app=model.replaceNode(f.app,{...node,visibleWhen:{op:'eq',left:{kind:'row',fieldId:secret},right:{kind:'literal',value:900}}});f.revision=builderV2Revision(f.app)
    await data.db.update(data.apps).set({draft:f.app}).where(eq(data.apps.id,f.app.id));expect(await publish.publishBuilderV2Action(f.app.id,f.revision)).toMatchObject({ok:true})
    const result=await api.readPublishedV2DataAction(f.app.slug,{revision:f.revision,screenId:f.home,nodeId:f.collectionId});expect(result).toMatchObject({ok:true,page:{rows:[expect.objectContaining({id:a,visibleNodeIds:[]})]}});expect(JSON.stringify(result)).not.toContain('900')
    expect(await api.inspectPublishedV2ButtonAction(f.app.slug,{revision:f.revision,screenId:f.home,nodeId:f.itemButton,itemId:a})).toMatchObject({ok:false})
  })
  it('does not reject a current list row just because an unrelated NOW formula was recalculated',async()=>{
    const f=await listFixture();await data.db.update(data.fields).set({options:{expression:'NOW()'}}).where(eq(data.fields.id,double))
    const clock=vi.spyOn(Date,'now'),asOf=new Date('2026-11-04T12:00:00Z').getTime()
    try{clock.mockReturnValue(asOf);const request=await itemInput(f,a);clock.mockReturnValue(asOf+5000);expect(await api.submitPublishedV2ButtonAction(f.app.slug,request)).toMatchObject({ok:true,rowId:a})}
    finally{clock.mockRestore();await data.db.update(data.fields).set({options:{expression:'{Сумма} * 2'}}).where(eq(data.fields.id,double))}
  })

  async function rowChainFixture(related=false,lateFailure=false){
    const f=await listFixture(related),item=await import('./builder-v2-item-action');let app=item.configureBuilderV2ItemAction(f.app,f.collectionId,['owner','worker'])
    const original=buttons.builderV2ButtonAction(app,app.nodes.find(node=>node.id===f.itemButton)!)!.flow,flow=buttons.builderV2NodeAction(app,app.nodes.find(node=>node.id===f.collectionId)!)!.flow
    app=item.configureBuilderV2ItemWorkflow(app,f.collectionId,{...flow,name:'Обработать строку',steps:[...original.steps,...(lateFailure?[{id:'fail-row',type:'require' as const,condition:{op:'eq' as const,left:{kind:'literal' as const,value:1},right:{kind:'literal' as const,value:2}},message:'Отмена всей цепочки'}]:related?[{id:'row-back',type:'go_back' as const}]:[{id:'row-open',type:'open_screen' as const,screenId:f.detail,record:{kind:'current' as const}}])]})
    await data.db.update(data.apps).set({draft:app}).where(eq(data.apps.id,app.id));expect(await publish.publishBuilderV2Action(app.id,builderV2Revision(app))).toMatchObject({ok:true})
    return {...f,app,revision:builderV2Revision(app),itemButton:f.collectionId}
  }
  it('executes itemPress as one server chain, never ships a navigation fragment, and deduplicates after filter exit',async()=>{
    const f=await rowChainFixture(),page=await pages.loadPublishedV2Page(f.app.slug,{screen:f.home});if(page.login)throw new Error('No page')
    expect(page.rowActions[f.collectionId]).toEqual({name:'Обработать строку'});expect(page.app.workflows.some(flow=>flow.id===(f.app.nodes.find(node=>node.id===f.collectionId) as Extract<AppV2Node,{type:'collection'}>).events.itemPress)).toBe(false)
    expect(JSON.stringify(page)).not.toContain('update_row');expect(page.buttons[f.collectionId]).toBeUndefined()
    const request=await itemInput(f,a),results=await Promise.all([api.submitPublishedV2ButtonAction(f.app.slug,request),api.submitPublishedV2ButtonAction(f.app.slug,request)])
    expect(results.every(result=>result.ok)).toBe(true);expect(results.map(result=>result.ok&&result.repeated).sort()).toEqual([false,true]);expect(results[0]).toMatchObject({effects:expect.arrayContaining([{type:'open_screen',screenId:f.detail,recordId:a}])})
    expect(await data.db.select().from(data.appActionRuns).where(eq(data.appActionRuns.appId,f.app.id))).toHaveLength(1);expect(await record(f)).toMatchObject({ok:true,record:{values:{[done]:true}}})
    identity.email=emailB;expect(await api.submitPublishedV2ButtonAction(f.app.slug,request)).toMatchObject({ok:false})
  })
  it('binds itemPress to the related row and its parent and rejects forged scope, ownership and stale versions',async()=>{
    const f=await rowChainFixture(true),scope={revision:f.revision,screenId:f.detail,nodeId:f.collectionId,itemId:ta,recordId:a}
    for(const extra of[{itemId:tb},{recordId:b},{event:'press'},{itemId:undefined},{recordId:undefined}])expect(await api.inspectPublishedV2ButtonAction(f.app.slug,{...scope,...extra})).toMatchObject({ok:false})
    const request=await itemInput(f,ta,a);await data.db.update(data.rows).set({version:1}).where(eq(data.rows.id,ta));expect(await api.submitPublishedV2ButtonAction(f.app.slug,request)).toMatchObject({ok:false,stale:true})
    expect(await api.submitPublishedV2ButtonAction(f.app.slug,await itemInput(f,ta,a))).toMatchObject({ok:true,rowId:ta,effects:expect.arrayContaining([{type:'go_back',screenId:f.home}])})
    expect(await data.db.select().from(data.rows).where(eq(data.rows.tableId,audits))).toMatchObject([{data:{[note]:'Проект Альфа',[auditParent]:[a]}}])
    expect(await record(f)).toMatchObject({ok:true,record:{values:{[title]:'Проект Альфа',[done]:false}}})
  })
  it('rolls a failed itemPress chain back without returning browser effects',async()=>{
    const f=await rowChainFixture(false,true),result=await api.submitPublishedV2ButtonAction(f.app.slug,await itemInput(f,a))
    expect(result).toMatchObject({ok:false,error:'Отмена всей цепочки'});expect(result).not.toHaveProperty('effects');expect(await record(f)).toMatchObject({ok:true,record:{values:{[done]:false}}})
    expect(await data.db.select().from(data.appActionRuns).where(eq(data.appActionRuns.appId,f.app.id))).toHaveLength(0);expect(await data.db.select().from(data.appWorkflowRuns).where(eq(data.appWorkflowRuns.appId,f.app.id))).toMatchObject([{status:'failed'}])
  })

  async function chainedDeletion(surface:'button'|'item'|'form'='button',multi=false,fail=false){
    const f=await fixture({publish:false}),items=await import('./builder-v2-item-action');let app=f.app
    const steps:AppV2Step[]=[{id:'before-delete',type:'update_row',tableId:projects,target:{kind:'current'},values:{[done]:{kind:'literal',value:true}}},...(multi?[{id:'temporary',type:'create_row' as const,tableId:audits,values:{[note]:{kind:'literal' as const,value:'Временное событие'}}},{id:'delete-temporary',type:'delete_row' as const,tableId:audits,target:{kind:'result' as const,stepId:'temporary'},confirm:true}]:[]),{id:'delete-project',type:'delete_row',tableId:projects,target:{kind:'current'},confirm:true},{id:'deleted-notice',type:'notify',message:{kind:'literal',value:'Проект удалён'}},...(fail?[{id:'late-failure',type:'require' as const,condition:{op:'eq' as const,left:{kind:'literal' as const,value:1},right:{kind:'literal' as const,value:2}},message:'Следующий шаг не выполнен'}]:[])]
    if(surface==='item'){
      app=items.configureBuilderV2ItemAction(app,f.collection,['owner','worker']);const flow=buttons.builderV2NodeAction(app,app.nodes.find(node=>node.id===f.collection)!)!.flow
      app=items.configureBuilderV2ItemWorkflow(app,f.collection,{...flow,steps});app=model.updateNodeSource(app,f.collection,{filter:{op:'eq',left:{kind:'row',fieldId:done},right:{kind:'literal',value:false}}})
    }else if(surface==='form'){
      const form=app.nodes.find(node=>node.id===f.editForm) as Extract<AppV2Node,{type:'form'}>,action=forms.builderV2SaveFormAction(app,form)!
      app=forms.configureBuilderV2FormWorkflow(app,form.id,{...action.flow,steps:[action.step,...steps.slice(1)]});const configured=app.nodes.find(node=>node.id===form.id)!;app=model.replaceNode(app,{...configured,visibleWhen:{op:'eq',left:{kind:'row',fieldId:done},right:{kind:'literal',value:false}}})
    }else{const flow=buttons.builderV2ButtonAction(app,app.nodes.find(node=>node.id===f.buttonId)!)!.flow;app=buttons.configureBuilderV2ButtonWorkflow(app,f.buttonId,{...flow,steps})}
    await data.db.update(data.apps).set({draft:app}).where(eq(data.apps.id,app.id));expect(await publish.publishBuilderV2Action(app.id,builderV2Revision(app))).toMatchObject({ok:true})
    const current={...f,app,revision:builderV2Revision(app)},created=await api.submitPublishedV2FormAction(app.slug,await formInput(current));if(!created.ok||!created.rowId)throw new Error(JSON.stringify(created))
    const rowId=created.rowId
    let request:Record<string,unknown>
    if(surface==='form'){
      const scope={revision:current.revision,screenId:f.detail,formId:f.editForm,recordId:rowId},state=await api.inspectPublishedV2FormAction(app.slug,{...scope,mode:'initial'});if(!state.ok||!('state'in state))throw new Error('No form')
      request={...scope,fingerprint:state.state.fingerprint,requestId:token('submit'),values:{[title]:'Новый проект',[amount]:0,[done]:true}}
    }else if(surface==='item'){
      const scope={revision:current.revision,screenId:f.home,nodeId:f.collection,itemId:rowId},state=await api.inspectPublishedV2ButtonAction(app.slug,scope);if(!state.ok)throw new Error(state.error)
      request={...scope,fingerprint:state.state.fingerprint,requestId:token('button')}
    }else request=await buttonInput(current,rowId)
    const submit=(value:Record<string,unknown>)=>surface==='form'?api.submitPublishedV2FormAction(app.slug,value):api.submitPublishedV2ButtonAction(app.slug,value)
    return {...current,rowId,request,submit}
  }
  for(const surface of ['button','item','form'] as const)it(`confirms the complete ${surface} chain without a committed prefix and replays once after deletion`,async()=>{
    const f=await chainedDeletion(surface),pending=await f.submit(f.request)
    expect(pending).toMatchObject({ok:false,confirmation:{records:[{recordLabel:'Новый проект',tableName:'Проекты'}]}});expect(pending).not.toHaveProperty('effects')
    expect(await record(f,f.rowId)).toMatchObject({ok:true,record:{values:{[done]:false}}});expect(await data.db.select().from(data.appWorkflowRuns).where(and(eq(data.appWorkflowRuns.appId,f.app.id),eq(data.appWorkflowRuns.requestId,String(f.request.requestId))))).toHaveLength(0)
    if(pending.ok||!pending.confirmation)throw new Error('Missing confirmation')
    expect(await f.submit({...f.request,confirmation:'a'.repeat(64)})).toMatchObject({ok:false,confirmation:pending.confirmation})
    const confirmed={...f.request,confirmation:pending.confirmation.fingerprint},results=await Promise.all([f.submit(confirmed),f.submit(confirmed)])
    expect(results.every(result=>result.ok)).toBe(true);expect(results.map(result=>result.ok&&result.repeated).sort()).toEqual([false,true]);expect(await record(f,f.rowId)).toMatchObject({ok:false})
    expect(await data.db.select().from(data.rowChanges).where(eq(data.rowChanges.rowId,f.rowId))).toHaveLength(3)
    identity.email=emailB;expect(await f.submit(confirmed)).toMatchObject({ok:false})
  })
  it('confirms all executed deletion targets including a result created by an earlier step',async()=>{
    const f=await chainedDeletion('item',true),pending=await f.submit(f.request);if(pending.ok||!pending.confirmation)throw new Error(JSON.stringify(pending))
    expect(pending.confirmation.records).toEqual([{recordLabel:'Новая запись из этого действия',tableName:'Внутренний журнал'},{recordLabel:'Новый проект',tableName:'Проекты'}])
    expect(await data.db.select().from(data.rows).where(eq(data.rows.tableId,audits))).toHaveLength(0)
    const result=await f.submit({...f.request,confirmation:pending.confirmation.fingerprint});expect(result).toMatchObject({ok:true})
    const audit=await data.db.select().from(data.rows).where(eq(data.rows.tableId,audits));expect(audit).toHaveLength(1);expect(audit[0]!.deletedAt).not.toBeNull()
  })
  it('rolls back a deletion and prior update on a later failure and refuses dependencies and revoked permission',async()=>{
    const failed=await chainedDeletion('button',false,true),result=await failed.submit(failed.request)
    expect(result).toMatchObject({ok:false,error:'Следующий шаг не выполнен'});expect(result).not.toHaveProperty('confirmation');expect(await record(failed,failed.rowId)).toMatchObject({ok:true,record:{values:{[done]:false}}})
    const f=await chainedDeletion(),dependent=await f.submit(await buttonInput(f,a));expect(dependent).toMatchObject({ok:false});expect(await record(f,a)).toMatchObject({ok:true,record:{values:{[done]:false}}})
    const pending=await f.submit(f.request);if(pending.ok||!pending.confirmation)throw new Error('No confirmation')
    const app=structuredClone(f.app);app.policy.tables=app.policy.tables.map(rule=>({...rule,grants:rule.grants.map(({delete:_,...grant})=>grant)}));await data.db.update(data.apps).set({published:app}).where(eq(data.apps.id,app.id))
    expect(await f.submit({...f.request,confirmation:pending.confirmation.fingerprint})).toMatchObject({ok:false});expect((await data.db.select().from(data.rows).where(eq(data.rows.id,f.rowId)))[0]!.deletedAt).toBeNull()
  })
  async function deletionFixture(){
    const f=await fixture({publish:false}),tables=(await builder.loadBuilderV2Catalog(workspaceId)).tables,added=model.addNode(f.app,f.detail,'button',tables,null,'')
    const {configureBuilderV2Delete}=await import('./builder-v2-delete-action'),app=configureBuilderV2Delete(added.app,added.id,['owner','worker'])
    await data.db.update(data.apps).set({draft:app}).where(eq(data.apps.id,app.id));expect(await publish.publishBuilderV2Action(app.id,builderV2Revision(app))).toMatchObject({ok:true})
    return {...f,app,revision:builderV2Revision(app),deleteId:added.id}
  }
  async function deletionInput(f:Awaited<ReturnType<typeof deletionFixture>>,recordId:string){
    const scope={revision:f.revision,screenId:f.detail,nodeId:f.deleteId,recordId},state=await api.inspectPublishedV2DeleteAction(f.app.slug,scope)
    if(!state.ok)throw new Error(state.error)
    return {...scope,fingerprint:state.state.fingerprint,confirmed:true,requestId:`delete_${crypto.randomUUID().replaceAll('-','')}`}
  }
  it('requires confirmation, deletes once under concurrent retries and retains only one receipt, history and journal',async()=>{
    const f=await deletionFixture(),created=await api.submitPublishedV2FormAction(f.app.slug,await formInput(f));if(!created.ok||!created.rowId)throw new Error(JSON.stringify(created))
    const id=created.rowId,request=await deletionInput(f,id),scope={revision:f.revision,screenId:f.detail,nodeId:f.deleteId,recordId:id}
    expect(await api.submitPublishedV2DeleteAction(f.app.slug,{...request,confirmed:false})).toMatchObject({ok:false})
    expect(await record(f,id)).toMatchObject({ok:true});expect(await api.inspectPublishedV2DeleteAction(f.app.slug,scope)).toMatchObject({ok:true})
    const results=await Promise.all([api.submitPublishedV2DeleteAction(f.app.slug,request),api.submitPublishedV2DeleteAction(f.app.slug,request)])
    expect(results.every(result=>result.ok)).toBe(true);expect(results.map(result=>result.ok&&result.repeated).sort()).toEqual([false,true])
    expect(await record(f,id)).toMatchObject({ok:false});expect(await api.inspectPublishedV2DeleteAction(f.app.slug,scope)).toMatchObject({ok:false})
    const history=await data.db.select().from(data.rowChanges).where(eq(data.rowChanges.rowId,id));expect(history).toHaveLength(2)
    expect(await data.db.select().from(data.appActionRuns).where(and(eq(data.appActionRuns.appId,f.app.id),eq(data.appActionRuns.requestId,request.requestId)))).toHaveLength(1)
    expect(await data.db.select().from(data.appWorkflowRuns).where(and(eq(data.appWorkflowRuns.appId,f.app.id),eq(data.appWorkflowRuns.requestId,request.requestId)))).toMatchObject([{status:'succeeded'}])
    identity.email=emailB;expect(await api.submitPublishedV2DeleteAction(f.app.slug,request)).toMatchObject({ok:false})
  })
  it('refuses foreign records, related rows, stale versions and permission revocation without leaking linked content',async()=>{
    const f=await deletionFixture(),scope={revision:f.revision,screenId:f.detail,nodeId:f.deleteId}
    expect(await api.inspectPublishedV2DeleteAction(f.app.slug,{...scope,recordId:b})).toMatchObject({ok:false})
    const related=await api.inspectPublishedV2DeleteAction(f.app.slug,{...scope,recordId:a});expect(related).toMatchObject({ok:false});expect(JSON.stringify(related)).not.toContain('Задача Альфа')
    const created=await api.submitPublishedV2FormAction(f.app.slug,await formInput(f));if(!created.ok||!created.rowId)throw new Error(JSON.stringify(created))
    const request=await deletionInput(f,created.rowId)
    await data.db.update(data.rows).set({version:1}).where(eq(data.rows.id,created.rowId))
    expect(await api.submitPublishedV2DeleteAction(f.app.slug,request)).toMatchObject({ok:false,stale:true})
    const fresh=await deletionInput(f,created.rowId)
    expect(await api.submitPublishedV2DeleteAction(f.app.slug,{...fresh,userId:'spoofed'})).toMatchObject({ok:false})
    await data.db.update(data.apps).set({published:{...f.app,authentication:{...f.app.authentication,members:f.app.authentication.members.filter(item=>item.email!==emailA)}}}).where(eq(data.apps.id,f.app.id))
    expect(await api.submitPublishedV2DeleteAction(f.app.slug,fresh)).toMatchObject({ok:false});expect((await data.db.select().from(data.rows).where(eq(data.rows.id,created.rowId)))[0]!.deletedAt).toBeNull()
  })
  it('returns scoped browser effects and one durable outcome to the real app user',async()=>{
    const f=await fixture({flow:steps=>[...steps.slice(0,2),{id:'copy',type:'copy_value',value:{kind:'result',stepId:'complete',fieldId:title}},{id:'link',type:'open_url',value:{kind:'literal',value:'https://example.invalid/help'}},{id:'back',type:'go_back'}]}),request=await buttonInput(f),first=await api.submitPublishedV2ButtonAction(f.app.slug,request)
    expect(first).toMatchObject({ok:true,effects:[{type:'copy_value',value:'Проект Альфа'},{type:'open_url',url:'https://example.invalid/help'},{type:'go_back',screenId:f.home}]})
    expect(await api.submitPublishedV2ButtonAction(f.app.slug,request)).toMatchObject({...first,repeated:true})
    expect(await data.db.select().from(data.appWorkflowRuns).where(eq(data.appWorkflowRuns.appId,f.app.id))).toHaveLength(1)
    identity.email=emailB;expect(await api.submitPublishedV2ButtonAction(f.app.slug,request)).toMatchObject({ok:false})
  })
  it('never returns hidden values through clipboard or dynamic URLs and rolls the entire chain back',async()=>{
    for(const type of ['copy_value','open_url'] as const){
      const f=await fixture({flow:steps=>[...steps.slice(0,2),{id:'hidden-effect',type,value:{kind:'row',fieldId:secret}}]}),result=await api.submitPublishedV2ButtonAction(f.app.slug,await buttonInput(f))
      expect(result).toMatchObject({ok:false});expect(result).not.toHaveProperty('effects');expect(JSON.stringify(result)).not.toContain('900');expect(await record(f)).toMatchObject({ok:true,record:{values:{[done]:false}}})
    }
  })
  it('publishes only the saved revision, keeps drafts isolated and rejects readers of an unpublished app',async()=>{
    const f=await fixture({publish:false});expect(await read(f)).toMatchObject({ok:false});expect(await publish.publishBuilderV2Action(f.app.id,'b'.repeat(64))).toMatchObject({ok:false})
    expect(await publish.publishBuilderV2Action(f.app.id,f.revision)).toMatchObject({ok:true});expect(await read(f)).toMatchObject({ok:true})
    await data.db.update(data.apps).set({draft:{...f.app,name:'Черновое название'}}).where(eq(data.apps.id,f.app.id));const page=await pages.loadPublishedV2Page(f.app.slug,{screen:f.home});expect(page.login).toBe(false);if(!page.login)expect(page.app.name).toBe('Личные проекты')
    expect(await data.db.select().from(data.appConfigVersions).where(and(eq(data.appConfigVersions.appId,f.app.id),eq(data.appConfigVersions.kind,'published')))).toHaveLength(1)
    identity.member={...member,role:'viewer'};expect(await publish.publishBuilderV2Action(f.app.id,f.revision)).toMatchObject({ok:false})
  })
  it('isolates lists, exact rows, search, counts, relations and calculations for two users without memberships',async()=>{
    const f=await fixture(),first=await read(f);if(!first.ok)throw new Error(first.error)

    expect(first.page.total).toBe(1);expect(first.page.rows.map(row=>row.id)).toEqual([a]);expect(await record(f,b)).toMatchObject({ok:false})
    const detail=await record(f);if(!detail.ok)throw new Error(detail.error)
    expect(detail.record.values).toMatchObject({[title]:'Проект Альфа',[double]:20,[links]:[ta],[count]:1});for(const id of[secret,owner,leak,lookup])expect(detail.record.values).not.toHaveProperty(id)
    expect(JSON.stringify(detail)).not.toContain('Задача Бета');expect(JSON.stringify(detail)).not.toContain('111');expect(await read(f,{search:'Бета'})).toMatchObject({ok:true,page:{total:0}})
    expect(await api.readPublishedV2DataAction(f.app.slug,{revision:f.revision,screenId:f.home,nodeId:f.metricId})).toMatchObject({ok:true,page:{value:1,total:1}})
    identity.email=emailB;expect(await read(f)).toMatchObject({ok:true,page:{total:1,rows:[expect.objectContaining({id:b})]}});expect(await record(f,a)).toMatchObject({ok:false})
    expect(await data.db.select().from(data.workspaceMembers).where(eq(data.workspaceMembers.workspaceId,workspaceId))).toHaveLength(1)
  })
  it('opens concurrent first requests for a new app identity without a transient unavailable page',async()=>{
    const f=await fixture(),results=await Promise.all(Array.from({length:8},(_,index)=>index%2?read(f):pages.loadPublishedV2Page(f.app.slug,{screen:f.home})))
    for(const result of results)if('ok'in result)expect(result.ok).toBe(true);else expect(result.login).toBe(false)
    expect(await data.db.select().from(data.appUsers).where(and(eq(data.appUsers.appId,f.app.id),eq(data.appUsers.email,emailA)))).toHaveLength(1)
  })
  it('never serializes invitations, policies, action bodies, other screens or hidden fields in the page payload',async()=>{
    const f=await fixture(),page=await pages.loadPublishedV2Page(f.app.slug,{screen:f.detail,row:a});if(page.login)throw new Error('Unexpected login')
    expect(page.app.authentication.members).toEqual([]);expect(page.app.policy).toEqual({tables:[],workflows:[]});expect(JSON.stringify(page)).not.toContain(emailB);expect(JSON.stringify(page)).not.toContain(JSON.stringify(member.email));expect(JSON.stringify(page)).not.toContain('create_row');expect(page.tables.flatMap(table=>table.fields).some(field=>field.id===secret)).toBe(false)
    expect(page.buttons[f.buttonId]).toBeTruthy();expect(page.record?.values).not.toHaveProperty(leak)
    identity.email=null;expect((await pages.loadPublishedV2Page(f.app.slug,{})).login).toBe(true);expect(await read(f)).toMatchObject({ok:false})
  })
  it('executes app-user button chains atomically and deduplicates simultaneous requests in app-user storage',async()=>{
    const f=await fixture(),request=await buttonInput(f),results=await Promise.all([api.submitPublishedV2ButtonAction(f.app.slug,request),api.submitPublishedV2ButtonAction(f.app.slug,request)])
    expect(results.every(result=>result.ok)).toBe(true);expect(results.map(result=>result.ok&&result.repeated).sort()).toEqual([false,true]);expect((await record(f))).toMatchObject({ok:true,record:{values:{[done]:true}}})
    expect(await data.db.select().from(data.appActionRuns).where(eq(data.appActionRuns.appId,f.app.id))).toHaveLength(1);expect(await data.db.select().from(data.appWorkflowRuns).where(eq(data.appWorkflowRuns.appId,f.app.id))).toHaveLength(1);expect(await data.db.select().from(data.builderActionRuns).where(eq(data.builderActionRuns.appId,f.app.id))).toHaveLength(0)
    const [audit]=await data.db.select().from(data.rows).where(eq(data.rows.tableId,audits));expect(audit?.data).toMatchObject({[auditOwner]:emailA,[auditParent]:[a]})
    identity.email=emailB;expect(await api.submitPublishedV2ButtonAction(f.app.slug,request)).toMatchObject({ok:false});expect(await data.db.select().from(data.appActionRuns).where(eq(data.appActionRuns.appId,f.app.id))).toHaveLength(1)
  })
  it('rolls back late failures and refuses hidden-field conditions without exposing the value',async()=>{
    const f=await fixture({flow:steps=>[...steps,{id:'late',type:'require',condition:{op:'eq',left:{kind:'literal',value:1},right:{kind:'literal',value:2}},message:'Проверка не пройдена'}]}),result=await api.submitPublishedV2ButtonAction(f.app.slug,await buttonInput(f))
    expect(result).toMatchObject({ok:false,error:'Проверка не пройдена'});expect(await record(f)).toMatchObject({ok:true,record:{values:{[done]:false}}});expect(await data.db.select().from(data.rows).where(eq(data.rows.tableId,audits))).toHaveLength(0);expect(await data.db.select().from(data.appWorkflowRuns).where(eq(data.appWorkflowRuns.appId,f.app.id))).toMatchObject([{status:'failed'}])
    const app=structuredClone(f.app),flow=app.workflows.find(flow=>flow.id===(app.nodes.find(node=>node.id===f.buttonId) as Extract<AppV2Node,{type:'button'}>).events.press)!;flow.steps=[{id:'hidden',type:'require',condition:{op:'eq',left:{kind:'row',fieldId:secret},right:{kind:'literal',value:900}},message:'Не совпало'},...flow.steps.slice(0,-1)]
    await data.db.update(data.apps).set({draft:app}).where(eq(data.apps.id,app.id));expect(await publish.publishBuilderV2Action(app.id,builderV2Revision(app))).toMatchObject({ok:true});const changed={...f,app,revision:builderV2Revision(app)},denied=await api.submitPublishedV2ButtonAction(app.slug,await buttonInput(changed));expect(denied.ok).toBe(false);expect(JSON.stringify(denied)).not.toContain('900');expect(await record(changed)).toMatchObject({ok:true,record:{values:{[done]:false}}})
  })
  it('creates and edits through forms, assigns ownership and readonly parent links on the server, and rejects spoofed fields',async()=>{
    const f=await fixture(),input=await formInput(f),bad=await api.submitPublishedV2FormAction(f.app.slug,{...input,values:{...input.values,[owner]:emailB}});expect(bad).toMatchObject({ok:false})
    const whitespace=await api.submitPublishedV2FormAction(f.app.slug,{...input,values:{...input.values,[title]:'   '}});expect(whitespace).toMatchObject({ok:false})
    const created=await api.submitPublishedV2FormAction(f.app.slug,input);if(!created.ok||!created.rowId)throw new Error(JSON.stringify(created));const [stored]=await data.db.select().from(data.rows).where(eq(data.rows.id,created.rowId));expect(stored!.data).toMatchObject({[owner]:emailA,[amount]:0,[done]:false})
    const child=await api.submitPublishedV2FormAction(f.app.slug,await formInput(f,'child'));if(!child.ok||!child.rowId)throw new Error(JSON.stringify(child));expect((await data.db.select().from(data.rows).where(eq(data.rows.id,child.rowId)))[0]!.data).toMatchObject({[taskOwner]:emailA,[taskParent]:[a]})
    const edited=await api.submitPublishedV2FormAction(f.app.slug,await formInput(f,'edit'));expect(edited.ok).toBe(true);expect((await data.db.select().from(data.rows).where(eq(data.rows.id,a)))[0]!.data).toMatchObject({[title]:'Новый проект',[owner]:emailA,[secret]:900})
  })
  it('filters relation choices and rejects a guessed foreign relation value',async()=>{
    const f=await fixture(),scope={revision:f.revision,screenId:f.detail,formId:f.childForm,recordId:a},app=structuredClone(f.app),form=app.nodes.find(node=>node.id===f.childForm) as Extract<AppV2Node,{type:'form'}>,input=app.nodes.find(node=>node.type==='input'&&node.fieldId===taskParent&&form.childIds.includes(node.id)) as Extract<AppV2Node,{type:'input'}>;input.readOnly=false
    await data.db.update(data.apps).set({draft:app}).where(eq(data.apps.id,app.id));expect(await publish.publishBuilderV2Action(app.id,builderV2Revision(app))).toMatchObject({ok:true});const revised={...scope,revision:builderV2Revision(app)},options=await api.inspectPublishedV2FormAction(app.slug,{...revised,mode:'options',fieldId:taskParent,search:''});expect(options).toMatchObject({ok:true,options:[{id:a,label:'Проект Альфа'}]})
    const state=await api.inspectPublishedV2FormAction(app.slug,{...revised,mode:'initial'});if(!state.ok||!('state'in state))throw new Error('No state');expect(await api.submitPublishedV2FormAction(app.slug,{...revised,requestId:token('submit'),fingerprint:state.state.fingerprint,values:{[taskTitle]:'Подмена',[taskParent]:[b]}})).toMatchObject({ok:false})
    expect(await api.inspectPublishedV2FormAction(app.slug,{...revised,mode:'options',fieldId:taskParent,search:'Бета'})).toMatchObject({ok:true,options:[]})
  })
  it('rejects stale versions, unpublished requests, forged actors, workflows and cross-app IDs',async()=>{
    const f=await fixture(),request=await buttonInput(f)
    for(const extra of[{actor:{id:'fake',roleIds:['owner']}},{values:{[done]:true}},{workflow:f.app.workflows[0]}])expect(await api.submitPublishedV2ButtonAction(f.app.slug,{...request,...extra})).toMatchObject({ok:false})
    await data.db.update(data.rows).set({version:1}).where(eq(data.rows.id,a));expect(await api.submitPublishedV2ButtonAction(f.app.slug,request)).toMatchObject({ok:false,stale:true})
    expect(await api.readPublishedV2DataAction(f.app.slug,{revision:f.revision,screenId:f.home,nodeId:newId('component')})).toMatchObject({ok:false})
    const app={...f.app,name:'Новая публикация'};await data.db.update(data.apps).set({draft:app}).where(eq(data.apps.id,app.id));expect(await publish.publishBuilderV2Action(app.id,builderV2Revision(app))).toMatchObject({ok:true});expect(await read(f)).toMatchObject({ok:false,stale:true});expect(await api.submitPublishedV2ButtonAction(app.slug,request)).toMatchObject({ok:false,stale:true})
    await data.db.update(data.apps).set({published:null}).where(eq(data.apps.id,app.id));expect(await read(f)).toMatchObject({ok:false});expect(await api.submitPublishedV2ButtonAction(app.slug,request)).toMatchObject({ok:false})
  })
  it('binds continuation cursors to the user and search, and applies access revocation immediately',async()=>{
    const f=await fixture({publish:false}),app=structuredClone(f.app)
    app.sources.find(source=>source.id===(app.nodes.find(node=>node.id===f.collection) as Extract<AppV2Node,{type:'collection'}>).sourceId)!.pageSize=1
    await data.db.insert(data.rows).values({id:newId('row'),tableId:projects,position:'a2',data:{...projectData('a'),[title]:'Ещё один проект'}})
    await data.db.update(data.apps).set({draft:app}).where(eq(data.apps.id,app.id));expect(await publish.publishBuilderV2Action(app.id,builderV2Revision(app))).toMatchObject({ok:true})
    const current={...f,app,revision:builderV2Revision(app)},first=await read(current);if(!first.ok||!first.page.next)throw new Error('Expected a continuation')
    expect(first.page.rows).toHaveLength(1);const next=await read(current,{cursor:first.page.next});expect(next).toMatchObject({ok:true,page:{total:2,next:null}});if(next.ok)expect(next.page.rows[0]?.id).not.toBe(first.page.rows[0]?.id)
    expect(await read(current,{cursor:first.page.next,search:'проект'})).toMatchObject({ok:false,stale:true})
    identity.email=emailB;expect(await read(current,{cursor:first.page.next})).toMatchObject({ok:false,stale:true})
    identity.email=emailA;const request=await buttonInput(current);app.authentication.members=app.authentication.members.filter(member=>member.email!==emailA)
    await data.db.update(data.apps).set({draft:app}).where(eq(data.apps.id,app.id));expect(await publish.publishBuilderV2Action(app.id,builderV2Revision(app))).toMatchObject({ok:true})
    expect(await read(current)).toMatchObject({ok:false});expect(await api.submitPublishedV2ButtonAction(app.slug,request)).toMatchObject({ok:false})
    expect((await pages.loadPublishedV2Page(app.slug,{})).login).toBe(true)
  })
  it('allows an explicit guest list without exposing private fields or executable forms and buttons',async()=>{
    const f=await fixture({publish:false}),app=structuredClone(f.app)
    app.screens.find(screen=>screen.id===f.home)!.audience={kind:'public'}
    app.policy.tables.find(rule=>rule.tableId===projects)!.grants.push({audience:{kind:'public'},read:{fieldIds:[title],rows:{kind:'all'}}})
    await data.db.update(data.apps).set({draft:app}).where(eq(data.apps.id,app.id));expect(await publish.publishBuilderV2Action(app.id,builderV2Revision(app))).toMatchObject({ok:true})
    identity.email=null;const current={...f,app,revision:builderV2Revision(app)},result=await read(current);if(!result.ok)throw new Error(result.error)
    expect(result.page.total).toBe(2);for(const row of result.page.rows)expect(Object.keys(row.values)).toEqual([title])
    const page=await pages.loadPublishedV2Page(app.slug,{});if(page.login)throw new Error('Expected guest page')
    expect(page.actor.authenticated).toBe(false);expect(page.app.nodes.some(node=>node.type==='button'||node.type==='form')).toBe(false);expect(page.app.screens.map(screen=>screen.id)).toEqual([f.home])
    expect(await api.inspectPublishedV2ButtonAction(app.slug,{revision:current.revision,screenId:f.detail,nodeId:f.buttonId,recordId:a})).toMatchObject({ok:false})
  })
  it('publishes appearance and menu labels as a snapshot without widening screen access or data permissions',async()=>{
    const f=await fixture(),app=structuredClone(f.app),policy=structuredClone(app.policy)
    app.theme={...app.theme,scheme:'dark',accent:'violet'};app.appearance={navigation:'sidebar',icon:'folder'}
    app.screens.find(screen=>screen.id===f.home)!.menuLabel='Итоги'
    app.screens.push({...app.screens.find(screen=>screen.id===f.home)!,id:'owner_only',name:'Внутренний отчёт',menuLabel:'Только владельцу',rootIds:[],audience:{kind:'roles',roleIds:['owner']}})
    await data.db.update(data.apps).set({draft:app}).where(eq(data.apps.id,app.id))
    let page=await pages.loadPublishedV2Page(app.slug,{screen:f.home});if(page.login)throw new Error('Expected published page')
    expect(page.app.theme.accent).not.toBe('violet');expect(page.app.screens.find(screen=>screen.id===f.home)?.menuLabel).toBeUndefined()
    expect(await publish.publishBuilderV2Action(app.id,builderV2Revision(app))).toMatchObject({ok:true})
    page=await pages.loadPublishedV2Page(app.slug,{screen:f.home});if(page.login)throw new Error('Expected published page')
    expect(page.app.appearance).toEqual(app.appearance);expect(page.app.theme).toEqual(app.theme);expect(page.app.screens.find(screen=>screen.id===f.home)?.menuLabel).toBe('Итоги')
    expect(page.app.screens.some(screen=>screen.id==='owner_only')).toBe(false);expect(page.app.policy).toEqual({tables:[],workflows:[]});expect(app.policy).toEqual(policy)
    expect(await read({...f,app,revision:builderV2Revision(app)})).toMatchObject({ok:true,page:{total:1}})
    identity.email=null;expect(await pages.loadPublishedV2Page(app.slug,{})).toMatchObject({login:true,theme:app.theme})
  })

  it('seeds edit forms with empty permitted fields and still denies fields the role cannot read', async () => {
    const f = await fixture()
    await data.db.update(data.rows).set({ data: { [title]: 'Проект Альфа', [owner]: emailA } }).where(eq(data.rows.id, a))
    const scope = { revision: f.revision, screenId: f.detail, formId: f.editForm, recordId: a }
    const initial = await api.inspectPublishedV2FormAction(f.app.slug, { ...scope, mode: 'initial' })
    expect(initial).toMatchObject({ ok: true, state: { values: { [title]: 'Проект Альфа', [amount]: null, [done]: false } } })
    if (!initial.ok || !('state' in initial)) throw new Error(JSON.stringify(initial))
    expect(await api.submitPublishedV2FormAction(f.app.slug, {
      ...scope, requestId: token('submit'), fingerprint: initial.state.fingerprint,
      values: { [title]: 'Проект Альфа', [amount]: null, [done]: true },
    })).toMatchObject({ ok: true })
    expect(await record(f)).toMatchObject({ ok: true, record: { values: { [done]: true } } })

    const deniedApp = structuredClone(f.app)
    const projectsPolicy = deniedApp.policy.tables.find(rule => rule.tableId === projects)!
    const workerGrant = projectsPolicy.grants.find(grant => grant.audience.kind === 'roles' && grant.audience.roleIds.includes('worker'))!
    workerGrant.read = { ...workerGrant.read!, fieldIds: workerGrant.read!.fieldIds.filter(id => id !== amount) }
    await data.db.update(data.apps).set({ published: deniedApp }).where(eq(data.apps.id, f.app.id))
    expect(await api.inspectPublishedV2FormAction(f.app.slug, { ...scope, revision: builderV2Revision(deniedApp), mode: 'initial' })).toMatchObject({
      ok: false, error: 'Одно из полей формы недоступно для чтения',
    })
  })

})
