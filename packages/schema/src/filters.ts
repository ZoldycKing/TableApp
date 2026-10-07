import { z } from 'zod'
import type { FieldType } from './fields'

export const FILTER_OPS = [
  'is', 'is_not',
  'contains', 'does_not_contain',
  'is_empty', 'is_not_empty',
  'gt', 'gte', 'lt', 'lte',
  'is_any_of', 'is_none_of',
  'has_any_of', 'has_all_of', 'has_none_of', 'is_exactly',
  'is_before', 'is_after', 'is_on_or_before', 'is_on_or_after', 'is_within',
] as const

export type FilterOp = (typeof FILTER_OPS)[number]

const TEXT_OPS: FilterOp[] = ['is', 'is_not', 'contains', 'does_not_contain', 'is_empty', 'is_not_empty']
const NUMBER_OPS: FilterOp[] = ['is', 'is_not', 'gt', 'gte', 'lt', 'lte', 'is_empty', 'is_not_empty']
const DATE_OPS: FilterOp[] = ['is', 'is_not', 'is_before', 'is_after', 'is_on_or_before', 'is_on_or_after', 'is_within', 'is_empty', 'is_not_empty']
const SINGLE_OPS: FilterOp[] = ['is', 'is_not', 'is_any_of', 'is_none_of', 'is_empty', 'is_not_empty']
const MULTI_OPS: FilterOp[] = ['has_any_of', 'has_all_of', 'has_none_of', 'is_exactly', 'is_empty', 'is_not_empty']
const BOOL_OPS: FilterOp[] = ['is']
const PRESENCE_OPS: FilterOp[] = ['is_empty', 'is_not_empty']

const OPS_BY_TYPE: Record<FieldType, FilterOp[]> = {
  text: TEXT_OPS,
  long_text: TEXT_OPS,
  email: TEXT_OPS,
  phone: TEXT_OPS,
  url: TEXT_OPS,
  number: NUMBER_OPS,
  date: DATE_OPS,
  datetime: DATE_OPS,
  checkbox: BOOL_OPS,
  single_select: SINGLE_OPS,
  multi_select: MULTI_OPS,
  attachment: PRESENCE_OPS,
  image: PRESENCE_OPS,
  member: MULTI_OPS,
  relation: MULTI_OPS,
  formula: [...TEXT_OPS, ...NUMBER_OPS],
  lookup: MULTI_OPS,
  rollup: NUMBER_OPS,
  count: NUMBER_OPS,
  created_time: DATE_OPS,
  updated_time: DATE_OPS,
  created_by: SINGLE_OPS,
  updated_by: SINGLE_OPS,
  row_id: TEXT_OPS,
}

export function operatorsFor(type: FieldType): readonly FilterOp[] {
  return OPS_BY_TYPE[type]
}

/** Операторы, у которых нет операнда: значение в условии игнорируется. */
export const UNARY_OPS: readonly FilterOp[] = ['is_empty', 'is_not_empty']

export function isUnary(op: FilterOp): boolean {
  return UNARY_OPS.includes(op)
}

export const filterConditionSchema = z.object({
  id: z.string(),
  fieldId: z.string(),
  op: z.enum(FILTER_OPS),
  value: z.unknown().default(null),
})
export type FilterCondition = z.infer<typeof filterConditionSchema>

export type FilterGroup = {
  id: string
  conjunction: 'and' | 'or'
  conditions: Array<FilterCondition | FilterGroup>
}

export const filterGroupSchema: z.ZodType<FilterGroup> = z.lazy(() =>
  z.object({
    id: z.string(),
    conjunction: z.enum(['and', 'or']).default('and'),
    conditions: z.array(z.union([filterConditionSchema, filterGroupSchema])).default([]),
  }),
)

export function isGroup(node: FilterCondition | FilterGroup): node is FilterGroup {
  return 'conjunction' in node
}

export function emptyFilterGroup(id: string): FilterGroup {
  return { id, conjunction: 'and', conditions: [] }
}

export const sortSchema = z.object({
  fieldId: z.string(),
  direction: z.enum(['asc', 'desc']).default('asc'),
})
export type Sort = z.infer<typeof sortSchema>

export const groupBySchema = z.object({
  fieldId: z.string(),
  direction: z.enum(['asc', 'desc']).default('asc'),
})
export type GroupBy = z.infer<typeof groupBySchema>

/**
 * Поля, на которые ссылается отбор.
 *
 * Нужно везде, где отбор надо проверить на живые колонки или подать вместе
 * со строками: условие по удалённой колонке молча перестаёт отбирать, а это
 * худший вид поломки — данные показываются не те, и никто об этом не узнаёт.
 */
export function fieldsOfFilter(filter: FilterGroup | null | undefined, into = new Set<string>()): Set<string> {
  if (!filter) return into
  for (const node of filter.conditions) {
    if (isGroup(node)) fieldsOfFilter(node, into)
    else into.add(node.fieldId)
  }
  return into
}
