import {builderV2ChartFields,readBuilderV2Chart} from './builder-v2-chart'
import {builderV2CanMove} from './builder-v2-board-policy'
import {builderCollectionWindowField,readBuilderCollectionWindow} from './builder-v2-collection-window'
import {builderV2ListGrouping,compareBuilderV2ListGroups,type BuilderV2ListGroup} from './builder-v2-list-group'
import {readBuilderV2ListSql} from './builder-v2-list-sql'
import {readBuilderV2RecordGroups} from './builder-v2-record-groups'
import {builderV2OrderAccumulator,builderV2OrderLineFields} from './builder-v2-order-summary'
import {publishedV2ItemNodes} from './builder-v2-published-items'
import {db,rows,views} from '@tableapp/db'
import {compareRows,evalFilter,indexFields,normalizeView} from '@tableapp/schema'
import {appV2ChildIds,canOpenAppV2Screen,evaluateAppV2Condition,matchesAppV2Audience,type AppV2,type AppV2Actor,type AppV2Node,type AppV2Record} from '@tableapp/schema/app-v2'
import {and,asc,eq,gt,inArray,isNull,or,sql} from 'drizzle-orm'
import {withPublishedV2Read,publishedV2Context,publishedV2Screen} from './builder-v2-published'
import {canReadPublishedV2Row,derivePublishedV2Rows,publishedV2Fields,publishedV2Row} from './builder-v2-published-rows'
import {builderV2Json,loadBuilderV2ReadMetadata,type BuilderV2ReadMetadata} from './builder-v2-row-data'
import {builderV2Revision} from './builder-v2-revision'
import {historyCursor,readHistoryCursor} from './history-cursor'
import {RowWriteError} from './row-mutations'
import type {BuilderV2DataPage,BuilderV2DataRequest,BuilderV2DataRecord} from './builder-v2-data-types'
import type {RuntimeSourceRow} from './runtime-project'

export function publishedV2ReadSql(app:AppV2,actor:AppV2Actor,tableId:string){
  const grants=app.policy.tables.find(rule=>rule.tableId===tableId)?.grants.filter(grant=>grant.read&&matchesAppV2Audience(grant.audience,actor))??[]
  return or(...grants.map(grant=>{
    const scope=grant.read!.rows;if(scope.kind==='all')return sql`true`
    const value=actor[scope.property];if(!actor.authenticated||typeof value!=='string'||!value.trim())return sql`false`
    const cell=sql`${rows.data}->>${scope.fieldId}`
    return and(sql`jsonb_typeof(${rows.data}->${scope.fieldId}) = 'string'`,scope.property==='email'?sql`lower(btrim(${cell})) = ${value.trim().toLowerCase()}`:sql`btrim(${cell}) = ${value.trim()}`)
  }))??sql`false`
}
/** Create-product form lives on its own screen but opens as a dialog on the items list. */
export function publishedV2FormHostScreenId(app:AppV2,screenId:string,nodeId:string){
  const inv=app.inventory
  if(inv?.createItemFormId===nodeId&&inv.itemsScreenId===screenId&&inv.createItemScreenId)return inv.createItemScreenId
  if(inv?.createPurchaseFormId===nodeId&&(inv.purchasesScreenId===screenId||inv.supplierScreenId===screenId)&&inv.createPurchaseScreenId)return inv.createPurchaseScreenId
  if(inv?.createSupplierFormId===nodeId&&inv.suppliersScreenId===screenId&&inv.createSupplierScreenId)return inv.createSupplierScreenId
  if(inv?.createCountFormId===nodeId&&inv.countsScreenId===screenId&&inv.createCountScreenId)return inv.createCountScreenId
  return screenId
}
export function publishedV2Node(app:AppV2,actor:AppV2Actor,screenId:string,nodeId:string,screenRow?:AppV2Record){
  const hostScreenId=publishedV2FormHostScreenId(app,screenId,nodeId)
  const screen=publishedV2Screen(app,actor,hostScreenId),map=new Map(app.nodes.map(node=>[node.id,node]))
  const visit=(ids:readonly string[],ancestors:AppV2Node[]):AppV2Node[]|null=>{for(const id of ids){const node=map.get(id);if(!node)continue;const path=[...ancestors,node];if(node.id===nodeId)return path;const result=visit(appV2ChildIds(node),path);if(result)return result}return null}
  const path=visit(screen.rootIds,[])
  if(!path||path.slice(0,-1).some(node=>node.type==='collection')||path.some(node=>node.visibleTo&&!matchesAppV2Audience(node.visibleTo,actor)||node.visibleWhen&&(()=>{const result=evaluateAppV2Condition(node.visibleWhen!,{actor,row:screenRow,screenRow});return !result.ok||!result.value})()))throw new RowWriteError('denied','Элемент недоступен')
  return path.at(-1)!
}
const output=(row:Awaited<ReturnType<typeof derivePublishedV2Rows>>[number]):BuilderV2DataRecord=>({id:row.id,tableId:row.tableId,values:builderV2Json(row.data) as BuilderV2DataRecord['values'],display:row.display})
export async function publishedV2DataRevision(meta:BuilderV2ReadMetadata,app:AppV2,actor:AppV2Actor){
  const summary=[]
  for(const tableId of [...meta.tableIds].sort()){const [row]=await meta.runner.select({count:sql<number>`count(*)`,revision:sql<number>`max(${rows.syncRevision})`}).from(rows).where(and(eq(rows.tableId,tableId),publishedV2ReadSql(app,actor,tableId)));summary.push([tableId,row])}
  return builderV2Revision([summary,meta.allFields.filter(field=>meta.tableIds.has(field.tableId))])
}
export async function readPublishedV2Data(slug:string,request:BuilderV2DataRequest&{revision:string}):Promise<BuilderV2DataPage>{
  return withPublishedV2Read(async tx=>{
    const {app,actor,revision}=await publishedV2Context(slug,tx)
    if(revision!==request.revision)throw new RowWriteError('conflict','Приложение обновлено. Обновите страницу.')
    const screen=publishedV2Screen(app,actor,request.screenId??''),node=app.nodes.find(node=>node.id===request.nodeId)
    if(!node||(node.type!=='collection'&&node.type!=='metric'&&node.type!=='chart'))throw new RowWriteError('denied','Элемент недоступен')
    const source=app.sources.find(source=>source.id===node.sourceId)!
    if(Boolean(screen.contextTableId)!==Boolean(request.recordId))throw new RowWriteError('denied','Запись недоступна')
    const meta=await loadBuilderV2ReadMetadata(tx,app.workspaceId,[source.tableId,...(screen.contextTableId?[screen.contextTableId]:[])])
    const selected=screen.contextTableId?(await publishedV2Row(meta,app,actor,screen.contextTableId,request.recordId)).record:undefined
    publishedV2Node(app,actor,screen.id,node.id,selected)
    if(source.screenTableId&&source.screenTableId!==screen.contextTableId)throw new RowWriteError('denied','Источник недоступен')
    const [viewRow]=source.viewId?await tx.select().from(views).where(and(eq(views.id,source.viewId),eq(views.tableId,source.tableId))):[],view=viewRow?normalizeView(viewRow):null
    if(source.viewId&&!view)throw new RowWriteError('missing','Представление удалено')
    const search=(request.search??'').trim().toLocaleLowerCase('ru-RU'),dataRevision=await publishedV2DataRevision(meta,app,actor),binding=builderV2Revision(['published-v2',revision,actor,screen.id,request.recordId??null,node.id,search,dataRevision,view])
    const special=node.type==='chart'||node.type==='collection'&&['calendar','kanban'].includes(node.layout)
    const state=special?null:readHistoryCursor(request.cursor,binding) as {lastId?:unknown;asOf?:unknown}|null
    if(state&&(typeof state.lastId!=='string'||typeof state.asOf!=='number'||!Number.isFinite(state.asOf)||state.asOf<0||state.asOf>Date.now()+60000))throw new RowWriteError('conflict','Обновите список')
    const asOf=state?.asOf as number??Date.now(),index=indexFields(meta.fieldsByTable.get(source.tableId)??[]),sorts=source.sorts.length?source.sorts:view?.config.sorts??[]
    const configuredGrouping = builderV2ListGrouping(node, [...index.values()])
    const reads = (app.policy.tables.find(rule => rule.tableId === source.tableId)?.grants ?? [])
      .flatMap(grant => grant.read?.fieldIds.length && matchesAppV2Audience(grant.audience, actor) ? [grant.read] : [])
    const grouping = configuredGrouping && reads.some(read => read.fieldIds.includes(configuredGrouping.fieldId)) ? configuredGrouping : null
    type Candidate=Awaited<ReturnType<typeof derivePublishedV2Rows>>[number] & {group?: BuilderV2ListGroup}
    const matchesSearch = (row: Candidate) => !search || source.searchFieldIds.some(id => row.display[id]?.toLocaleLowerCase('ru-RU').includes(search))
    const matchesSource = (row: Candidate) => {
      if(view&&!evalFilter(view.config.filter,row.data,index))return false
      if(source.filter){const result=evaluateAppV2Condition(source.filter,{actor,row:{id:row.id,tableId:row.tableId,values:builderV2Json(row.data) as AppV2Record['values']},screenRow:selected});if(!result.ok||!result.value)return false}
      return true
    }
    const allowed = (row: Candidate) => matchesSource(row) && matchesSearch(row)
    const compare=(a:Candidate,b:Candidate)=>compareBuilderV2ListGroups(a.group,b.group)||compareRows(a,b,sorts,index)
    if(node.type==='chart'){
      if(request.cursor!==undefined||request.calendarMonth!==undefined||request.calendarDay!==undefined||request.boardColumn!==undefined)throw new RowWriteError('invalid','Диаграмма рассчитывается по всем данным выбранного источника')
      const fields=meta.fieldsByTable.get(source.tableId)??[],configured=builderV2ChartFields(node,fields),required=[configured.group.id,...(configured.value?[configured.value.id]:[])]
      if(required.some(id=>!app.policy.tables.find(rule=>rule.tableId===source.tableId)?.grants.some(grant=>grant.read?.fieldIds.includes(id)&&matchesAppV2Audience(grant.audience,actor))))throw new RowWriteError('denied','Эта диаграмма недоступна для вашей роли')
      const iterate=async function*(){let after:string|null=null;while(true){const batch=await tx.select().from(rows).where(and(eq(rows.tableId,source.tableId),isNull(rows.deletedAt),publishedV2ReadSql(app,actor,source.tableId),after?gt(rows.id,after):undefined)).orderBy(asc(rows.id)).limit(200);if(!batch.length)break;after=batch.at(-1)!.id;const visible=batch.filter(row=>{const permitted=publishedV2Fields(app,actor,row as RuntimeSourceRow);return required.every(id=>permitted.has(id))});for(const row of await derivePublishedV2Rows(meta,app,actor,visible as RuntimeSourceRow[],asOf))if(allowed(row))yield row;if(batch.length<200)break}}
      return readBuilderV2Chart(node,fields,iterate())
    }
    const windowField=builderCollectionWindowField(node,meta.fieldsByTable.get(source.tableId)??[])
    if(windowField&&node.type==='collection'){
      if(!app.policy.tables.find(rule=>rule.tableId===source.tableId)?.grants.some(grant=>grant.read&&grant.read.fieldIds.includes(windowField.id)&&matchesAppV2Audience(grant.audience,actor)))throw new RowWriteError('denied','Этот вид списка недоступен для вашей роли')
      const project=(row:Candidate):BuilderV2DataRecord=>({...output(row),...(node.layout==='kanban'?{canMove:Boolean((row as Candidate&{boardCanMove?:boolean}).boardCanMove)}:{}),visibleNodeIds:publishedV2ItemNodes(app,actor,node,{id:row.id,tableId:row.tableId,values:builderV2Json(row.data) as AppV2Record['values']},selected)})
      const iterate=async function*(asOf:number){let after:string|null=null;while(true){const batch=await tx.select().from(rows).where(and(eq(rows.tableId,source.tableId),isNull(rows.deletedAt),publishedV2ReadSql(app,actor,source.tableId),after?gt(rows.id,after):undefined)).orderBy(asc(rows.id)).limit(200);if(!batch.length)break;after=batch.at(-1)!.id;const visible=batch.filter(row=>publishedV2Fields(app,actor,row as RuntimeSourceRow).has(windowField.id));const movable=new Set(visible.filter(row=>builderV2CanMove(app,node,actor,{id:row.id,tableId:row.tableId,values:builderV2Json(row.data) as AppV2Record['values']})).map(row=>row.id));for(const row of await derivePublishedV2Rows(meta,app,actor,visible as RuntimeSourceRow[],asOf))if(allowed(row))yield {...row,boardCanMove:movable.has(row.id)};if(batch.length<200)break}}
      return readBuilderCollectionWindow({node,field:windowField,request,binding,pageSize:source.pageSize,preserveSort:sorts.length>0,iterate,output:project,compare})
    }
    if(request.calendarMonth!==undefined||request.calendarDay!==undefined||request.boardColumn!==undefined)throw new RowWriteError('invalid','Параметры не относятся к этому виду списка')
    const derive = async (batch: RuntimeSourceRow[]): Promise<Candidate[]> => {
      const candidates = await derivePublishedV2Rows(meta,app,actor,batch,asOf)
      if (!grouping) return candidates
      // A group is based on this record's own field grant. Other records in a
      // page must not change the label or order of the cursor's anchor.
      const groups = new Map(batch.map(row => [row.id, grouping.value(publishedV2Fields(app, actor, row).has(grouping.fieldId) ? row.data[grouping.fieldId] : undefined)]))
      return candidates.map(row => ({ ...row, group: groups.get(row.id) }))
    }
    const project = (row: Candidate): BuilderV2DataRecord => ({ ...output(row),
      ...(row.group ? { group: { key: row.group.key, label: row.group.label } } : {}),
      ...(node.type === 'collection' ? { visibleNodeIds: publishedV2ItemNodes(app, actor, node,
        { id: row.id, tableId: row.tableId, values: builderV2Json(row.data) as AppV2Record['values'] }, selected) } : {}),
    })
    const nextToken = (last: Candidate | undefined, hasNext: boolean) => last && hasNext ? historyCursor({ lastId: last.id, asOf }, binding) : null
    const scope = and(eq(rows.tableId,source.tableId),isNull(rows.deletedAt),publishedV2ReadSql(app,actor,source.tableId))
    let anchor:Candidate|undefined
    if (state) {
      const stored = await tx.select().from(rows).where(and(scope, eq(rows.id, state.lastId as string))).limit(1)
      ;[anchor] = await derive(stored as RuntimeSourceRow[])
      if (!anchor || !(node.type === 'collection' && node.recordGroup ? matchesSource(anchor) : allowed(anchor))) throw new RowWriteError('conflict','Обновите список')
    }
    if (node.type === 'collection' && node.recordGroup) {
      const candidates = async function* () {
        let lastId: string | null = null
        while (true) {
          const batch = await tx.select().from(rows).where(and(scope, lastId ? gt(rows.id, lastId) : undefined)).orderBy(asc(rows.id)).limit(200)
          if (!batch.length) break
          lastId = batch.at(-1)!.id
          for (const row of await derive(batch as RuntimeSourceRow[])) if (matchesSource(row)) yield row
          if (batch.length < 200) break
        }
      }
      return readBuilderV2RecordGroups({ config: node.recordGroup, rows: candidates(), anchor, pageSize: source.pageSize, matchesSearch, compare, project, next: nextToken })
    }
    const unrestricted = reads.length > 0 && reads.every(read => read.rows.kind === 'all')
    if (node.type === 'collection' && unrestricted && !source.filter && !view?.config.filter.conditions.length && !sorts.length && !search && (!grouping || grouping.choiceIds)) {
      const page = await readBuilderV2ListSql(tx, source.tableId, source.pageSize, anchor, grouping?.choiceIds ? { fieldId: grouping.fieldId, choiceIds: grouping.choiceIds } : null)
      if (page) {
        const result = await derive(page.rows)
        return { kind: 'collection', rows: result.map(project), total: page.total, value: null, next: nextToken(result.at(-1), page.hasNext) }
      }
    }
    const orderFields = source.filter && builderV2OrderLineFields(node, source, [...index.values()])
    const order = orderFields && builderV2OrderAccumulator(orderFields)
    const scopedOrder = Boolean(orderFields && !reads.some(read => read.rows.kind === 'all' && read.fieldIds.includes(orderFields.amount.id)))
    const top:Candidate[]=[];let total=0,numeric=0,sum=0,min=Infinity,max=-Infinity,lastId:string|null=null
    while(true){const batch=await tx.select().from(rows).where(and(scope,lastId?gt(rows.id,lastId):undefined)).orderBy(asc(rows.id)).limit(200);if(!batch.length)break;lastId=batch.at(-1)!.id
      for(const row of await derive(batch as RuntimeSourceRow[])){if(!allowed(row))continue;total++;order?.add(row.data,row.display);if(node.type==='metric'){const value=row.data[node.fieldId??''];if(typeof value==='number'&&Number.isFinite(value)){numeric++;sum+=value;min=Math.min(min,value);max=Math.max(max,value)}}else if(!anchor||compare(row,anchor)>0){top.push(row);top.sort(compare);if(top.length>source.pageSize+1)top.pop()}}
      if(batch.length<200)break
    }
    const result=top.slice(0,source.pageSize),value=node.type==='collection'?null:node.operation==='count'?total:node.operation==='sum'?sum:!numeric?null:node.operation==='avg'?sum/numeric:node.operation==='min'?min:max
    if(value!==null&&!Number.isFinite(value))throw new RowWriteError('invalid','Результат расчёта слишком велик')
    return {kind:node.type,rows:result.map(project),total,value,next:nextToken(result.at(-1),top.length>source.pageSize),...(order ? { orderSummary: { ...order.result(), ...(scopedOrder ? { scoped: true } : {}) } } : {})}
  })
}
export async function readPublishedV2Record(slug:string,request:{screenId:string;recordId:string;revision:string}){
  return withPublishedV2Read(async tx => {
    const { app, actor, revision } = await publishedV2Context(slug, tx)
    if (revision !== request.revision) throw new RowWriteError('conflict', 'Приложение обновлено. Обновите страницу.')
    const screen = publishedV2Screen(app, actor, request.screenId)
    if (!screen.contextTableId) throw new RowWriteError('denied', 'Карточка недоступна')
    const meta = await loadBuilderV2ReadMetadata(tx, app.workspaceId, [screen.contextTableId])
    const { record } = await publishedV2Row(meta, app, actor, screen.contextTableId, request.recordId)
    const titleFieldId = screen.catalog?.titleFieldId ?? screen.recordTitleFieldId ?? meta.primaryByTable.get(screen.contextTableId)
    return { record, title: titleFieldId && record.display[titleFieldId] || 'Запись' }
  })
}

/** Load related table rows by id for a published actor, honoring row/field grants. */
/** Storefront related products — resolves catalog collection server-side (client detail payloads omit foreign screen nodes). */
export async function readPublishedV2ShopCatalog(slug:string,request:{revision:string}):Promise<BuilderV2DataPage>{
  const resolved=await withPublishedV2Read(async tx=>{
    const {app,actor,revision}=await publishedV2Context(slug,tx)
    if(revision!==request.revision)throw new RowWriteError('conflict','Приложение обновлено. Обновите страницу.')
    const shop=app.shop
    if(!shop||!canOpenAppV2Screen(app,actor,shop.catalogScreenId))throw new RowWriteError('denied','Каталог недоступен')
    const node=app.nodes.find(item=>item.type==='collection'&&item.layout==='catalog'
      &&app.sources.some(source=>source.id===item.sourceId&&source.tableId===shop.catalogTableId&&!source.screenTableId))
    if(!node)throw new RowWriteError('missing','Каталог не найден')
    return {nodeId:node.id,screenId:shop.catalogScreenId}
  })
  return readPublishedV2Data(slug,{revision:request.revision,nodeId:resolved.nodeId,screenId:resolved.screenId})
}

export async function readPublishedV2RelatedRows(slug:string,request:{revision:string;tableId:string;recordIds:readonly string[]}){
  return withPublishedV2Read(async tx=>{
    const {app,actor,revision}=await publishedV2Context(slug,tx)
    if(revision!==request.revision)throw new RowWriteError('conflict','Приложение обновлено. Обновите страницу.')
    if(!request.recordIds.length||request.recordIds.length>100)throw new RowWriteError('invalid','Слишком много связанных записей')
    const meta=await loadBuilderV2ReadMetadata(tx,app.workspaceId,[request.tableId])
    const stored=await tx.select().from(rows).where(and(eq(rows.tableId,request.tableId),inArray(rows.id,[...request.recordIds]),isNull(rows.deletedAt)))
    const visible=stored.filter(row=>canReadPublishedV2Row(app,actor,row as RuntimeSourceRow)) as RuntimeSourceRow[]
    const derived=await derivePublishedV2Rows(meta,app,actor,visible)
    const byId=new Map(derived.map(row=>[row.id,output(row)]))
    return {rows:request.recordIds.flatMap(id=>byId.has(id)?[byId.get(id)!]:[])}
  })
}

function relationOne(value: unknown) {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (Array.isArray(value)) {
    const id = value.find((item): item is string => typeof item === 'string' && Boolean(item.trim()))
    return id?.trim() ?? null
  }
  return null
}

/** Default purchase line prices from product cost for staff/owner (cost stays hidden on product cards). */
export async function readPublishedV2PurchaseCosts(slug:string,request:{revision:string;productIds:readonly string[]}){
  return withPublishedV2Read(async tx=>{
    const {app,actor,revision}=await publishedV2Context(slug,tx)
    if(revision!==request.revision)throw new RowWriteError('conflict','Приложение обновлено. Обновите страницу.')
    const inventory=app.inventory
    if(!inventory?.purchasesScreenId||!inventory.itemCostFieldId||!canOpenAppV2Screen(app,actor,inventory.purchasesScreenId)){
      throw new RowWriteError('denied','Закупки недоступны')
    }
    if(!actor.roleIds.includes('owner')&&!actor.roleIds.includes('staff'))throw new RowWriteError('denied','Закупки недоступны')
    if(!request.productIds.length||request.productIds.length>100)throw new RowWriteError('invalid','Слишком много товаров')
    const stored=await tx.select({id:rows.id,data:rows.data}).from(rows).where(and(
      eq(rows.tableId,inventory.itemsTableId),
      inArray(rows.id,[...request.productIds]),
      isNull(rows.deletedAt),
      publishedV2ReadSql(app,actor,inventory.itemsTableId),
    ))
    const costs:Record<string,number>={}
    for(const row of stored){
      const raw=(row.data as Record<string,unknown>)[inventory.itemCostFieldId]
      const price=typeof raw==='number'?raw:Number(raw)
      if(Number.isFinite(price)&&price>=0)costs[row.id]=price
    }
    return {costs}
  })
}

/** Count of products strictly below minimum for the purchases toolbar badge. */
export async function readPublishedV2LowStockCount(slug:string,request:{revision:string}){
  return withPublishedV2Read(async tx=>{
    const {app,actor,revision}=await publishedV2Context(slug,tx)
    if(revision!==request.revision)throw new RowWriteError('conflict','Приложение обновлено. Обновите страницу.')
    const inventory=app.inventory
    if(!inventory?.purchasesScreenId||!inventory.itemStockFieldId||!inventory.itemMinFieldId
      ||!canOpenAppV2Screen(app,actor,inventory.purchasesScreenId)){
      throw new RowWriteError('denied','Закупки недоступны')
    }
    if(!actor.roleIds.includes('owner')&&!actor.roleIds.includes('staff'))throw new RowWriteError('denied','Закупки недоступны')
    const meta=await loadBuilderV2ReadMetadata(tx,app.workspaceId,[inventory.itemsTableId,inventory.movementsTableId])
    const stored=await tx.select().from(rows).where(and(
      eq(rows.tableId,inventory.itemsTableId),
      isNull(rows.deletedAt),
      publishedV2ReadSql(app,actor,inventory.itemsTableId),
    ))
    const derived=await derivePublishedV2Rows(meta,app,actor,stored as RuntimeSourceRow[])
    let count=0
    for(const row of derived){
      const stock=Number(row.data[inventory.itemStockFieldId])
      const min=Number(row.data[inventory.itemMinFieldId])
      if(Number.isFinite(stock)&&Number.isFinite(min)&&stock<min)count+=1
    }
    return {count}
  })
}

/** Sum of open purchase orders for the items list metric (purchases nodes are not shipped on that screen). */
export async function readPublishedV2OpenPurchaseTotal(slug:string,request:{revision:string}){
  return withPublishedV2Read(async tx=>{
    const {app,actor,revision}=await publishedV2Context(slug,tx)
    if(revision!==request.revision)throw new RowWriteError('conflict','Приложение обновлено. Обновите страницу.')
    const inventory=app.inventory
    if(!inventory?.itemsScreenId||!inventory.purchaseOrdersTableId||!inventory.statusOrdered||!inventory.purchaseStatusFieldId
      ||!canOpenAppV2Screen(app,actor,inventory.itemsScreenId)){
      throw new RowWriteError('denied','Товары недоступны')
    }
    if(!actor.roleIds.includes('owner')&&!actor.roleIds.includes('staff'))throw new RowWriteError('denied','Товары недоступны')
    const stored=await tx.select().from(rows).where(and(
      eq(rows.tableId,inventory.purchaseOrdersTableId),
      isNull(rows.deletedAt),
      publishedV2ReadSql(app,actor,inventory.purchaseOrdersTableId),
    ))
    let total=0
    for(const row of stored){
      const data=row.data as Record<string,unknown>
      if(String(data[inventory.purchaseStatusFieldId]??'')!==inventory.statusOrdered)continue
      const amount=inventory.purchaseTotalFieldId?Number(data[inventory.purchaseTotalFieldId]):NaN
      if(Number.isFinite(amount))total+=amount
    }
    return {total}
  })
}

/** Per-client open-deal counts for the CRM clients list shell (board nodes are not shipped on that screen). */
export async function readPublishedV2ClientDealStats(slug:string,request:{revision:string}){
  return withPublishedV2Read(async tx=>{
    const {app,actor,revision}=await publishedV2Context(slug,tx)
    if(revision!==request.revision)throw new RowWriteError('conflict','Приложение обновлено. Обновите страницу.')
    const crm=app.crm
    if(!crm?.clientsScreenId||!crm.dealsTableId||!canOpenAppV2Screen(app,actor,crm.clientsScreenId)){
      throw new RowWriteError('denied','Клиенты недоступны')
    }
    if(!actor.roleIds.includes('owner')&&!actor.roleIds.includes('staff'))throw new RowWriteError('denied','Клиенты недоступны')
    const stored=await tx.select().from(rows).where(and(
      eq(rows.tableId,crm.dealsTableId),
      isNull(rows.deletedAt),
      publishedV2ReadSql(app,actor,crm.dealsTableId),
    ))
    const terminal=new Set(crm.terminalStages??[])
    const stats:Record<string,{deals:number;sum:number;lastContact:string}>={}
    let openDeals=0
    let pipeline=0
    let dueToday=0
    let dueOverdue=0
    const startOfToday=(()=>{const d=new Date();d.setHours(0,0,0,0);return d.getTime()})()
    const endOfToday=startOfToday+86_400_000-1
    for(const row of stored){
      const data=row.data as Record<string,unknown>
      const clientRaw=data[crm.clientRelationFieldId]
      const clientId=typeof clientRaw==='string'?clientRaw
        :Array.isArray(clientRaw)?clientRaw.find((id):id is string=>typeof id==='string'):undefined
      if(!clientId)continue
      const stage=String(data[crm.stageFieldId]??'')
      const open=!terminal.has(stage)
      const sumRaw=Number(data[crm.sumFieldId])
      const sum=Number.isFinite(sumRaw)?sumRaw:0
      const due=String(data[crm.dueFieldId]??'')
      const current=stats[clientId]??{deals:0,sum:0,lastContact:''}
      current.deals+=1
      if(open){
        current.sum+=sum
        openDeals+=1
        pipeline+=sum
        if(due){
          const dueMs=Date.parse(due)
          if(Number.isFinite(dueMs)){
            if(dueMs<startOfToday)dueOverdue+=1
            else if(dueMs<=endOfToday)dueToday+=1
          }
        }
      }
      if(due&&(!current.lastContact||due>current.lastContact))current.lastContact=due
      stats[clientId]=current
    }
    return {stats,openDeals,pipeline,dueToday,dueOverdue}
  })
}

/** Last supplier + price per product for «Что заказать» (mirrors create_reorder_orders grouping). */
export async function readPublishedV2ReorderHints(slug:string,request:{revision:string;productIds:readonly string[]}){
  return withPublishedV2Read(async tx=>{
    const {app,actor,revision}=await publishedV2Context(slug,tx)
    if(revision!==request.revision)throw new RowWriteError('conflict','Приложение обновлено. Обновите страницу.')
    const inventory=app.inventory
    if(!inventory?.purchasesScreenId||!inventory.purchaseOrdersTableId||!inventory.purchaseLinesTableId
      ||!inventory.purchaseSupplierFieldId||!inventory.purchaseStatusFieldId||!inventory.lineProductFieldId
      ||!inventory.lineOrderFieldId||!inventory.linePriceFieldId||!inventory.suppliersTableId||!inventory.supplierNameFieldId
      ||!canOpenAppV2Screen(app,actor,inventory.purchasesScreenId)){
      throw new RowWriteError('denied','Закупки недоступны')
    }
    if(!actor.roleIds.includes('owner')&&!actor.roleIds.includes('staff'))throw new RowWriteError('denied','Закупки недоступны')
    if(!request.productIds.length||request.productIds.length>100)throw new RowWriteError('invalid','Слишком много товаров')
    const productSet=new Set(request.productIds)
    const [orderRows,lineRows,supplierRows]=await Promise.all([
      tx.select({id:rows.id,data:rows.data}).from(rows).where(and(
        eq(rows.tableId,inventory.purchaseOrdersTableId),isNull(rows.deletedAt),publishedV2ReadSql(app,actor,inventory.purchaseOrdersTableId),
      )),
      tx.select({id:rows.id,data:rows.data}).from(rows).where(and(
        eq(rows.tableId,inventory.purchaseLinesTableId),isNull(rows.deletedAt),publishedV2ReadSql(app,actor,inventory.purchaseLinesTableId),
      )),
      tx.select({id:rows.id,data:rows.data}).from(rows).where(and(
        eq(rows.tableId,inventory.suppliersTableId),isNull(rows.deletedAt),publishedV2ReadSql(app,actor,inventory.suppliersTableId),
      )),
    ])
    const supplierName=new Map(supplierRows.map(row=>{
      const data=row.data as Record<string,unknown>
      return [row.id,String(data[inventory.supplierNameFieldId!]??'').trim()] as const
    }))
    const rankOf=(status:unknown)=>status===inventory.statusReceived?3
      :status===inventory.statusOrdered?2
        :status===inventory.statusDraft?1
          :0
    const best=new Map<string,{rank:number;at:string;supplier:string;price:number}>()
    for(const order of orderRows){
      const data=order.data as Record<string,unknown>
      if(inventory.statusCancelled&&data[inventory.purchaseStatusFieldId!]===inventory.statusCancelled)continue
      const rank=rankOf(data[inventory.purchaseStatusFieldId!])
      if(!rank)continue
      const supplierId=relationOne(data[inventory.purchaseSupplierFieldId!])
      if(!supplierId)continue
      const at=String(
        (inventory.purchaseReceivedAtFieldId?data[inventory.purchaseReceivedAtFieldId]:undefined)
        ??(inventory.purchaseOrderedAtFieldId?data[inventory.purchaseOrderedAtFieldId]:undefined)
        ??(inventory.purchaseCreatedAtFieldId?data[inventory.purchaseCreatedAtFieldId]:undefined)
        ??(inventory.purchaseDateFieldId?data[inventory.purchaseDateFieldId]:undefined)
        ??'',
      )
      const supplier=supplierName.get(supplierId)||''
      if(!supplier)continue
      for(const line of lineRows){
        const lineData=line.data as Record<string,unknown>
        if(relationOne(lineData[inventory.lineOrderFieldId!])!==order.id)continue
        const productId=relationOne(lineData[inventory.lineProductFieldId!])
        if(!productId||!productSet.has(productId))continue
        const price=Number(lineData[inventory.linePriceFieldId!])
        const current=best.get(productId)
        if(!current||rank>current.rank||(rank===current.rank&&at>current.at)){
          best.set(productId,{rank,at,supplier,price:Number.isFinite(price)&&price>=0?price:0})
        }
      }
    }
    const hints:Record<string,{supplier:string;price:number}>={}
    for(const [productId,hint] of best)hints[productId]={supplier:hint.supplier,price:hint.price}
    return {hints}
  })
}
