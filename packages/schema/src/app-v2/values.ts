import { z } from 'zod'

export const appV2IdSchema = z.string().min(1).max(128).regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/)
  .refine(value => !['constructor', 'prototype', '__proto__'].includes(value), 'Недопустимый идентификатор')
export const appV2JsonSchema = z.json()
export type AppV2Json = z.infer<typeof appV2JsonSchema>

/** A binding names its context explicitly. Literal objects are data, never references. */
export const appV2BindingSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('literal'), value: appV2JsonSchema }),
  z.strictObject({ kind: z.literal('row'), fieldId: appV2IdSchema }),
  z.strictObject({ kind: z.literal('row_id') }),
  z.strictObject({ kind: z.literal('screen_row'), fieldId: appV2IdSchema }),
  z.strictObject({ kind: z.literal('screen_row_id') }),
  z.strictObject({ kind: z.literal('record_ids'), tableId: appV2IdSchema, record: z.discriminatedUnion('kind', [z.strictObject({ kind: z.literal('row') }), z.strictObject({ kind: z.literal('screen') }), z.strictObject({ kind: z.literal('result'), stepId: appV2IdSchema })]) }),
  z.strictObject({ kind: z.literal('user'), property: z.enum(['id', 'email', 'name', 'company']) }),
  z.strictObject({ kind: z.literal('form'), formId: appV2IdSchema, fieldId: appV2IdSchema }),
  z.strictObject({ kind: z.literal('result'), stepId: appV2IdSchema, fieldId: appV2IdSchema }),
  z.strictObject({ kind: z.literal('result_id'), stepId: appV2IdSchema }),
])
export type AppV2Binding = z.infer<typeof appV2BindingSchema>

export type AppV2Condition =
  | { op: 'and' | 'or'; conditions: AppV2Condition[] }
  | { op: 'empty' | 'not_empty'; value: AppV2Binding }
  | { op: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'includes'; left: AppV2Binding; right: AppV2Binding }
export const appV2ConditionSchema: z.ZodType<AppV2Condition> = z.lazy(() => z.discriminatedUnion('op', [
  z.strictObject({ op: z.literal('and'), conditions: z.array(appV2ConditionSchema).min(1).max(20) }),
  z.strictObject({ op: z.literal('or'), conditions: z.array(appV2ConditionSchema).min(1).max(20) }),
  z.strictObject({ op: z.enum(['empty', 'not_empty']), value: appV2BindingSchema }),
  z.strictObject({ op: z.enum(['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'contains', 'includes']), left: appV2BindingSchema, right: appV2BindingSchema }),
]))

export type AppV2Actor = { authenticated: boolean; roleIds: readonly string[]; id: string | null; email: string | null; name?: string | null; company: string | null }
export type AppV2Record = { tableId: string; id: string; values: Readonly<Record<string, AppV2Json>> }
export type AppV2Context = {
  actor: AppV2Actor
  row?: AppV2Record
  screenRow?: AppV2Record
  forms?: ReadonlyMap<string, { tableId: string; values: Readonly<Record<string, AppV2Json>> }>
  results?: ReadonlyMap<string, AppV2Record>
}
export type AppV2Resolved = { ok: true; value: AppV2Json } | { ok: false; error: string }
const missing = (error: string): AppV2Resolved => ({ ok: false, error })

export function resolveAppV2Binding(binding: AppV2Binding, context: AppV2Context): AppV2Resolved {
  const field = (values: Readonly<Record<string, AppV2Json>> | undefined, id: string): AppV2Resolved =>
    values && Object.hasOwn(values, id) ? { ok: true, value: values[id]! } : missing('Значение поля недоступно в этом контексте')
  switch (binding.kind) {
    case 'literal': return { ok: true, value: binding.value }
    case 'row': return field(context.row?.values, binding.fieldId)
    case 'row_id': return context.row ? { ok: true, value: context.row.id } : missing('Сначала выберите запись')
    case 'screen_row': return field(context.screenRow?.values, binding.fieldId)
    case 'screen_row_id': return context.screenRow ? { ok: true, value: context.screenRow.id } : missing('Сначала откройте запись на экране')
    case 'record_ids': {
      const record = binding.record.kind === 'screen' ? context.screenRow : binding.record.kind === 'row' ? context.row : context.results?.get(binding.record.stepId)
      return record && record.tableId === binding.tableId ? { ok: true, value: [record.id] } : missing('Связанная запись недоступна или относится к другой таблице')
    }
    case 'user': {
      const value = context.actor[binding.property]
      return context.actor.authenticated && typeof value === 'string' && value.trim() ? { ok: true, value } : missing('Данные пользователя недоступны')
    }
    case 'form': return field(context.forms?.get(binding.formId)?.values, binding.fieldId)
    case 'result': return field(context.results?.get(binding.stepId)?.values, binding.fieldId)
    case 'result_id': {
      const row = context.results?.get(binding.stepId)
      return row ? { ok: true, value: row.id } : missing('Результат шага ещё недоступен')
    }
  }
}

/** Unknown/missing values are failures, including inside an OR: never turn them into a match. */
export function evaluateAppV2Condition(condition: AppV2Condition, context: AppV2Context): { ok: true; value: boolean } | { ok: false; error: string } {
  if ('conditions' in condition) {
    const results = condition.conditions.map(item => evaluateAppV2Condition(item, context))
    const failure = results.find(item => !item.ok)
    if (failure && !failure.ok) return failure
    return { ok: true, value: condition.op === 'and' ? results.every(item => item.ok && item.value) : results.some(item => item.ok && item.value) }
  }
  if ('value' in condition) {
    const result = resolveAppV2Binding(condition.value, context)
    if (!result.ok) return result
    const empty = result.value === null || (typeof result.value === 'string' && !result.value.trim()) || (Array.isArray(result.value) && result.value.length === 0)
    return { ok: true, value: condition.op === 'empty' ? empty : !empty }
  }
  const left = resolveAppV2Binding(condition.left, context), right = resolveAppV2Binding(condition.right, context)
  if (!left.ok) return left
  if (!right.ok) return right
  const a = left.value, b = right.value
  if (condition.op === 'includes') return Array.isArray(a) && b !== null && typeof b !== 'object'
    ? { ok: true, value: a.some(value => value === b) } : { ok: false, error: 'Для этого сравнения нужны список значений и отдельное значение' }
  if (condition.op === 'contains') return typeof a === 'string' && typeof b === 'string'
    ? { ok: true, value: a.includes(b) } : { ok: false, error: 'Для сравнения нужны текстовые значения' }
  if (condition.op === 'eq' || condition.op === 'ne') {
    if ((a !== null && typeof a === 'object') || (b !== null && typeof b === 'object')) return { ok: false, error: 'Выберите отдельное значение для сравнения' }
    return { ok: true, value: condition.op === 'eq' ? a === b : a !== b }
  }
  if (typeof a !== 'number' || typeof b !== 'number') return { ok: false, error: 'Для сравнения нужны числа' }
  return { ok: true, value: condition.op === 'gt' ? a > b : condition.op === 'gte' ? a >= b : condition.op === 'lt' ? a < b : a <= b }
}

/** Apply again after resolving a dynamic URL, before returning any browser navigation intent. */
export function appV2NavigationUrl(value: AppV2Json): string | null {
  if (typeof value !== 'string') return null
  const text = value.trim()
  if (!text || /[\u0000-\u001f\u007f\\]/.test(text)) return null
  if (text.startsWith('/') && !text.startsWith('//')) return text
  try { const url = new URL(text); return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null } catch { return null }
}

/** Bound JSON before recursive schema parsing: reject cycles, executable values and excessive depth. */
export function appDefinitionInputError(value: unknown): string | null {
  try { return inspectAppDefinitionInput(value) } catch { return 'Описание приложения должно содержать обычные JSON-объекты' }
}
function inspectAppDefinitionInput(value: unknown): string | null {
  const active = new WeakSet<object>()
  const stack: { value: unknown; depth: number; exit?: boolean }[] = [{ value, depth: 0 }]
  let items = 0, textLength = 0
  while (stack.length) {
    const item = stack.pop()!
    if (item.exit) { active.delete(item.value as object); continue }
    if (++items > 100_000 || item.depth > 40 || textLength > 2_000_000) return 'Определение приложения слишком большое или слишком глубоко вложено'
    const entry = item.value
    if (entry === null || typeof entry === 'boolean') continue
    if (typeof entry === 'string') { textLength += entry.length; if (textLength > 2_000_000) return 'Определение приложения слишком большое'; continue }
    if (typeof entry === 'number' && Number.isFinite(entry)) continue
    if (!entry || typeof entry !== 'object') return 'Описание приложения должно содержать только JSON-значения'
    const prototype = Object.getPrototypeOf(entry)
    if (!Array.isArray(entry) && prototype !== Object.prototype && prototype !== null) return 'Недопустимый объект в описании приложения'
    if (active.has(entry)) return 'В описании приложения обнаружен цикл'
    active.add(entry); stack.push({ value: entry, depth: item.depth, exit: true })
    if (Object.getOwnPropertySymbols(entry).length) return 'Описание приложения не может содержать символьные свойства'
    const keys = Object.getOwnPropertyNames(entry).filter(key => !Array.isArray(entry) || key !== 'length')
    if (keys.length + stack.length + items > 100_000) return 'Определение приложения слишком большое'
    for (const key of keys) {
      textLength += key.length
      const descriptor = Object.getOwnPropertyDescriptor(entry, key)!
      if (!('value' in descriptor)) return 'Описание приложения не может содержать вычисляемые свойства'
      if (!descriptor.enumerable) return 'Описание приложения не может содержать скрытые свойства'
      stack.push({ value: descriptor.value, depth: item.depth + 1 })
    }
  }
  return null
}
