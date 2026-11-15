import { rows, views } from '@tableapp/db'
import { APP_TIME_ZONE, compareRows, evalFilter, fieldsOfFilter, indexFields, normalizeView } from '@tableapp/schema'
import { matchesAppV2Audience, type AppV2, type AppV2Actor, type AppV2Node } from '@tableapp/schema/app-v2'
import { and, asc, eq, gt, isNull } from 'drizzle-orm'
import type { Transaction } from './db-transaction'
import { builderV2CalculationPlan } from './builder-v2-read-plan'
import { deriveBuilderV2Rows, loadBuilderV2ReadMetadata, projectBuilderV2Record } from './builder-v2-row-data'
import { derivePublishedV2Rows, publishedV2Row, publishedV2Fields } from './builder-v2-published-rows'
import { publishedV2Node } from './builder-v2-published-data'
import type { RuntimeSourceRow } from './runtime-project'
import { RowWriteError } from './row-mutations'
import type { BuilderV2DataRecord } from './builder-v2-data-types'
import { teamCalendarSnapshot, type TeamCalendarRequest } from './team-calendar-model'

/** Three real table readers in one consistent snapshot; raw rows never leave the server. */
export async function readTeamCalendar(tx: Transaction, app: AppV2, actor: AppV2Actor, node: Extract<AppV2Node,{type:'team_calendar'}>, query: TeamCalendarRequest, published: boolean) {
  const data = node.data
  if (!data) throw new RowWriteError('invalid','Выберите таблицы и поля календаря в конструкторе.')
  const screen = app.screens.find(screen=>screen.id===query.screenId)
  if (!screen || Boolean(screen.contextTableId)!==Boolean(query.recordId)) throw new RowWriteError('denied','Экран календаря недоступен.')
  const roots = [data.tableId,data.resources.tableId,...(data.hours?[data.hours.tableId]:[]),...(screen.contextTableId?[screen.contextTableId]:[])]
  const meta = await loadBuilderV2ReadMetadata(tx,app.workspaceId,roots)
  const selected = published && screen.contextTableId ? (await publishedV2Row(meta,app,actor,screen.contextTableId,query.recordId)).record : undefined
  if (published) publishedV2Node(app,actor,screen.id,node.id,selected)
  const asOf = Date.now()
  const read = async (source:{tableId:string;viewId:string|null}, required:string[], ownerEmailFieldId?:string|null):Promise<BuilderV2DataRecord[]> => {
    const [storedView] = source.viewId ? await tx.select().from(views).where(and(eq(views.id,source.viewId),eq(views.tableId,source.tableId))) : []
    if(source.viewId&&!storedView)throw new RowWriteError('missing','Представление календаря удалено. Выберите другое.')
    const view = storedView ? normalizeView(storedView) : null, fields = meta.fieldsByTable.get(source.tableId)??[]
    const plan = builderV2CalculationPlan(meta.fieldsByTable,meta.primaryByTable,new Map([[source.tableId,new Set([...required,...fieldsOfFilter(view?.config.filter),...(view?.config.sorts??[]).map(sort=>sort.fieldId)])]]))
    const result:{record:BuilderV2DataRecord;order:Awaited<ReturnType<typeof deriveBuilderV2Rows>>[number]}[]=[];let after:string|undefined,total=0
    while(true){
      const batch=await tx.select().from(rows).where(and(eq(rows.tableId,source.tableId),isNull(rows.deletedAt),after?gt(rows.id,after):undefined)).orderBy(asc(rows.id)).limit(200)
      if(!batch.length)break
      total+=batch.length
      if(total>20000)throw new RowWriteError('invalid','Для одного календаря поддерживается до 20 000 строк в каждой таблице. Разделите данные.')
      after=batch.at(-1)!.id
      const own = ownerEmailFieldId && !actor.roleIds.some(id=>node.actions.manageRoleIds.includes(id)) ? batch.filter(row=>Boolean(actor.email)&&String((row.data as Record<string,unknown>)[ownerEmailFieldId]??'').trim().toLowerCase()===actor.email!.trim().toLowerCase()) : batch
      const permitted = published ? new Map(own.map(row=>[row.id,publishedV2Fields(app,actor,row as RuntimeSourceRow)])) : null
      const projected=published?await derivePublishedV2Rows(meta,app,actor,own as RuntimeSourceRow[],asOf):await deriveBuilderV2Rows(meta,own as RuntimeSourceRow[],plan,asOf)
      for(const row of projected){
        if(view&&!evalFilter(view.config.filter,row.data,indexFields(fields)))continue
        result.push({record:projectBuilderV2Record(meta,row,new Set(required.filter(id=>!published||permitted?.get(row.id)?.has(id)))),order:row})
      }
      if(batch.length<200)break
    }
    return result.sort((a,b)=>view?.config.sorts.length?compareRows(a.order,b.order,view.config.sorts,indexFields(fields)):a.order.position.localeCompare(b.order.position)||a.order.id.localeCompare(b.order.id)).map(item=>item.record)
  }
  const eventFields=[data.titleFieldId,data.subtitleFieldId,data.startFieldId,data.durationFieldId,data.endFieldId,data.resourceFieldId,data.statusFieldId,data.amountFieldId].filter((id):id is string=>Boolean(id))
  const events=await read(data,eventFields),resources=await read(data.resources,[data.resources.titleFieldId,...(data.resources.photoFieldId?[data.resources.photoFieldId]:[])],data.resources.ownerEmailFieldId)
  const h=data.hours,required=h?[h.resourceFieldId,h.weekdayFieldId,h.dateFieldId,h.startFieldId,h.endFieldId,h.closedFieldId].filter((id):id is string=>Boolean(id)):[]
  const periods=h?await read(h,required):null
  // Empty strings are legitimate stored values. Missing keys mean the field was denied.
  const readable= !published || !h || required.every(id=>app.policy.tables.find(rule=>rule.tableId===h.tableId)?.grants.some(grant=>grant.read?.fieldIds.includes(id)&&matchesAppV2Audience(grant.audience,actor)))
  const hours=readable?periods?.filter(row=>required.every(id=>Object.hasOwn(row.values,id)))??null:null
  const timeZone=meta.fieldsByTable.get(data.tableId)?.find(field=>field.id===data.startFieldId)?.options
  return teamCalendarSnapshot(data,{events,resources,hours},query,timeZone&&'timeZone'in timeZone&&typeof timeZone.timeZone==='string'?timeZone.timeZone:APP_TIME_ZONE)
}
