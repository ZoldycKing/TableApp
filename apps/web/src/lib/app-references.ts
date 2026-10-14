import type { App, Field } from '@tableapp/schema'
import { customerWorkflows, normalizeFieldOptions } from '@tableapp/schema'
import { eq, inArray } from 'drizzle-orm'
import { checkAppModules } from './app-modules'
import { orderStockPair } from './order-stock-config'

export type AppReferenceCatalog = {
  tableIds: Set<string>
  views: Map<string, { tableId: string }>
  fields: Map<string, Field>
}

const INVALID_REFERENCE = 'Приложение ссылается на недоступную таблицу, представление или поле'

/** Check references in their table context; literal cell values are not definitions. */
export function checkAppReferences(app: App, catalog: AppReferenceCatalog): string | null {
  const screenIds = new Set(app.screens.map((screen) => screen.id))
  let error: string | null = screenIds.size !== app.screens.length ? 'Идентификаторы экранов повторяются' : null
  const invalid = (kind: string, id: string) => { error ??= `${INVALID_REFERENCE} (${kind}: ${id})` }
  const table = (id: string | null | undefined) => {
    if (id && !catalog.tableIds.has(id)) invalid('таблица', id)
    return id || undefined
  }
  const field = (id: string, tableId?: string) => {
    if (id && (!tableId || catalog.fields.get(id)?.tableId !== tableId)) invalid('поле', id)
  }
  const screenLink = (id: unknown) => {
    if (typeof id === 'string' && id && !screenIds.has(id)) invalid('экран', id)
  }
  const sourceTable = (value: { viewId: string }) => {
    const view = catalog.views.get(value.viewId)
    if (value.viewId && !view) invalid('представление', value.viewId)
    return view?.tableId
  }

  function walk(value: unknown, tableId?: string): void {
    if (!value || typeof value !== 'object') return
    if (Array.isArray(value)) {
      for (const item of value) walk(item, tableId)
      return
    }
    const object = value as Record<string, unknown>
    if (object.kind === 'literal') return

    if (object.type === 'open_screen' && object.initialValues) {
      const target = app.screens.find(screen => screen.id === object.screenId)
      if (!target || target.type !== 'form' || target.mode !== 'create') invalid('форма создания', String(object.screenId))
      for (const [id, binding] of Object.entries(object.initialValues as Record<string, unknown>)) {
        field(id, target?.type === 'form' ? target.tableId : undefined)
        if (target?.type === 'form' && !target.components.some(component => component.type === 'form_field' && component.fieldId === id)) invalid('поле формы', id)
        walk(binding, tableId)
      }
    }

    // Bindings read from the current row, even when the action creates another row.
    if (object.type === 'create_row' || object.type === 'update_row') {
      const target = object.type === 'create_row' ? table(object.tableId as string) : tableId
      for (const [id, binding] of Object.entries((object.values ?? {}) as Record<string, unknown>)) {
        field(id, target)
        walk(binding, tableId)
      }
      return
    }
    let relatedTable: string | undefined
    if (object.type === 'related_list') {
      const id = object.relationFieldId as string
      field(id, tableId)
      const relation = catalog.fields.get(id)
      if (id && relation?.type !== 'relation') invalid('поле связи', id)
      if (relation?.type === 'relation') relatedTable = table(relation.options.tableId)
    }
    for (const [key, item] of Object.entries(object)) {
      // Filters contain arbitrary user data in value, not more references.
      if (key === 'value' || key === 'values' || key === 'initialValues') continue
      if (key.endsWith('ScreenId') || key === 'screenId') screenLink(item)
      else if (key.endsWith('FieldId') || key === 'fieldId') {
        if (typeof item === 'string') {
          const context = object.type === 'related_list' && key !== 'relationFieldId' ? relatedTable : tableId
          field(item, context)
        }
      } else if (key.endsWith('FieldIds') || key === 'publicFields') {
        if (Array.isArray(item)) for (const id of item) if (typeof id === 'string') field(id, tableId)
      } else walk(item, tableId)
    }
  }

  screenLink(app.homeScreenId)
  for (const screen of app.screens) {
    if (screen.type === 'dashboard') {
      const blockTables = new Set(screen.blocks.flatMap((block) => 'source' in block ? [sourceTable(block.source)] : []))
      for (const id of screen.access.publicFields) {
        const own = catalog.fields.get(id)
        if (id && (!own || !blockTables.has(own.tableId))) invalid('публичное поле', id)
      }
      for (const block of screen.blocks) {
        walk(block, 'source' in block ? sourceTable(block.source) : undefined)
      }
    } else {
      const tableId = 'source' in screen ? sourceTable(screen.source) : table(screen.tableId)
      walk(screen, tableId)
    }
  }
  for (const rule of app.rowAccessRules) {
    field(rule.fieldId, table(rule.tableId))
  }
  if (app.production) {
    const config = app.production
    for (const id of Object.values(config.tables)) table(id)
    for (const [group, tableId] of [
      [config.run, config.tables.production], [config.norm, config.tables.norms],
      [config.movement, config.tables.movements], [config.material, config.tables.materials],
    ] as const) for (const id of Object.values(group)) field(id, tableId)
    if (config.stock) {
      const itemsTableId = table(config.stock.itemsTableId), pair = orderStockPair(app)
      if (!pair || pair.inventory.tables.items !== itemsTableId) invalid('склад готовой продукции', config.stock.itemsTableId)
      field(config.stock.materialStockFieldId, config.tables.materials)
      const materialStock = catalog.fields.get(config.stock.materialStockFieldId), opening = catalog.fields.get(config.material.opening)
      const sum = [...catalog.fields.values()].find(field => field.tableId === config.tables.materials && field.type === 'rollup' &&
        field.options.relationFieldId === config.material.movements && field.options.targetFieldId === config.movement.qty && field.options.fn === 'sum')
      if (!sum || materialStock?.type !== 'formula' || materialStock.options.expression !== `{${opening?.name}} + {${sum.name}}`) invalid('остаток материала', config.stock.materialStockFieldId)
      for (const id of [config.run.product, config.norm.product]) {
        const product = catalog.fields.get(id)
        if (product?.type !== 'relation' || product.options.tableId !== itemsTableId || product.options.allowMultiple) invalid('товар выпуска', id)
      }
    }
    screenLink(config.formScreenId)
    screenLink(config.movementScreenId)
  }
  if (app.booking) {
    const config = app.booking
    if (new Set(Object.values(config.tables)).size !== 4) invalid('раздельные таблицы записи', config.tables.visits)
    for (const id of Object.values(config.tables)) table(id)
    const groups = [[config.service, config.tables.services], [config.master, config.tables.masters],
      [config.schedule, config.tables.schedule], [config.visit, config.tables.visits]] as const
    for (const [group, tableId] of groups) for (const id of Object.values(group)) field(id, tableId)
    for (const id of [config.listScreenId, config.formScreenId, config.rescheduleScreenId, config.setupScreenId]) screenLink(id)
    if (config.listScreenId) {
      const list = app.screens.find(screen => screen.id === config.listScreenId)
      if (!list || (list.type !== 'list' && list.type !== 'tiles') || catalog.views.get(list.source.viewId)?.tableId !== config.tables.visits || !list.access.roles.includes('client')) invalid('экран посещений клиента', config.listScreenId)
    }
    for (const [id, tableId, mode] of [[config.formScreenId, config.tables.visits, 'create'], [config.rescheduleScreenId, config.tables.visits, 'edit'], [config.setupScreenId, config.tables.masters, 'create']] as const) {
      const screen = app.screens.find(s => s.id === id)
      if (!screen || screen.type !== 'form' || screen.tableId !== tableId || screen.mode !== mode) invalid('форма записи', id)
    }
    for (const [id, type] of [[config.service.price, 'number'], [config.service.minutes, 'number'], [config.service.active, 'checkbox'],
      [config.master.email, 'email'], [config.master.active, 'checkbox'], [config.visit.email, 'email'], [config.visit.masterEmail, 'email'],
      [config.visit.start, 'datetime'], [config.visit.minutes, 'number'], [config.visit.price, 'number'], [config.visit.status, 'single_select'],
      [config.schedule.weekday, 'single_select'], [config.schedule.start, 'text'], [config.schedule.end, 'text'], [config.schedule.date, 'date'], [config.schedule.closed, 'checkbox']] as const) {
      if (catalog.fields.get(id)?.type !== type) invalid('поле записи', id)
    }
    for (const [id, target] of [[config.master.services, config.tables.services], [config.schedule.master, config.tables.masters],
      [config.visit.service, config.tables.services], [config.visit.master, config.tables.masters]] as const) {
      const relation = catalog.fields.get(id)
      if (relation?.type !== 'relation' || relation.options.tableId !== target) invalid('связь записи', id)
    }
    const status = catalog.fields.get(config.visit.status)
    if (status?.type !== 'single_select' || Object.values(config.statuses).some(id => !status.options.choices.some(choice => choice.id === id))) invalid('статус записи', config.visit.status)
    const weekday = catalog.fields.get(config.schedule.weekday)
    if (weekday?.type !== 'single_select' || new Set(config.weekdays).size !== 7 || config.weekdays.some(id => !weekday.options.choices.some(choice => choice.id === id))) invalid('дни недели', config.schedule.weekday)
  }
  const customerConfigs = customerWorkflows(app)
  if (new Set(customerConfigs.map(config => config.tableId)).size !== customerConfigs.length) invalid('повторяющийся клиентский раздел', app.id)
  for (const c of customerConfigs) {
    table(c.tableId)
    if (c.profile) for (const [id, type] of [[c.profile.nameFieldId, 'text'], [c.profile.phoneFieldId, 'phone']]) {
      field(id!, c.tableId)
      if (catalog.fields.get(id!)?.type !== type) invalid('контакт клиента', id!)
    }
    for (const id of [c.emailFieldId, c.statusFieldId, c.assignmentFieldId, c.createdFieldId, c.submissionFieldId]) if (id) field(id, c.tableId)
    for (const [id, type] of [[c.emailFieldId, 'email'], [c.statusFieldId, 'single_select'], ...(c.assignmentFieldId ? [[c.assignmentFieldId, 'email']] : []), ...(c.createdFieldId ? [[c.createdFieldId, 'datetime']] : []), ...(c.submissionFieldId ? [[c.submissionFieldId, 'text']] : [])]) if (catalog.fields.get(id!)?.type !== type) invalid('поле клиентского сценария', id!)
    for (const id of [c.listScreenId, c.detailScreenId, c.formScreenId]) screenLink(id)
    const form = app.screens.find(screen => screen.id === c.formScreenId)
    const detail = app.screens.find(screen => screen.id === c.detailScreenId)
    const list = app.screens.find(screen => screen.id === c.listScreenId)
    if (!form || form.type !== 'form' || form.mode !== 'create' || form.tableId !== c.tableId) invalid('клиентская форма', c.formScreenId)
    if (!detail || detail.type !== 'detail' || detail.tableId !== c.tableId) invalid('клиентская карточка', c.detailScreenId)
    if (!list || !('source' in list) || sourceTable(list.source) !== c.tableId) invalid('клиентский список', c.listScreenId)
    if (!app.rowAccessRules.some(rule => rule.tableId === c.tableId && rule.fieldId === c.emailFieldId && rule.match === 'email' && rule.appliesTo.includes('client'))) invalid('принадлежность клиентской записи', c.emailFieldId)
    const status = catalog.fields.get(c.statusFieldId)
    const statuses = [c.initialStatus, c.cancelStatus, ...c.terminalStatuses, ...c.cancellableStatuses, ...(c.logistics ? [c.logistics.shippedStatus, c.logistics.deliveredStatus, ...(c.logistics.kind === 'delivery' ? [c.logistics.returnedStatus, c.logistics.missedStatus] : [])] : []), ...(c.approval ? [c.approval.waitingStatus, c.approval.approvedStatus, c.approval.declinedStatus, ...(c.approval.consentRequiredStatuses ?? [])] : []), ...(c.appointment ? [c.appointment.confirmedStatus] : [])]
    if (status?.type !== 'single_select' || statuses.some(id => !status.options.choices.some(choice => choice.id === id))) invalid('статус клиентского сценария', c.statusFieldId)
    if (c.logistics) {
      field(c.logistics.addressFieldId, c.tableId)
      if (catalog.fields.get(c.logistics.addressFieldId)?.type !== 'text' || !c.profile || !c.assignmentFieldId) invalid('контакты доставки', c.tableId)
      if (c.logistics.kind === 'sales' && !c.cart) invalid('заказ доставки', c.tableId)
      if (c.logistics.kind === 'delivery') {
        field(c.logistics.contentsFieldId, c.tableId)
        if (!['text', 'long_text'].includes(catalog.fields.get(c.logistics.contentsFieldId)?.type ?? '') || c.cart) invalid('содержимое доставки', c.logistics.contentsFieldId)
      }
      if (!c.terminalStatuses.includes(c.logistics.deliveredStatus) || c.logistics.shippedStatus === c.cancelStatus || c.logistics.shippedStatus === c.initialStatus || c.terminalStatuses.includes(c.logistics.shippedStatus)) invalid('этапы доставки', c.statusFieldId)
      const stages = [c.initialStatus, c.cancelStatus, c.logistics.shippedStatus, c.logistics.deliveredStatus, ...(c.logistics.kind === 'delivery' ? [c.logistics.returnedStatus, c.logistics.missedStatus] : [])]
      if (new Set(stages).size !== stages.length || c.cancellableStatuses.includes(c.logistics.shippedStatus) || c.logistics.kind === 'delivery' && (!c.terminalStatuses.includes(c.logistics.returnedStatus) || c.terminalStatuses.includes(c.logistics.missedStatus))) invalid('согласованные этапы доставки', c.statusFieldId)
    }
    if (c.crm) {
      const crm = c.crm
      table(crm.clientsTableId); field(crm.relationFieldId, c.tableId)
      for (const id of [crm.emailFieldId, crm.nameFieldId, crm.phoneFieldId]) field(id, crm.clientsTableId)
      const relation = catalog.fields.get(crm.relationFieldId)
      if (c.tableId === crm.clientsTableId || relation?.type !== 'relation' || relation.options.tableId !== crm.clientsTableId || relation.options.allowMultiple || catalog.fields.get(crm.emailFieldId)?.type !== 'email' || catalog.fields.get(crm.nameFieldId)?.type !== 'text' || catalog.fields.get(crm.phoneFieldId)?.type !== 'phone') invalid('клиент сделки', crm.relationFieldId)
      for (const [id, type] of [[crm.listScreenId, 'list'], [crm.detailScreenId, 'detail']] as const) if (id) {
        screenLink(id)
        const screen = app.screens.find(screen => screen.id === id)
        if (!screen || (type === 'list' ? screen.type !== 'list' && screen.type !== 'tiles' : screen.type !== 'detail') || ('tableId' in screen ? screen.tableId : 'source' in screen ? sourceTable(screen.source) : null) !== crm.clientsTableId || screen.access.public || screen.access.roles.some(id => app.roles.some(role => role.id === id && role.isDefault))) invalid('внутренний экран клиентов', id)
      }
    }
    if (c.catalog) {
      const cat = c.catalog
      table(cat.tableId); sourceTable({ viewId: cat.viewId }); screenLink(cat.detailScreenId)
      if (catalog.views.get(cat.viewId)?.tableId !== cat.tableId) invalid('витрина', cat.viewId)
      field(cat.titleFieldId, cat.tableId); field(cat.activeFieldId, cat.tableId)
      if (catalog.fields.get(cat.activeFieldId)?.type !== 'checkbox') invalid('публикация витрины', cat.activeFieldId)
      if (cat.selectionFieldId) {
        field(cat.selectionFieldId, c.tableId)
        const relation = catalog.fields.get(cat.selectionFieldId)
        if (relation?.type !== 'relation' || relation.options.tableId !== cat.tableId) invalid('выбранная услуга', cat.selectionFieldId)
      }
    }
    if (c.cart) {
      const cart = c.cart
      table(cart.itemsTableId)
      field(cart.fieldId, c.tableId); field(cart.positionsFieldId, c.tableId); field(cart.priceFieldId, c.catalog?.tableId)
      for (const id of [cart.nameFieldId, cart.quantityFieldId, cart.itemPriceFieldId, cart.itemEmailFieldId, cart.itemAssignmentFieldId]) field(id, cart.itemsTableId)
      const relation = catalog.fields.get(cart.positionsFieldId)
      if (!c.catalog || c.tableId === cart.itemsTableId || cart.itemsTableId === c.catalog.tableId || relation?.type !== 'relation' || relation.options.tableId !== cart.itemsTableId) invalid('состав заказа', cart.positionsFieldId)
      for (const [id, type] of [[cart.fieldId, 'long_text'], [cart.priceFieldId, 'number'], [cart.quantityFieldId, 'number'], [cart.itemPriceFieldId, 'number'], [cart.itemEmailFieldId, 'email'], [cart.itemAssignmentFieldId, 'email']]) if (catalog.fields.get(id!)?.type !== type) invalid('поле корзины', id!)
      if (!app.rowAccessRules.some(rule => rule.tableId === cart.itemsTableId && rule.fieldId === cart.itemEmailFieldId && rule.match === 'email' && rule.appliesTo.includes('client'))) invalid('принадлежность позиции', cart.itemEmailFieldId)
      if (cart.productFieldId) {
        field(cart.productFieldId, cart.itemsTableId)
        const product = catalog.fields.get(cart.productFieldId)
        if (product?.type !== 'relation' || product.options.tableId !== c.catalog?.tableId || product.options.allowMultiple) invalid('товар позиции заказа', cart.productFieldId)
      }
    }
    if (c.stock && (!c.cart?.productFieldId || !c.cancellableStatuses.includes(c.stock.confirmedStatus) || c.stock.confirmedStatus === c.initialStatus)) invalid('подтверждение складского заказа', c.stock.confirmedStatus)
    if (c.approval) for (const id of [c.approval.priceFieldId, c.approval.approvedPriceFieldId]) {
      field(id, c.tableId)
      if (catalog.fields.get(id)?.type !== 'number') invalid('стоимость ремонта', id)
    }
    if (c.appointment) {
      field(c.appointment.fieldId, c.tableId)
      if (!c.assignmentFieldId || catalog.fields.get(c.appointment.fieldId)?.type !== 'datetime') invalid('время просмотра', c.appointment.fieldId)
    }
    if (c.parent) {
      table(c.parent.tableId); field(c.parent.relationFieldId, c.tableId); field(c.parent.emailFieldId, c.parent.tableId)
      const relation = catalog.fields.get(c.parent.relationFieldId)
      if (relation?.type !== 'relation' || relation.options.tableId !== c.parent.tableId || catalog.fields.get(c.parent.emailFieldId)?.type !== 'email') invalid('заказ обращения', c.parent.relationFieldId)
      if (!app.rowAccessRules.some(rule => rule.tableId === c.parent!.tableId && rule.fieldId === c.parent!.emailFieldId && rule.match === 'email' && rule.appliesTo.includes('client'))) invalid('принадлежность заказа', c.parent.emailFieldId)
    }
  }
  if (app.inventory) {
    if (app.modules && app.modules.length > 1 && !orderStockPair(app)) invalid('общий каталог продаж и склада', app.inventory.tables.items)
    const config = app.inventory
    table(config.tables.items); table(config.tables.movements)
    for (const id of Object.values(config.item)) if (id) field(id, config.tables.items)
    for (const id of Object.values(config.movement)) field(id, config.tables.movements)
    screenLink(config.receiptScreenId)
    const receipt = app.screens.find(s => s.id === config.receiptScreenId)
    if (!receipt || receipt.type !== 'form' || receipt.mode !== 'create' || receipt.tableId !== config.tables.movements) invalid('экран приёмки', config.receiptScreenId ?? '')
    const relation = catalog.fields.get(config.item.movements)
    if (relation?.type !== 'relation' || relation.options.tableId !== config.tables.movements) invalid('связь приёмок', config.item.movements)
    const item = catalog.fields.get(config.movement.item)
    if (item?.type !== 'relation' || item.options.tableId !== config.tables.items) invalid('связь товара', config.movement.item)
    for (const [id, type] of [[config.item.opening, 'number'], [config.item.stock, 'formula'],
      [config.movement.qty, 'number'], [config.movement.date, 'datetime'], [config.movement.author, 'email'],
      [config.movement.note, 'text'], [config.movement.name, 'text']] as const) {
      if (catalog.fields.get(id)?.type !== type) invalid('поле складского учёта', id)
    }
    const rollup = [...catalog.fields.values()].find(field => field.tableId === config.tables.items && field.type === 'rollup' &&
      field.options.relationFieldId === config.item.movements && field.options.targetFieldId === config.movement.qty && field.options.fn === 'sum')
    const opening = catalog.fields.get(config.item.opening), stock = catalog.fields.get(config.item.stock)
    if (!rollup || stock?.type !== 'formula' || stock.options.expression !== `{${opening?.name}} + {${rollup.name}}`) invalid('формула остатка', config.item.stock)
    if (config.operations) {
      const ops = config.operations
      if (new Set([...Object.values(config.movement), ...Object.values(ops.fields)]).size !== 9) invalid('раздельные поля движения', ops.fields.before)
      for (const [name, id] of Object.entries(ops.fields)) {
        field(id, config.tables.movements)
        if (catalog.fields.get(id)?.type !== (name === 'kind' ? 'single_select' : 'number')) invalid('поле движения', id)
      }
      const kind = catalog.fields.get(ops.fields.kind)
      const choices = kind?.type === 'single_select' ? kind.options.choices : []
      if (new Set(Object.values(ops.kinds)).size !== 6 || Object.values(ops.kinds).some(id => !choices.some(choice => choice.id === id))) invalid('виды движений', ops.fields.kind)
      const screenIds = [config.receiptScreenId, ...Object.values(ops.screens)]
      if (new Set(screenIds).size !== 6) invalid('экраны движений', config.receiptScreenId ?? '')
      for (const id of Object.values(ops.screens)) {
        screenLink(id)
        const screen = app.screens.find(s => s.id === id)
        if (!screen || screen.type !== 'form' || screen.mode !== 'create' || screen.tableId !== config.tables.movements) invalid('экран движения', id)
      }
    }
  }
  return error ?? checkAppModules(app, catalog)
}

/** The catalog contains only objects owned by the authoritative workspace. */
export async function validateAppReferences(app: App, transaction?: import('./db-transaction').Transaction): Promise<string | null> {
  const { db, fields, tables, views } = await import('@tableapp/db')
  const runner = transaction ?? db
  const scopedTables = runner.select({ id: tables.id }).from(tables).where(eq(tables.workspaceId, app.workspaceId))
  const [tableRows, viewRows, fieldRows] = await Promise.all([
    scopedTables,
    runner.select({ id: views.id, tableId: views.tableId }).from(views).where(inArray(views.tableId, scopedTables)),
    runner.select().from(fields).where(inArray(fields.tableId, scopedTables)),
  ])
  return checkAppReferences(app, {
    tableIds: new Set(tableRows.map((row) => row.id)),
    views: new Map(viewRows.map((row) => [row.id, row])),
    fields: new Map(fieldRows.map((row) => [row.id, {
      ...row, options: normalizeFieldOptions(row.type as Field['type'], row.options),
    } as unknown as Field])),
  })
}
