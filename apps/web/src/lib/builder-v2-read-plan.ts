import { compileTableFormulas, topologicalOrder } from '@tableapp/formula'
import { fieldsOfFilter, isComputed, type Field, type View } from '@tableapp/schema'
import type { AppV2, AppV2Node } from '@tableapp/schema/app-v2'
import { builderV2DataNodes } from './builder-v2-data-types'
import { builderV2CardLayout } from './builder-v2-catalog'

/** Select only displayed/calculation dependencies; an unrelated broken formula must not break a list. */
export function builderV2ReadPlan(app: AppV2, node: AppV2Node & { sourceId: string }, source: AppV2['sources'][number], view: View | null,
  fieldsByTable: Map<string, Field[]>, primaryByTable: Map<string, string | null>, searching = false) {
  const collect = (value: unknown, into: Set<string>): void => {
    if (!value || typeof value !== 'object') return
    const object = value as Record<string, unknown>
    if (object.kind === 'literal') return
    if (object.kind === 'row' && typeof object.fieldId === 'string') into.add(object.fieldId)
    Object.values(object).forEach(item => collect(item, into))
  }
  const displayed = new Set(node.type === 'collection' ? [node.titleFieldId, ...(node.subtitleFieldId ? [node.subtitleFieldId] : []),...(node.dateFieldId?[node.dateFieldId]:[]),...(node.groupFieldId?[node.groupFieldId]:[])] : [])
  if (node.type === 'collection' && builderV2CardLayout(node.layout) && !node.itemIds.length) {
    if (node.cardImageFieldId) displayed.add(node.cardImageFieldId)
    if (node.cardDetailFieldId) displayed.add(node.cardDetailFieldId)
  }
  if (node.type === 'collection' && node.layout === 'history') {
    if (node.statusFieldId) displayed.add(node.statusFieldId)
    if (node.historyNoteFieldId) displayed.add(node.historyNoteFieldId)
    if (node.cardDetailFieldId) displayed.add(node.cardDetailFieldId)
  }
  // Native booking screens use these same records for photos, availability and visit cards.
  // Keep author previews complete; published reads still apply their separate row/field grants.
  if (node.type === 'collection' && app.booking) {
    const booking = app.booking
    const fields = source.tableId === booking.tables.services ? [...Object.values(booking.service), booking.servicePhotoFieldId, booking.serviceDescriptionFieldId]
      : source.tableId === booking.tables.masters ? [...Object.values(booking.master), booking.masterPhotoFieldId, booking.masterDescriptionFieldId]
      : source.tableId === booking.tables.visits ? Object.values(booking.visit)
      : source.tableId === booking.tables.schedule ? Object.values(booking.schedule) : []
    for (const field of fields) if (field) displayed.add(field)
  }
  builderV2DataNodes(app, node).forEach(child => collect(child, displayed))
  const required = new Set([...displayed, ...(searching ? source.searchFieldIds : []), ...(node.type === 'collection' ? source.sorts.length ? source.sorts : view?.config.sorts ?? [] : []).map(sort => sort.fieldId), ...fieldsOfFilter(view?.config.filter)])
  if (node.type === 'collection' && node.recordGroup) {
    required.add(node.recordGroup.fieldId)
    if (node.recordGroup.amountFieldId) required.add(node.recordGroup.amountFieldId)
  }
  if ((node.type === 'metric'||node.type==='chart') && node.fieldId) required.add(node.fieldId)
  if(node.type==='chart')required.add(node.groupFieldId)
  collect(source.filter, required)
  const screenFields = new Set<string>()
  const collectScreen = (value: unknown): void => {
    if (!value || typeof value !== 'object') return
    const object = value as Record<string, unknown>
    if (object.kind === 'literal') return
    if (object.kind === 'screen_row' && typeof object.fieldId === 'string') screenFields.add(object.fieldId)
    Object.values(object).forEach(collectScreen)
  }
  collectScreen(source.filter)
  const neededFields = new Map<string, Set<string>>([[source.tableId, required]])
  if (source.screenTableId) neededFields.set(source.screenTableId, new Set([...(neededFields.get(source.screenTableId) ?? []), ...screenFields]))
  return { displayed, ...builderV2CalculationPlan(fieldsByTable, primaryByTable, neededFields) }
}

export function builderV2CalculationPlan(fieldsByTable: Map<string, Field[]>, primaryByTable: Map<string, string | null>, neededFields: Map<string, Set<string>>) {
  const compiled = new Map([...fieldsByTable].map(([id, fields]) => [id, compileTableFormulas(fields)]))
  const visited = new Set<string>(), pending = [...neededFields].flatMap(([tableId, ids]) => [...ids].map(id => ({ id, tableId })))
  const add = (tableId: string, id: string | null | undefined) => {
    if (!id || !fieldsByTable.has(tableId)) return
    const group = neededFields.get(tableId) ?? new Set<string>(); group.add(id); neededFields.set(tableId, group)
    pending.push({ id, tableId })
  }
  while (pending.length) {
    const { id, tableId } = pending.pop()!
    if (visited.has(id)) continue
    visited.add(id)
    const columns = fieldsByTable.get(tableId) ?? [], field = columns.find(field => field.id === id)
    if (!field) continue
    for (const dependency of compiled.get(tableId)?.get(id)?.dependencies ?? []) add(tableId, dependency)
    if (field.type === 'lookup' || field.type === 'rollup' || field.type === 'count') {
      add(tableId, field.options.relationFieldId)
      const relation = columns.find(column => column.id === field.options.relationFieldId)
      if (relation?.type === 'relation' && field.type !== 'count') add(relation.options.tableId, field.options.targetFieldId)
    }
    if (field.type === 'relation') add(field.options.tableId, primaryByTable.get(field.options.tableId) ?? fieldsByTable.get(field.options.tableId)?.[0]?.id)
  }
  const calculationFields = new Map([...fieldsByTable].map(([id, columns]) => [id, columns.filter(field => !isComputed(field.type) || neededFields.get(id)?.has(field.id))]))
  const invalidFormulas: string[] = []
  for (const [tableId, columns] of calculationFields) {
    const formulas = compileTableFormulas(columns), order = topologicalOrder(formulas)
    for (const field of columns) if (field.type === 'formula' && neededFields.get(tableId)?.has(field.id) && field.options.expression.trim() && (!formulas.has(field.id) || 'cycle' in order && order.cycle.includes(field.id))) invalidFormulas.push(field.name)
  }
  return { neededFields, calculationFields, invalidFormulas }
}
