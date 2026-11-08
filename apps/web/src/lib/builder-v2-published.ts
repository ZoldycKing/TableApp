import {apps,appUsers,db} from '@tableapp/db'
import {newId} from '@tableapp/schema'
import {readAppDefinition,validateAppV2Definition} from '@tableapp/schema/app-definition'
import {canOpenAppV2Screen,type AppV2,type AppV2Actor} from '@tableapp/schema/app-v2'
import {and,eq} from 'drizzle-orm'
import {currentStaffEmail} from './app-session'
import {currentAccount} from './session'
import {builderV2Enabled,loadBuilderV2Catalog} from './builder-v2'
import {builderV2Revision} from './builder-v2-revision'
import {RowWriteError} from './row-mutations'
import type {Transaction} from './db-transaction'

export function publishedV2Roles(app:AppV2,email:string) {
  const normalized=email.trim().toLowerCase(),declared=app.authentication.members.find(member=>member.email.trim().toLowerCase()===normalized)
  return {roleIds:declared?.roleIds??(app.authentication.mode==='verified_email'&&app.authentication.defaultRoleId?[app.authentication.defaultRoleId]:[]),company:declared?.company??''}
}
export async function publishedV2Definition(slug:string,connection:Transaction|typeof db=db,lock=false) {
  if(!builderV2Enabled()||typeof slug!=='string'||!slug||slug.length>200)return null
  const query=connection.select().from(apps).where(eq(apps.slug,slug)),[record]=lock?await query.for('share'):await query
  const read=readAppDefinition(record?.published)
  if(!record||!read.ok||read.formatVersion!==2||read.app.id!==record.id||read.app.workspaceId!==record.workspaceId||read.app.slug!==record.slug)return null
  const catalog=await loadBuilderV2Catalog(record.workspaceId,connection),checked=validateAppV2Definition(read.app,catalog.catalog)
  if(!checked.ok)throw new RowWriteError('invalid','Настройки приложения требуют проверки владельцем')
  return {app:checked.app,revision:builderV2Revision(record.published),record,tables:catalog.tables,catalog:catalog.catalog}
}
export async function publishedV2Actor(app:AppV2,connection:Transaction|typeof db=db):Promise<AppV2Actor> {
  const staff=await currentStaffEmail(),account=staff?null:await currentAccount(),email=(staff??account?.email)?.trim().toLowerCase()
  const guest:AppV2Actor={authenticated:false,roleIds:[],email:null,name:null,company:null,id:null}
  if(!email)return guest
  const {roleIds,company}=publishedV2Roles(app,email)
  if(!roleIds.length)return guest
  let [user]=await connection.select().from(appUsers).where(and(eq(appUsers.appId,app.id),eq(appUsers.email,email)))
  if(!user){
    await connection.insert(appUsers).values({id:newId('appUser'),appId:app.id,email,name:account?.name??null}).onConflictDoNothing()
    ;[user]=await connection.select().from(appUsers).where(and(eq(appUsers.appId,app.id),eq(appUsers.email,email)))
  }
  if(!user)return guest
  return {authenticated:true,roleIds,id:user.id,email:user.email,name:user.name,company}
}
export async function publishedV2Context(slug:string,connection:Transaction|typeof db=db,lock=false) {
  const definition=await publishedV2Definition(slug,connection,lock)
  if(!definition)throw new RowWriteError('missing','Приложение недоступно')
  return {...definition,actor:await publishedV2Actor(definition.app,connection)}
}
export function publishedV2Screen(app:AppV2,actor:AppV2Actor,screenId:string) {
  const screen=app.screens.find(screen=>screen.id===screenId)
  if(!screen||!canOpenAppV2Screen(app,actor,screenId))throw new RowWriteError('denied','Этот экран недоступен')
  return screen
}

/** A simultaneous first visit can create the same app identity after our snapshot. */
export async function withPublishedV2Read<T>(read:(tx:Transaction)=>Promise<T>):Promise<T>{
  for(let attempt=0;;attempt++){
    try{return await db.transaction(read,{isolationLevel:'repeatable read'})}
    catch(error){
      let cause:unknown=error,serialization=false
      for(let depth=0;depth<5&&cause&&typeof cause==='object';depth++){
        if('code'in cause&&cause.code==='40001'){serialization=true;break}
        cause='cause'in cause?cause.cause:null
      }
      if(!serialization||attempt>=2)throw error
    }
  }
}
