import Link from 'next/link'
import { AppChrome } from '@/components/app-chrome'
import { OwnerKnowledgeBase } from '@/components/owner-help'
import { requireMember, listMemberships } from '@/lib/session'
import { PRIVATE_PAGE } from '@/lib/seo'
import { setupHref, setupStep } from '@/lib/guided-setup'

export const metadata = { title: 'База знаний', ...PRIVATE_PAGE }
export const dynamic = 'force-dynamic'
export default async function HelpPage({ searchParams }: { searchParams: Promise<{ article?: string; app?: string; step?: string }> }) {
  const member = await requireMember()
  const query = await searchParams
  return <AppChrome member={{ email: member.email, role: member.role, workspaceName: member.workspaceName }} memberships={await listMemberships(member.userId)} activeWorkspaceId={member.workspaceId}><main className="mx-auto w-full max-w-5xl px-5 py-10 sm:px-8"><Link href={query.step ? setupHref(query.app, setupStep(query.step)) : '/app'} className="text-sm text-ink-soft underline underline-offset-4">← {query.step ? 'Назад к подготовке' : 'Обзор пространства'}</Link><h1 className="mt-6 text-3xl font-semibold">Как работать в TableApp</h1><p className="mb-8 mt-4 text-sm leading-6 text-ink-soft">Короткие инструкции по вашим задачам: от первого запуска до таблиц, прав доступа и публикации.</p><OwnerKnowledgeBase context={query.step ? '/setup' : ''} appId={query.app} articleId={query.article} /></main></AppChrome>
}
