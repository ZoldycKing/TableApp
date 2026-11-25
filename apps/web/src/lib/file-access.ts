import { apps, attachments, db, rows } from '@tableapp/db'
import { appSchema } from '@tableapp/schema'
import { readAppDefinition } from '@tableapp/schema/app-definition'
import { and, eq } from 'drizzle-orm'
import { appReadPolicy } from './app-read-policy'
import { canSubmitFiles } from './app-roles'
import { currentAppAccess } from './app-session'
import { validateAppReferences } from './app-references'
import { canReadBuilderV2File } from './builder-v2-file-access'
import { canReadConversationFile } from './conversations'
import { accessViewerFor } from './record-access'
import { currentMember } from './session'
import { restrictedTables, tablePermission } from './table-permissions'

type FileRecord = typeof attachments.$inferSelect

function appClaimsTable(published: unknown, tableId: string): boolean {
  const definition = readAppDefinition(published)
  if (definition.ok && definition.formatVersion === 2) {
    return definition.app.screens.some(screen => 'tableId' in screen && screen.tableId === tableId)
      || definition.app.nodes.some(node => 'tableId' in node && (node as { tableId?: string }).tableId === tableId)
  }
  const parsed = appSchema.safeParse(published)
  if (!parsed.success) return false
  return parsed.data.screens.some(screen => 'tableId' in screen && screen.tableId === tableId)
}

/**
 * Single download gate. File keys are identifiers, never authorization.
 * Returns false for anything the principal cannot see — callers map that to 404.
 *
 * Status rule: file GET denials are always 404 (existence leak prevention).
 * Write/upload denials elsewhere may still be 403 when the principal is in
 * scope but lacks the action (e.g. viewer uploading).
 */
export async function canReadAttachment(
  record: FileRecord,
  opts: { v2App?: string | null; business?: boolean } = {},
): Promise<boolean> {
  if (record.state !== 'ready' || record.scanStatus === 'infected') return false

  if (record.conversationId || record.messageId) {
    return canReadConversationFile(record, opts.business === true)
  }

  // Explicit ?v2App= (including empty) never falls back to workspace-member rights.
  if (opts.v2App !== undefined && opts.v2App !== null) {
    if (!opts.v2App) return false
    return canReadBuilderV2File(opts.v2App, record)
  }

  const published = await db.select().from(apps).where(eq(apps.workspaceId, record.workspaceId))

  // Bound to a row/field: authorize via published app policy (V1 or V2). Never
  // fall through to a blanket workspace-member allow for app-claimed tables.
  if (record.tableId && record.rowId && record.fieldId) {
    let claimedByApp = false
    for (const candidate of published) {
      if (!appClaimsTable(candidate.published, record.tableId)) continue
      claimedByApp = true
      const definition = readAppDefinition(candidate.published)
      if (definition.ok && definition.formatVersion === 2) {
        if (await canReadBuilderV2File(candidate.slug, record)) return true
        continue
      }
      const parsed = candidate.published ? appSchema.safeParse(candidate.published) : null
      if (!parsed?.success) continue
      const app = { ...parsed.data, id: candidate.id, workspaceId: candidate.workspaceId, slug: candidate.slug }
      if (await validateAppReferences(app)) continue
      const { visitor, viewer } = await currentAppAccess(app)
      const policy = await appReadPolicy(app, record.tableId, visitor, accessViewerFor(app, visitor, viewer))
      if (!policy.readable.fields.has(record.fieldId)) continue
      const [row] = await db.select().from(rows)
        .where(and(eq(rows.id, record.rowId), eq(rows.tableId, record.tableId))).limit(1)
      if (!row || row.deletedAt !== null) continue
      const data = row.data as Record<string, unknown>
      const cell = data[record.fieldId]
      const linked = Array.isArray(cell) && cell.some((file) => file && typeof file === 'object' && 'key' in file && file.key === record.key)
      if (linked && policy.canRead(data, row)) return true
    }
    if (claimedByApp) return false
    const member = await currentMember()
    return Boolean(member?.workspaceId === record.workspaceId && tablePermission(member, record.tableId) !== 'none')
  }

  // Spreadsheet / unbound workspace files.
  const member = await currentMember()
  if (member?.workspaceId === record.workspaceId) {
    if (record.tableId) return tablePermission(member, record.tableId) !== 'none'
    // Restricted members: only their own unbound uploads.
    if (restrictedTables(member)) return record.uploadedBy === member.userId
    // Unrestricted workspace editors/owners may read unbound workspace files.
    return true
  }

  // App visitor previewing their own unlinked upload before save.
  for (const candidate of published) {
    const parsed = candidate.published ? appSchema.safeParse(candidate.published) : null
    if (!parsed?.success) continue
    const app = { ...parsed.data, id: candidate.id, workspaceId: candidate.workspaceId, slug: candidate.slug }
    if (await validateAppReferences(app)) continue
    const { visitor, viewer } = await currentAppAccess(app)
    if (viewer && record.uploadedBy === viewer.id && canSubmitFiles(app, visitor)) return true
  }

  return false
}
