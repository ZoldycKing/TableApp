import type { App, Field } from '@tableapp/schema'
import { normalizeFieldOptions } from '@tableapp/schema'
import { eq, inArray } from 'drizzle-orm'

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
      if (key === 'value' || key === 'values') continue
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
    for (const id of [config.formScreenId, config.rescheduleScreenId, config.setupScreenId]) screenLink(id)
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
  if (app.inventory) {
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
  return error
}

/** The catalog contains only objects owned by the authoritative workspace. */
export async function validateAppReferences(app: App): Promise<string | null> {
  const { db, fields, tables, views } = await import('@tableapp/db')
  const scopedTables = db.select({ id: tables.id }).from(tables).where(eq(tables.workspaceId, app.workspaceId))
  const [tableRows, viewRows, fieldRows] = await Promise.all([
    scopedTables,
    db.select({ id: views.id, tableId: views.tableId }).from(views).where(inArray(views.tableId, scopedTables)),
    db.select().from(fields).where(inArray(fields.tableId, scopedTables)),
  ])
  return checkAppReferences(app, {
    tableIds: new Set(tableRows.map((row) => row.id)),
    views: new Map(viewRows.map((row) => [row.id, row])),
    fields: new Map(fieldRows.map((row) => [row.id, {
      ...row, options: normalizeFieldOptions(row.type as Field['type'], row.options),
    } as unknown as Field])),
  })
}
