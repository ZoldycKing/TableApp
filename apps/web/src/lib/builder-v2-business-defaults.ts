import type { AppV2, AppV2Node } from '@tableapp/schema/app-v2'
import { addNode, removeNode, replaceNode, setCollectionCard, updateNodeSource, v2Id } from '@/components/builder/v2/model'
import { collectionCardScreen } from '@/components/builder/v2/collection-navigation'
import { isBuilderV2ContactTable, isBuilderV2OrderTable } from '@/components/builder/v2/record-presentation'
import type { BuilderV2Table } from './builder-v2'

/** Applied when generating the screen, so the result can be edited like any other screen. */
export function applyBuilderV2BusinessDefaults(app: AppV2, listId: string, cardId: string, tables: readonly BuilderV2Table[]): AppV2 {
  const list = app.nodes.find(node => node.id === listId)
  if (list?.type !== 'collection') return app
  const table = tables.find(table => table.id === app.sources.find(source => source.id === list.sourceId)?.tableId)
  const card = app.screens.find(screen => screen.id === cardId)
  if (!table || card?.contextTableId !== table.id || card.catalog) return app
  const find = (name: RegExp, types: string[]) => table.fields.find(field => name.test(field.name.trim()) && types.includes(field.type))
  const customerTable = isBuilderV2ContactTable(table)
  const orderTable = isBuilderV2OrderTable(table)
  const customer = customerTable ? find(/^(имя|фио|клиент|название|full name|name|customer)$/iu, ['text', 'long_text']) : undefined
  const orderNumber = orderTable ? find(/^(?:№\s*заказа|номер заказа|заказ|order(?: number| id| #)?)$/iu, ['text', 'number', 'single_select']) : undefined
  if (!customer && !orderNumber) return app
  const contact = find(/^(?:почта|e-?mail|электронная почта)$/iu, ['email', 'text'])
  const phone = find(/^(?:телефон|phone)$/iu, ['phone', 'text'])
  const city = find(/^(?:город|city)$/iu, ['text', 'single_select'])
  const buyer = find(/^(?:клиент|покупатель|customer|client)$/iu, ['text', 'single_select', 'relation'])
  const status = find(/^(?:статус|status)$/iu, ['text', 'single_select'])
  const date = find(/^(?:дата(?: заказа)?|(?:order )?date)$/iu, ['date', 'datetime'])
  const product = find(/^(?:товар|услуга|позиция|product|service|item)$/iu, ['text', 'single_select', 'relation'])
  const amount = find(/^(?:сумма (?:позиции|строки)|line (?:total|amount))(?:\s|[,(_]|$)/iu, ['number', 'formula', 'rollup'])
  const title = (customer || orderNumber)!
  const subtitle = customer ? city ?? contact ?? phone : buyer ?? date ?? status
  const recordGroup = orderNumber && product ? { fieldId: orderNumber.id, ...(amount ? { amountFieldId: amount.id } : {}) } : undefined
  const searchFieldIds = [title.id, subtitle?.id, customer ? contact?.id : product?.id, customer ? phone?.id : undefined]
    .filter((id): id is string => Boolean(id))
  app = replaceNode(app, { ...list, layout: 'list', titleFieldId: title.id, subtitleFieldId: subtitle?.id ?? null, ...(recordGroup ? { recordGroup } : {}) })
  app = { ...app, sources: app.sources.map(source => source.id === list.sourceId ? {
    ...source, searchFieldIds: [...new Set(searchFieldIds)], ...(date && orderNumber ? { sorts: [{ fieldId: date.id, direction: 'desc' as const }] } : {}),
  } : source) }

  for (const id of card.rootIds) app = removeNode(app, id)
  const preferred = customer ? [contact, phone, city] : [buyer, status, date]
  const fields = [...new Set([...preferred.filter(field => field !== undefined), ...(!recordGroup ? table.fields : [])])]
    .filter(field => field.id !== title.id && !['attachment', 'image'].includes(field.type)).slice(0, 8)
  const columnsId = v2Id()
  const details: AppV2Node[] = fields.map(field => ({
    id: v2Id(), name: field.name, type: 'field', label: field.name, value: { kind: 'row', fieldId: field.id }, visibleTo: null, visibleWhen: null,
  }))
  const roots = details.length ? [columnsId] : []
  if (details.length) app = { ...app, nodes: [...app.nodes, { id: columnsId, name: customer ? 'Контакты' : 'О заказе', type: 'columns', columns: 2, childIds: details.map(field => field.id), visibleTo: null, visibleWhen: null }, ...details] }
  app = { ...app, screens: app.screens.map(screen => screen.id === cardId ? { ...screen, recordTitleFieldId: title.id, rootIds: roots } : screen) }
  if (!recordGroup || !product) return app

  const lines = addNode(app, cardId, 'collection', tables, null, table.id)
  const collection = lines.app.nodes.find(node => node.id === lines.id)
  if (collection?.type !== 'collection') return app
  app = replaceNode(lines.app, { ...collection, name: 'Состав заказа', titleFieldId: product.id, subtitleFieldId: amount?.id ?? null })
  const groupKey = { kind: 'screen_row' as const, fieldId: recordGroup.fieldId }
  return {
    ...app,
    sources: app.sources.map(source => source.id === collection.sourceId ? {
      ...source,
      screenTableId: table.id,
      searchFieldIds: [],
      filter: { op: 'or', conditions: [
        { op: 'eq', left: { kind: 'row_id' }, right: { kind: 'screen_row_id' } },
        { op: 'and', conditions: [
          { op: 'not_empty', value: groupKey },
          { op: 'eq', left: { kind: 'row', fieldId: recordGroup.fieldId }, right: groupKey },
        ] },
      ] },
    } : source),
  }
}

/** Use the same relation, permissions and navigation as a list added by the author. */
export function addBuilderV2CustomerOrders(app: AppV2, tables: readonly BuilderV2Table[]): AppV2 {
  const orderTables = tables.filter(isBuilderV2OrderTable)
  const roots = new Set(app.screens.filter(screen => !screen.contextTableId && screen.navigation).flatMap(screen => screen.rootIds))
  for (const card of app.screens.filter(screen => screen.contextTableId && screen.recordTitleFieldId)) {
    if (!isBuilderV2ContactTable(tables.find(table => table.id === card.contextTableId))) continue
    const related = orderTables.filter(table => table.fields.filter(field => field.type === 'relation' && field.relationTableId === card.contextTableId).length === 1)
    if (related.length !== 1) continue
    const tableId = related[0]!.id
    const orderSource = app.sources.find(source => source.tableId === tableId && !source.screenTableId)
    const orders = app.nodes.find(node => node.type === 'collection' && node.sourceId === orderSource?.id && roots.has(node.id))
    if (!orderSource || orders?.type !== 'collection') continue
    const orderCard = collectionCardScreen(app, orders)
    if (!orderCard) continue

    const added = addNode(app, card.id, 'collection', tables, null, tableId)
    const list = added.app.nodes.find(node => node.id === added.id)
    if (list?.type !== 'collection') continue
    const date = related[0]!.fields.find(field => orderSource.sorts.some(sort => sort.fieldId === field.id) && ['date', 'datetime'].includes(field.type))
    app = replaceNode(added.app, { ...list, name: 'История заказов', titleFieldId: orders.titleFieldId, subtitleFieldId: date?.id ?? null, recordGroup: orders.recordGroup })
    app = updateNodeSource(app, list.id, { sorts: orderSource.sorts, searchFieldIds: [] })
    app = setCollectionCard(app, list.id, orderCard)
  }
  return app
}
