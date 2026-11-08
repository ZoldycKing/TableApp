import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AppChrome } from '@/components/app-chrome'
import { PrepareImportedApp } from '@/components/import/prepare-imported-app'
import { builderV2Enabled } from '@/lib/builder-v2'
import { importedBuilderTables } from '@/lib/builder-v2-import'
import { listMemberships, requireWorkspaceMember } from '@/lib/session'
import { PRIVATE_PAGE } from '@/lib/seo'
import { authorizeWorkspace } from '@/lib/authorize'

export const metadata = { title: 'Подготовка приложения', ...PRIVATE_PAGE }
export const dynamic = 'force-dynamic'

export default async function ImportedAppPage({ params, searchParams }: { params: Promise<{ runId: string }>; searchParams: Promise<{ table?: string }> }) {
  const member = await requireWorkspaceMember(), { runId } = await params, query = await searchParams
  const auth = await authorizeWorkspace(false)
  if (!auth.ok || !builderV2Enabled()) notFound()
  const imported = await importedBuilderTables(runId, member)
  if (!imported.length) notFound()
  return <AppChrome member={{ email: member.email, workspaceName: member.workspaceName, role: member.role }} memberships={await listMemberships(member.userId)} activeWorkspaceId={member.workspaceId}>
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <PrepareImportedApp runId={runId} primaryTableId={query.table} />
      <nav aria-label="Загруженные таблицы" className="mt-6 flex flex-wrap gap-4">{imported.map(table => <Link key={table.id} href={`/t/${encodeURIComponent(table.id)}`} className="max-w-full break-words text-sm text-ink-soft underline underline-offset-4">{table.name}</Link>)}</nav>
    </main>
  </AppChrome>
}
