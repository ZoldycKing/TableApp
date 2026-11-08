import Link from 'next/link'
import { notFound } from 'next/navigation'
import { authorizeApp } from '@/lib/authorize'
import { builderV2Enabled, loadBuilderV2Catalog, loadBuilderV2Draft } from '@/lib/builder-v2'
import { builderV2ScreenNodes } from '@/lib/builder-v2-data-types'
import { inspectWorkingBuilderV2Form } from '@/lib/builder-v2-submit'
import { readBuilderV2Record } from '@/lib/builder-v2-record'
import { requireWorkspaceMember } from '@/lib/session'
import { PRIVATE_PAGE } from '@/lib/seo'
import { RowWriteError } from '@/lib/row-mutations'
import { builderV2MemberActor } from '@/lib/builder-v2-actor'
import { AppV2Renderer } from '@/components/builder/v2/view'
import styles from '@/components/builder/prototype/prototype.module.css'
import ui from '@/components/builder/v2/view.module.css'

export const metadata = { title: 'Рабочая форма', ...PRIVATE_PAGE }
export const dynamic = 'force-dynamic'
export default async function WorkingFormPage({ params, searchParams }: { params: Promise<{ appId: string; formId: string }>; searchParams: Promise<{ screen?: string; row?: string;learn?:string }> }) {
  await requireWorkspaceMember()
  const { appId, formId } = await params, query = await searchParams, auth = await authorizeApp(appId)
  if (!auth.ok || !builderV2Enabled()) notFound()
  const [draft, metadata] = await Promise.all([loadBuilderV2Draft(appId, auth.member.workspaceId), loadBuilderV2Catalog(auth.member.workspaceId)])
  const form = draft?.app.nodes.find(node => node.id === formId)
  const screen = draft?.app.screens.find(screen => (!query.screen || screen.id === query.screen) && builderV2ScreenNodes(draft.app, screen.id).some(node => node.id === formId))
  if (!draft || form?.type !== 'form' || !screen) notFound()
  const scope = { formId, screenId: screen.id, ...(query.row ? { recordId: query.row } : {}) }, table = metadata.tables.find(table => table.id === form.tableId)
  let error = ''
  try { const checked = await inspectWorkingBuilderV2Form(appId, auth.member, { ...scope, mode: 'initial' }); if (!checked.ok) error = checked.error }
  catch (cause) { error = cause instanceof RowWriteError ? cause.message : 'Не удалось открыть форму. Попробуйте обновить страницу.' }
  const source = draft.app.sources.find(source => source.tableId === form.tableId)
  const list = source && draft.app.nodes.find(node => node.type === 'collection' && node.sourceId === source.id)
  const listScreen = list && draft.app.screens.find(screen => !screen.contextTableId && builderV2ScreenNodes(draft.app, screen.id).some(node => node.id === list.id))
  const learning=query.learn==='1'
  const listHref = learning&&listScreen?`/apps/${encodeURIComponent(appId)}?screen=${encodeURIComponent(listScreen.id)}`:listScreen ? `/apps/${encodeURIComponent(appId)}/preview?screen=${encodeURIComponent(listScreen.id)}` : `/t/${encodeURIComponent(form.tableId)}`
  const selected = !error && screen.contextTableId && query.row ? await readBuilderV2Record(draft.app, auth.member, screen.id, query.row).catch(() => null) : null
  const actor = builderV2MemberActor(draft.app, auth.member)
  const recordHref = `/apps/${encodeURIComponent(appId)}/preview?screen=${encodeURIComponent(screen.id)}${query.row ? `&row=${encodeURIComponent(query.row)}` : ''}`
  return <main className={ui.preview}><header><Link href={`/apps/${encodeURIComponent(appId)}?screen=${encodeURIComponent(screen.id)}${query.row ? `&row=${encodeURIComponent(query.row)}` : ''}`} className={styles.secondary}>← К редактору</Link><span>{learning?'Сохраните первую запись':'Рабочая форма'}</span></header><div className={`${ui.previewBody} ${ui.workingForm}`}><div className={styles.surface}><header className={styles.appHeader}><div><strong>{draft.app.name}</strong></div></header><p className={ui.context}>{form.mode === 'edit' ? 'Изменения будут сохранены в таблице' : 'Сохранение добавит строку в таблицу'} «{table?.name ?? 'Таблица'}».</p><div className={styles.appContent}>{error ? <p role="alert" className={ui.dataError}>{error}</p> : <AppV2Renderer live app={draft.app} tables={metadata.tables} actor={actor} screenId={screen.id} record={selected?.record} rootNodeIds={[form.id]} workingForm={{ formId: form.id, tableName: table?.name ?? 'Таблица', listHref, revision: draft.revision, recordHref, learning }} />}</div></div></div></main>
}
