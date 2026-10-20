import Link from 'next/link'
import { AppChrome } from '@/components/app-chrome'
import { OwnerKnowledgeBase } from '@/components/owner-help'
import { requireMember, listMemberships } from '@/lib/session'
import { PRIVATE_PAGE } from '@/lib/seo'

export const metadata = { title: 'База знаний', ...PRIVATE_PAGE }
export const dynamic = 'force-dynamic'
export default async function HelpPage() {
  const member = await requireMember()
  return <AppChrome member={{ email: member.email, role: member.role, workspaceName: member.workspaceName }} memberships={await listMemberships(member.userId)} activeWorkspaceId={member.workspaceId}><main className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-8"><Link href="/app" className="text-sm text-ink-soft underline underline-offset-4">← Обзор бизнеса</Link><h1 className="mt-6 text-3xl font-semibold">Как работать в TableApp</h1><p className="mb-8 mt-4 text-sm leading-6 text-ink-soft">Короткие инструкции по вашим задачам: от первого запуска до таблиц, прав доступа и публикации.</p><OwnerKnowledgeBase /></main></AppChrome>
}
