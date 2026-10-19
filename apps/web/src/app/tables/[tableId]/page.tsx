import { notFound } from 'next/navigation'
import { AppChrome } from '@/components/app-chrome'
import { TableOverview } from '@/components/table-overview'
import { loadBusinessProfile } from '@/lib/business-profile'
import { canEdit, listMemberships, requireMember } from '@/lib/session'
import { PRIVATE_PAGE } from '@/lib/seo'
import { loadTableDirectory } from '@/lib/table-directory-data'

export const metadata = { title: 'Обзор таблицы', ...PRIVATE_PAGE }
export const dynamic = 'force-dynamic'

export default async function TableOverviewPage({ params }: { params: Promise<{ tableId: string }> }) {
  const member = await requireMember()
  const { tableId } = await params
  const directory = await loadTableDirectory(member.workspaceId)
  const table = directory.find(item => item.id === tableId)
  if (!table) notFound()
  const [memberships, profile] = await Promise.all([listMemberships(member.userId), loadBusinessProfile(member.workspaceId)])
  return <AppChrome member={{ email: member.email, workspaceName: member.workspaceName, role: member.role }} memberships={memberships} activeWorkspaceId={member.workspaceId}>
    <TableOverview key={table.id} table={table} businessName={profile?.name ?? member.workspaceName} canEdit={canEdit(member)} />
  </AppChrome>
}
