import { db, rows } from '@tableapp/db'
import { appV2ChildIds, type AppV2 } from '@tableapp/schema/app-v2'
import { and, eq, isNull } from 'drizzle-orm'
import { builderV2CalculationPlan } from './builder-v2-read-plan'
import { deriveBuilderV2Rows, loadBuilderV2ReadMetadata, projectBuilderV2Record } from './builder-v2-row-data'
import { RowWriteError } from './row-mutations'
import type { Member } from './session'
import { restrictedTables, tablePermission } from './table-permissions'
import type { RuntimeSourceRow } from './runtime-project'

/** Collect page bindings without confusing each repeated item with the screen's selected record. */
export function builderV2ScreenFields(app: AppV2, screenId: string): Set<string> {
  const fields = new Set<string>(), seen = new Set<string>()
  const collect = (value: unknown, repeated: boolean): void => {
    if (!value || typeof value !== 'object') return
    const object = value as Record<string, unknown>
    if (object.kind === 'literal') return
    if ((object.kind === 'screen_row' || !repeated && object.kind === 'row') && typeof object.fieldId === 'string') fields.add(object.fieldId)
    Object.values(object).forEach(value => collect(value, repeated))
  }
  const visit = (ids: readonly string[], repeated: boolean) => {
    for (const id of ids) {
      if (seen.has(id)) continue
      seen.add(id); const node = app.nodes.find(node => node.id === id)
      if (!node) continue
      if ('value' in node) collect(node.value, repeated)
      if (node.type === 'profile') collect([node.title, node.subtitle, node.image, ...node.contacts.map(contact => contact.value)], repeated)
      if (node.type === 'input') collect(node.initialValue, repeated)
      collect(node.visibleWhen, repeated)
      visit(appV2ChildIds(node), repeated || node.type === 'collection')
    }
  }
  const screen = app.screens.find(screen => screen.id === screenId)
  for (const fieldId of Object.values(screen?.catalog ?? {})) if (fieldId) fields.add(fieldId)
  if (screen?.recordTitleFieldId) fields.add(screen.recordTitleFieldId)
  visit(screen?.rootIds ?? [], false)
  return fields
}
export async function readBuilderV2Record(app: AppV2, member: Member, screenId: string, recordId: string) {
  const screen = app.screens.find(screen => screen.id === screenId), tableId = screen?.contextTableId
  if (!tableId || member.workspaceId !== app.workspaceId || restrictedTables(member) || tablePermission(member, tableId) === 'none') throw new RowWriteError('denied', 'Карточка записи недоступна')
  return db.transaction(async tx => {
    const meta = await loadBuilderV2ReadMetadata(tx, member.workspaceId, [tableId])
    const [row] = await tx.select().from(rows).where(and(eq(rows.tableId, tableId), eq(rows.id, recordId), isNull(rows.deletedAt))).limit(1)
    if (!row) throw new RowWriteError('missing', 'Запись удалена или больше недоступна')
    const columns = meta.fieldsByTable.get(tableId) ?? [], primary = meta.primaryByTable.get(tableId) ?? columns[0]?.id
    const displayed = builderV2ScreenFields(app, screenId); if (primary) displayed.add(primary)
    const plan = builderV2CalculationPlan(meta.fieldsByTable, meta.primaryByTable, new Map([[tableId, new Set(displayed)]]))
    const [derived] = await deriveBuilderV2Rows(meta, [row as RuntimeSourceRow], plan, Date.now())
    const record = projectBuilderV2Record(meta, derived!, displayed)
    const titleFieldId = screen.catalog?.titleFieldId ?? screen.recordTitleFieldId ?? primary
    return { record, title: titleFieldId ? record.display[titleFieldId] || 'Без названия' : 'Запись' }
  }, { isolationLevel: 'repeatable read', accessMode: 'read only' })
}
