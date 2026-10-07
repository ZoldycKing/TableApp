import { db, fields, tables, views, workspaces } from '@tableapp/db'
import { asc, eq, inArray } from 'drizzle-orm'
import { lockRowUsage } from './row-mutations'
import { fieldSettingsPlan, viewSettingsPlan } from './settings-plan'
import { publishTable } from './live'

/** Add defaults only; preserve unknown keys, references and existing filters. */
export async function migrateSettings({ run = false, workspaceId }: { run?: boolean; workspaceId?: string } = {}) {
  const spaces = await db.select({ id: workspaces.id }).from(workspaces)
    .where(workspaceId ? eq(workspaces.id, workspaceId) : undefined).orderBy(asc(workspaces.id))
  const result = { workspaces: spaces.length, fields: 0, views: 0, invalidFields: [] as string[], invalidViews: [] as string[] }
  for (const space of spaces) {
    const changed = new Set<string>()
    await db.transaction(async (tx) => {
      if (run) await lockRowUsage({ tx, workspaceId: space.id, changed })
      const ids = tx.select({ id: tables.id }).from(tables).where(eq(tables.workspaceId, space.id))
      const fieldQuery = tx.select().from(fields).where(inArray(fields.tableId, ids)).orderBy(asc(fields.id))
      const viewQuery = tx.select().from(views).where(inArray(views.tableId, ids)).orderBy(asc(views.id))
      const fieldRows = run ? await fieldQuery.for('update') : await fieldQuery
      const viewRows = run ? await viewQuery.for('update') : await viewQuery
      for (const field of fieldRows) {
        const plan = fieldSettingsPlan(field.type, field.options)
        if (!plan.ok) { result.invalidFields.push(field.id); continue }
        if (!plan.changed) continue
        result.fields += 1
        if (run) { await tx.update(fields).set({ options: plan.value, updatedAt: new Date() }).where(eq(fields.id, field.id)); changed.add(field.tableId) }
      }
      for (const view of viewRows) {
        const plan = viewSettingsPlan(view)
        if (!plan.ok) { result.invalidViews.push(view.id); continue }
        if (!plan.changed) continue
        result.views += 1
        if (run) { await tx.update(views).set({ config: plan.value, updatedAt: new Date() }).where(eq(views.id, view.id)); changed.add(view.tableId) }
      }
    })
    for (const tableId of changed) publishTable(tableId, 'structure')
  }
  return result
}
