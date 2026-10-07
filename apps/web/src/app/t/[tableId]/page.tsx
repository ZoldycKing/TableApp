import { notFound } from 'next/navigation'
import { TableScreen } from '@/components/table-screen'
import { loadTable } from '@/lib/queries'
import { AppChrome } from '@/components/app-chrome'
import { listMemberships, requireMember } from '@/lib/session'
import { PRIVATE_PAGE } from '@/lib/seo'

/*
 * В поиске этой странице делать нечего: за ней рабочее пространство.
 * Запрет в robots.txt обход закрывает, но не индексацию — адрес, на который
 * кто-то сослался, попадает в выдачу и без обхода. Отказ говорится здесь.
 */
export const metadata = PRIVATE_PAGE

export default async function TablePage({ params }: { params: Promise<{ tableId: string }> }) {
  const member = await requireMember()
  const { tableId } = await params
  const table = await loadTable(tableId, member.workspaceId)
  if (!table) notFound()
  return (
    <AppChrome
      wide
      member={{ email: member.email, workspaceName: member.workspaceName, role: member.role }}
      memberships={await listMemberships(member.userId)}
      activeWorkspaceId={member.workspaceId}
    >
      <TableScreen table={table} member={{ role: member.role }} />
    </AppChrome>
  )
}
