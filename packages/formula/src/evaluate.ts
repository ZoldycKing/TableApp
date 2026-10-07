import type { BinaryOp, Node } from './ast'
import { FormulaError } from './ast'
import type { EvalContext } from './functions'
import { lookupFunction } from './functions'
import type { Value } from './values'
import { looksNumeric, toBool, toNumber, toText } from './values'

/** Ячейка может хранить массив (связь, мультивыбор, lookup) — приводим к скаляру. */
function cellToValue(raw: unknown): Value {
  if (raw === null || raw === undefined) return null
  if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') return raw
  if (Array.isArray(raw)) {
    if (raw.length === 0) return null
    if (raw.length === 1) return cellToValue(raw[0])
    return raw.map((item) => toText(cellToValue(item))).join(', ')
  }
  if (typeof raw === 'object' && 'name' in (raw as Record<string, unknown>)) {
    return String((raw as Record<string, unknown>).name)
  }
  return String(raw)
}

function compare(op: BinaryOp, left: Value, right: Value): boolean {
  if (looksNumeric(left) && looksNumeric(right)) {
    const a = toNumber(left)!
    const b = toNumber(right)!
    switch (op) {
      case '=': return a === b
      case '!=': return a !== b
      case '<': return a < b
      case '>': return a > b
      case '<=': return a <= b
      case '>=': return a >= b
    }
  }
  // Текст сравнивается без учёта регистра — так же, как в фильтрах представлений.
  const a = toText(left).toLowerCase()
  const b = toText(right).toLowerCase()
  switch (op) {
    case '=': return a === b
    case '!=': return a !== b
    case '<': return a < b
    case '>': return a > b
    case '<=': return a <= b
    case '>=': return a >= b
    default: return false
  }
}

function arithmetic(op: BinaryOp, left: Value, right: Value): Value {
  const a = toNumber(left)
  const b = toNumber(right)
  if (a === null || b === null) return null
  switch (op) {
    case '+': return a + b
    case '-': return a - b
    case '*': return a * b
    // Деление на ноль даёт пусто, а не ошибку: одна плохая строка не должна
    // красить весь столбец в красное.
    case '/': return b === 0 ? null : a / b
    case '%': return b === 0 ? null : a % b
    case '^': {
      const result = a ** b
      return Number.isFinite(result) ? result : null
    }
    default: return null
  }
}

export function evaluate(node: Node, ctx: EvalContext): Value {
  switch (node.kind) {
    case 'number': return node.value
    case 'string': return node.value
    case 'boolean': return node.value
    case 'blank': return null

    case 'field':
      return cellToValue(ctx.values[node.fieldId])

    case 'unary': {
      if (node.op === 'not') return !toBool(evaluate(node.operand, ctx))
      const n = toNumber(evaluate(node.operand, ctx))
      return n === null ? null : -n
    }

    case 'binary': {
      if (node.op === '&') {
        return toText(evaluate(node.left, ctx)) + toText(evaluate(node.right, ctx))
      }
      const left = evaluate(node.left, ctx)
      const right = evaluate(node.right, ctx)
      if (node.op === '=' || node.op === '!=' || node.op === '<' || node.op === '>' || node.op === '<=' || node.op === '>=') {
        return compare(node.op, left, right)
      }
      return arithmetic(node.op, left, right)
    }

    case 'call': {
      const impl = lookupFunction(node.name)
      if (node.args.length < impl.minArgs || node.args.length > impl.maxArgs) {
        const expected = impl.maxArgs === Number.POSITIVE_INFINITY
          ? `не менее ${impl.minArgs}`
          : impl.minArgs === impl.maxArgs
            ? `ровно ${impl.minArgs}`
            : `от ${impl.minArgs} до ${impl.maxArgs}`
        throw new FormulaError(`${node.name}: ожидалось ${expected} аргументов, получено ${node.args.length}`)
      }

      if (node.name === 'IF') {
        // Ветки вычисляются лениво, иначе IF({Делитель} = 0; 0; 100 / {Делитель})
        // всё равно считал бы деление на ноль.
        const condition = toBool(evaluate(node.args[0]!, ctx))
        if (condition) return evaluate(node.args[1]!, ctx)
        return node.args[2] ? evaluate(node.args[2], ctx) : null
      }

      return impl.call(node.args.map((arg) => evaluate(arg, ctx)), ctx)
    }
  }
}
