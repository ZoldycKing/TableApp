/**
 * Переименование поля внутри формул.
 *
 * Ссылка на поле в формуле пишется именем — `{Остаток} <= {Минимум}`, — потому
 * что формулу читает человек, а не машина. Плата за это: стоит переименовать
 * колонку, и все формулы, которые на неё смотрели, перестают считаться. Поэтому
 * при переименовании выражения переписываются здесь.
 *
 * Переписываются только ссылки в фигурных скобках: имя поля, встреченное
 * в текстовой строке формулы, — это текст, а не ссылка, и трогать его нельзя.
 */

const REFERENCE = /\{([^}]*)\}/g

export function renameInExpression(expression: string, from: string, to: string): string {
  if (from === to) return expression
  return expression.replace(REFERENCE, (match, name: string) => (name.trim() === from ? `{${to}}` : match))
}

/** Ссылается ли выражение на поле с таким именем. */
export function referencesField(expression: string, name: string): boolean {
  return [...expression.matchAll(REFERENCE)].some((match) => (match[1] ?? '').trim() === name)
}
