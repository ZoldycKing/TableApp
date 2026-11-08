import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { AppChrome } from '@/components/app-chrome'
import { PrepareApp } from '@/components/prepare-app'
import { loadTableDirectory } from '@/lib/table-directory-data'
import { listMemberships, requireWorkspaceMember } from '@/lib/session'
import { restrictedTables } from '@/lib/table-permissions'
import { PRIVATE_PAGE } from '@/lib/seo'
import { builderV2Enabled } from '@/lib/builder-v2'
import { CreateBuilderV2App } from '@/components/builder/v2/create'

export const metadata = { ...PRIVATE_PAGE, title: 'Создать приложение' }

export default async function NewAppPage({ searchParams }: { searchParams: Promise<{ table?: string; builder?: string }> }) {
  const member = await requireWorkspaceMember()
  if (member.role === 'viewer' || restrictedTables(member)) redirect('/apps')
  const [query, tables, memberships] = await Promise.all([
    searchParams, loadTableDirectory(member.workspaceId, member), listMemberships(member.userId),
  ])
  const blank = query.builder === '1' && builderV2Enabled()
  if (query.table && !tables.some(table => table.id === query.table)) notFound()
  return <AppChrome member={{ email: member.email, workspaceName: member.workspaceName, role: member.role }} memberships={memberships} activeWorkspaceId={member.workspaceId}>
    <main className="mx-auto w-full max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
      <Link href={query.table ? `/t/${encodeURIComponent(query.table)}` : '/apps'} className="text-sm text-ink-soft underline underline-offset-4">← Назад</Link>
      <h1 className="mb-6 mt-6 text-2xl font-semibold tracking-tight sm:text-3xl">Создать приложение</h1>
      {builderV2Enabled() && <nav aria-label="Способ создания" className="mb-6 flex gap-2"><Link href="/apps/new" aria-current={!blank ? 'page' : undefined} className={!blank ? 'platform-primary' : 'platform-secondary'}>Из своих таблиц</Link><Link href="/apps/new?builder=1" aria-current={blank ? 'page' : undefined} className={blank ? 'platform-primary' : 'platform-secondary'}>С нуля</Link></nav>}
      {blank ? <CreateBuilderV2App /> : tables.length ? <PrepareApp tables={tables.map(({ id, name }) => ({ id, name }))} initialSelected={query.table ? [query.table] : []} showTitle={false} /> : <p className="text-sm leading-6 text-ink-soft">Сначала <Link href="/tables" className="underline underline-offset-4">создайте или загрузите таблицу</Link>.</p>}
    </main>
  </AppChrome>
}
