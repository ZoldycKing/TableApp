import { apps, db, fields, tables, views } from '@tableapp/db'
import { newId, fieldTimeZone, type FieldType, type Field } from '@tableapp/schema'
import { readAppDefinition } from '@tableapp/schema/app-definition'
import type { AppV2, AppV2Catalog } from '@tableapp/schema/app-v2'
import { and, asc, eq, inArray } from 'drizzle-orm'
import type { Transaction } from './db-transaction'
import { builderV2Revision } from './builder-v2-revision'
export { builderV2Revision } from './builder-v2-revision'

export type BuilderV2Table = { id: string; name: string; primaryFieldId: string | null; fields: { id: string; name: string; type: FieldType; timeZone?:string; relationTableId?: string; choices?: { id: string; name: string }[] }[]; views: { id: string; name: string }[] }
export const builderV2Enabled = () => process.env.NODE_ENV !== 'production' || process.env.TABLEAPP_BUILDER_V2 === '1'

export function newBuilderV2App(input: { id: string; workspaceId: string; name: string; slug: string; email: string }): AppV2 {
  const home = newId('screen')
  return { formatVersion: 2, id: input.id, workspaceId: input.workspaceId, name: input.name, slug: input.slug, purpose: 'personal', appearance: {navigation:'sidebar',icon:'apps'}, theme: { accent: 'green', scheme: 'light', logoKey: null, iconKey: null },
    roles: [{ id: 'owner', name: 'Владелец' }], authentication: { mode: 'invite_only', defaultRoleId: null, members: [{ email: input.email.trim().toLowerCase(), roleIds: ['owner'], company: '' }] },
    homeScreenId: home, screens: [{ id: home, name: 'Главная', icon: 'home', navigation: true, audience: { kind: 'roles', roleIds: ['owner'] }, contextTableId: null, rootIds: [], events: { enter: null } }], nodes: [], sources: [], workflows: [], policy: { tables: [], workflows: [] } }
}

/** Only schema metadata, never workspace rows, enters the layout editor. */
export async function loadBuilderV2Catalog(workspaceId: string, connection: Transaction | typeof db = db) {
  const tableRows = await connection.select().from(tables).where(eq(tables.workspaceId, workspaceId)).orderBy(asc(tables.position))
  const ids = tableRows.map(table => table.id)
  const fieldRows = ids.length ? await connection.select().from(fields).where(inArray(fields.tableId, ids)).orderBy(asc(fields.position)) : []
  const viewRows = ids.length ? await connection.select().from(views).where(inArray(views.tableId, ids)).orderBy(asc(views.position)) : []
  const catalog: AppV2Catalog = { workspaceId, tables: new Map(tableRows.map(table => [table.id, { workspaceId: table.workspaceId }])), fields: new Map(fieldRows.map(field => [field.id, { tableId: field.tableId, type: field.type as FieldType, ...(['date','datetime'].includes(field.type)?{timeZone:fieldTimeZone(field as unknown as Field)}:{}), ...(field.type === 'relation' && typeof (field.options as { tableId?: unknown }).tableId === 'string' ? { relationTableId: (field.options as { tableId: string }).tableId } : {}) }])), views: new Map(viewRows.map(view => [view.id, { tableId: view.tableId }])) }
  const metadata: BuilderV2Table[] = tableRows.map(table => ({ id: table.id, name: table.name, primaryFieldId: table.primaryFieldId, fields: fieldRows.filter(field => field.tableId === table.id).map(field => ({ id: field.id, name: field.name, type: field.type as FieldType, ...(['date','datetime'].includes(field.type)?{timeZone:fieldTimeZone(field as unknown as Field)}:{}), ...(field.type === 'relation' && typeof (field.options as { tableId?: unknown }).tableId === 'string' ? { relationTableId: (field.options as { tableId: string }).tableId } : {}), ...(['single_select', 'multi_select'].includes(field.type) && Array.isArray((field.options as { choices?: unknown }).choices) ? { choices: ((field.options as { choices: { id: string; name: string }[] }).choices).map(choice => ({ id: choice.id, name: choice.name })) } : {}) })), views: viewRows.filter(view => view.tableId === table.id).map(view => ({ id: view.id, name: view.name })) }))
  return { catalog, tables: metadata }
}

export async function loadBuilderV2Draft(appId: string, workspaceId: string) {
  const [record] = await db.select().from(apps).where(and(eq(apps.id, appId), eq(apps.workspaceId, workspaceId)))
  if (!record) return null
  const read = readAppDefinition(record.draft)
  if (!read.ok || read.formatVersion !== 2 || read.app.id !== record.id || read.app.workspaceId !== record.workspaceId) return null
  return { app: { ...read.app, slug: record.slug }, revision: builderV2Revision(record.draft), record }
}
