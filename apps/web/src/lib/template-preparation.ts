import { apps, db, fields, rows, tables } from '@tableapp/db'
import { appSchema } from '@tableapp/schema'
import { readAppDefinition } from '@tableapp/schema/app-definition'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import type { Transaction } from './db-transaction'
import { appModules, moduleContract } from './app-modules'
import { guidedSetupPlan } from './guided-setup'
import { removableSamples, type SampleRelation } from './template-samples'

/** Derive the cleanup boundary from saved engine bindings, never client IDs or names. */
export async function templatePreparation(workspaceId: string, appId: string, connection: Transaction | typeof db = db) {
  const [record] = await connection.select().from(apps).where(and(eq(apps.id, appId), eq(apps.workspaceId, workspaceId)))
  const parsed = appSchema.safeParse(record?.draft)
  const read = readAppDefinition(record?.draft)
  const shop = read.ok && read.formatVersion === 2 ? read.app.shop : null
  const crm = read.ok && read.formatVersion === 2 ? read.app.crm : null
  if (!parsed.success && !shop && !crm) return null
  const relationFields = await connection.select({ id: fields.id, tableId: fields.tableId, options: fields.options }).from(fields)
    .innerJoin(tables, eq(tables.id, fields.tableId)).where(and(eq(tables.workspaceId, workspaceId), eq(fields.type, 'relation')))
  const allRelations = relationFields.flatMap(field => {
    const target = (field.options as { tableId?: unknown } | null)?.tableId
    return typeof target === 'string' ? [{ id: field.id, tableId: field.tableId, targetTableId: target }] : []
  }) satisfies SampleRelation[]
  const legacyIds = parsed.success ? (() => {
    const app = parsed.data
    const contracts = appModules(app).map(module => moduleContract(app, module)).filter(contract => contract !== null)
    if (!contracts.length) return null
    const tasks = guidedSetupPlan(app, allRelations.map(field => ({ fieldId: field.id, targetId: field.targetTableId }))).tasks
    return [...new Set([...(app.templateTableIds ?? []), ...contracts.flatMap(contract => Object.values(contract.tables)), ...tasks.map(task => task.id)])]
  })() : null
  const ids = shop
    ? [shop.catalogTableId, shop.ordersTableId, shop.itemsTableId]
    : crm
      ? [crm.dealsTableId, crm.clientsTableId, ...(crm.contactsTableId ? [crm.contactsTableId] : [])]
      : legacyIds
  if (!ids?.length) return null
  const own = await connection.select({ id: tables.id }).from(tables).where(and(eq(tables.workspaceId, workspaceId), inArray(tables.id, ids)))
  if (own.length !== ids.length) return null
  // Include incoming references from other workspace tables: their data must survive intact.
  const relations = allRelations.filter(field => ids.includes(field.tableId) || ids.includes(field.targetTableId))
  const sources = [...new Set([...ids, ...relations.map(field => field.tableId), ...relations.map(field => field.targetTableId)])]
  // Foreign relation targets are never read, even in a malformed definition.
  const ownSources = await connection.select({ id: tables.id }).from(tables).where(and(eq(tables.workspaceId, workspaceId), inArray(tables.id, sources)))
  const records = await connection.select({ id: rows.id, tableId: rows.tableId, sample: rows.sample, data: rows.data, deletedAt: rows.deletedAt })
    .from(rows).where(and(inArray(rows.tableId, ownSources.map(table => table.id)), isNull(rows.deletedAt)))
  const removable = removableSamples(ids, records, relations)
  return { removable, samples: removable.length }
}
