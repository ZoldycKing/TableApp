import Link from 'next/link'
import { AppChrome } from '@/components/app-chrome'
import { OwnerKnowledgeBase } from '@/components/owner-help'
import { currentMember, requireMember, listMemberships } from '@/lib/session'
import { PRIVATE_PAGE } from '@/lib/seo'
import { setupHref, setupStep } from '@/lib/guided-setup'
import { MarketingShell, PageHero, PrimaryLink, Section } from '@/components/marketing/blocks'
import { ImportGuideContent } from '@/components/marketing/import-guide'

export const metadata = { title: 'База знаний', ...PRIVATE_PAGE }
export const dynamic = 'force-dynamic'
export default async function HelpPage({ searchParams }: { searchParams: Promise<{ article?: string; app?: string; step?: string }> }) {
  const [query, visitor] = await Promise.all([searchParams, currentMember()])
  if (!visitor && query.article === 'import') return <MarketingShell signedIn={false}>
    <PageHero title="Перенесите таблицу и продолжайте работу." lead="Загрузите копию файла. Дальше ведите учёт в Scatta." actions={<PrimaryLink href="/login?next=%2Fimport">Загрузить свою таблицу</PrimaryLink>} />
    <Section width="narrow"><ImportGuideContent /><Link href="/how-it-works" className="text-sm text-sage-700 underline underline-offset-4">Как устроена работа в Scatta</Link></Section>
  </MarketingShell>
  const member = visitor ?? await requireMember()
  return <AppChrome member={{ email: member.email, role: member.role, workspaceName: member.workspaceName }} memberships={await listMemberships(member.userId)} activeWorkspaceId={member.workspaceId}><main className="mx-auto w-full max-w-5xl px-5 py-10 sm:px-8"><Link href={query.step ? setupHref(query.app, setupStep(query.step)) : '/app'} className="text-sm text-ink-soft underline underline-offset-4">← {query.step ? 'Назад к подготовке' : 'Обзор пространства'}</Link><h1 className="mt-6 text-3xl font-semibold">Как работать в Scatta</h1><p className="mb-8 mt-4 text-sm leading-6 text-ink-soft">Короткие инструкции по вашим задачам: от первого запуска до таблиц, прав доступа и публикации.</p><OwnerKnowledgeBase context={query.step ? '/setup' : ''} appId={query.app} articleId={query.article} /></main></AppChrome>
}
