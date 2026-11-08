import { apps, db } from '@tableapp/db'
import { and, eq } from 'drizzle-orm'
import { notFound, redirect } from 'next/navigation'
import { requireWorkspaceMember as requireMember } from '@/lib/session'
import { PRIVATE_PAGE } from '@/lib/seo'

export const dynamic = 'force-dynamic'
export const metadata = { ...PRIVATE_PAGE, title: 'Сообщения приложения' }
/** Keep bookmarked per-app links working after moving the inbox to the workspace menu. */
export default async function BusinessConversations({ params, searchParams }: {
  params: Promise<{ appId: string }>; searchParams: Promise<{ table?: string; row?: string }>
}) {
  const member = await requireMember(), { appId } = await params, selected = await searchParams
  const [record] = await db.select({ id: apps.id }).from(apps).where(and(eq(apps.id, appId), eq(apps.workspaceId, member.workspaceId))).limit(1)
  if (!record) notFound()
  const query = new URLSearchParams({ app: record.id })
  if (selected.table && selected.row && selected.table.length <= 200 && selected.row.length <= 200) {
    query.set('table', selected.table); query.set('row', selected.row)
  }
  redirect(`/messages?${query}`)
}
