import {rows} from '@tableapp/db'
import {emptyValue,fieldTimeZone,isComputed} from '@tableapp/schema'
import {authorizeAppV2Write,canInvokeAppV2Workflow,readableAppV2Fields,resolveAppV2Binding,type AppV2Context,type AppV2Json} from '@tableapp/schema/app-v2'
import {and,asc,eq,gt,isNull} from 'drizzle-orm'
import {builderV2SaveFormAction} from './builder-v2-form-action'
import {BUILDER_V2_FORM_TYPES,builderV2FormInputs,type BuilderV2FormRequest,type BuilderV2FormState} from './builder-v2-form-types'
import {builderV2Revision} from './builder-v2-revision'
import {publishedV2Screen,type publishedV2Context} from './builder-v2-published'
import {publishedV2Node,publishedV2ReadSql,publishedV2DataRevision} from './builder-v2-published-data'
import {derivePublishedV2Rows,publishedV2Row} from './builder-v2-published-rows'
import {builderV2WorkflowValues} from './builder-v2-workflow-values'
import {builderV2Json,loadBuilderV2ReadMetadata} from './builder-v2-row-data'
import {historyCursor,readHistoryCursor} from './history-cursor'
import {withInitialValues} from './initial-values'
import {formatCell} from './format'
import {RowWriteError} from './row-mutations'
import type {Transaction} from './db-transaction'
import type {RuntimeSourceRow} from './runtime-project'

export async function inspectPublishedV2Form(current:Awaited<ReturnType<typeof publishedV2Context>>,tx:Transaction,request:BuilderV2FormRequest){
  const {app,actor,revision}=current,screen=publishedV2Screen(app,actor,request.screenId),form=app.nodes.find(node=>node.id===request.formId)
  if(!actor.authenticated||form?.type!=='form')throw new RowWriteError('denied','Для сохранения формы нужно войти с разрешённой почтой')
  const action=builderV2SaveFormAction(app,form)
  if(!action||!canInvokeAppV2Workflow(app,actor,action.flow.id)||form.mode==='edit'&&screen.contextTableId!==form.tableId)throw new RowWriteError('denied','Сохранение формы недоступно')
  if(Boolean(screen.contextTableId)!==Boolean(request.recordId))throw new RowWriteError('denied','Запись недоступна')
  const meta=await loadBuilderV2ReadMetadata(tx,app.workspaceId,[form.tableId,...(screen.contextTableId?[screen.contextTableId]:[])]),selected=screen.contextTableId?await publishedV2Row(meta,app,actor,screen.contextTableId,request.recordId):undefined
  publishedV2Node(app,actor,screen.id,form.id,selected?.record)
  const values=Object.fromEntries(Object.keys(action.step.values).map(id=>[id,null])),permission=authorizeAppV2Write(app,actor,form.mode==='edit'&&selected?{operation:'update',row:{...selected.record,values:selected.stored.data as Record<string,AppV2Json>},values}:{operation:'create',tableId:form.tableId,values})
  if(!permission.ok)throw new RowWriteError('denied',permission.error)
  const inputs=builderV2FormInputs(app,form),fields=inputs.map(input=>meta.fieldsByTable.get(form.tableId)?.find(field=>field.id===input.fieldId)!)
  if(!inputs.length||fields.some(field=>!field||isComputed(field.type)||!BUILDER_V2_FORM_TYPES.includes(field.type)))throw new RowWriteError('invalid','Настройки формы требуют проверки владельцем')
  // Absent stored keys are empty values, not denials: only policy-readable fields may seed an edit form.
  if(form.mode==='edit'){
    const readable=readableAppV2Fields(app,actor,{id:selected!.record.id,tableId:selected!.record.tableId,values:selected!.stored.data as Record<string,AppV2Json>})
    if(fields.some(field=>!readable.has(field.id)))throw new RowWriteError('denied','Одно из полей формы недоступно для чтения')
  }
  const context:AppV2Context={actor,row:selected?.record,screenRow:selected?.record},initial:Record<string,unknown>={}
  for(const input of inputs){
    const field=fields.find(field=>field.id===input.fieldId)!
    if(input.initialValue){
      const value=resolveAppV2Binding(input.initialValue,context)
      if(!value.ok)throw new RowWriteError('denied','Начальное значение поля недоступно')
      initial[field.id]=value.value
    }else if(form.mode==='edit')initial[field.id]=selected?.record.values[field.id]??emptyValue(field.type)
    else initial[field.id]=emptyValue(field.type)
  }
  const now=new Date(),defaults=await withInitialValues(fields,initial,async(tableId,rowId,fieldId)=>{const loaded=await publishedV2Row(meta,app,actor,tableId,rowId);const value=loaded.record.values[fieldId];return typeof value==='number'?value:undefined},{creating:form.mode==='create',now})
  const fingerprint=builderV2Revision([revision,actor,screen.id,form,inputs,fields,selected?.stored.version??null,request.recordId??null])
  if(request.mode==='options'){
    const input=inputs.find(input=>input.fieldId===request.fieldId),field=fields.find(field=>field.id===request.fieldId)
    if(!input||input.readOnly||field?.type!=='relation')throw new RowWriteError('denied','Выбор записей недоступен')
    const target=field.options.tableId,primary=meta.primaryByTable.get(target),search=request.search.trim().toLocaleLowerCase('ru-RU'),binding=builderV2Revision([fingerprint,field.id,search,await publishedV2DataRevision(meta,app,actor)]),cursor=readHistoryCursor(request.after,binding) as {lastId?:unknown}|null
    if(cursor&&typeof cursor.lastId!=='string')throw new RowWriteError('conflict','Обновите список')
    const options:{id:string;label:string}[]=[];let lastId=cursor?.lastId as string|undefined
    while(options.length<31){const batch=await tx.select().from(rows).where(and(eq(rows.tableId,target),isNull(rows.deletedAt),publishedV2ReadSql(app,actor,target),lastId?gt(rows.id,lastId):undefined)).orderBy(asc(rows.id)).limit(100);if(!batch.length)break;for(const row of await derivePublishedV2Rows(meta,app,actor,batch as RuntimeSourceRow[])){lastId=row.id;const label=primary?row.display[primary]??'Запись':'Запись';if(!search||label.toLocaleLowerCase('ru-RU').includes(search))options.push({id:row.id,label:label||'Без названия'});if(options.length===31)break}if(batch.length<100)break;lastId=options.length<31?batch.at(-1)!.id:lastId}
    return {ok:true as const,options:options.slice(0,30),next:options.length>30?historyCursor({lastId:options[29]!.id},binding):null}
  }
  if(request.mode==='check'&&request.fingerprint!==fingerprint)return {ok:false as const,stale:true,error:'Настройки формы или запись изменились. Обновите форму.'}
  if(request.mode==='check'&&Object.keys(request.values).some(id=>!inputs.some(input=>input.fieldId===id&&!input.readOnly)))throw new RowWriteError('denied','Форма содержит недоступное поле')
  const parsed={...defaults,...(request.mode==='check'?request.values:{})},errors:Record<string,string>={},labels:Record<string,string>={}
  for(const input of inputs){const field=fields.find(field=>field.id===input.fieldId)!;try{const values=await builderV2WorkflowValues(meta,form.tableId,{[field.id]:parsed[field.id] as AppV2Json},{app,actor});parsed[field.id]=values[field.id];const value=values[field.id];if(request.mode==='check'&&input.required&&(value===null||typeof value==='string'&&!value.trim()||Array.isArray(value)&&!value.length||field.type==='checkbox'&&value!==true))errors[input.id]=`Заполните поле «${input.label||field.name}»`;if(field.type==='relation'){const ids=Array.isArray(value)?value as string[]:[],primary=meta.primaryByTable.get(field.options.tableId),names=[];for(const id of ids){const related=await publishedV2Row(meta,app,actor,field.options.tableId,id);names.push(primary?related.record.display[primary]??'Запись':'Запись')}labels[field.id]=names.join(', ')}else labels[field.id]=formatCell(field,value)}catch(error){errors[input.id]=error instanceof RowWriteError?error.message:'Проверьте значение поля'}}
  if(Object.keys(errors).length)return {ok:false as const,error:'Проверьте отмеченные поля',errors}
  const state:BuilderV2FormState&{revision:string}={values:builderV2Json(parsed) as Record<string,AppV2Json>,labels,fingerprint,revision,fields:inputs.map(input=>{const field=fields.find(field=>field.id===input.fieldId)!;return {nodeId:input.id,fieldId:field.id,label:input.label||field.name,type:field.type,required:input.required,readOnly:Boolean(input.readOnly),supported:true,...('choices'in field.options?{choices:field.options.choices}:{}),...(field.type==='relation'?{allowMultiple:field.options.allowMultiple}:{}), ...(field.type==='image'||field.type==='attachment'?{maxCount:field.options.maxCount}:{}),...(field.type==='date'||field.type==='datetime'?{timeZone:fieldTimeZone(field)}:{})}})}
  return {ok:true as const,state}
}
