import Link from 'next/link'
import {notFound} from 'next/navigation'
import {authorizeApp} from '@/lib/authorize'
import {builderV2Enabled} from '@/lib/builder-v2'
import {inspectBuilderV2Enter} from '@/lib/builder-v2-enter'
import {RowWriteError} from '@/lib/row-mutations'
import {PRIVATE_PAGE} from '@/lib/seo'
import {BuilderV2ScreenEnter} from '@/components/builder/v2/screen-enter'
import styles from '@/components/builder/prototype/prototype.module.css'
import ui from '@/components/builder/v2/view.module.css'
export const metadata={...PRIVATE_PAGE,title:'Действие при открытии экрана'}
export const dynamic='force-dynamic'
export default async function ScreenEventPage({params,searchParams}:{params:Promise<{appId:string;screenId:string}>;searchParams:Promise<{row?:string}>}){
  const {appId,screenId}=await params,query=await searchParams,auth=await authorizeApp(appId)
  if(!auth.ok||!builderV2Enabled())notFound()
  const scope={screenId,...(query.row?{recordId:query.row}:{})},returnHref=`/apps/${encodeURIComponent(appId)}/preview?screen=${encodeURIComponent(screenId)}${query.row?`&row=${encodeURIComponent(query.row)}`:''}`
  let checked
  try{checked=await inspectBuilderV2Enter(appId,auth.member,scope)}catch(error){checked={ok:false as const,error:error instanceof RowWriteError?error.message:'Не удалось открыть действие.'}}
  return <main className={ui.preview}><header><Link className={styles.secondary} href={returnHref}>← К приложению</Link><span>Действие при открытии</span></header><div className={`${ui.previewBody} ${ui.workingForm}`}><div className={styles.surface}><div className={styles.appContent}>{checked.ok?<><h1 className={ui.formTitle}>{checked.state.actionName}</h1><BuilderV2ScreenEnter appId={appId} scope={scope} initial={checked.state} returnHref={returnHref}/></>:<p role="alert" className={ui.dataError}>{checked.error}</p>}</div></div></div></main>
}
