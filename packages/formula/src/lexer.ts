import { FormulaError } from './ast'

export type TokenType =
  | 'number' | 'string' | 'fieldref' | 'identifier'
  | 'operator' | 'lparen' | 'rparen' | 'comma' | 'eof'

export type Token = {
  type: TokenType
  value: string
  position: number
  length: number
}

const OPERATOR_CHARS = new Set(['+', '-', '*', '/', '%', '^', '&', '=', '<', '>', '!'])
const BACKSLASH = String.fromCharCode(92)
const TWO = new Set(['<=', '>=', '!=', '<>'])

function isDigit(ch: string): boolean {
  return ch >= '0' && ch <= '9'
}

function isIdentStart(ch: string): boolean {
  return /[A-Za-zА-Яа-яЁё_]/.test(ch)
}

function isIdentPart(ch: string): boolean {
  return /[A-Za-zА-Яа-яЁё0-9_]/.test(ch)
}

/**
 * Разбор на токены. Ссылка на поле пишется как {Имя поля} — фигурные скобки
 * позволяют именам содержать пробелы и не конфликтовать с именами функций.
 */
export function tokenize(input: string): Token[] {
  const tokens: Token[] = []
  let i = 0

  while (i < input.length) {
    const ch = input[i]!

    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i++
      continue
    }

    if (ch === '{') {
      const end = input.indexOf('}', i + 1)
      if (end < 0) throw new FormulaError('Не закрыта фигурная скобка ссылки на поле', i, 1)
      const name = input.slice(i + 1, end)
      if (name.trim() === '') throw new FormulaError('Пустая ссылка на поле', i, end - i + 1)
      tokens.push({ type: 'fieldref', value: name, position: i, length: end - i + 1 })
      i = end + 1
      continue
    }

    if (ch === '"' || ch === "'") {
      const quote = ch
      let value = ''
      let j = i + 1
      while (j < input.length && input[j] !== quote) {
        if (input[j] === BACKSLASH && j + 1 < input.length) {
          value += input[j + 1]
          j += 2
        } else {
          value += input[j]
          j++
        }
      }
      if (j >= input.length) throw new FormulaError('Не закрыта строковая константа', i, 1)
      tokens.push({ type: 'string', value, position: i, length: j - i + 1 })
      i = j + 1
      continue
    }

    if (isDigit(ch) || (ch === '.' && isDigit(input[i + 1] ?? ''))) {
      let j = i
      let seenDot = false
      while (j < input.length) {
        const c = input[j]!
        if (isDigit(c)) { j++; continue }
        if (c === '.' && !seenDot) { seenDot = true; j++; continue }
        break
      }
      tokens.push({ type: 'number', value: input.slice(i, j), position: i, length: j - i })
      i = j
      continue
    }

    if (isIdentStart(ch)) {
      let j = i
      while (j < input.length && isIdentPart(input[j]!)) j++
      tokens.push({ type: 'identifier', value: input.slice(i, j), position: i, length: j - i })
      i = j
      continue
    }

    if (ch === '(') { tokens.push({ type: 'lparen', value: ch, position: i, length: 1 }); i++; continue }
    if (ch === ')') { tokens.push({ type: 'rparen', value: ch, position: i, length: 1 }); i++; continue }
    if (ch === ',' || ch === ';') { tokens.push({ type: 'comma', value: ',', position: i, length: 1 }); i++; continue }

    if (OPERATOR_CHARS.has(ch)) {
      const two = input.slice(i, i + 2)
      if (TWO.has(two)) {
        tokens.push({ type: 'operator', value: two === '<>' ? '!=' : two, position: i, length: 2 })
        i += 2
        continue
      }
      if (ch === '!') throw new FormulaError('Оператор ! не поддерживается, используйте NOT()', i, 1)
      tokens.push({ type: 'operator', value: ch, position: i, length: 1 })
      i++
      continue
    }

    throw new FormulaError(`Непонятный символ «${ch}»`, i, 1)
  }

  tokens.push({ type: 'eof', value: '', position: input.length, length: 0 })
  return tokens
}

