import {readBuilderV2Chart} from './builder-v2-chart'
import {builderV2CanMove} from './builder-v2-board-policy'
import {builderCollectionWindowField,readBuilderCollectionWindow} from './builder-v2-collection-window'
import {builderV2ListGrouping,compareBuilderV2ListGroups} from './builder-v2-list-group'
import {readBuilderV2ListSql} from './builder-v2-list-sql'
import {builderV2MemberActor} from './builder-v2-actor'
import { db, rows, views } from '@tableapp/db'
import { compareRows, evalFilter, indexFields, normalizeView } from '@tableapp/schema'
import { evaluateAppV2Condition, type AppV2, type AppV2Actor, type AppV2Json, type AppV2Record } from '@tableapp/schema/app-v2'
import { and, asc, eq, gt, inArray, isNull, sql } from 'drizzle-orm'
import type { Member } from './session'
import { builderV2Revision } from './builder-v2-revision'
import type { BuilderV2DataPage, BuilderV2DataRecord, BuilderV2DataRequest } from './builder-v2-data-types'
import { builderV2DataKey, builderV2ScreenNodes } from './builder-v2-data-types'
import { builderV2ReadPlan } from './builder-v2-read-plan'
import { readBuilderV2RecordGroups } from './builder-v2-record-groups'
import { builderV2OrderAccumulator, builderV2OrderLineFields } from './builder-v2-order-summary'
import { historyCursor, readHistoryCursor } from './history-cursor'
import { builderV2Json as json, deriveBuilderV2Rows, loadBuilderV2ReadMetadata, projectBuilderV2Record } from './builder-v2-row-data'
import type { RuntimeSourceRow } from './runtime-project'
import { RowWriteError } from './row-mutations'
import { restrictedTables, tablePermission } from './table-permissions'

type Cursor = { lastId: string; revision: string; asOf: number }
const stale = () => new RowWriteError('conflict', 'Данные изменились. Обновите список и начните с первой страницы.')

/** Author-only reader. Callers must verify full workspace membership and definition ownership first.
 * It is deliberately separate from the published-app reader: application grants are not modified. */
export async function readBuilderV2NodeData(app: AppV2, member: Member, request: BuilderV2DataRequest): Promise<BuilderV2DataPage> {
  const node = app.nodes.find(node => node.id === request.nodeId)
  if (!node || (node.type !== 'collection' && node.type !== 'metric' && node.type !== 'chart')) throw new RowWriteError('invalid', 'Выберите список или показатель')
  const source = app.sources.find(source => source.id === node.sourceId)
  if (!source || member.workspaceId !== app.workspaceId || restrictedTables(member) || tablePermission(member, source.tableId) === 'none') throw new RowWriteError('denied', 'Источник данных недоступен')
  const search = (request.search ?? '').trim().toLocaleLowerCase('ru-RU')
  return db.transaction(async tx => {
    const screen = request.screenId ? app.screens.find(screen => screen.id === request.screenId) : undefined
    if (request.screenId && (!screen || !builderV2ScreenNodes(app, screen.id).some(item => item.id === node.id))) throw new RowWriteError('denied', 'Элемент не принадлежит выбранному экрану')
    if (request.recordId && !screen?.contextTableId) throw new RowWriteError('invalid', 'Для этой записи нужен экран карточки')
    if (source.screenTableId && (screen?.contextTableId !== source.screenTableId || !request.recordId)) throw new RowWriteError('invalid', 'Сначала откройте запись из списка')
    const meta = await loadBuilderV2ReadMetadata(tx, member.workspaceId, [source.tableId, ...(screen?.contextTableId ? [screen.contextTableId] : [])])
    const { owned, allFields, tableIds, fieldsByTable, primaryByTable } = meta
    const columns = fieldsByTable.get(source.tableId)!, index = indexFields(columns)
    const [viewRow] = source.viewId ? await tx.select().from(views).where(and(eq(views.id, source.viewId), eq(views.tableId, source.tableId))) : []
    if (source.viewId && !viewRow) throw new RowWriteError('missing', 'Выбранное представление удалено. Выберите другое в свойствах.')
    const view = viewRow ? normalizeView(viewRow) : null
    const { displayed, neededFields, calculationFields, invalidFormulas } = builderV2ReadPlan(app, node, source, view, fieldsByTable, primaryByTable, Boolean(search))
    if (invalidFormulas.length) throw new RowWriteError('invalid', `Проверьте формулу «${invalidFormulas[0]}»: в ней ошибка или циклическая зависимость.`)
    const summary = await tx.select({ tableId: rows.tableId, count: sql<number>`count(*)`, revision: sql<number>`max(${rows.syncRevision})` }).from(rows).where(inArray(rows.tableId, [...tableIds])).groupBy(rows.tableId).orderBy(asc(rows.tableId))
    const revision = builderV2Revision([summary, allFields.filter(field => tableIds.has(field.tableId)), owned.filter(table => tableIds.has(table.id)), view])
    const actor=builderV2MemberActor(app,member)
    const binding = builderV2Revision(['builder-author-data-v1', builderV2DataKey(app, node, { ...(request.screenId ? { screenId: request.screenId } : {}), ...(request.recordId ? { recordId: request.recordId } : {}) }), member.userId, member.role, actor, search, revision])
    // Include configuration and identity in the cursor; a token cannot be moved between lists or users.
    const special=node.type==='chart'||node.type==='collection'&&['calendar','kanban'].includes(node.layout)
    const state = special?null:readHistoryCursor(request.cursor, binding) as Cursor | null
    if (state && (typeof state.lastId !== 'string' || state.lastId.length > 200 || state.revision !== revision || !Number.isFinite(state.asOf) || state.asOf > Date.now() + 60_000 || state.asOf < 0)) throw stale()
    const asOf = state?.asOf ?? Date.now()
    const plan = { neededFields, calculationFields, invalidFormulas }
    const grouping = builderV2ListGrouping(node, columns)
    const derived = async (roots: RuntimeSourceRow[]) => (await deriveBuilderV2Rows(meta, roots, plan, asOf)).map(row => ({
      ...row, ...(grouping ? { group: grouping.value(row.data[grouping.fieldId]) } : {}),
    }))
    type Candidate = Awaited<ReturnType<typeof derived>>[number]
    const output = (row: Candidate): BuilderV2DataRecord => ({ ...projectBuilderV2Record(meta, row, displayed),
      ...(row.group ? { group: { key: row.group.key, label: row.group.label } } : {}),
    })
    let screenRow: AppV2Record | undefined
    if (request.recordId && screen?.contextTableId) {
      const [selected] = await tx.select().from(rows).where(and(eq(rows.tableId, screen.contextTableId), eq(rows.id, request.recordId), isNull(rows.deletedAt))).limit(1)
      if (!selected) throw new RowWriteError('missing', 'Открытая запись удалена или больше недоступна')
      const [selectedData] = await derived([selected as RuntimeSourceRow])
      screenRow = { tableId: selected.tableId, id: selected.id, values: json(selectedData!.data) as Record<string, AppV2Json> }
    }
    const matchesSearch = (row: Candidate) => !search || source.searchFieldIds.some(id => row.display[id]?.toLocaleLowerCase('ru-RU').includes(search))
    const matchesSource = (row: Candidate) => {
      if (view && !evalFilter(view.config.filter, row.data, index)) return false
      if (source.filter) { const match = evaluateAppV2Condition(source.filter, { actor, screenRow, row: { id: row.id, tableId: row.tableId, values: json(row.data) as Record<string, AppV2Json> } }); if (!match.ok || !match.value) return false }
      return true
    }
    const allowed = (row: Candidate) => matchesSource(row) && matchesSearch(row)
    const sorts = source.sorts.length ? source.sorts : view?.config.sorts ?? []
    const compare = (a: Candidate, b: Candidate) => compareBuilderV2ListGroups(a.group, b.group) || compareRows(a, b, sorts, index)
    if(node.type==='chart'){
      if(request.cursor!==undefined||request.calendarMonth!==undefined||request.calendarDay!==undefined||request.boardColumn!==undefined)throw new RowWriteError('invalid','Диаграмма рассчитывается по всем данным выбранного источника')
      const iterate=async function*(){let after:string|null=null;while(true){const batch=await tx.select().from(rows).where(and(eq(rows.tableId,source.tableId),isNull(rows.deletedAt),after?gt(rows.id,after):undefined)).orderBy(asc(rows.id)).limit(200);if(!batch.length)break;after=batch.at(-1)!.id;for(const row of await derived(batch as RuntimeSourceRow[]))if(allowed(row))yield row;if(batch.length<200)break}}
      return readBuilderV2Chart(node,columns,iterate())
    }
    const windowField=builderCollectionWindowField(node,columns)
    if(windowField&&node.type==='collection'){
      const iterate=async function*(asOf:number){let after:string|null=null;while(true){const batch=await tx.select().from(rows).where(and(eq(rows.tableId,source.tableId),isNull(rows.deletedAt),after?gt(rows.id,after):undefined)).orderBy(asc(rows.id)).limit(200);if(!batch.length)break;after=batch.at(-1)!.id;for(const row of await deriveBuilderV2Rows(meta,batch as RuntimeSourceRow[],plan,asOf))if(allowed(row))yield row;if(batch.length<200)break}}
      return readBuilderCollectionWindow({node,field:windowField,request,binding,pageSize:source.pageSize,preserveSort:sorts.length>0,iterate,output:row=>({...output(row),...(node.layout==='kanban'?{canMove:builderV2CanMove(app,node,actor,{id:row.id,tableId:row.tableId,values:json(row.data) as Record<string,AppV2Json>})}:{})}),compare})
    }
    if(request.calendarMonth!==undefined||request.calendarDay!==undefined||request.boardColumn!==undefined)throw new RowWriteError('invalid','Параметры не относятся к этому виду списка')
    let anchor: Candidate | null = null
    if (state) {
      const selected = await tx.select().from(rows).where(and(eq(rows.tableId, source.tableId), eq(rows.id, state.lastId), isNull(rows.deletedAt))).limit(1)
      anchor = (await derived(selected as RuntimeSourceRow[]))[0] ?? null
      if (!anchor || !(node.type === 'collection' && node.recordGroup ? matchesSource(anchor) : allowed(anchor))) throw stale()
    }
    const scope = and(eq(rows.tableId, source.tableId), isNull(rows.deletedAt))
    const nextToken = (last: Candidate | undefined, hasNext: boolean) => last && hasNext ? historyCursor({ lastId: last.id, revision, asOf } satisfies Cursor, binding) : null
    if (node.type === 'collection' && node.recordGroup) {
      const candidates = async function* () {
        let lastId: string | null = null
        while (true) {
          const batch = await tx.select().from(rows).where(and(scope, lastId ? gt(rows.id, lastId) : undefined)).orderBy(asc(rows.id)).limit(200)
          if (!batch.length) break
          lastId = batch.at(-1)!.id
          for (const row of await derived(batch as RuntimeSourceRow[])) if (matchesSource(row)) yield row
          if (batch.length < 200) break
        }
      }
      return readBuilderV2RecordGroups({ config: node.recordGroup, rows: candidates(), anchor, pageSize: source.pageSize, matchesSearch, compare, project: output, next: nextToken })
    }
    if (node.type === 'metric' && node.operation === 'count' && !source.filter && !view?.config.filter.conditions.length && !search) {
      const [count] = await tx.select({ total: sql<number>`count(*)` }).from(rows).where(scope)
      const total = Number(count?.total ?? 0)
      return { kind: node.type, rows: [], total, value: total, next: null }
    }
    if (node.type === 'collection' && !source.filter && !view?.config.filter.conditions.length && !sorts.length && !search && (!grouping || grouping.choiceIds)) {
      const page = await readBuilderV2ListSql(tx, source.tableId, source.pageSize, anchor, grouping?.choiceIds ? { fieldId: grouping.fieldId, choiceIds: grouping.choiceIds } : null)
      if (page) {
        const result = await derived(page.rows)
        return { kind: node.type, rows: result.map(output), total: page.total, value: null, next: nextToken(result.at(-1), page.hasNext) }
      }
    }
    const orderFields = source.filter && builderV2OrderLineFields(node, source, columns)
    const order = orderFields && builderV2OrderAccumulator(orderFields)
    const top: Candidate[] = []
    let total = 0, numericCount = 0, sum = 0, min = Infinity, max = -Infinity, lastId: string | null = null
    while (true) {
      const batch = await tx.select().from(rows).where(and(scope, lastId ? gt(rows.id, lastId) : undefined)).orderBy(asc(rows.id)).limit(200)
      if (!batch.length) break
      lastId = batch.at(-1)!.id
      for (const row of await derived(batch as RuntimeSourceRow[])) {
        if (!allowed(row)) continue
        total++
        order?.add(row.data, row.display)
        if (node.type === 'metric') { const value = row.data[node.fieldId ?? '']; if (typeof value === 'number' && Number.isFinite(value)) { numericCount++; sum += value; min = Math.min(min, value); max = Math.max(max, value) } }
        else if (!anchor || compare(row, anchor) > 0) { top.push(row); top.sort(compare); if (top.length > source.pageSize + 1) top.pop() }
      }
      if (batch.length < 200) break
    }
    const value = node.type !== 'metric' ? null : node.operation === 'count' ? total : node.operation === 'sum' ? sum : !numericCount ? null : node.operation === 'avg' ? sum / numericCount : node.operation === 'min' ? min : max
    if (value !== null && !Number.isFinite(value)) throw new RowWriteError('invalid', 'Результат расчёта слишком велик. Проверьте значения в таблице.')
    const result = top.slice(0, source.pageSize)
    return { kind: node.type, rows: result.map(output), total, value, next: nextToken(result.at(-1), top.length > source.pageSize), ...(order ? { orderSummary: order.result() } : {}) }
  }, { isolationLevel: 'repeatable read', accessMode: 'read only' })
}
