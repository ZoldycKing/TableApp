import { notFound } from 'next/navigation'
import { cookies } from 'next/headers'
import { TableScreen } from '@/components/table-screen'
import { loadTable, loadTableTitle } from '@/lib/queries'
import { AppChrome } from '@/components/app-chrome'
import { listMemberships, requireMember } from '@/lib/session'
import { PRIVATE_PAGE } from '@/lib/seo'
import { loadTableRecordPanels } from '@/lib/load-table-record-panels'
import { NO_RECORD_PANELS } from '@/lib/table-record-panels'
import { TABLE_EDITOR_MODE_COOKIE, tableEditorMode } from '@/lib/table-editor-mode'
import { restrictedTables,tablePermission } from '@/lib/table-permissions'
import { editorPageRequestSchema, TABLE_PAGE_SIZE } from '@/lib/table-page'

/*
 * В поиске этой странице делать нечего: за ней рабочее пространство.
 * Запрет в robots.txt обход закрывает, но не индексацию — адрес, на который
 * кто-то сослался, попадает в выдачу и без обхода. Отказ говорится здесь.
 */
export async function generateMetadata({ params }: { params: Promise<{ tableId: string }> }) {
  const member = await requireMember()
  const { tableId } = await params
  return { ...PRIVATE_PAGE, title: await loadTableTitle(tableId, member.workspaceId, member) ?? 'Таблица' }
}

export default async function TablePage({ params, searchParams }: { params: Promise<{ tableId: string }>; searchParams: Promise<{ r?: string; mode?: string; readonly?: string; p?: string; q?: string; view?: string }> }) {
  const member = await requireMember()
  const { tableId } = await params
  const query = await searchParams
  const mode = tableEditorMode(query.mode, (await cookies()).get(TABLE_EDITOR_MODE_COOKIE)?.value)
  const page = editorPageRequestSchema.parse({ mode, offset: Math.floor(Math.min(100_000, Math.max(1, Number(query.p) || 1))) * TABLE_PAGE_SIZE - TABLE_PAGE_SIZE,
    search: query.q?.slice(0, 500) ?? '', viewId: query.view?.slice(0, 200), rowId: query.r?.slice(0, 200) })
  const table = await loadTable(tableId, member.workspaceId,member,page)
  if (!table) notFound()
  const selected = query.r
  const initialRowId = selected && (table.rows.some(row => row.id === selected) || table.editorPinnedRow?.id === selected) ? selected : null
  const recordPanels = !restrictedTables(member) && tablePermission(member, tableId) === 'edit' && query.readonly !== '1'
    ? await loadTableRecordPanels(member.workspaceId, tableId) : NO_RECORD_PANELS
  return (
    <AppChrome
      wide
      member={{ email: member.email, workspaceName: member.workspaceName, role: member.role }}
      memberships={await listMemberships(member.userId)}
      activeWorkspaceId={member.workspaceId}
    >
      <TableScreen key={`${table.id}:${query.readonly === '1' ? 'readonly' : 'edit'}:${tablePermission(member,tableId)}`} table={table} member={{ role: tablePermission(member,tableId)==='edit'?member.role:'viewer' }} limitedAccess={restrictedTables(member)} initialRowId={initialRowId} initialMode={mode} viewOnly={query.readonly === '1'} recordPanels={recordPanels} />
    </AppChrome>
  )
}
