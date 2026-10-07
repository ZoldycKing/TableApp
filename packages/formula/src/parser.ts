import type { BinaryOp, Node } from './ast'
import { FormulaError } from './ast'
import type { Token } from './lexer'
import { tokenize } from './lexer'

/** Имя поля -> стабильный id. Если поля нет, вернуть null. */
export type FieldResolver = (name: string) => string | null

const COMPARISON: BinaryOp[] = ['=', '!=', '<', '>', '<=', '>=']
const ADDITIVE: BinaryOp[] = ['+', '-']
const MULTIPLICATIVE: BinaryOp[] = ['*', '/', '%']

class Parser {
  private index = 0

  constructor(
    private readonly tokens: Token[],
    private readonly resolve: FieldResolver,
  ) {}

  private peek(): Token {
    return this.tokens[this.index]!
  }

  private advance(): Token {
    return this.tokens[this.index++]!
  }

  private matchOperator(ops: readonly BinaryOp[]): BinaryOp | null {
    const token = this.peek()
    if (token.type === 'operator' && (ops as readonly string[]).includes(token.value)) {
      this.index++
      return token.value as BinaryOp
    }
    return null
  }

  parse(): Node {
    if (this.peek().type === 'eof') return { kind: 'blank' }
    const node = this.parseComparison()
    if (this.peek().type !== 'eof') {
      throw new FormulaError(
        `Лишний фрагмент «${this.peek().value}» в конце выражения`,
        this.peek().position,
        this.peek().length,
      )
    }
    return node
  }

  private parseComparison(): Node {
    let left = this.parseConcat()
    let op: BinaryOp | null
    while ((op = this.matchOperator(COMPARISON))) {
      left = { kind: 'binary', op, left, right: this.parseConcat() }
    }
    return left
  }

  private parseConcat(): Node {
    let left = this.parseAdditive()
    while (this.matchOperator(['&'])) {
      left = { kind: 'binary', op: '&', left, right: this.parseAdditive() }
    }
    return left
  }

  private parseAdditive(): Node {
    let left = this.parseMultiplicative()
    let op: BinaryOp | null
    while ((op = this.matchOperator(ADDITIVE))) {
      left = { kind: 'binary', op, left, right: this.parseMultiplicative() }
    }
    return left
  }

  private parseMultiplicative(): Node {
    let left = this.parseUnary()
    let op: BinaryOp | null
    while ((op = this.matchOperator(MULTIPLICATIVE))) {
      left = { kind: 'binary', op, left, right: this.parseUnary() }
    }
    return left
  }

  private parseUnary(): Node {
    if (this.peek().type === 'operator' && this.peek().value === '-') {
      this.index++
      return { kind: 'unary', op: '-', operand: this.parseUnary() }
    }
    if (this.peek().type === 'operator' && this.peek().value === '+') {
      this.index++
      return this.parseUnary()
    }
    return this.parsePower()
  }

  private parsePower(): Node {
    const base = this.parsePrimary()
    if (this.matchOperator(['^'])) {
      // Возведение в степень правоассоциативно: 2^3^2 = 2^(3^2).
      return { kind: 'binary', op: '^', left: base, right: this.parseUnary() }
    }
    return base
  }

  private parsePrimary(): Node {
    const token = this.advance()

    switch (token.type) {
      case 'number': {
        const value = Number(token.value)
        if (!Number.isFinite(value)) {
          throw new FormulaError(`Некорректное число «${token.value}»`, token.position, token.length)
        }
        return { kind: 'number', value }
      }

      case 'string':
        return { kind: 'string', value: token.value }

      case 'fieldref': {
        const name = token.value
        const fieldId = this.resolve(name)
        if (!fieldId) {
          throw new FormulaError(`Поле «${name}» не найдено`, token.position, token.length)
        }
        return { kind: 'field', fieldId, name }
      }

      case 'identifier': {
        const upper = token.value.toUpperCase()
        if (upper === 'TRUE') return { kind: 'boolean', value: true }
        if (upper === 'FALSE') return { kind: 'boolean', value: false }
        if (upper === 'BLANK') {
          if (this.peek().type === 'lparen') {
            this.advance()
            this.expect('rparen', 'Ожидалась закрывающая скобка')
          }
          return { kind: 'blank' }
        }
        if (this.peek().type !== 'lparen') {
          throw new FormulaError(
            `Неизвестное имя «${token.value}». Ссылка на поле пишется как {${token.value}}`,
            token.position,
            token.length,
          )
        }
        this.advance()
        const args: Node[] = []
        if (this.peek().type !== 'rparen') {
          args.push(this.parseComparison())
          while (this.peek().type === 'comma') {
            this.advance()
            args.push(this.parseComparison())
          }
        }
        this.expect('rparen', `Не закрыта скобка вызова ${upper}`)
        return { kind: 'call', name: upper, args }
      }

      case 'lparen': {
        const inner = this.parseComparison()
        this.expect('rparen', 'Не закрыта круглая скобка')
        return inner
      }

      case 'eof':
        throw new FormulaError('Выражение оборвано', token.position, 0)

      default:
        throw new FormulaError(`Неожиданный фрагмент «${token.value}»`, token.position, token.length)
    }
  }

  private expect(type: Token['type'], message: string): Token {
    if (this.peek().type !== type) {
      throw new FormulaError(message, this.peek().position, this.peek().length)
    }
    return this.advance()
  }
}

export function parse(input: string, resolve: FieldResolver): Node {
  return new Parser(tokenize(input), resolve).parse()
}

const NEEDS_NO_PARENS = new Set(['number', 'string', 'boolean', 'blank', 'field', 'call'])

/**
 * Обратная печать выражения с текущими именами полей.
 * Формула хранится по id, поэтому переименование поля меняет только отображение.
 */
export function print(node: Node, fieldName: (id: string) => string | null): string {
  switch (node.kind) {
    case 'number': return String(node.value)
    case 'string': return `"${node.value.replace(/"/g, '\\"')}"`
    case 'boolean': return node.value ? 'TRUE' : 'FALSE'
    case 'blank': return 'BLANK()'
    case 'field': return `{${fieldName(node.fieldId) ?? node.name}}`
    case 'unary': {
      const operand = print(node.operand, fieldName)
      const wrapped = NEEDS_NO_PARENS.has(node.operand.kind) ? operand : `(${operand})`
      return node.op === '-' ? `-${wrapped}` : `NOT(${operand})`
    }
    case 'binary': {
      const left = print(node.left, fieldName)
      const right = print(node.right, fieldName)
      const l = NEEDS_NO_PARENS.has(node.left.kind) ? left : `(${left})`
      const r = NEEDS_NO_PARENS.has(node.right.kind) ? right : `(${right})`
      return `${l} ${node.op} ${r}`
    }
    case 'call':
      return `${node.name}(${node.args.map((a) => print(a, fieldName)).join(', ')})`
  }
}
