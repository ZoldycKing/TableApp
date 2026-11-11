import { apps, db, fields, rows, tables } from '@tableapp/db'
import { appSchema } from '@tableapp/schema'
import { appV2Schema } from '@tableapp/schema/app-v2'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import type { Transaction } from './db-transaction'
import { removableSamples, type SampleRelation } from './template-samples'

/** Only metadata and counts leave the server; references always come from the stored app. */
export async function inventoryPreparation(workspaceId: string, appId: string, connection: Transaction | typeof db = db) {
  const [record] = await connection.select().from(apps).where(and(eq(apps.id, appId), eq(apps.workspaceId, workspaceId)))
  const ids = inventoryTableIds(record?.draft)
  if (!ids) return null
  const own = await connection.select({ id: tables.id }).from(tables).where(and(eq(tables.workspaceId, workspaceId), inArray(tables.id, ids)))
  if (own.length !== ids.length) return null
  const relationFields = await connection.select({ id: fields.id, tableId: fields.tableId, options: fields.options }).from(fields)
    .innerJoin(tables, eq(tables.id, fields.tableId)).where(and(eq(tables.workspaceId, workspaceId), eq(fields.type, 'relation')))
  const relations = relationFields.flatMap(field => {
    const target = (field.options as { tableId?: unknown } | null)?.tableId
    return typeof target === 'string' && ids.includes(target) ? [{ id: field.id, tableId: field.tableId, targetTableId: target }] : []
  }) satisfies SampleRelation[]
  const sources = [...new Set([...ids, ...relations.map(field => field.tableId)])]
  const records = await connection.select({ id: rows.id, tableId: rows.tableId, sample: rows.sample, data: rows.data, deletedAt: rows.deletedAt })
    .from(rows).where(and(inArray(rows.tableId, sources), isNull(rows.deletedAt)))
  const removable = removableSamples(ids, records, relations)
  return { removable, samples: removable.length }
}

function inventoryTableIds(draft: unknown): string[] | null {
  const v1 = appSchema.safeParse(draft)
  if (v1.success && v1.data.inventory) return [...new Set(Object.values(v1.data.inventory.tables))]
  const v2 = appV2Schema.safeParse(draft)
  if (v2.success && v2.data.inventory) {
    const inv = v2.data.inventory
    return [...new Set([inv.itemsTableId, inv.movementsTableId, inv.warehousesTableId, ...(inv.suppliersTableId ? [inv.suppliersTableId] : []), ...(inv.purchaseOrdersTableId ? [inv.purchaseOrdersTableId] : []), ...(inv.purchaseLinesTableId ? [inv.purchaseLinesTableId] : [])])]
  }
  return null
}
