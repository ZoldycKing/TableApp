import type { App, Block, BlockProblem, Field, RoleId, View } from '@tableapp/schema'
import {
  byPosition,
  computeMetric,
  countByChoice,
  evalFilter,
  indexFields,
  RANGE_COMPARE,
  RANGE_LABELS,
  sortRows,
  validateBlock,
} from '@tableapp/schema'
import { applyView } from './apply-view'
import { formatCell } from './format'
import type { TableRow } from './table-store'

/**
 * Что показать в блоках сводки.
 *
 * Считается **на сервере**, и это не оптимизация, а требование прав. Число
 * «сумма по себестоимости» — такие же данные, как и сама себестоимость:
 * посчитай его в браузере, и значения каждой строки придётся туда отправить.
 * Поэтому наружу уезжает готовое число, а строки, по которым оно посчитано,
 * остаются на сервере.
 *
 * Порядок расчёта задан и его нельзя менять:
 *
 * ```
 * доступ к экрану → доступ к строкам → читаемые поля
 *   → отбор представления → отбор блока → подсчёт → показ
 * ```
 *
 * Первые три шага выполняет `loadRuntimeForApp` до вызова этого модуля: сюда
 * приходят строки, которые человеку уже положены, с полями, которые ему уже
 * положены. Отбор блока идёт после прав и может только сузить выборку — своих
 * прав у него нет.
 *
 * Модуль чистый: ни базы, ни браузера, ни времени, кроме переданного.
 */

export type MetricResult = {
  kind: 'metric'
  /** Готовая строка: «187 400 ₽». Число не отправляем — показывать его нечем. */
  text: string
  /** Рост в процентах или null. */
  delta: number | null
  /** «в этом месяце» или «к прошлому месяцу» — что показать под числом. */
  caption: string
  /** Есть ли с чем сравнивать: от этого зависит, рисовать ли стрелку. */
  compared: boolean
}

export type ListItemResult = {
  rowId: string
  title: string
  subtitle: string
  /** Подпись-плашкой, когда подпись берётся из колонки выбора. */
  choice: { name: string; color: string } | null
  meta: string
}

export type ListResult = {
  kind: 'list'
  items: ListItemResult[]
  /** Сколько записей всего подошло: «Все →» ведёт именно к ним. */
  total: number
}

export type PipelineColumnResult = {
  id: string
  name: string
  color: string
  count: number
  cards: { rowId: string; title: string }[]
}

export type PipelineResult = {
  kind: 'pipeline'
  columns: PipelineColumnResult[]
  total: number
}

/** Блок, настройки которого больше не работают: показываем это владельцу. */
export type BrokenResult = { kind: 'broken'; problems: BlockProblem[] }

export type BlockResult = MetricResult | ListResult | PipelineResult | BrokenResult

export type DashboardResults = Record<string, BlockResult>

type SourceTable = { fields: readonly Field[]; rows: readonly TableRow[] }

export type ComputeArgs = {
  blocks: readonly Block[]
  views: Readonly<Record<string, View>>
  /** Строки, уже отобранные по правам: чужого и непоказанного в них нет. */
  tables: Readonly<Record<string, SourceTable>>
  /** Поля, которые роль вправе прочитать, по таблице. Пусто — ограничений нет. */
  readable?: Readonly<Record<string, ReadonlySet<string>>>
  screenIds: ReadonlySet<string>
  roleIds: ReadonlySet<string>
  roleName?: string
  now?: Date
}

/**
 * Строки представления — один раз на представление.
 *
 * Шесть блоков по одной таблице раньше прогоняли `applyView` шесть раз.
 * Считаем по разу и раздаём: блоков на сводке бывает десяток, а строк
 * в таблице — тысячи.
 */
function sourceRows(args: ComputeArgs): Map<string, { rows: TableRow[]; fields: readonly Field[] }> {
  const cache = new Map<string, { rows: TableRow[]; fields: readonly Field[] }>()

  for (const block of args.blocks) {
    if (!('source' in block)) continue
    const viewId = block.source.viewId
    if (cache.has(viewId)) continue

    const view = args.views[viewId]
    const table = view ? args.tables[view.tableId] : undefined
    if (!view || !table) continue

    cache.set(viewId, {
      rows: applyView(table.rows as TableRow[], table.fields, view.config).rows as TableRow[],
      fields: table.fields,
    })
  }

  return cache
}

/** Отбор и сортировка самого блока — поверх представления, а не вместо него. */
function narrow(block: Block, rows: readonly TableRow[], fields: readonly Field[]): TableRow[] {
  if (!('source' in block)) return [...rows]
  const index = indexFields(fields)
  const filtered = block.filter
    ? rows.filter((row) => evalFilter(block.filter, row.data, index))
    : [...rows]
  return block.sorts.length > 0 ? sortRows(filtered, block.sorts, index) : filtered
}

function fieldOf(fields: readonly Field[], id: string | null | undefined): Field | undefined {
  return id ? fields.find((field) => field.id === id) : undefined
}

/**
 * Сколько знаков после запятой показать.
 *
 * В сводке копейки — шум: «11 960,00 ₽» и длиннее, и читается хуже, чем
 * «11 960 ₽», а в узкой плитке ещё и не помещается. На мелких величинах
 * дробная часть, наоборот, и есть содержание — там она остаётся.
 */
function digitsFor(value: number): number {
  return Math.abs(value) >= 1000 ? 0 : 2
}

/**
 * Число в том же виде, в каком человек видит его в таблице.
 *
 * `auto` берёт настройки колонки: рубли остаются рублями, и владельцу
 * не приходится отдельно объяснять сводке, что «Сумма» — это деньги.
 */
function showNumber(
  value: number | null,
  field: Field | undefined,
  format: 'auto' | 'plain' | 'currency' | 'percent',
): string {
  if (value === null) return '—'

  const kind =
    format !== 'auto'
      ? format
      : field && field.type === 'number'
        ? (field.options.format as 'currency' | 'percent' | 'plain') || 'plain'
        : 'plain'

  if (kind === 'currency') {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: (field?.type === 'number' && field.options.currency) || 'RUB',
      maximumFractionDigits: digitsFor(value),
    }).format(value)
  }
  if (kind === 'percent') {
    // Колонка процентов хранит долю, поэтому Intl сам умножает на сто.
    return new Intl.NumberFormat('ru-RU', { style: 'percent', maximumFractionDigits: 1 }).format(value)
  }
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: digitsFor(value) }).format(value)
}

function choiceOf(field: Field | undefined, value: unknown): { name: string; color: string } | null {
  if (!field || (field.type !== 'single_select' && field.type !== 'multi_select')) return null
  const id = Array.isArray(value) ? value[0] : value
  const choice = field.options.choices.find((item) => item.id === id)
  return choice ? { name: choice.name, color: choice.color } : null
}

/** Итоги всех блоков сводки, по идентификатору блока. */
export function computeBlocks(args: ComputeArgs): DashboardResults {
  const out: DashboardResults = {}
  const cache = sourceRows(args)

  const context = {
    views: Object.fromEntries(
      Object.values(args.views).map((view) => [view.id, { id: view.id, name: view.name, tableId: view.tableId }]),
    ),
    fields: Object.fromEntries(
      Object.entries(args.tables).map(([tableId, table]) => [tableId, table.fields]),
    ),
    screenIds: args.screenIds,
    roleIds: args.roleIds,
    readable: args.readable,
    roleName: args.roleName,
  }

  for (const block of args.blocks) {
    // Кнопки и заметка ничего не считают: их содержимое лежит в определении.
    if (block.type === 'actions' || block.type === 'note') continue

    const problems = validateBlock(block, context)
    if (problems.some((problem) => problem.level === 'error')) {
      out[block.id] = { kind: 'broken', problems }
      continue
    }

    const source = cache.get(block.source.viewId)
    if (!source) {
      out[block.id] = {
        kind: 'broken',
        problems: [{ level: 'error', text: 'Представление недоступно — блоку неоткуда брать данные.' }],
      }
      continue
    }

    const rows = narrow(block, source.rows, source.fields)

    if (block.type === 'metric') {
      const field = fieldOf(source.fields, block.fieldId)
      const result = computeMetric(block, rows, args.now)
      const countLike = block.kind === 'count' || block.kind === 'count_filled'

      out[block.id] = {
        kind: 'metric',
        text: countLike
          ? new Intl.NumberFormat('ru-RU').format(result.value ?? 0)
          : showNumber(result.value, field, block.format),
        delta: result.delta,
        caption: result.delta !== null ? RANGE_COMPARE[block.range] : RANGE_LABELS[block.range],
        compared: result.previous !== null,
      }
      continue
    }

    if (block.type === 'list') {
      const title = fieldOf(source.fields, block.titleFieldId)
      const subtitle = fieldOf(source.fields, block.subtitleFieldId)
      const meta = fieldOf(source.fields, block.metaFieldId)

      out[block.id] = {
        kind: 'list',
        total: rows.length,
        items: rows.slice(0, block.limit).map((row) => {
          const choice = choiceOf(subtitle, subtitle ? row.data[subtitle.id] : null)
          return {
            rowId: row.id,
            title: (title ? formatCell(title, row.data[title.id]) : '') || 'Без названия',
            subtitle: subtitle && !choice ? formatCell(subtitle, row.data[subtitle.id]) : '',
            choice,
            meta: meta ? formatCell(meta, row.data[meta.id]) : '',
          }
        }),
      }
      continue
    }

    const stack = fieldOf(source.fields, block.stackFieldId)
    const cardTitle = fieldOf(source.fields, block.cardTitleFieldId)
    const counts = countByChoice(rows, stack)

    out[block.id] = {
      kind: 'pipeline',
      total: counts.reduce((sum, item) => sum + item.count, 0),
      columns: counts.map((column) => ({
        ...column,
        cards:
          block.cardLimit > 0 && cardTitle && stack
            ? rows
                .filter((row) => {
                  const value = row.data[stack.id]
                  return Array.isArray(value) ? value.includes(column.id) : value === column.id
                })
                .slice(0, block.cardLimit)
                .map((row) => ({
                  rowId: row.id,
                  title: formatCell(cardTitle, row.data[cardTitle.id]) || 'Без названия',
                }))
            : [],
      })),
    }
  }

  return out
}

/**
 * Итоги сводки для всех экранов приложения.
 *
 * Считаются разом: экранов-сводок у приложения обычно один-два, а держать
 * расчёт в компоненте нельзя — он тогда уедет в браузер вместе со строками.
 */
export function computeDashboards(
  app: App,
  args: Omit<ComputeArgs, 'blocks' | 'screenIds' | 'roleIds' | 'roleName'> & { role?: RoleId },
): DashboardResults {
  const screenIds = new Set(app.screens.map((screen) => screen.id))
  const roleIds = new Set(app.roles.map((role) => role.id))
  const blocks = app.screens.flatMap((screen) =>
    screen.type === 'dashboard' ? [...screen.blocks].sort(byPosition) : [],
  )
  if (blocks.length === 0) return {}

  return computeBlocks({
    ...args,
    blocks,
    screenIds,
    roleIds,
    roleName: args.role ? app.roles.find((role) => role.id === args.role)?.name : undefined,
  })
}
