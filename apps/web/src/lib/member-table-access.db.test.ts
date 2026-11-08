import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { and,eq,inArray } from 'drizzle-orm'
import { afterAll,beforeAll,beforeEach,describe,expect,it,vi } from 'vitest'
import { defaultViewConfig,newId } from '@tableapp/schema'
import type { Member } from './session'
const env=resolve(import.meta.dirname,'../../../../.env')
if(!process.env.DATABASE_URL&&existsSync(env))process.loadEnvFile(env)
const identity=vi.hoisted(()=>({member:null as Member|null,mail:vi.fn(async()=>({delivered:true as const})),file:vi.fn()}))
vi.mock('@/lib/session',async original=>({...await original<typeof import('./session')>(),currentMember:async()=>identity.member,requireMember:async()=>identity.member!}))
vi.mock('@/lib/mailer',()=>({sendMagicLink:identity.mail}))
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}))
vi.mock('next/headers',()=>({headers:async()=>new Headers({host:'localhost:3101'})}))
vi.mock('@/lib/storage',()=>({getFile:identity.file}))

describe.skipIf(!process.env.DATABASE_URL)('member table permissions against Postgres',()=>{
  let data:typeof import('@tableapp/db')
  const ids={owner:newId('user'),staff:newId('user'),viewer:newId('user'),workspace:newId('workspace'),foreign:newId('workspace'),edit:newId('table'),read:newId('table'),secret:newId('table'),other:newId('table'),name:newId('field'),secretName:newId('field'),link:newId('field'),lookup:newId('field'),formula:newId('field'),file:newId('field'),row:newId('row'),secretRow:newId('row')}
  const prefix=`table-acl-${Date.now()}-${ids.workspace.slice(-5)}`
  const defaultAccess=()=>({[ids.edit]:'edit',[ids.read]:'view',[ids.secret]:'none'} as const)
  const addedUsers:string[]=[]
  async function login(who:'owner'|'staff'|'viewer'){
    const [membership]=await data.db.select().from(data.workspaceMembers).where(and(eq(data.workspaceMembers.workspaceId,ids.workspace),eq(data.workspaceMembers.userId,ids[who])))
    identity.member={userId:ids[who],workspaceId:ids.workspace,workspaceName:'ACL test',email:`${prefix}-${who}@example.invalid`,name:who,role:membership!.role as Member['role'],tableAccess:membership!.tableAccess}
  }
  beforeAll(async()=>{
    data=await import('@tableapp/db')
    await data.db.insert(data.users).values(['owner','staff','viewer'].map(who=>({id:ids[who as 'owner'],email:`${prefix}-${who}@example.invalid`})))
    await data.db.insert(data.workspaces).values([{id:ids.workspace,ownerId:ids.owner,name:'ACL test',slug:prefix},{id:ids.foreign,ownerId:ids.owner,name:'Other test',slug:`${prefix}-other`}])
    await data.db.insert(data.workspaceMembers).values([{workspaceId:ids.workspace,userId:ids.owner,role:'owner'},{workspaceId:ids.workspace,userId:ids.staff,role:'editor'},{workspaceId:ids.workspace,userId:ids.viewer,role:'viewer'}])
    await data.db.insert(data.tables).values([{id:ids.edit,workspaceId:ids.workspace,name:'Товары',position:'a0',primaryFieldId:ids.name},{id:ids.read,workspaceId:ids.workspace,name:'Клиенты',position:'a1'},{id:ids.secret,workspaceId:ids.workspace,name:'SECRET_TABLE',position:'a2',primaryFieldId:ids.secretName},{id:ids.other,workspaceId:ids.foreign,name:'FOREIGN_TABLE',position:'a0'}])
    await data.db.insert(data.fields).values([{id:ids.name,tableId:ids.edit,name:'Название',type:'text',position:'a0'},{id:ids.link,tableId:ids.edit,name:'Финансы',type:'relation',options:{tableId:ids.secret},position:'a1'},{id:ids.lookup,tableId:ids.edit,name:'Подстановка',type:'lookup',options:{relationFieldId:ids.link,targetFieldId:ids.secretName},position:'a2'},{id:ids.formula,tableId:ids.edit,name:'Расчёт',type:'formula',options:{expression:'CONCAT({Подстановка}, "!")'},position:'a3'},{id:ids.file,tableId:ids.edit,name:'Файл',type:'attachment',options:{},position:'a4'},{id:ids.secretName,tableId:ids.secret,name:'Контакт',type:'text',position:'a0'}])
    await data.db.insert(data.views).values({id:newId('view'),tableId:ids.edit,name:'Все товары',type:'grid',position:'a0',config:defaultViewConfig('grid','filter')})
    await data.db.insert(data.rows).values([{id:ids.row,tableId:ids.edit,position:'a0',data:{}},{id:ids.secretRow,tableId:ids.secret,position:'a0',data:{[ids.secretName]:'PRIVATE_VALUE'}}])
  })
  beforeEach(async()=>{
    identity.mail.mockClear();identity.file.mockReset()
    identity.file.mockResolvedValue({mime:'text/plain',body:new ReadableStream({start(controller){controller.enqueue(Buffer.from('file'));controller.close()}})})
    await data.db.update(data.workspaceMembers).set({role:'editor',tableAccess:defaultAccess()}).where(and(eq(data.workspaceMembers.workspaceId,ids.workspace),eq(data.workspaceMembers.userId,ids.staff)))
    await data.db.update(data.workspaceMembers).set({role:'viewer',tableAccess:null}).where(and(eq(data.workspaceMembers.workspaceId,ids.workspace),eq(data.workspaceMembers.userId,ids.viewer)))
    await data.db.update(data.rows).set({data:{[ids.name]:'Товар',[ids.link]:[ids.secretRow]},version:0}).where(eq(data.rows.id,ids.row))
    await data.db.delete(data.rowChanges).where(eq(data.rowChanges.tableId,ids.edit))
    await data.db.delete(data.attachments).where(eq(data.attachments.workspaceId,ids.workspace))
    await login('staff')
  })
  afterAll(async()=>{
    if(!data)return
    await data.db.delete(data.authTokens).where(eq(data.authTokens.email,`${prefix}-invited@example.invalid`))
    await data.db.delete(data.workspaces).where(inArray(data.workspaces.id,[ids.workspace,ids.foreign]))
    await data.db.delete(data.users).where(inArray(data.users.id,[ids.owner,ids.staff,ids.viewer,...addedUsers]))
    await data.sql.end()
  })
  const save=async(tableId:string,fieldId=ids.name,value='Изменено')=>(await import('@/app/table-editor-actions')).saveTableRowsAction(tableId,[{id:ids.row,data:{[fieldId]:value},base:{[fieldId]:'Товар'}}])
  const sync=async(tableId=ids.edit,mutations:unknown[]=[],since?:string)=>(await import('@/app/api/sync/route')).POST(new Request('http://localhost/api/sync',{method:'POST',body:JSON.stringify({tableId,deviceId:'acl-device',mutations,since})}))
  it('distinguishes edit, view, hidden and foreign tables on every action',async()=>{
    const {authorizeTable}=await import('./authorize')
    expect((await authorizeTable(ids.edit)).ok).toBe(true)
    expect((await authorizeTable(ids.read,false)).ok).toBe(true)
    for(const [id,write]of [[ids.read,true],[ids.secret,false],[ids.other,false]] as const)expect((await authorizeTable(id,write)).ok).toBe(false)
    expect((await save(ids.edit)).ok).toBe(true)
    expect((await save(ids.secret)).ok).toBe(false)
  })
  it('filters directory, navigation, related records and computed values',async()=>{
    const loaded=await (await import('./queries')).loadTable(ids.edit,ids.workspace,identity.member!)
    expect(loaded!.fields.map(field=>field.id)).toEqual([ids.name,ids.file])
    expect(JSON.stringify(loaded)).not.toMatch(/PRIVATE_VALUE|SECRET_TABLE/)
    expect(loaded!.rows[0]!.data).not.toHaveProperty(ids.link)
    const directory=await (await import('./table-directory-data')).loadTableDirectory(ids.workspace,identity.member!)
    expect(directory.map(table=>table.id)).toEqual([ids.edit,ids.read])
    expect(directory[0]!.access).toBe('edit')
    const navigation=await (await import('./business-navigation')).loadBusinessNavigation()
    expect(JSON.stringify(navigation)).not.toMatch(/SECRET_TABLE|FOREIGN_TABLE/)
    expect(navigation[0]!.tableLimited).toBe(true)
  })
  it('rejects a row write after permission was revoked inside the request',async()=>{
    await data.db.update(data.workspaceMembers).set({tableAccess:{[ids.edit]:'view'}}).where(eq(data.workspaceMembers.userId,ids.staff))
    expect((await save(ids.edit)).ok).toBe(false)
    expect((await data.db.select().from(data.rows).where(eq(data.rows.id,ids.row)))[0]!.data).toHaveProperty(ids.name,'Товар')
  })
  it('blocks direct hidden-relation edits even on an editable table',async()=>{
    expect((await save(ids.edit,ids.link,'guess')).ok).toBe(false)
    const {createFieldAction}=await import('@/app/field-actions')
    expect((await createFieldAction(ids.edit,{name:'Новая связь',type:'relation',options:{tableId:ids.secret}})).ok).toBe(false)
  })
  it('projects sync data and refuses read-only or hidden-table mutations',async()=>{
    const page=await (await sync()).json()
    expect(page.rows[0].data).toEqual({[ids.name]:'Товар'})
    const readonly=await (await sync(ids.read,[{id:newId('change'),rowId:ids.row,op:'update',fieldId:ids.name,base:'Товар',next:'Нельзя'}])).json()
    expect(readonly.applied).toHaveLength(0)
    expect((await sync(ids.secret)).status).toBe(403)
  })
  it('resets a sync snapshot when table access changes and blocks after revocation',async()=>{
    const first=await (await sync()).json()
    await data.db.update(data.workspaceMembers).set({tableAccess:{...defaultAccess(),[ids.secret]:'view'}}).where(eq(data.workspaceMembers.userId,ids.staff))
    await login('staff')
    const second=await (await sync(ids.edit,[],first.cursor)).json()
    expect(second.reset).toBe(true)
    await data.db.update(data.workspaceMembers).set({tableAccess:{}}).where(eq(data.workspaceMembers.userId,ids.staff));await login('staff')
    expect((await sync()).status).toBe(403)
  })
  it('redacts history values and denies hidden-table history',async()=>{
    await data.db.insert(data.rowChanges).values({id:newId('change'),tableId:ids.edit,rowId:ids.row,op:'update',before:{[ids.name]:'До',[ids.lookup]:'PRIVATE_VALUE'},after:{[ids.name]:'После',[ids.lookup]:'PRIVATE_VALUE'}})
    const {loadTableHistoryAction}=await import('@/app/history-actions')
    const result=await loadTableHistoryAction(ids.edit)
    expect(result.ok).toBe(true);expect(JSON.stringify(result)).not.toContain('PRIVATE_VALUE')
    expect((await loadTableHistoryAction(ids.secret)).ok).toBe(false)
  })
  it('exports visible data only and refuses hidden-table export',async()=>{
    const {GET}=await import('@/app/t/[tableId]/export/route')
    const response=await GET(new Request('http://localhost/export?format=csv'),{params:Promise.resolve({tableId:ids.edit})})
    expect(response.status).toBe(200);expect(await response.text()).not.toMatch(/PRIVATE_VALUE|Финансы|Подстановка/)
    expect((await GET(new Request('http://localhost/export'),{params:Promise.resolve({tableId:ids.secret})})).status).toBe(404)
  })
  it('denies hidden files and stealing another uploader’s unbound object',async()=>{
    const hiddenKey=`${ids.workspace}/hidden.txt`,pendingKey=`${ids.workspace}/pending.txt`
    await data.db.insert(data.attachments).values([{id:newId('attachment'),key:hiddenKey,workspaceId:ids.workspace,uploadedBy:ids.owner,name:'Секрет.txt',mime:'text/plain',size:4,state:'ready',tableId:ids.secret,rowId:ids.secretRow,fieldId:ids.secretName},{id:newId('attachment'),key:pendingKey,workspaceId:ids.workspace,uploadedBy:ids.owner,name:'Pending.txt',mime:'text/plain',size:4,state:'ready'}])
    const {GET}=await import('@/app/api/files/[...key]/route')
    for(const key of [hiddenKey,pendingKey])expect((await GET(new Request(`http://localhost/api/files/${key}`),{params:Promise.resolve({key:key.split('/')})})).status).toBe(403)
    expect(identity.file).not.toHaveBeenCalled()
    const value=[{id:'claimed',key:pendingKey,name:'Pending.txt',mime:'text/plain',size:4,width:null,height:null}]
    const {saveTableRowsAction}=await import('@/app/table-editor-actions')
    expect((await saveTableRowsAction(ids.edit,[{id:ids.row,data:{[ids.file]:value},base:{[ids.file]:null}}])).ok).toBe(false)
  })
  it('lets only the owner grant table permissions and rejects foreign IDs and elevation',async()=>{
    const {setMemberTableAccessAction}=await import('@/app/team-actions')
    expect((await setMemberTableAccessAction(ids.viewer,{[ids.edit]:'view'})).ok).toBe(false)
    await login('owner')
    expect((await setMemberTableAccessAction(ids.staff,{[ids.other]:'edit'})).ok).toBe(false)
    expect((await setMemberTableAccessAction(ids.viewer,{[ids.edit]:'edit'})).ok).toBe(false)
    expect((await setMemberTableAccessAction(ids.owner,{})).ok).toBe(false)
    expect(await setMemberTableAccessAction(ids.staff,{[ids.read]:'view'})).toEqual({ok:true})
    await login('staff');expect((await (await import('./authorize')).authorizeTable(ids.edit,false)).ok).toBe(false)
  })
  it('keeps unrestricted existing memberships and can restore the role default',async()=>{
    await login('owner')
    const {setMemberTableAccessAction}=await import('@/app/team-actions')
    expect(await setMemberTableAccessAction(ids.staff,null)).toEqual({ok:true})
    await login('staff')
    expect((await (await import('./authorize')).authorizeTable(ids.secret)).ok).toBe(true)
  })
  it('persists the selected tables before an invitation would be delivered',async()=>{
    await login('owner')
    const email=`${prefix}-invited@example.invalid`
    identity.mail.mockImplementationOnce(async()=>{
      const [user]=await data.db.select().from(data.users).where(eq(data.users.email,email))
      const [membership]=await data.db.select().from(data.workspaceMembers).where(eq(data.workspaceMembers.userId,user!.id))
      expect(membership!.tableAccess).toEqual({[ids.read]:'view'})
      return {delivered:true}
    })
    const {inviteMemberAction}=await import('@/app/team-actions')
    expect((await inviteMemberAction(email,'editor',{[ids.read]:'view'})).ok).toBe(true)
    const [user]=await data.db.select().from(data.users).where(eq(data.users.email,email));addedUsers.push(user!.id)
    const [membership]=await data.db.select().from(data.workspaceMembers).where(eq(data.workspaceMembers.userId,user!.id))
    expect(membership!.tableAccess).toEqual({[ids.read]:'view'});expect(identity.mail).toHaveBeenCalledOnce()
  })
})
