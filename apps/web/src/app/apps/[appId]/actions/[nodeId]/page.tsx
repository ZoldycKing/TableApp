import Link from 'next/link'
import { notFound } from 'next/navigation'
import { authorizeApp } from '@/lib/authorize'
import { builderV2Enabled, loadBuilderV2Draft } from '@/lib/builder-v2'
import { inspectBuilderV2Delete } from '@/lib/builder-v2-delete'
import { builderV2DeleteAction } from '@/lib/builder-v2-delete-action'
import { builderV2NodeAction } from '@/lib/builder-v2-button-action'
import { inspectBuilderV2Button } from '@/lib/builder-v2-button'
import { BuilderV2WorkingButton } from '@/components/builder/v2/working-button'
import type { BuilderV2ButtonInspection } from '@/lib/builder-v2-button-types'
import { builderV2ScreenNodes } from '@/lib/builder-v2-data-types'
import { requireWorkspaceMember } from '@/lib/session'
import { PRIVATE_PAGE } from '@/lib/seo'
import { RowWriteError } from '@/lib/row-mutations'
import { BuilderV2WorkingDelete } from '@/components/builder/v2/working-delete'
import type { BuilderV2DeleteInspection } from '@/lib/builder-v2-delete-types'
import styles from '@/components/builder/prototype/prototype.module.css'
import ui from '@/components/builder/v2/view.module.css'

export const metadata = { title: 'Рабочее действие', ...PRIVATE_PAGE }
export const dynamic = 'force-dynamic'
export default async function WorkingActionPage({ params, searchParams }: { params: Promise<{ appId: string; nodeId: string }>; searchParams: Promise<{ screen?: string; row?: string;item?:string }> }) {
  await requireWorkspaceMember()
  const { appId, nodeId } = await params, query = await searchParams, auth = await authorizeApp(appId)
  if (!auth.ok || !builderV2Enabled()) notFound()
  const draft = await loadBuilderV2Draft(appId, auth.member.workspaceId), node = draft?.app.nodes.find(node => node.id === nodeId), action = draft && node ? builderV2DeleteAction(draft.app, node) : null
  const chain=draft&&node?builderV2NodeAction(draft.app,node):null
  if (!draft || !node || !query.screen || !action&&!chain) notFound()
  if(chain){
    const scope={screenId:query.screen,nodeId,...(query.row?{recordId:query.row}:{}),...(query.item?{itemId:query.item}:{})}
    let checked:BuilderV2ButtonInspection
    try{checked=await inspectBuilderV2Button(appId,auth.member,scope)}catch(cause){checked={ok:false,error:cause instanceof RowWriteError?cause.message:'Не удалось открыть действие. Попробуйте обновить страницу.'}}
    const editorHref=`/apps/${encodeURIComponent(appId)}?screen=${encodeURIComponent(scope.screenId)}${scope.recordId?`&row=${encodeURIComponent(scope.recordId)}`:''}`,returnHref=editorHref.replace('?screen=','/preview?screen=')
    return <main className={ui.preview}><header><Link href={editorHref} className={styles.secondary}>← К редактору</Link><span>Рабочее действие</span></header><div className={`${ui.previewBody} ${ui.workingForm}`}><div className={styles.surface}><header className={styles.appHeader}><strong>{draft.app.name}</strong></header><div className={styles.appContent}>{checked.ok?<BuilderV2WorkingButton appId={appId} scope={scope} initial={checked.state} returnHref={returnHref}/>:<p role="alert" className={ui.dataError}>{checked.error}</p>}</div></div></div></main>
  }
  if(!action||!query.row)notFound()
  const scope = { screenId: query.screen, nodeId, recordId: query.row }
  let checked: BuilderV2DeleteInspection
  try { checked = await inspectBuilderV2Delete(appId, auth.member, scope) }
  catch (cause) { checked = { ok: false, error: cause instanceof RowWriteError ? cause.message : 'Не удалось открыть действие. Попробуйте обновить страницу.' } }
  const tableId = action.step.tableId, sourceIds = new Set(draft.app.sources.filter(source => source.tableId === tableId).map(source => source.id))
  const list = draft.app.nodes.find(node => node.type === 'collection' && sourceIds.has(node.sourceId)), listScreen = list && draft.app.screens.find(screen => !screen.contextTableId && builderV2ScreenNodes(draft.app, screen.id).some(node => node.id === list.id))
  const listHref = listScreen ? `/apps/${encodeURIComponent(appId)}/preview?screen=${encodeURIComponent(listScreen.id)}` : `/t/${encodeURIComponent(tableId)}`
  return <main className={ui.preview}><header><Link href={`/apps/${encodeURIComponent(appId)}?screen=${encodeURIComponent(scope.screenId)}&row=${encodeURIComponent(scope.recordId)}`} className={styles.secondary}>← К редактору</Link><span>Рабочее действие</span></header><div className={`${ui.previewBody} ${ui.workingForm}`}><div className={styles.surface}><header className={styles.appHeader}><strong>{draft.app.name}</strong></header><div className={styles.appContent}>{checked.ok ? <BuilderV2WorkingDelete appId={appId} scope={scope} initial={checked.state} listHref={listHref} /> : <p role="alert" className={ui.dataError}>{checked.error}</p>}</div></div></div></main>
}
