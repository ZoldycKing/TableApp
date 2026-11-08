import {attachments} from '@tableapp/db'
import type {Field} from '@tableapp/schema'
import {inArray} from 'drizzle-orm'
import {isInlineImage} from './file-policy'
import {RowWriteError} from './row-mutations'
import type {Transaction} from './db-transaction'

/** Client MIME and count claims cannot turn a document into an image. Ownership and binding are checked by row mutations. */
export async function validateBuilderV2Attachments(field:Field,value:unknown,tx:Transaction){
  if(field.type!=='image'&&field.type!=='attachment')return
  const items=Array.isArray(value)?value as {key:string}[]:[]
  if(items.length>field.options.maxCount)throw new RowWriteError('invalid',`В поле «${field.name}» можно добавить не больше ${field.options.maxCount} файлов`)
  const keys=items.map(item=>item.key)
  if(new Set(keys).size!==keys.length)throw new RowWriteError('invalid','Один файл добавлен несколько раз')
  if(field.type==='image'&&keys.length){
    const found=await tx.select({mime:attachments.mime}).from(attachments).where(inArray(attachments.key,keys))
    if(found.length!==keys.length||found.some(file=>!isInlineImage(file.mime)))throw new RowWriteError('invalid','Для фотографий выберите PNG, JPEG, WebP или GIF')
  }
}
