import {existsSync} from 'node:fs'
import {resolve} from 'node:path'
import {afterAll,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest'
import {eq,inArray} from 'drizzle-orm'
import {newId} from '@tableapp/schema'
const identity=vi.hoisted(()=>({member:null as import('./session').Member|null}))
vi.mock('@/lib/session',async original=>({...await original<typeof import('./session')>(),currentMember:async()=>identity.member}))
const env=resolve(import.meta.dirname,'../../../../.env');if(!process.env.DATABASE_URL&&existsSync(env))process.loadEnvFile(env)
describe.skipIf(!process.env.DATABASE_URL)('author access to published workflow history',()=>{
 let d:typeof import('@tableapp/db'),history:typeof import('@/app/builder-v2-workflow-actions')
 const userId=newId('user'),other=newId('user'),workspaceId=newId('workspace'),foreignWorkspace=newId('workspace'),appId=newId('app'),secondId=newId('app'),appUser=newId('appUser'),appUserB=newId('appUser'),foreignUser=newId('appUser')
 const member={userId,workspaceId,email:`${userId}@example.invalid`,name:'Автор журнала',workspaceName:'V14 history fixture',role:'owner' as const},emailA=`a-${appId}@example.invalid`,emailB=`b-${appId}@example.invalid`
 beforeAll(async()=>{
  d=await import('@tableapp/db');history=await import('@/app/builder-v2-workflow-actions');await d.db.insert(d.users).values([{id:userId,email:member.email},{id:other,email:`${other}@example.invalid`}]);await d.db.insert(d.workspaces).values([{id:workspaceId,ownerId:userId,name:member.workspaceName,slug:workspaceId},{id:foreignWorkspace,ownerId:other,name:'Foreign history fixture',slug:foreignWorkspace}]);await d.db.insert(d.workspaceMembers).values([{workspaceId,userId,role:'owner'},{workspaceId,userId:other,role:'editor'},{workspaceId:foreignWorkspace,userId:other,role:'owner'}])
  await d.db.insert(d.apps).values([{id:appId,workspaceId,name:'Проверка журнала',slug:appId,draft:{}},{id:secondId,workspaceId,name:'Другое приложение',slug:secondId,draft:{}}]);await d.db.insert(d.appUsers).values([{id:appUser,appId,email:emailA,name:'Анна'},{id:appUserB,appId,email:emailB,name:null},{id:foreignUser,appId:secondId,email:'other@example.invalid'}])
  const at=new Date('2026-11-04T00:00:00Z'),base={workspaceId,appId,workflowId:'save',workflowName:'Сохранить проект',eventNodeId:'button',definitionRevision:'a'.repeat(64),trace:[]}
  await d.db.insert(d.appWorkflowRuns).values(Array.from({length:12},(_,index)=>({id:`run_history_${String(index).padStart(2,'0')}`, ...base,userId:index%2?appUser:appUserB,requestId:`button_${index}`,status:index===11?'failed' as const:'succeeded' as const,error:index===11?'Проверка не пройдена':null,trace:index===11?[{stepId:'save',label:'Изменить запись',status:'rolled_back'},{stepId:'check',label:'Проверить условие',status:'failed'}]:[],createdAt:at})))
  await d.db.insert(d.appWorkflowRuns).values({id:newId('run'),...base,appId:secondId,userId:foreignUser,requestId:'foreign',workflowName:'Чужой запуск',status:'succeeded'})
  await d.db.insert(d.builderWorkflowRuns).values([{id:newId('run'),...base,userId,requestId:'own',status:'succeeded'},{id:newId('run'),...base,userId:other,requestId:'colleague',workflowName:'Проверка коллеги',status:'succeeded'}])
 })
 beforeEach(()=>{identity.member=member;vi.unstubAllEnvs()})
 afterAll(async()=>{vi.unstubAllEnvs();if(!d)return;await d.db.delete(d.workspaces).where(inArray(d.workspaces.id,[workspaceId,foreignWorkspace]));await d.db.delete(d.users).where(inArray(d.users.id,[userId,other]));await d.sql.end()})
 it('shows all end users of this app, the failed steps and stable pages with equal timestamps',async()=>{
  const first=await history.readBuilderV2WorkflowRunsAction(appId,undefined,'published');if(!first.ok||!first.next)throw new Error('Expected page')
  expect(first.runs).toHaveLength(10);expect(first.runs[0]).toMatchObject({status:'failed',error:'Проверка не пройдена',actor:{email:emailA,name:'Анна'},trace:[{status:'rolled_back'},{status:'failed'}]});expect(new Set(first.runs.map(run=>run.actor?.email)).size).toBe(2)
  const second=await history.readBuilderV2WorkflowRunsAction(appId,first.next,'published');if(!second.ok)throw new Error(second.error);expect(second.runs).toHaveLength(2);expect(second.next).toBeNull();expect(new Set([...first.runs,...second.runs].map(run=>run.id)).size).toBe(12);expect(JSON.stringify(first)).not.toContain('Чужой запуск')
  const own=await history.readBuilderV2WorkflowRunsAction(appId);expect(own).toMatchObject({ok:true,runs:[{workflowName:'Сохранить проект'}]});if(own.ok){expect(own.runs).toHaveLength(1);expect(own.runs[0]).not.toHaveProperty('actor')}
 })
 it('binds cursors to app, source and author and refuses forged inputs',async()=>{
  const first=await history.readBuilderV2WorkflowRunsAction(appId,undefined,'published');if(!first.ok)throw new Error('No page')
  expect(await history.readBuilderV2WorkflowRunsAction(appId,first.next,'author')).toMatchObject({ok:false,reset:true});expect(await history.readBuilderV2WorkflowRunsAction(secondId,first.next,'published')).toMatchObject({ok:false,reset:true})
  identity.member={...member,userId:other,role:'editor'};expect(await history.readBuilderV2WorkflowRunsAction(appId,first.next,'published')).toMatchObject({ok:false,reset:true});expect(await history.readBuilderV2WorkflowRunsAction(appId,undefined,'published')).toMatchObject({ok:true})
  for(const before of[{at:'2026-11-04',id:'run_history_11'},'not-a-valid-cursor'])expect(await history.readBuilderV2WorkflowRunsAction(appId,before,'published')).toMatchObject({ok:false,reset:true})
  expect(await history.readBuilderV2WorkflowRunsAction(appId,undefined,'all' as never)).toMatchObject({ok:false})
 })
 it('requires full editor access and never accepts an app-only identity as an author',async()=>{
  identity.member=null;expect(await history.readBuilderV2WorkflowRunsAction(appId,undefined,'published')).toMatchObject({ok:false})
  identity.member={...member,role:'viewer'};expect(await history.readBuilderV2WorkflowRunsAction(appId,undefined,'published')).toMatchObject({ok:false})
  identity.member={...member,role:'editor',tableAccess:{}};expect(await history.readBuilderV2WorkflowRunsAction(appId,undefined,'published')).toMatchObject({ok:false})
  identity.member={...member,workspaceId:foreignWorkspace};expect(await history.readBuilderV2WorkflowRunsAction(appId,undefined,'published')).toMatchObject({ok:false})
  identity.member=member;vi.stubEnv('NODE_ENV','production');vi.stubEnv('TABLEAPP_BUILDER_V2','0');expect(await history.readBuilderV2WorkflowRunsAction(appId,undefined,'published')).toMatchObject({ok:false})
 })
})
