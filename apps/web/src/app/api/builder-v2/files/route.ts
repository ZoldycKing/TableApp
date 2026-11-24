import {NextResponse} from 'next/server'
import {builderV2UploadSchema} from '@/lib/builder-v2-upload-types'
import {authorizeBuilderV2Upload} from '@/lib/builder-v2-upload'
import {imageMime,MAX_FILE_BYTES,MAX_FILE_MB,SOURCE_IMAGE_MIME,validateFileContent,validateFileMetadata} from '@/lib/file-policy'
import {storeAttachment} from '@/lib/file-upload'
import {RowWriteError} from '@/lib/row-mutations'
import {isPlanLimitError} from '@/lib/limits'
import {explainToCustomer} from '@tableapp/schema'

export async function POST(request:Request){
  const fail=(error:string,status:number)=>NextResponse.json({ok:false,error},{status,headers:{'Cache-Control':'private, no-store'}})
  if(Number(request.headers.get('content-length'))>MAX_FILE_BYTES+65536)return fail(`Файл больше ${MAX_FILE_MB} МБ`,413)
  let body:FormData
  try{body=await request.formData()}catch{return fail('Не удалось прочитать файл',400)}
  const file=body.get('file'),raw=body.get('context')
  if(!(file instanceof File)||typeof raw!=='string'||raw.length>4000)return fail('Проверьте файл и форму',400)
  let context:ReturnType<typeof builderV2UploadSchema.parse>
  try{context=builderV2UploadSchema.parse(JSON.parse(raw))}catch{return fail('Обновите форму перед загрузкой',400)}
  try{
    const access=await authorizeBuilderV2Upload(context),metadataError=validateFileMetadata(file)
    if(metadataError)return fail(metadataError,400)
    const bytes=new Uint8Array(await file.arrayBuffer()),contentError=validateFileContent({name:file.name,type:file.type,bytes})
    if(contentError)return fail(contentError,400)
    if(access.field.type==='image'){
      const detected=imageMime(bytes)
      if(!detected||!SOURCE_IMAGE_MIME.has(detected))return fail('Для фотографий выберите PNG, JPEG, WebP, GIF или HEIC',400)
    }
    const attachment=await storeAttachment(access.workspaceId,access.uploadedBy,access.origin,{name:file.name,type:file.type,bytes})
    if(attachment.scanStatus==='infected')return fail('Файл заблокирован: обнаружена угроза. Выберите другой файл.',400)
    return NextResponse.json({ok:true,attachment},{headers:{'Cache-Control':'private, no-store'}})
  }catch(error){
    if(error instanceof RowWriteError)return fail(error.message,error.code==='conflict'?409:403)
    if(isPlanLimitError(error))return fail(context.kind==='published'?explainToCustomer():error.message,413)
    return fail('Не удалось загрузить файл. Повторите попытку.',503)
  }
}
