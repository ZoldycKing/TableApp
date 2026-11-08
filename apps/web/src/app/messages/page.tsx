import { apps, db } from '@tableapp/db'
import { and, eq } from 'drizzle-orm'
import { AppChrome } from '@/components/app-chrome'
import { ConversationInbox } from '@/components/runtime/conversation-inbox'
import { listMemberships, requireWorkspaceMember as requireMember } from '@/lib/session'
import { PRIVATE_PAGE } from '@/lib/seo'
import { canAdminister } from '@/lib/roles'
import { GeneralMessageAccess } from '@/components/general-message-access'

export const dynamic = 'force-dynamic'
export const metadata = { ...PRIVATE_PAGE, title: 'Сообщения' }
export default async function Messages({ searchParams }: { searchParams: Promise<{ app?: string; table?: string; row?: string }> }) {
  const member = await requireMember(), selected = await searchParams
  const [record] = selected.app ? await db.select({ slug: apps.slug }).from(apps).where(and(eq(apps.workspaceId, member.workspaceId), eq(apps.id, selected.app))).limit(1) : []
  const target = record && selected.table && selected.row && selected.table.length <= 200 && selected.row.length <= 200
    ? { slug: record.slug, tableId: selected.table, rowId: selected.row } : null
  return <AppChrome member={member} memberships={await listMemberships(member.userId)} activeWorkspaceId={member.workspaceId}>
    <main className="mx-auto w-full max-w-6xl space-y-6 px-6 py-8"><div><h1 className="text-2xl font-semibold">Сообщения</h1></div>
      <ConversationInbox key={`${member.workspaceId}:${member.userId}`} business initialTarget={target} />
      {canAdminister(member.role) ? <GeneralMessageAccess key={`general-access:${member.workspaceId}:${member.userId}`} /> : null}
    </main>
  </AppChrome>
}
