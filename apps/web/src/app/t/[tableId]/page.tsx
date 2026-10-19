import { notFound } from 'next/navigation'
import { TableScreen } from '@/components/table-screen'
import { loadTable } from '@/lib/queries'
import { AppChrome } from '@/components/app-chrome'
import { listMemberships, requireMember } from '@/lib/session'
import { PRIVATE_PAGE } from '@/lib/seo'
import { hasCustomerHistoryTable } from '@/lib/customer-history'

/*
 * В поиске этой странице делать нечего: за ней рабочее пространство.
 * Запрет в robots.txt обход закрывает, но не индексацию — адрес, на который
 * кто-то сослался, попадает в выдачу и без обхода. Отказ говорится здесь.
 */
export const metadata = PRIVATE_PAGE

export default async function TablePage({ params, searchParams }: { params: Promise<{ tableId: string }>; searchParams: Promise<{ r?: string; mode?: string; readonly?: string }> }) {
  const member = await requireMember()
  const { tableId } = await params
  const table = await loadTable(tableId, member.workspaceId)
  if (!table) notFound()
  const query = await searchParams
  const selected = query.r
  const initialRowId = selected && table.rows.some(row => row.id === selected) ? selected : null
  return (
    <AppChrome
      wide
      member={{ email: member.email, workspaceName: member.workspaceName, role: member.role }}
      memberships={await listMemberships(member.userId)}
      activeWorkspaceId={member.workspaceId}
    >
      <TableScreen key={`${table.id}:${query.readonly === '1' ? 'readonly' : 'edit'}`} table={table} member={{ role: member.role }} initialRowId={initialRowId} initialMode={query.mode === 'records' ? 'records' : 'grid'} viewOnly={query.readonly === '1'} customerHistoryAvailable={await hasCustomerHistoryTable(member.workspaceId, table.id)} />
    </AppChrome>
  )
}
