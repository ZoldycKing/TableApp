import { apps, db } from '@tableapp/db'
import { eq } from 'drizzle-orm'
import { tableRecordPanels } from './table-record-panels'

export async function loadTableRecordPanels(workspaceId: string, tableId: string) {
  const records = await db.select({ published: apps.published }).from(apps).where(eq(apps.workspaceId, workspaceId))
  return tableRecordPanels(tableId, records.map(record => record.published))
}
