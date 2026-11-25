import {existsSync} from 'node:fs'
import {resolve} from 'node:path'
import {afterAll,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest'
import {and,eq} from 'drizzle-orm'
import {newId} from '@tableapp/schema'
import type {AppV2} from '@tableapp/schema/app-v2'
const identity=vi.hoisted(()=>({email:null as string|null,member:null as import('./session').Member|null}))
vi.mock('@/lib/session',()=>({currentAccount:async()=>null,currentMember:async()=>identity.member}))
vi.mock('@/lib/app-session',()=>({currentStaffEmail:async()=>identity.email,currentAppAccess:vi.fn()}))
vi.mock('@/lib/storage',()=>({getFile:vi.fn(async()=>({body:new Uint8Array([1,2,3]),mime:'image/png'}))}))
const env=resolve(import.meta.dirname,'../../../../.env');if(!process.env.DATABASE_URL&&existsSync(env))process.loadEnvFile(env)
describe.skipIf(!process.env.DATABASE_URL)('v2 stored attachment delivery',()=>{
 let data:typeof import('@tableapp/db'),route:typeof import('@/app/api/files/[...key]/route'),storage:typeof import('./storage'),app:AppV2
 const userId=newId('user'),workspaceId=newId('workspace'),tableId=newId('table'),title=newId('field'),owner=newId('field'),photo=newId('field'),secret=newId('field'),rowA=newId('row'),rowB=newId('row'),appId=newId('app'),emailA=`anna_${userId}@example.invalid`,emailB=`pavel_${userId}@example.invalid`,slug=appId.replace('_','-'),keyA=`${workspaceId}/a.png`,keyB=`${workspaceId}/b.png`,keySecret=`${workspaceId}/secret.png`
 const file=(key:string)=>({id:newId('attachment'),key,workspaceId,uploadedBy:userId,name:'Фото.png',mime:'image/png',size:3,state:'ready' as const,referenced:true,tableId,rowId:key===keyB?rowB:rowA,fieldId:key===keySecret?secret:photo})
 const rowData=(which:'a'|'b')=>({[title]:which==='a'?'Заказ Анны':'Заказ Павла',[owner]:which==='a'?emailA:emailB,[photo]:[{key:which==='a'?keyA:keyB,name:'Фото.png',mime:'image/png',size:3}],[secret]:[{key:keySecret,name:'Закрытое фото',mime:'image/png',size:3}]})
 beforeAll(async()=>{
  data=await import('@tableapp/db');route=await import('@/app/api/files/[...key]/route');storage=await import('./storage');const builder=await import('./builder-v2')
  await data.db.insert(data.users).values({id:userId,email:`${userId}@example.invalid`});await data.db.insert(data.workspaces).values({id:workspaceId,ownerId:userId,name:'V23 file permission check',slug:workspaceId,plan:'business'});await data.db.insert(data.workspaceMembers).values({workspaceId,userId,role:'owner'})
  await data.db.insert(data.tables).values({id:tableId,workspaceId,name:'Заказы',position:'a0'});await data.db.insert(data.fields).values([{id:title,tableId,name:'Название',type:'text',position:'a0'},{id:owner,tableId,name:'Почта',type:'email',position:'a1'},{id:photo,tableId,name:'Фото',type:'image',position:'a2'},{id:secret,tableId,name:'Закрыто',type:'attachment',position:'a3'}]);await data.db.update(data.tables).set({primaryFieldId:title}).where(eq(data.tables.id,tableId))
  await data.db.insert(data.rows).values([{id:rowA,tableId,position:'a0',data:rowData('a')},{id:rowB,tableId,position:'a1',data:rowData('b')}]);await data.db.insert(data.attachments).values([file(keyA),file(keyB),file(keySecret)])
  app=builder.newBuilderV2App({id:appId,workspaceId,name:'Файлы',slug,email:`${userId}@example.invalid`});app.roles.push({id:'worker',name:'Сотрудник'});app.authentication.members.push({email:emailA,roleIds:['worker'],company:''},{email:emailB,roleIds:['worker'],company:''});app.screens[0]!.audience={kind:'roles',roleIds:['owner','worker']};app.policy.tables=[{tableId,grants:[{audience:{kind:'roles',roleIds:['worker']},read:{fieldIds:[title,photo],rows:{kind:'owned',fieldId:owner,property:'email'}}}]}]
  await data.db.insert(data.apps).values({id:appId,workspaceId,name:app.name,slug,draft:app,published:app,theme:app.theme})
 })
 beforeEach(async()=>{
  identity.email=emailA;identity.member={userId,workspaceId,email:`${userId}@example.invalid`,name:'Владелец',workspaceName:'V23 file permission check',role:'owner'};vi.clearAllMocks()
  await data.db.update(data.apps).set({published:app,draft:app}).where(eq(data.apps.id,appId));await data.db.update(data.rows).set({data:rowData('a'),deletedAt:null}).where(eq(data.rows.id,rowA));await data.db.update(data.attachments).set({state:'ready',referenced:true,tableId,rowId:rowA,fieldId:photo}).where(eq(data.attachments.key,keyA))
 })
 afterAll(async()=>{if(!data)return;await data.db.delete(data.workspaces).where(eq(data.workspaces.id,workspaceId));await data.db.delete(data.users).where(eq(data.users.id,userId));await data.sql.end()})
 const get=(key:string,v2App=slug)=>route.GET(new Request(`http://localhost/api/files/${key}?v2App=${encodeURIComponent(v2App)}`),{params:Promise.resolve({key:key.split('/')})})
 it('delivers only a currently linked readable field of an owned row, ignoring broader member permissions in explicit app context',async()=>{
  const response=await get(keyA);expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('private, no-store');expect(response.headers.get('x-content-type-options')).toBe('nosniff');expect((await response.arrayBuffer()).byteLength).toBe(3)
  vi.mocked(storage.getFile).mockClear();expect((await get(keyB)).status).toBe(404);expect((await get(keySecret)).status).toBe(404);expect(storage.getFile).not.toHaveBeenCalled()
  identity.email=emailB;expect((await get(keyA)).status).toBe(404);expect((await get(keyB)).status).toBe(200)
 })
 it('refuses deleted rows, detached cells, unlinked metadata and not-ready files before reading storage',async()=>{
  await data.db.update(data.rows).set({deletedAt:new Date()}).where(eq(data.rows.id,rowA));expect((await get(keyA)).status).toBe(404)
  await data.db.update(data.rows).set({deletedAt:null,data:{...rowData('a'),[photo]:[]}}).where(eq(data.rows.id,rowA));expect((await get(keyA)).status).toBe(404)
  await data.db.update(data.rows).set({data:rowData('a')}).where(eq(data.rows.id,rowA));await data.db.update(data.attachments).set({tableId:null,rowId:null,fieldId:null,referenced:false}).where(eq(data.attachments.key,keyA));expect((await get(keyA)).status).toBe(404)
  await data.db.update(data.attachments).set({state:'deleting'}).where(eq(data.attachments.key,keyA));expect((await get(keyA)).status).toBe(404);expect(storage.getFile).not.toHaveBeenCalled()
 })
 it('applies published access revocation and rejects missing app context without falling back to the owner session',async()=>{
  expect((await get(keyA,'')).status).toBe(404);expect((await get(keyA,'another-app')).status).toBe(404)
  const revoked=structuredClone(app);revoked.authentication.members=revoked.authentication.members.filter(member=>member.email!==emailA);await data.db.update(data.apps).set({published:revoked}).where(eq(data.apps.id,appId));expect((await get(keyA)).status).toBe(404)
  await data.db.update(data.apps).set({published:null}).where(eq(data.apps.id,appId));expect((await get(keyA)).status).toBe(404);expect(storage.getFile).not.toHaveBeenCalled()
 })
 it('allows anonymous delivery only with explicit public screen and field grants',async()=>{
  identity.email=null;expect((await get(keyA)).status).toBe(404)
  const publicApp=structuredClone(app);publicApp.screens[0]!.audience={kind:'public'};publicApp.policy.tables[0]!.grants.push({audience:{kind:'public'},read:{fieldIds:[photo],rows:{kind:'all'}}});await data.db.update(data.apps).set({published:publicApp}).where(eq(data.apps.id,appId));expect((await get(keyA)).status).toBe(200);expect((await get(keySecret)).status).toBe(404)
 })
})
