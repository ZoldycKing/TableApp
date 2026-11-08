import {views} from '@tableapp/db'
import {evalFilter,fieldsOfFilter,indexFields,normalizeView} from '@tableapp/schema'
import {evaluateAppV2Condition,matchesAppV2Audience,type AppV2,type AppV2Actor,type AppV2Json,type AppV2Record} from '@tableapp/schema/app-v2'
import {and,eq} from 'drizzle-orm'
import {builderV2ActionContext} from './builder-v2-working-scope'
import {workingBuilderV2Record} from './builder-v2-working'
import {builderV2Json,deriveBuilderV2Rows,loadBuilderV2ReadMetadata} from './builder-v2-row-data'
import {builderV2CalculationPlan} from './builder-v2-read-plan'
import {canReadPublishedV2Row,derivePublishedV2Rows} from './builder-v2-published-rows'
import {RowWriteError,type StoredRow} from './row-mutations'
import type {Transaction} from './db-transaction'
import type {BuilderV2ButtonScope} from './builder-v2-button-types'
import type {RuntimeSourceRow} from './runtime-project'

/** Load and authorize both identities before looking up a receipt. Membership is rechecked for new runs. */
export async function loadBuilderV2ButtonSelection(tx:Transaction,app:AppV2,actor:AppV2Actor,scope:BuilderV2ButtonScope,published=false,lock=false){
  const context=builderV2ActionContext(app,scope.screenId,scope.nodeId)
  if(!context||Boolean(context.screenTableId)!==Boolean(scope.recordId)||Boolean(context.collection)!==Boolean(scope.itemId))throw new RowWriteError('denied','Откройте действие из нужной строки списка или карточки')
  if(context.path.some(node=>node.visibleTo&&!matchesAppV2Audience(node.visibleTo,actor)))throw new RowWriteError('denied','Действие недоступно')
  const wanted=[...(context.screenTableId?[{tableId:context.screenTableId,id:scope.recordId!}]:[]),...(context.source?[{tableId:context.source.tableId,id:scope.itemId!}]:[])].sort((a,b)=>a.tableId.localeCompare(b.tableId)||a.id.localeCompare(b.id)),found=new Map<string,StoredRow>()
  for(const value of wanted){const key=`${value.tableId}:${value.id}`;if(found.has(key))continue;const row=await workingBuilderV2Record(tx,value.tableId,value.id,lock,lock)
    if(published&&!canReadPublishedV2Row(app,actor,row as RuntimeSourceRow))throw new RowWriteError('denied','Запись недоступна')
    found.set(key,row)
  }
  const screenSelected=context.screenTableId?found.get(`${context.screenTableId}:${scope.recordId}`):undefined,selected=context.source?found.get(`${context.source.tableId}:${scope.itemId}`):screenSelected
  return {context,selected,screenSelected,published}
}

export async function verifyBuilderV2ButtonSelection(tx:Transaction,app:AppV2,actor:AppV2Actor,loaded:Awaited<ReturnType<typeof loadBuilderV2ButtonSelection>>){
  const {context,selected,screenSelected,published}=loaded
  if(selected?.deletedAt||screenSelected?.deletedAt)throw new RowWriteError('missing','Запись удалена или больше недоступна')
  const roots=[...new Map([selected,screenSelected].filter((row):row is StoredRow=>Boolean(row)).map(row=>[row.id,row])).values()]
  const meta=await loadBuilderV2ReadMetadata(tx,app.workspaceId,[...new Set(roots.map(row=>row.tableId))])
  const [viewRow]=context.source?.viewId?await tx.select().from(views).where(and(eq(views.id,context.source.viewId),eq(views.tableId,context.source.tableId))):[]
  if(context.source?.viewId&&!viewRow)throw new RowWriteError('missing','Представление списка недоступно')
  const view=viewRow?normalizeView(viewRow):null,needed=new Map<string,Set<string>>()
  const need=(id:string)=>{const field=meta.allFields.find(field=>field.id===id);if(field){const group=needed.get(field.tableId)??new Set<string>();group.add(id);needed.set(field.tableId,group)}}
  const scan=(value:unknown):void=>{if(!value||typeof value!=='object')return;const object=value as Record<string,unknown>;if(object.kind==='literal')return;if(typeof object.fieldId==='string')need(object.fieldId);Object.values(object).forEach(scan)}
  scan(context.path);scan(context.source?.filter);scan(app.workflows.find(flow=>{const node=context.path.at(-1)!;return flow.id===(node.type==='collection'?node.events.itemPress:node.type==='button'?node.events.press:null)})?.steps)
  fieldsOfFilter(view?.config.filter).forEach(need);for(const row of roots){const primary=meta.primaryByTable.get(row.tableId);if(primary)need(primary)}
  const derived=published?await derivePublishedV2Rows(meta,app,actor,roots as RuntimeSourceRow[]):await deriveBuilderV2Rows(meta,roots as RuntimeSourceRow[],builderV2CalculationPlan(meta.fieldsByTable,meta.primaryByTable,needed),Date.now())
  const record=(row?:StoredRow):AppV2Record|undefined=>{const own=derived.find(value=>value.id===row?.id);return own?{id:own.id,tableId:own.tableId,values:builderV2Json(own.data) as Record<string,AppV2Json>}:undefined}
  const item=record(selected),screenRow=record(screenSelected)
  let repeated=false
  for(const node of context.path.slice(0,-1)){
    if(node.visibleWhen){const show=evaluateAppV2Condition(node.visibleWhen,{actor,row:repeated?item:screenRow,screenRow});if(!show.ok||!show.value)throw new RowWriteError('denied','Действие недоступно для этой записи')}
    if(node.type==='collection')repeated=true
  }
  if(context.source){
    if(context.source.screenTableId&&context.source.screenTableId!==context.screenTableId)throw new RowWriteError('denied','Список недоступен в этой карточке')
    const values=item?.values??{}
    if(view&&!evalFilter(view.config.filter,values,indexFields(meta.fieldsByTable.get(context.source.tableId)??[])))throw new RowWriteError('conflict','Запись больше не входит в этот список')
    if(context.source.filter){const show=evaluateAppV2Condition(context.source.filter,{actor,row:item,screenRow});if(!show.ok||!show.value)throw new RowWriteError('conflict','Запись больше не входит в этот список')}
  }
  const button=context.path.at(-1)!;if(button.visibleWhen){const show=evaluateAppV2Condition(button.visibleWhen,{actor,row:context.event==='press'&&context.collection?item:screenRow,screenRow});if(!show.ok||!show.value)throw new RowWriteError('denied','Действие недоступно для этой записи')}
  const row=derived.find(row=>row.id===selected?.id),primary=selected?meta.primaryByTable.get(selected.tableId):null
  return {...loaded,record:item,screenRecord:screenRow,label:primary?row?.display[primary]??'Запись':selected?'Запись':null,visibilityRevision:context.collection?[view]:null}
}
