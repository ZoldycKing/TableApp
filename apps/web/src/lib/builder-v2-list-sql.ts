import { rows } from '@tableapp/db'
import { and, asc, eq, gt, isNull, or, sql } from 'drizzle-orm'
import type { Transaction } from './db-transaction'
import type { BuilderV2ListGroup } from './builder-v2-list-group'
import type { RuntimeSourceRow } from './runtime-project'

/** Plain lists and select groups with unconditional row access can page before projecting any cells. */
export async function readBuilderV2ListSql(tx: Transaction, tableId: string, pageSize: number,
  anchor: { id: string; position: string; group?: BuilderV2ListGroup } | null | undefined,
  grouping?: { fieldId: string; choiceIds: string[] } | null) {
  const scope = and(eq(rows.tableId, tableId), isNull(rows.deletedAt))
  // Generated keys are ASCII. Legacy keys outside that range keep the JavaScript order.
  const ascii = '^[\\x01-\\x7f]*$'
  const [summary] = await tx.select({ total: sql<number>`count(*)`,
    unusual: sql<boolean>`bool_or(not ((${rows.position} collate "C") ~ ${ascii}) or not ((${rows.id} collate "C") ~ ${ascii}))`,
  }).from(rows).where(scope)
  if (summary?.unusual) return null

  const position = sql`${rows.position} collate "C"`, id = sql`${rows.id} collate "C"`
  const afterPosition = anchor ? or(gt(position, anchor.position), and(eq(position, anchor.position), gt(id, anchor.id))) : undefined
  const choice = grouping ? sql`${rows.data}->${grouping.fieldId}` : null
  const choiceText = grouping ? sql`${rows.data}->>${grouping.fieldId}` : null
  const rank = grouping ? sql`case
    when ${choice} is null or ${choice} in ('null'::jsonb, '""'::jsonb) then ${grouping.choiceIds.length + 2}::int
    when jsonb_typeof(${choice}) <> 'string' then ${grouping.choiceIds.length + 1}::int
    else coalesce(array_position(array(select jsonb_array_elements_text(${JSON.stringify(grouping.choiceIds)}::jsonb)), ${choiceText}), ${grouping.choiceIds.length + 1}::int)
    end` : null
  const rankValue = grouping && anchor ? (Number.isFinite(anchor.group?.rank) ? anchor.group!.rank : grouping.choiceIds.length + 2) : null
  const after = rank && rankValue !== null ? or(gt(rank, rankValue), and(eq(rank, rankValue), afterPosition)) : afterPosition
  const page = await tx.select().from(rows).where(and(scope, after)).orderBy(...(rank ? [asc(rank)] : []), asc(position), asc(id)).limit(pageSize + 1)
  return { rows: page.slice(0, pageSize) as RuntimeSourceRow[], total: Number(summary?.total ?? 0), hasNext: page.length > pageSize }
}
