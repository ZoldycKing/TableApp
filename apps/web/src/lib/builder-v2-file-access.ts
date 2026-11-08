import {rows,fields} from '@tableapp/db'
import {and,eq,isNull} from 'drizzle-orm'
import {canOpenAppV2Screen,readableAppV2Fields,type AppV2Json} from '@tableapp/schema/app-v2'
import {publishedV2Context,withPublishedV2Read} from './builder-v2-published'

type FileRecord={key:string;workspaceId:string;tableId:string|null;rowId:string|null;fieldId:string|null;conversationId:string|null;messageId:string|null;state:string}
/** Stored file keys are identifiers, never authorization. Use the published app's current row and field grants. */
export async function canReadBuilderV2File(slug:string,file:FileRecord):Promise<boolean>{
  if(!file.tableId||!file.rowId||!file.fieldId||file.conversationId||file.messageId||file.state!=='ready')return false
  try{return await withPublishedV2Read(async tx=>{
    const {app,actor}=await publishedV2Context(slug,tx)
    if(app.workspaceId!==file.workspaceId||!app.screens.some(screen=>canOpenAppV2Screen(app,actor,screen.id)))return false
    const [field]=await tx.select().from(fields).where(and(eq(fields.id,file.fieldId!),eq(fields.tableId,file.tableId!)))
    if(!field||!['image','attachment'].includes(field.type))return false
    const [row]=await tx.select().from(rows).where(and(eq(rows.id,file.rowId!),eq(rows.tableId,file.tableId!),isNull(rows.deletedAt)))
    if(!row||!readableAppV2Fields(app,actor,{id:row.id,tableId:row.tableId,values:row.data as Record<string,AppV2Json>}).has(file.fieldId!))return false
    const value=(row.data as Record<string,unknown>)[file.fieldId!]
    return Array.isArray(value)&&value.some(item=>item&&typeof item==='object'&&'key'in item&&item.key===file.key)
  })}catch{return false}
}
