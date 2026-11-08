import { notFound } from 'next/navigation'
import { requireWorkspaceMember } from '@/lib/session'
import { authorizeApp } from '@/lib/authorize'
import { loadBuilderV2Catalog, loadBuilderV2Draft } from '@/lib/builder-v2'
import { AppV2Preview } from '@/components/builder/v2/preview'
import { PRIVATE_PAGE } from '@/lib/seo'
import { BuilderV2WorkflowNotice } from '@/components/builder/v2/workflow-feedback'
import { loadBuilderBusinessApps } from '@/lib/builder-v2-business'

export const metadata = { ...PRIVATE_PAGE, title: 'Предпросмотр приложения' }
export const dynamic = 'force-dynamic'
export default async function V2PreviewPage({ params, searchParams }: { params: Promise<{ appId: string }>; searchParams: Promise<{ screen?: string; row?: string; device?: string }> }) {
  await requireWorkspaceMember()
  const { appId } = await params, auth = await authorizeApp(appId, false)
  if (!auth.ok) notFound()
  const [draft, catalog, query] = await Promise.all([loadBuilderV2Draft(appId, auth.member.workspaceId), loadBuilderV2Catalog(auth.member.workspaceId), searchParams])
  if (!draft) notFound()
  const businessApps = await loadBuilderBusinessApps(auth.member.workspaceId, catalog.catalog.views)
  return <><BuilderV2WorkflowNotice appId={appId} /><AppV2Preview app={draft.app} tables={catalog.tables} businessApps={businessApps} initialScreen={query.screen} initialRecordId={query.row} phone={query.device === 'mobile'} actor={{ authenticated: true, roleIds: draft.app.authentication.members.find(entry => entry.email.toLowerCase() === auth.member.email.toLowerCase())?.roleIds ?? [], id: auth.member.userId, email: auth.member.email, name: auth.member.name, company: '' }} /></>
}
