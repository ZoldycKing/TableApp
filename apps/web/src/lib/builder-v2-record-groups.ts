import type { AppV2Node } from '@tableapp/schema/app-v2'
import type { BuilderV2DataPage, BuilderV2DataRecord } from './builder-v2-data-types'

type GroupConfig = NonNullable<Extract<AppV2Node, { type: 'collection' }>['recordGroup']>
type Candidate = { id: string; data: Record<string, unknown> }

export async function readBuilderV2RecordGroups<Row extends Candidate>(options: {
  config: GroupConfig
  rows: AsyncIterable<Row>
  anchor?: Row | null
  pageSize: number
  matchesSearch: (row: Row) => boolean
  compare: (left: Row, right: Row) => number
  project: (row: Row) => BuilderV2DataRecord
  next: (last: Row | undefined, hasNext: boolean) => string | null
}): Promise<BuilderV2DataPage> {
  const { config, rows, anchor, pageSize, matchesSearch, compare, project, next } = options
  const groups = new Map<string, { row: Row; count: number; amount: number | null; matches: boolean }>()
  for await (const row of rows) {
    const value = row.data[config.fieldId]
    const key = typeof value === 'number' || typeof value === 'string' && value.trim() ? JSON.stringify(['group', value]) : JSON.stringify(['row', row.id])
    const amount = config.amountFieldId ? row.data[config.amountFieldId] : null
    const numeric = typeof amount === 'number' && Number.isFinite(amount) ? amount : null
    const group = groups.get(key)
    if (!group) {
      groups.set(key, { row, count: 1, amount: numeric, matches: matchesSearch(row) })
      continue
    }
    if (compare(row, group.row) < 0) group.row = row
    group.count++
    group.amount = numeric === null || group.amount === null ? null : group.amount + numeric
    group.matches ||= matchesSearch(row)
  }
  const matches = [...groups.values()].filter(group => group.matches)
  const page = matches.filter(group => !anchor || compare(group.row, anchor) > 0).sort((a, b) => compare(a.row, b.row)).slice(0, pageSize + 1)
  const hasNext = page.length > pageSize
  if (hasNext) page.pop()
  return {
    kind: 'collection',
    rows: page.map(({ row, count, amount }) => ({ ...project(row), summary: { count, amount: Number.isFinite(amount) ? amount : null } })),
    value: null,
    total: matches.length,
    next: next(page.at(-1)?.row, hasNext),
  }
}
