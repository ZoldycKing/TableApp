import { db, tables } from '@tableapp/db'
import { asc, eq } from 'drizzle-orm'
import { AppChrome } from '@/components/app-chrome'
import { TableDirectory } from '@/components/table-directory'
import { canEdit, listMemberships, requireMember } from '@/lib/session'
import { PRIVATE_PAGE } from '@/lib/seo'
import { loadBusinessProfile } from '@/lib/business-profile'

export const metadata = { title: 'Таблицы', ...PRIVATE_PAGE }
export const dynamic = 'force-dynamic'

/** Tables belong to the selected business, including on direct page visits. */
export default async function TablesPage() {
  const member = await requireMember()
  const [tableRows, memberships, profile] = await Promise.all([
    db.select({ id: tables.id, name: tables.name, icon: tables.icon })
      .from(tables).where(eq(tables.workspaceId, member.workspaceId)).orderBy(asc(tables.position)),
    listMemberships(member.userId),
    loadBusinessProfile(member.workspaceId),
  ])

  return (
    <AppChrome
      member={{ email: member.email, workspaceName: member.workspaceName, role: member.role }}
      memberships={memberships}
      activeWorkspaceId={member.workspaceId}
    >
      <TableDirectory tables={tableRows} businessName={profile?.name ?? member.workspaceName} canCreate={canEdit(member)} />
    </AppChrome>
  )
}
