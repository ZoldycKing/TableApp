/** Разобранное выражение формулы. Кода в нём нет — только данные. */
export type Node =
  | { kind: 'number'; value: number }
  | { kind: 'string'; value: string }
  | { kind: 'boolean'; value: boolean }
  | { kind: 'blank' }
  /** Ссылка на поле. Пишется как {Имя}, но хранится по стабильному id. */
  | { kind: 'field'; fieldId: string; name: string }
  | { kind: 'unary'; op: '-' | 'not'; operand: Node }
  | { kind: 'binary'; op: BinaryOp; left: Node; right: Node }
  | { kind: 'call'; name: string; args: Node[] }

export type BinaryOp =
  | '+' | '-' | '*' | '/' | '%' | '^'
  | '&'
  | '=' | '!=' | '<' | '>' | '<=' | '>='

export class FormulaError extends Error {
  constructor(
    message: string,
    readonly position: number = 0,
    readonly length: number = 0,
  ) {
    super(message)
    this.name = 'FormulaError'
  }
}

/** Все поля, от которых зависит выражение. Основа графа пересчёта. */
export function collectDependencies(node: Node, out: Set<string> = new Set()): Set<string> {
  switch (node.kind) {
    case 'field':
      out.add(node.fieldId)
      break
    case 'unary':
      collectDependencies(node.operand, out)
      break
    case 'binary':
      collectDependencies(node.left, out)
      collectDependencies(node.right, out)
      break
    case 'call':
      for (const arg of node.args) collectDependencies(arg, out)
      break
  }
  return out
}
