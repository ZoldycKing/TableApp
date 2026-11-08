import { apps, db, fields, rows, tables, views } from '@tableapp/db'
import { and,asc, eq, sql } from 'drizzle-orm'
import { memberTableFields,restrictedTables,tablePermission,type TableMember } from './table-permissions'
import { normalizeFieldOptions,type Field } from '@tableapp/schema'

export type DirectoryApp = { id: string; name: string; inDraft: boolean; inPublished: boolean }
export type DirectoryField = { id: string; name: string; type: string; description: string | null }
export type DirectoryRelation = {
  fieldId: string; fieldName: string
  sourceId: string; sourceName: string
  targetId: string; targetName: string
  multiple: boolean
}
export type DirectoryTable = {
  id: string; name: string; icon: string
  rowCount: number; fieldCount: number
  createdAt: string; updatedAt: string
  fields: DirectoryField[]; apps: DirectoryApp[]; relations: DirectoryRelation[]
  access?:'view'|'edit'
}

type TableMetadata = Omit<DirectoryTable, 'fields' | 'apps' | 'relations' | 'createdAt' | 'updatedAt'> & { createdAt: Date; updatedAt: Date }
type FieldMetadata = DirectoryField & { tableId: string; options: unknown }
type AppMetadata = { id: string; name: string; draft: unknown; published: unknown }

/** Only configuration reference keys count; literal content is never a table dependency. */
function referencedTables(definition: unknown, owned: Set<string>, viewTables: Map<string, string>): Set<string> {
  const result = new Set<string>()
  const add = (value: unknown) => { if (typeof value === 'string' && owned.has(value)) result.add(value) }
  const walk = (value: unknown): void => {
    if (!value || typeof value !== 'object') return
    if (Array.isArray(value)) { value.forEach(walk); return }
    const object = value as Record<string, unknown>
    if (object.kind === 'literal') return
    for (const [key, child] of Object.entries(object)) {
      if (key === 'tableId' || key.endsWith('TableId')) add(child)
      if (key === 'viewId' && typeof child === 'string') add(viewTables.get(child))
      if (key === 'tables' && child && typeof child === 'object' && !Array.isArray(child)) Object.values(child).forEach(add)
      walk(child)
    }
  }
  walk(definition)
  return result
}

/** Never returns row values, customer contacts, or references outside the selected business. */
export function assembleTableDirectory(
  tableRecords: TableMetadata[], fieldRecords: FieldMetadata[],
  viewRecords: { id: string; tableId: string }[], appRecords: AppMetadata[],
): DirectoryTable[] {
  const owned = new Set(tableRecords.map(table => table.id))
  const names = new Map(tableRecords.map(table => [table.id, table.name]))
  const viewTables = new Map(viewRecords.filter(view => owned.has(view.tableId)).map(view => [view.id, view.tableId]))
  const allRelations: DirectoryRelation[] = []
  for (const field of fieldRecords) {
    if (!owned.has(field.tableId) || field.type !== 'relation' || !field.options || typeof field.options !== 'object') continue
    const options = field.options as Record<string, unknown>
    if (typeof options.tableId !== 'string' || !owned.has(options.tableId)) continue
    allRelations.push({ fieldId: field.id, fieldName: field.name, sourceId: field.tableId,
      sourceName: names.get(field.tableId)!, targetId: options.tableId, targetName: names.get(options.tableId)!, multiple: options.allowMultiple === true })
  }
  const appLinks = appRecords.map(app => ({ ...app,
    draftTables: referencedTables(app.draft, owned, viewTables),
    publishedTables: referencedTables(app.published, owned, viewTables),
  }))
  return tableRecords.map(table => ({
    ...table, createdAt: table.createdAt.toISOString(), updatedAt: table.updatedAt.toISOString(),
    fields: fieldRecords.filter(field => field.tableId === table.id).map(({ id, name, type, description }) => ({ id, name, type, description })),
    apps: appLinks.filter(app => app.draftTables.has(table.id) || app.publishedTables.has(table.id))
      .map(app => ({ id: app.id, name: app.name, inDraft: app.draftTables.has(table.id), inPublished: app.publishedTables.has(table.id) })),
    relations: allRelations.filter(relation => relation.sourceId === table.id || relation.targetId === table.id),
  }))
}

/** Counts and timestamps are computed by PostgreSQL; no business rows are loaded for this directory. */
export async function loadTableDirectory(workspaceId: string,member?:TableMember): Promise<DirectoryTable[]> {
  // Drizzle removes Column qualifiers in single-table SELECT projections. An
  // explicit identifier keeps this correlation bound to the OUTER table, rather
  // than comparing each row/field's table_id to its own id inside the subquery.
  const outerTableId = sql`${sql.identifier('tables')}.${sql.identifier('id')}`
  const [tableRecords, fieldRecords, viewRecords, appRecords] = await Promise.all([
    db.select({
      id: tables.id, name: tables.name, icon: tables.icon, createdAt: tables.createdAt,
      rowCount: sql<number>`(select count(*)::int from ${rows} where ${rows.tableId} = ${outerTableId} and ${rows.deletedAt} is null)`,
      fieldCount: sql<number>`(select count(*)::int from ${fields} where ${fields.tableId} = ${outerTableId})`,
      updatedAt: sql<Date>`greatest(${tables.updatedAt},
        (select max(greatest(${rows.updatedAt}, ${rows.deletedAt})) from ${rows} where ${rows.tableId} = ${outerTableId}),
        (select max(${fields.updatedAt}) from ${fields} where ${fields.tableId} = ${outerTableId}))`.mapWith(tables.updatedAt),
    }).from(tables).where(eq(tables.workspaceId, workspaceId)).orderBy(asc(tables.position)),
    db.select({ id: fields.id, tableId: fields.tableId, name: fields.name, type: fields.type, description: fields.description, options: fields.options })
      .from(fields).innerJoin(tables, eq(tables.id, fields.tableId)).where(eq(tables.workspaceId, workspaceId)).orderBy(asc(fields.position)),
    db.select({ id: views.id, tableId: views.tableId }).from(views)
      .innerJoin(tables, eq(tables.id, views.tableId)).where(eq(tables.workspaceId, workspaceId)),
    db.select({ id: apps.id, name: apps.name, draft: apps.draft, published: apps.published })
      .from(apps).where(eq(apps.workspaceId, workspaceId)).orderBy(asc(apps.createdAt)),
  ])
  const visibleTables=member?tableRecords.filter(table=>tablePermission(member,table.id)!=='none'):tableRecords
  const ids=new Set(visibleTables.map(table=>table.id))
  const visibleFields=member?visibleTables.flatMap(table=>memberTableFields(fieldRecords.filter(field=>field.tableId===table.id).map(field=>({...field,description:field.description,position:'a0',options:normalizeFieldOptions(field.type as Field['type'],field.options)}) as Field),member)):fieldRecords
  return assembleTableDirectory(visibleTables,visibleFields,viewRecords.filter(view=>ids.has(view.tableId)),member&&restrictedTables(member)?[]:appRecords).map(table=>({...table,...(member?{access:tablePermission(member,table.id) as 'view'|'edit'}:{})}))
}
