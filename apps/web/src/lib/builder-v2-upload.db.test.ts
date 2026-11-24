import {existsSync} from 'node:fs'
import {resolve} from 'node:path'
import {afterAll,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest'
import {eq} from 'drizzle-orm'
import {newId,type Attachment} from '@tableapp/schema'
import type {AppV2,AppV2UploadContext} from '@tableapp/schema/app-v2'
import {builderV2Revision} from './builder-v2-revision'
const identity=vi.hoisted(()=>({email:null as string|null,member:null as import('./session').Member|null}))
vi.mock('@/lib/session',async original=>({...await original<typeof import('./session')>(),currentAccount:async()=>null,currentMember:async()=>identity.member}))
vi.mock('@/lib/app-session',async original=>({...await original<typeof import('./app-session')>(),currentStaffEmail:async()=>identity.email}))
vi.mock('@/lib/live',()=>({publishTable:vi.fn()}))
const storage=vi.hoisted(()=>({putFile:vi.fn(async(_workspace:string,file:{name:string;type:string;bytes:Uint8Array},key:string)=>({ok:true,stored:{key,name:file.name,mime:file.type,size:file.bytes.length}})),deleteFile:vi.fn(async()=>{}),getFile:vi.fn(async()=>({mime:'image/png',body:new Uint8Array([1,2,3])})),fileKey:(workspace:string)=>`${workspace}/${crypto.randomUUID()}.png`}))
vi.mock('@/lib/storage',()=>storage)
const env=resolve(import.meta.dirname,'../../../../.env');if(!process.env.DATABASE_URL&&existsSync(env))process.loadEnvFile(env)

describe.skipIf(!process.env.DATABASE_URL)('v2 form attachment upload and atomic binding',()=>{
 let data:typeof import('@tableapp/db'),route:typeof import('@/app/api/builder-v2/files/route'),download:typeof import('@/app/api/files/[...key]/route'),forms:typeof import('./builder-v2-published-write'),author:typeof import('./builder-v2-submit'),app:AppV2,scope:{screenId:string;formId:string},editScope:{screenId:string;formId:string;recordId:string}
 const userId=newId('user'),workspaceId=newId('workspace'),appId=newId('app'),tableId=newId('table'),title=newId('field'),photo=newId('field'),docs=newId('field'),owner=newId('field'),rowA=newId('row'),rowB=newId('row'),slug=appId.replace('_','-'),emailA=`a_${userId}@example.invalid`,emailB=`b_${userId}@example.invalid`,member={userId,workspaceId,email:`${userId}@example.invalid`,name:'Автор',workspaceName:'V24 upload test',role:'owner' as const}
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5V8AAAAASUVORK5CYII=','base64')
 beforeAll(async()=>{
  data=await import('@tableapp/db');route=await import('@/app/api/builder-v2/files/route');download=await import('@/app/api/files/[...key]/route');forms=await import('./builder-v2-published-write');author=await import('./builder-v2-submit')
  await data.db.insert(data.users).values({id:userId,email:member.email});await data.db.insert(data.workspaces).values({id:workspaceId,ownerId:userId,name:member.workspaceName,slug:workspaceId,plan:'business'});await data.db.insert(data.workspaceMembers).values({workspaceId,userId,role:'owner'})
  await data.db.insert(data.tables).values({id:tableId,workspaceId,name:'Заказы',position:'a0',primaryFieldId:title});await data.db.insert(data.fields).values([{id:title,tableId,name:'Заказ',type:'text',position:'a0'},{id:photo,tableId,name:'Фото',type:'image',options:{maxCount:2},position:'a1'},{id:docs,tableId,name:'Документы',type:'attachment',options:{maxCount:2},position:'a2'},{id:owner,tableId,name:'Автор',type:'email',position:'a3'}])
  const builder=await import('./builder-v2'),model=await import('@/components/builder/v2/model'),configure=await import('./builder-v2-form-action'),tables=(await builder.loadBuilderV2Catalog(workspaceId)).tables
  app=builder.newBuilderV2App({id:appId,workspaceId,name:'Заказы',slug,email:member.email});app.roles.push({id:'worker',name:'Сотрудник'});app.authentication.members.push({email:emailA,roleIds:['worker'],company:''},{email:emailB,roleIds:['worker'],company:''});app.screens[0]!.audience={kind:'roles',roleIds:['owner','worker']}
  const create=model.addNode(app,app.screens[0]!.id,'form',tables,null,tableId);app=configure.configureBuilderV2FormSave(create.app,create.id,['owner','worker']);scope={screenId:app.screens[0]!.id,formId:create.id}
  const screen={...app.screens[0]!,id:newId('screen'),name:'Изменить заказ',navigation:false,contextTableId:tableId,rootIds:[]};app.screens.push(screen)
  const edit=model.addNode(app,screen.id,'form',tables,null,tableId);app=edit.app;const form=app.nodes.find(node=>node.id===edit.id)!;if(form.type!=='form')throw new Error('No form');form.mode='edit';app=configure.configureBuilderV2FormSave(app,form.id,['owner','worker']);editScope={screenId:screen.id,formId:form.id,recordId:rowA}
  app.policy.tables=[{tableId,grants:[{audience:{kind:'roles',roleIds:['owner']},read:{fieldIds:[title,photo,docs,owner],rows:{kind:'all'}},create:{fieldIds:[title,photo,docs]},update:{fieldIds:[title,photo,docs],rows:{kind:'all'}}},{audience:{kind:'roles',roleIds:['worker']},read:{fieldIds:[title,photo,docs],rows:{kind:'owned',fieldId:owner,property:'email'}},create:{fieldIds:[title,photo,docs],owner:{fieldId:owner,property:'email'}},update:{fieldIds:[title,photo,docs],rows:{kind:'owned',fieldId:owner,property:'email'}}}]}]
  await data.db.insert(data.apps).values({id:appId,workspaceId,name:app.name,slug,draft:app,published:app,theme:app.theme})
 })
 beforeEach(async()=>{vi.clearAllMocks();identity.member=member;identity.email=emailA;await data.db.delete(data.attachments).where(eq(data.attachments.workspaceId,workspaceId));await data.db.delete(data.rows).where(eq(data.rows.tableId,tableId));await data.db.delete(data.builderActionRuns).where(eq(data.builderActionRuns.appId,appId));await data.db.update(data.apps).set({draft:app,published:app}).where(eq(data.apps.id,appId));await data.db.insert(data.rows).values([{id:rowA,tableId,position:'a0',data:{[title]:'Заказ Анны',[owner]:emailA,[photo]:[],[docs]:[]}},{id:rowB,tableId,position:'a1',data:{[title]:'Заказ Павла',[owner]:emailB,[photo]:[],[docs]:[]}}])})
 afterAll(async()=>{if(!data)return;await data.db.delete(data.workspaces).where(eq(data.workspaces.id,workspaceId));await data.db.delete(data.users).where(eq(data.users.id,userId));await data.sql.end()})
 async function initial(selected=scope){const result=await forms.inspectPublishedV2FormRequest(slug,{...selected,revision:builderV2Revision(app),mode:'initial'});if(!result.ok||!('state'in result)||!result.state)throw new Error(JSON.stringify(result));return result.state}
 async function context(selected=scope,fieldId=photo):Promise<AppV2UploadContext>{const state=await initial(selected);return {kind:'published',slug,...selected,fieldId,revision:builderV2Revision(app),fingerprint:state.fingerprint}}
 const send=async(ctx:unknown,file=new File([png],'photo.png',{type:'image/png'}))=>{const body=new FormData();body.set('file',file);body.set('context',JSON.stringify(ctx));return route.POST(new Request('http://localhost/api/builder-v2/files',{method:'POST',body}))}
 const get=(key:string)=>download.GET(new Request(`http://localhost/api/files/${key}?v2App=${slug}`),{params:Promise.resolve({key:key.split('/')})})
 const request=(state:{revision:string;fingerprint:string},selected=scope,values:Record<string,unknown>={[title]:'Стеллаж',[photo]:[],[docs]:[]})=>({...selected,revision:state.revision,fingerprint:state.fingerprint,values:values as Record<string,import('@tableapp/schema/app-v2').AppV2Json>,requestId:`submit_${crypto.randomUUID().replaceAll('-','')}`})
 it('uploads as the app identity, binds canonical metadata atomically and repeats the same saved row without a second write',async()=>{
  const state=await initial(),response=await send(await context());expect(response.status).toBe(200);const {attachment}=await response.json() as {attachment:Attachment}
  const [pending]=await data.db.select().from(data.attachments).where(eq(data.attachments.key,attachment.key));expect(pending).toMatchObject({uploadedBy:expect.stringMatching(/^aus_/),rowId:null,referenced:false});expect(pending!.uploadedBy).not.toBe(userId);expect((await get(attachment.key)).status).toBe(403)
  identity.member=null;const input=request(state,scope,{[title]:'Стеллаж',[photo]:[{...attachment,name:'spoofed',mime:'text/html',size:999}],[docs]:[]}),saved=await forms.submitPublishedV2(slug,'form',input);expect(saved.ok).toBe(true);if(!saved.ok||!saved.rowId)throw new Error(JSON.stringify(saved))
  expect(await forms.submitPublishedV2(slug,'form',input)).toMatchObject({ok:true,repeated:true,rowId:saved.rowId});const [row]=await data.db.select().from(data.rows).where(eq(data.rows.id,saved.rowId));expect(row!.data).toMatchObject({[owner]:emailA,[photo]:[{name:'photo.png',mime:'image/png',size:expect.any(Number)}]});expect((row!.data as Record<string, {size:number}[]>)[photo]![0]!.size).toBeGreaterThan(0);expect(await data.db.select().from(data.rowChanges).where(eq(data.rowChanges.rowId,saved.rowId))).toHaveLength(1);expect((await get(attachment.key)).status).toBe(200)
 })
 it('replaces and removes an existing attachment only on edit save, preserving an uploaded replacement across validation failure',async()=>{
  const first=(await (await send(await context())).json()).attachment as Attachment,state=await initial(editScope)
  expect((await forms.submitPublishedV2(slug,'form',request(state,editScope,{[title]:'Заказ Анны',[photo]:[first],[docs]:[]}))).ok).toBe(true)
  const nextState=await initial(editScope),second=(await (await send(await context(editScope))).json()).attachment as Attachment
  expect(await forms.submitPublishedV2(slug,'form',request(nextState,editScope,{[title]:' ',[photo]:[second],[docs]:[]}))).toMatchObject({ok:false});expect((await get(first.key)).status).toBe(200)
  const saved=await forms.submitPublishedV2(slug,'form',request(nextState,editScope,{[title]:'Готовый стеллаж',[photo]:[second],[docs]:[]}));expect(saved.ok).toBe(true);expect((await get(first.key)).status).toBe(403);expect((await get(second.key)).status).toBe(200)
  const [removed]=await data.db.select().from(data.attachments).where(eq(data.attachments.key,first.key));expect(removed).toMatchObject({referenced:false,rowId:null});expect((await forms.submitPublishedV2(slug,'form',request(await initial(editScope),editScope,{[title]:'Без фото',[photo]:[],[docs]:[]}))).ok).toBe(true);expect((await get(second.key)).status).toBe(403)
 })
 it('checks the exact current form, field and row before storage, without falling back to owner permissions',async()=>{
  const ctx=await context();for(const altered of[{...ctx,fieldId:title},{...ctx,fingerprint:'f'.repeat(64)},{...ctx,revision:'e'.repeat(64)},{...ctx,roleIds:['owner']},{...ctx,kind:'preview'}])expect((await send(altered)).status).not.toBe(200)
  const edit=await context(editScope);identity.email=emailB;expect((await send(edit)).status).toBe(403);identity.email=null;expect((await send(ctx)).status).toBe(403);expect(storage.putFile).not.toHaveBeenCalled()
 })
 it('rejects documents in photo fields, MIME mismatch and saved counts, and does not adopt someone else’s pending upload',async()=>{
  const ctx=await context();expect((await send(ctx,new File(['hello'],'note.txt',{type:'text/plain'}))).status).toBe(400);expect((await send(ctx,new File(['fake png'],'fake.png',{type:'image/png'}))).status).toBe(400);expect(storage.putFile).not.toHaveBeenCalled()
  const document=(await(await send(await context(scope,docs),new File(['hello'],'note.txt',{type:'text/plain'}))).json()).attachment as Attachment
  const state=await initial();expect(await forms.submitPublishedV2(slug,'form',request(state,scope,{[title]:'Стеллаж',[photo]:[{...document,mime:'image/png'}],[docs]:[]}))).toMatchObject({ok:false})
  identity.email=emailB;expect(await forms.submitPublishedV2(slug,'form',request(await initial(),scope,{[title]:'Другой',[photo]:[],[docs]:[document]}))).toMatchObject({ok:false});identity.email=emailA
  const photos=[];for(let i=0;i<3;i++)photos.push((await(await send(await context())).json()).attachment);expect(await forms.submitPublishedV2(slug,'form',request(state,scope,{[title]:'Слишком много',[photo]:photos,[docs]:[]}))).toMatchObject({ok:false})
 })
 it('authorizes saved private forms separately and refuses read-only members, unpublished runtime and revoked workflow rights',async()=>{
  const state=await author.inspectWorkingBuilderV2Form(appId,member,{...scope,mode:'initial'});if(!state.ok||!('state'in state))throw new Error('No state')
  const ctx={kind:'working',appId,...scope,fieldId:photo,revision:state.state.revision,fingerprint:state.state.fingerprint};expect((await send(ctx)).status).toBe(200);identity.member={...member,role:'viewer'};expect((await send(ctx)).status).toBe(403);identity.member=member
  const runtime=await context(),revoked=structuredClone(app);revoked.policy.workflows=[];await data.db.update(data.apps).set({published:revoked}).where(eq(data.apps.id,appId));expect((await send({...runtime,revision:builderV2Revision(revoked)})).status).toBe(403);await data.db.update(data.apps).set({published:null}).where(eq(data.apps.id,appId));expect((await send(runtime)).status).toBe(403)
 })
 it('rolls file bindings and row history back when a later workflow step tries to reuse the same attachment',async()=>{
  const base=app;app=structuredClone(app)
  try{
   const form=app.nodes.find(node=>node.id===scope.formId)!;if(form.type!=='form')throw new Error('No form');const flow=app.workflows.find(flow=>flow.id===form.events.submit)!,step=flow.steps[0]!;flow.steps.push({...step,id:newId('screen')})
   await data.db.update(data.apps).set({published:app}).where(eq(data.apps.id,appId));const state=await initial(),file=(await(await send(await context())).json()).attachment as Attachment,before=(await data.db.select().from(data.rowChanges).where(eq(data.rowChanges.tableId,tableId))).length
   expect(await forms.submitPublishedV2(slug,'form',request(state,scope,{[title]:'Не сохранять',[photo]:[file],[docs]:[]}))).toMatchObject({ok:false})
   expect(await data.db.select().from(data.rows).where(eq(data.rows.tableId,tableId))).toHaveLength(2);const [pending]=await data.db.select().from(data.attachments).where(eq(data.attachments.key,file.key));expect(pending).toMatchObject({referenced:false,rowId:null,fieldId:null});expect(await data.db.select().from(data.rowChanges).where(eq(data.rowChanges.tableId,tableId))).toHaveLength(before)
  }finally{app=base}
 })
})
