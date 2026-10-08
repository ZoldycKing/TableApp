import type { Field, FilterCondition } from '@tableapp/schema'
import {
  defaultViewConfig,
  newId,
  normalizeFieldOptions,
  parseCellValue,
  positionBetween,
  VIEW_CONFIG_SCHEMA,
  wallClockToInstant,
  instantToWallClock,
} from '@tableapp/schema'
import { isRelativeDay, type TemplateDef, type TemplateValue } from './types'

/**
 * Разворачивание шаблона в записи базы.
 *
 * Функция чистая: на входе описание и текущий момент, на выходе готовые
 * строки для вставки. Идентификаторы выпускаются здесь же — установка шаблона
 * не копирует чужие таблицы, а создаёт человеку его собственные, которые
 * дальше живут своей жизнью.
 */

export type BuiltTable = {
  id: string
  workspaceId: string
  name: string
  icon: string
  position: string
  primaryFieldId: string | null
  templateId: string
}

export type BuiltField = {
  id: string
  tableId: string
  name: string
  type: string
  options: Record<string, unknown>
  description: string | null
  position: string
}

export type BuiltView = {
  id: string
  tableId: string
  name: string
  type: string
  config: Record<string, unknown>
  position: string
}

export type BuiltRow = {
  id: string
  tableId: string
  data: Record<string, unknown>
  position: string
  sample: boolean
}

export type BuiltTemplate = {
  tables: BuiltTable[]
  fields: BuiltField[]
  views: BuiltView[]
  rows: BuiltRow[]
  /** Таблица, по которой собирается приложение, и её представление. */
  appTableId: string
  appViewId: string
  appName: string
  inventory?: (Omit<import('@tableapp/schema').InventoryConfig, 'receiptScreenId'> & { views: { items: string; movements: string } }) | null
  /** Готовый кабинет клиента: таблица, поле с почтой, поля формы и название. */
  portal: {
    tableId: string
    /** Витрина: таблица, представление и поимённый список публичных колонок. */
    showcase: {
      tableId: string
      viewId: string
      publicFieldIds: string[]
      staffFieldIds: string[]
      titleFieldId: string
      listName: string
      cardName: string
      tabLabel: string
      intro: string
    }
    emailFieldId: string
    clientFieldIds: string[]
    staffOnlyFieldIds: string[]
    clientTitle: string
    guest: {
      screenName: string
      intro: string
      submitLabel: string
      successText: string
      /** Подписи уже по идентификаторам полей: ключи шаблона наружу не выходят. */
      labels: Record<string, string>
    }
  } | null
  /**
   * Производственный учёт: карта таблиц и колонок в выпущенных идентификаторах.
   *
   * По ней действие «сохранить выпуск» находит, куда писать, а сборщик
   * приложения — какие экраны показать какой роли.
   */
  production: {
    tables: { production: string; movements: string; norms: string; materials: string }
    views: { production: string; movements: string; norms: string; materials: string; low: string }
    run: { date: string; product: string; qty: string; defects: string; shift: string; note: string }
    norm: { product: string; material: string; perUnit: string; active: string }
    movement: { date: string; material: string; kind: string; qty: string; run: string; reason: string }
    material: { name: string; unit: string; opening: string; movements: string; stock: string; low: string; min: string }
    products: { table: string; name: string }
    movementKindId: string
    copy: { director: string; operator: string; formName: string; submitLabel: string }
  } | null
}

/** Дата примера считается от текущего дня по московскому времени. */
function relativeInstant(days: number, hour: number, minute: number, now: Date): string {
  const shifted = new Date(now.getTime() + days * 24 * 60 * 60 * 1000)
  const [year, month, day] = instantToWallClock(shifted)!.date.split('-').map(Number) as [number, number, number]
  return wallClockToInstant({
    year, month, day,
    hour,
    minute,
  }).toISOString()
}

export function buildTemplate(input: {
  template: TemplateDef
  workspaceId: string
  /** Позиция последней существующей таблицы: новые встают следом. */
  afterPosition?: string | null
  now?: Date
}): BuiltTemplate {
  const { template, workspaceId } = input
  const now = input.now ?? new Date()

  const tableIds = new Map<string, string>()
  for (const table of template.tables) tableIds.set(table.key, newId('table'))

  // id полей и вариантов выбора нужны раньше, чем строки: значения ячеек
  // ссылаются и на те, и на другие.
  const fieldIds = new Map<string, string>()
  const choiceIds = new Map<string, Map<string, string>>()
  const rowIds = new Map<string, string>()
  const key = (tableKey: string, fieldKey: string) => `${tableKey}.${fieldKey}`

  for (const table of template.tables) {
    for (const field of table.fields) {
      fieldIds.set(key(table.key, field.key), newId('field'))
      if (field.choices) {
        const byName = new Map<string, string>()
        for (const choice of field.choices) byName.set(choice.name, newId('choice'))
        choiceIds.set(key(table.key, field.key), byName)
      }
    }
    for (const row of table.rows) rowIds.set(`${table.key}.${row.key}`, newId('row'))
  }

  const tables: BuiltTable[] = []
  const fields: BuiltField[] = []
  const views: BuiltView[] = []
  const rows: BuiltRow[] = []

  let tablePosition = input.afterPosition ?? null

  for (const table of template.tables) {
    const tableId = tableIds.get(table.key)!
    tablePosition = positionBetween(tablePosition, null)

    let fieldPosition: string | null = null
    const builtFields: Field[] = []

    for (const field of table.fields) {
      const fieldId = fieldIds.get(key(table.key, field.key))!
      fieldPosition = positionBetween(fieldPosition, null)

      let options: Record<string, unknown> = { ...(field.options ?? {}) }
      if (field.choices) {
        const ids = choiceIds.get(key(table.key, field.key))!
        options.choices = field.choices.map((choice) => ({
          id: ids.get(choice.name)!,
          name: choice.name,
          color: choice.color,
        }))
      }
      if (field.relationTable) {
        options = {
          ...options,
          tableId: tableIds.get(field.relationTable)!,
          allowMultiple: field.allowMultiple ?? false,
          symmetricFieldId: null,
        }
      }
      if (field.through) {
        // Lookup и Rollup смотрят через поле-связь в свою таблицу, а целевое
        // поле лежит на той стороне связи.
        const relation = table.fields.find((candidate) => candidate.key === field.through)
        const targetTableKey = relation?.relationTable
        if (!targetTableKey) throw new Error(`Шаблон ${template.id}: связь ${field.through} не найдена`)
        options = {
          ...options,
          relationFieldId: fieldIds.get(key(table.key, field.through))!,
          targetFieldId: fieldIds.get(key(targetTableKey, field.target!))!,
          ...(field.fn ? { fn: field.fn } : {}),
        }
      }
      if (field.expression) options = { ...options, expression: field.expression }

      const built: BuiltField = {
        id: fieldId,
        tableId,
        name: field.name,
        type: field.type,
        options: normalizeFieldOptions(field.type, options),
        description: field.help ?? null,
        position: fieldPosition,
      }
      fields.push(built)
      builtFields.push(built as unknown as Field)
    }

    tables.push({
      id: tableId,
      workspaceId,
      name: table.name,
      icon: table.icon ?? 'table',
      position: tablePosition,
      primaryFieldId: fieldIds.get(key(table.key, table.primary)) ?? null,
      templateId: template.id,
    })

    let viewPosition: string | null = null
    for (const view of table.views) {
      viewPosition = positionBetween(viewPosition, null)
      const config = defaultViewConfig(view.type, newId('filter')) as Record<string, unknown>

      if (view.stackBy) config.stackFieldId = fieldIds.get(key(table.key, view.stackBy))!
      if (view.coverBy) config.coverFieldId = fieldIds.get(key(table.key, view.coverBy))!
      if (view.dateBy) config.dateFieldId = fieldIds.get(key(table.key, view.dateBy))!
      if (view.filter) {
        const condition: FilterCondition = {
          id: newId('filter'),
          fieldId: fieldIds.get(key(table.key, view.filter.field))!,
          op: view.filter.op,
          value: view.filter.value as unknown,
        }
        config.filter = { ...(config.filter as object), conditions: [condition] }
      }

      views.push({
        id: newId('view'),
        tableId,
        name: view.name,
        type: view.type,
        config: VIEW_CONFIG_SCHEMA[view.type].parse(config) as unknown as Record<string, unknown>,
        position: viewPosition,
      })
    }

    let rowPosition: string | null = null
    for (const row of table.rows) {
      rowPosition = positionBetween(rowPosition, null)
      const data: Record<string, unknown> = {}

      for (const field of table.fields) {
        const built = builtFields.find((candidate) => candidate.id === fieldIds.get(key(table.key, field.key)))!
        const raw = row.values[field.key]
        const value = resolveValue(raw, {
          choices: choiceIds.get(key(table.key, field.key)),
          relationTable: field.relationTable,
          rowIds,
          now,
        })
        // Пустые ячейки не записываем — кроме галочек, у которых «пусто»
        // и «нет» должны различаться на чтении.
        if (value === undefined) {
          if (field.type === 'checkbox') data[built.id] = false
          continue
        }
        data[built.id] = parseCellValue(built, value)
      }

      rows.push({ id: rowIds.get(`${table.key}.${row.key}`)!, tableId, data, position: rowPosition, sample: true })
    }
  }

  const appTableId = tableIds.get(template.appTable)!
  const appView = views.find((view) => view.tableId === appTableId && view.type === 'grid')
  if (!appView) throw new Error(`Шаблон ${template.id}: у таблицы приложения нет таблицы-представления`)

  const showcaseTableId = template.portal ? tableIds.get(template.portal.showcase.table)! : null
  const showcaseView = template.portal
    ? views.find(
        (view) => view.tableId === showcaseTableId && view.name === template.portal!.showcase.view,
      )
    : undefined
  if (template.portal && !showcaseView) {
    throw new Error(`Шаблон ${template.id}: у витрины нет представления «${template.portal.showcase.view}»`)
  }

  const portal = template.portal
    ? {
        tableId: tableIds.get(template.portal.table)!,
        showcase: {
          tableId: showcaseTableId!,
          viewId: showcaseView!.id,
          publicFieldIds: template.portal.showcase.publicFields.map(
            (fieldKey) => fieldIds.get(key(template.portal!.showcase.table, fieldKey))!,
          ),
          staffFieldIds: template.portal.showcase.staffFields.map(
            (fieldKey) => fieldIds.get(key(template.portal!.showcase.table, fieldKey))!,
          ),
          titleFieldId: fieldIds.get(key(template.portal.showcase.table, template.portal.showcase.publicFields[0]!))!,
          listName: template.portal.showcase.listName,
          cardName: template.portal.showcase.cardName,
          tabLabel: template.portal.showcase.tabLabel,
          intro: template.portal.showcase.intro,
        },
        emailFieldId: fieldIds.get(key(template.portal.table, template.portal.emailField))!,
        clientFieldIds: template.portal.clientFields.map(
          (fieldKey) => fieldIds.get(key(template.portal!.table, fieldKey))!,
        ),
        staffOnlyFieldIds: template.portal.staffOnlyFields.map(
          (fieldKey) => fieldIds.get(key(template.portal!.table, fieldKey))!,
        ),
        clientTitle: template.portal.clientTitle,
        guest: {
          ...template.portal.guest,
          labels: Object.fromEntries(
            Object.entries(template.portal.guest.labels).map(([fieldKey, label]) => [
              fieldIds.get(key(template.portal!.table, fieldKey))!,
              label,
            ]),
          ),
        },
      }
    : null

  const production = template.production
    ? (() => {
        const map = template.production!
        const tableId = (tableKey: string) => tableIds.get(tableKey)!
        const fieldId = (tableKey: string, fieldKey: string) => fieldIds.get(key(tableKey, fieldKey))!
        const viewId = (tableKey: string, name: string) => {
          const found = views.find((view) => view.tableId === tableId(tableKey) && view.name === name)
          if (!found) throw new Error(`Шаблон ${template.id}: нет представления «${name}»`)
          return found.id
        }
        const kindId = choiceIds.get(key(map.tables.movements, map.movement.kind))?.get(map.movementKind)
        if (!kindId) throw new Error(`Шаблон ${template.id}: нет варианта «${map.movementKind}»`)

        const of = <T extends Record<string, string>>(tableKey: string, keys: T): T =>
          Object.fromEntries(
            Object.entries(keys).map(([name, fieldKey]) => [name, fieldId(tableKey, fieldKey)]),
          ) as T

        return {
          tables: {
            production: tableId(map.tables.production),
            movements: tableId(map.tables.movements),
            norms: tableId(map.tables.norms),
            materials: tableId(map.tables.materials),
          },
          views: {
            production: viewId(map.tables.production, 'Все выпуски'),
            movements: viewId(map.tables.movements, 'Все движения'),
            norms: viewId(map.tables.norms, 'Все нормы'),
            materials: viewId(map.tables.materials, 'Все материалы'),
            low: viewId(map.tables.materials, 'Ниже нормы'),
          },
          run: of(map.tables.production, map.run),
          norm: of(map.tables.norms, map.norm),
          movement: of(map.tables.movements, map.movement),
          material: of(map.tables.materials, map.material),
          products: {
            table: tableId('products'),
            name: fieldId('products', 'name'),
          },
          movementKindId: kindId,
          copy: map.copy,
        }
      })()
    : null

  return {
    tables,
    fields,
    views,
    rows,
    appTableId,
    appViewId: appView.id,
    appName: template.appName,
    portal,
    production,
    inventory: template.inventory ? (() => {
      const map = template.inventory!
      const tableId = (key: string) => tableIds.get(key)!
      const of = <T extends Record<string, string>>(tableKey: string, keys: T): T => Object.fromEntries(
        Object.entries(keys).map(([name, fieldKey]) => [name, fieldIds.get(key(tableKey, fieldKey))!]),
      ) as T
      return {
        tables: { items: tableId(map.tables.items), movements: tableId(map.tables.movements) },
        views: { items: appView.id, movements: views.find(view => view.tableId === tableId(map.tables.movements))!.id },
        item: of(map.tables.items, map.item), movement: of(map.tables.movements, map.movement),
      }
    })() : null,
  }
}

function resolveValue(
  raw: TemplateValue | undefined,
  ctx: {
    choices?: Map<string, string>
    relationTable?: string
    rowIds: Map<string, string>
    now: Date
  },
): unknown {
  if (raw === undefined) return undefined
  if (raw === null) return null

  if (isRelativeDay(raw)) {
    return relativeInstant(raw.days, raw.hour ?? 10, raw.minute ?? 0, ctx.now)
  }
  // Связь указывает на строку той таблицы, на которую настроено поле, —
  // поэтому ключ строки достаточно короткий: `sokolov`, а не `clients.sokolov`.
  const rowId = (rowKey: string) => ctx.rowIds.get(`${ctx.relationTable}.${rowKey}`)
  if (typeof raw === 'object' && 'rowKey' in raw) {
    const id = rowId(raw.rowKey)
    if (!id) throw new Error(`Строка «${raw.rowKey}» не объявлена в связанной таблице`)
    return [id]
  }
  if (typeof raw === 'object' && 'rowKeys' in raw) {
    return raw.rowKeys.map((rowKey) => rowId(rowKey)).filter(Boolean)
  }
  // Вариант выбора задан именем: человеку описание шаблона читать, а не id.
  if (typeof raw === 'string' && ctx.choices) {
    const id = ctx.choices.get(raw)
    if (!id) throw new Error(`Вариант «${raw}» не объявлен в поле`)
    return id
  }
  return raw
}
