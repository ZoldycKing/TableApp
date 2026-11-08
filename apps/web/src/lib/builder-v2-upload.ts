import {authorizeApp} from './authorize'
import {builderV2Enabled} from './builder-v2'
import {inspectWorkingBuilderV2Form} from './builder-v2-submit'
import {inspectPublishedV2Form} from './builder-v2-published-form'
import {publishedV2Context,withPublishedV2Read} from './builder-v2-published'
import {RowWriteError} from './row-mutations'
import type {BuilderV2UploadContext} from './builder-v2-upload-types'
import type {BuilderV2FormField,BuilderV2FormState} from './builder-v2-form-types'

export async function authorizeBuilderV2Upload(context:BuilderV2UploadContext){
  if(!builderV2Enabled())throw new RowWriteError('denied','Загрузка файлов пока недоступна')
  let state:BuilderV2FormState&{revision?:string},workspaceId:string,uploadedBy:string,origin:'manual'|'runtime'
  if(context.kind==='published'){
    const authorized=await withPublishedV2Read(async tx=>{
      const current=await publishedV2Context(context.slug,tx)
      if(current.revision!==context.revision)throw new RowWriteError('conflict','Приложение обновлено. Обновите форму.')
      const result=await inspectPublishedV2Form(current,tx,{...context,mode:'initial'})
      if(!result.ok||!('state'in result)||!result.state||!current.actor.id)throw new RowWriteError('denied','Загрузка файлов недоступна')
      return {state:result.state,workspaceId:current.app.workspaceId,uploadedBy:current.actor.id}
    })
    ;({state,workspaceId,uploadedBy}=authorized);origin='runtime'
  }else{
    const auth=await authorizeApp(context.appId)
    if(!auth.ok)throw new RowWriteError('denied',auth.error)
    const result=await inspectWorkingBuilderV2Form(context.appId,auth.member,{...context,mode:'initial'})
    if(!result.ok||!('state'in result))throw new RowWriteError('denied','Загрузка файлов недоступна')
    state=result.state;workspaceId=auth.member.workspaceId;uploadedBy=auth.member.userId;origin='manual'
  }
  if(state.revision!==context.revision||state.fingerprint!==context.fingerprint)throw new RowWriteError('conflict','Настройки формы или запись изменились. Обновите форму.')
  const field:BuilderV2FormField|undefined=state.fields.find(field=>field.fieldId===context.fieldId)
  if(!field||field.readOnly||!field.supported||!['image','attachment'].includes(field.type))throw new RowWriteError('denied','В это поле нельзя загрузить файл')
  return {workspaceId,uploadedBy,origin,field}
}
