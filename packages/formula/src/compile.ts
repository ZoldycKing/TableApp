import { APP_TIME_ZONE } from '@tableapp/schema'
import type { Node } from './ast'
import { collectDependencies, FormulaError } from './ast'
import { evaluate } from './evaluate'
import type { EvalContext } from './functions'
import { parse } from './parser'
import type { Value } from './values'

/** Минимальный контракт поля: пакет формул не зависит от полной схемы. */
export type FieldLike = {
  id: string
  name: string
  type: string
  options?: Record<string, unknown>
}

export type ResultType = 'text' | 'number' | 'checkbox' | 'date' | 'unknown'

export type Compiled = {
  ast: Node
  /** id полей, от которых зависит выражение. */
  dependencies: string[]
  resultType: ResultType
}

const NUMERIC_FUNCTIONS = new Set(['LEN', 'ROUND', 'ABS', 'MIN', 'MAX', 'SUM', 'VALUE', 'DATEDIFF'])
const BOOLEAN_FUNCTIONS = new Set(['AND', 'OR', 'NOT', 'ISBLANK'])
const DATE_FUNCTIONS = new Set(['TODAY', 'NOW', 'DATEADD'])
const TEXT_FUNCTIONS = new Set(['CONCAT', 'LEFT', 'RIGHT', 'MID', 'UPPER', 'LOWER', 'TRIM', 'REPLACE', 'FORMAT_DATE'])

const FIELD_RESULT_TYPE: Record<string, ResultType> = {
  number: 'number', rollup: 'number', count: 'number',
  checkbox: 'checkbox',
  date: 'date', datetime: 'date', created_time: 'date', updated_time: 'date',
}

/** Тип результата выводится при сохранении и кэшируется: рантайм не гадает при рендеринге. */
export function inferType(node: Node, fields: ReadonlyMap<string, FieldLike>): ResultType {
  switch (node.kind) {
    case 'number': return 'number'
    case 'string': return 'text'
    case 'boolean': return 'checkbox'
    case 'blank': return 'unknown'
    case 'field': {
      const field = fields.get(node.fieldId)
      if (!field) return 'unknown'
      if (field.type === 'formula') {
        const cached = field.options?.resultType
        return typeof cached === 'string' ? (cached as ResultType) : 'unknown'
      }
      return FIELD_RESULT_TYPE[field.type] ?? 'text'
    }
    case 'unary':
      return node.op === 'not' ? 'checkbox' : 'number'
    case 'binary': {
      if (node.op === '&') return 'text'
      if (['=', '!=', '<', '>', '<=', '>='].includes(node.op)) return 'checkbox'
      return 'number'
    }
    case 'call': {
      if (NUMERIC_FUNCTIONS.has(node.name)) return 'number'
      if (BOOLEAN_FUNCTIONS.has(node.name)) return 'checkbox'
      if (DATE_FUNCTIONS.has(node.name)) return 'date'
      if (TEXT_FUNCTIONS.has(node.name)) return 'text'
      if (node.name === 'IF') {
        const a = node.args[1] ? inferType(node.args[1], fields) : 'unknown'
        const b = node.args[2] ? inferType(node.args[2], fields) : 'unknown'
        if (a === b) return a
        if (a === 'unknown') return b
        if (b === 'unknown') return a
        return 'text'
      }
      return 'unknown'
    }
  }
}

export function compile(expression: string, fields: readonly FieldLike[]): Compiled {
  const byName = new Map<string, FieldLike>()
  const byId = new Map<string, FieldLike>()
  for (const field of fields) {
    byName.set(field.name.trim().toLowerCase(), field)
    byId.set(field.id, field)
  }

  const ast = parse(expression, (name) => byName.get(name.trim().toLowerCase())?.id ?? null)
  return {
    ast,
    dependencies: [...collectDependencies(ast)],
    resultType: inferType(ast, byId),
  }
}

/**
 * Порядок пересчёта формульных полей.
 * Цикл ловится здесь, при сохранении поля, а не в рантайме на каждой строке.
 */
export function topologicalOrder(
  compiled: ReadonlyMap<string, Compiled>,
): { order: string[] } | { cycle: string[] } {
  const state = new Map<string, 'visiting' | 'done'>()
  const order: string[] = []
  const stack: string[] = []

  function visit(id: string): string[] | null {
    const mark = state.get(id)
    if (mark === 'done') return null
    if (mark === 'visiting') return [...stack.slice(stack.indexOf(id)), id]

    const node = compiled.get(id)
    if (!node) return null

    state.set(id, 'visiting')
    stack.push(id)
    for (const dependency of node.dependencies) {
      if (!compiled.has(dependency)) continue
      const cycle = visit(dependency)
      if (cycle) return cycle
    }
    stack.pop()
    state.set(id, 'done')
    order.push(id)
    return null
  }

  for (const id of compiled.keys()) {
    const cycle = visit(id)
    if (cycle) return { cycle }
  }
  return { order }
}

export type ComputeOptions = {
  now?: Date
  timeZone?: string
}

/**
 * Пересчёт формульных полей строки в порядке зависимостей.
 * Одна и та же функция работает в браузере (оптимистично) и на сервере
 * (авторитетно) — второго интерпретатора в проекте быть не должно.
 */
export function computeRow(
  data: Record<string, unknown>,
  compiled: ReadonlyMap<string, Compiled>,
  options: ComputeOptions = {},
): Record<string, unknown> {
  const plan = topologicalOrder(compiled)
  if ('cycle' in plan) {
    throw new FormulaError(`Циклическая зависимость формул: ${plan.cycle.join(' → ')}`)
  }

  const ctx: EvalContext = {
    values: { ...data },
    now: options.now ?? new Date(),
    timeZone: options.timeZone ?? APP_TIME_ZONE,
  }

  for (const fieldId of plan.order) {
    const formula = compiled.get(fieldId)!
    let value: Value
    try {
      value = evaluate(formula.ast, ctx)
    } catch {
      // Ошибка в одной строке не должна валить пересчёт остальных.
      value = null
    }
    ctx.values[fieldId] = value
  }

  return ctx.values
}
