import {existsSync} from 'node:fs'
import {resolve} from 'node:path'
import {afterAll,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest'
import {and,eq,inArray} from 'drizzle-orm'
import {newId} from '@tableapp/schema'
import type {AppV2} from '@tableapp/schema/app-v2'
const state=vi.hoisted(()=>({jar:new Map<string,string>(),code:'',letters:0,ip:''}))
vi.mock('next/headers',()=>({cookies:async()=>({get:(name:string)=>state.jar.has(name)?{value:state.jar.get(name)}:undefined,set:(name:string,value:string)=>state.jar.set(name,value),delete:(name:string)=>state.jar.delete(name)}),headers:async()=>new Headers({host:'localhost:3101','x-real-ip':state.ip})}))
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}))
vi.mock('@/lib/mailer',()=>({sendMagicLink:async(letter:{code:string})=>{state.code=letter.code;state.letters++;return {delivered:true}},mailHintFor:()=>null}))
const env=resolve(import.meta.dirname,'../../../../.env');if(!process.env.DATABASE_URL&&existsSync(env))process.loadEnvFile(env)
describe.skipIf(!process.env.DATABASE_URL)('published v2 email verification and invitation privacy',()=>{
 let d:typeof import('@tableapp/db'),auth:typeof import('@/app/auth-actions'),runtime:typeof import('./builder-v2-published')
 const fixtures:{workspaceId:string;userId:string}[]=[],emails=new Set<string>()
 beforeAll(async()=>{d=await import('@tableapp/db');auth=await import('@/app/auth-actions');runtime=await import('./builder-v2-published')})
 beforeEach(()=>{state.jar.clear();state.letters=0;state.code='';state.ip=`v13-auth-${newId('row')}`})
 afterAll(async()=>{if(!d)return;for(const f of fixtures){await d.db.delete(d.workspaces).where(eq(d.workspaces.id,f.workspaceId));await d.db.delete(d.users).where(eq(d.users.id,f.userId))}for(const table of[d.authTokens,d.authEvents,d.staffSessions])if(emails.size)await d.db.delete(table).where(inArray(table.email,[...emails]));state.jar.clear();await d.sql.end()})
 async function fixture(open=false){
  const userId=newId('user'),workspaceId=newId('workspace'),appId=newId('app'),owner=`${userId}@example.invalid`,known=`known-${userId}@example.invalid`,unknown=`unknown-${userId}@example.invalid`;for(const email of[owner,known,unknown])emails.add(email);fixtures.push({workspaceId,userId})
  await d.db.insert(d.users).values({id:userId,email:owner});await d.db.insert(d.workspaces).values({id:workspaceId,ownerId:userId,name:'V13 auth fixture',slug:workspaceId});await d.db.insert(d.workspaceMembers).values({workspaceId,userId,role:'owner'})
  const {newBuilderV2App}=await import('./builder-v2'),{newScreen}=await import('@/components/builder/v2/model');let app=newScreen(newBuilderV2App({id:appId,workspaceId,name:'Тест входа',slug:appId.replace('_','-'),email:owner}),'Главная')
  app.roles.push({id:'worker',name:'Участник'});app.authentication={mode:open?'verified_email':'invite_only',defaultRoleId:open?'worker':null,members:[{email:known,roleIds:['worker'],company:''}]};app.screens[0]!.audience={kind:'roles',roleIds:['worker']}
  await d.db.insert(d.apps).values({id:appId,workspaceId,name:app.name,slug:app.slug,draft:app,published:app,publishedAt:new Date()});return {app,known,unknown}
 }
 it('returns a generic response for a stranger without a token, and verifies only the invited email',async()=>{
  const f=await fixture();expect(await auth.requestAppLoginAction(f.app.slug,f.unknown)).toMatchObject({ok:true,delivered:true});expect(state.letters).toBe(0)
  expect(await d.db.select().from(d.authTokens).where(eq(d.authTokens.email,f.unknown))).toHaveLength(0);expect(await d.db.select().from(d.appUsers).where(eq(d.appUsers.appId,f.app.id))).toHaveLength(0)
  expect(await auth.requestAppLoginAction(f.app.slug,f.known)).toMatchObject({ok:true,delivered:true});expect(state.letters).toBe(1);expect((await runtime.publishedV2Context(f.app.slug)).actor.authenticated).toBe(false)
  expect(await auth.consumeAppCodeAction(f.app.slug,state.code)).toMatchObject({ok:true});expect((await runtime.publishedV2Context(f.app.slug)).actor).toMatchObject({authenticated:true,email:f.known,roleIds:['worker']});expect(await auth.consumeAppCodeAction(f.app.slug,state.code)).toMatchObject({ok:false})
  expect(await d.db.select().from(d.workspaceMembers).where(eq(d.workspaceMembers.workspaceId,f.app.workspaceId))).toHaveLength(1)
 })
 it('assigns the declared default role only after verification in open email mode',async()=>{
  const f=await fixture(true);expect(await auth.requestAppLoginAction(f.app.slug,f.unknown)).toMatchObject({ok:true});expect(state.letters).toBe(1);expect((await runtime.publishedV2Context(f.app.slug)).actor.authenticated).toBe(false)
  expect(await auth.consumeAppCodeAction(f.app.slug,state.code)).toMatchObject({ok:true});expect((await runtime.publishedV2Context(f.app.slug)).actor).toMatchObject({email:f.unknown,roleIds:['worker']})
  const app:AppV2={...f.app,authentication:{...f.app.authentication,mode:'invite_only',defaultRoleId:null}};await d.db.update(d.apps).set({published:app}).where(eq(d.apps.id,app.id));expect((await runtime.publishedV2Context(app.slug)).actor.authenticated).toBe(false)
 })
})
