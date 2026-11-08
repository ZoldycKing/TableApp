import { AppChrome } from '@/components/app-chrome'
import { TableDirectory } from '@/components/table-directory'
import { canEdit, listMemberships, requireMember } from '@/lib/session'
import { PRIVATE_PAGE } from '@/lib/seo'
import { loadTableDirectory } from '@/lib/table-directory-data'

export const metadata = { title: 'Таблицы', ...PRIVATE_PAGE }
export const dynamic = 'force-dynamic'

/** Tables belong to the selected business, including on direct page visits. */
export default async function TablesPage() {
  const member = await requireMember()
  const [tableRows, memberships] = await Promise.all([
    loadTableDirectory(member.workspaceId,member),
    listMemberships(member.userId),
  ])

  return (
    <AppChrome
      member={{ email: member.email, workspaceName: member.workspaceName, role: member.role }}
      memberships={memberships}
      activeWorkspaceId={member.workspaceId}
    >
      <TableDirectory key={member.workspaceId} tables={tableRows} canCreate={canEdit(member)} />
    </AppChrome>
  )
}
