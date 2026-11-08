import {db,apps} from '@tableapp/db'
import {eq} from 'drizzle-orm'
import {AppLogin} from '@/components/runtime/app-login'
import {loadPublishedV2Page} from '@/lib/builder-v2-published-page'
import {builderV2Enabled} from '@/lib/builder-v2'
import {publishedV2Definition} from '@/lib/builder-v2-published'
import {builderV2Revision} from '@/lib/builder-v2-revision'
import {PublishedV2Runtime} from './published-runtime'
import ui from './view.module.css'
import {BuilderV2AppMark, BuilderV2Theme} from './app-frame'
import {builderV2LogoUrl} from '@/lib/builder-v2-logo-types'
export async function isPublishedBuilderV2(slug:string){if(!builderV2Enabled())return false;const [row]=await db.select({definition:apps.published}).from(apps).where(eq(apps.slug,slug));return Boolean(row?.definition&&typeof row.definition==='object'&&(row.definition as {formatVersion?:unknown}).formatVersion===2)}
export async function PublishedBuilderV2Page({slug,query}:{slug:string;query:{screen?:string;row?:string;login?:string;error?:string}}){
  try{
    const data=await loadPublishedV2Page(slug,query)
    if(data.login||query.login==='1'){
      const meta = data.login ? data : data.app
      const logo = builderV2LogoUrl(meta)
      return <BuilderV2Theme as="main" app={meta} className={ui.preview}>
        <div className={ui.publishedLogin} data-v2-login>
          {logo && <div className={ui.loginMark}><BuilderV2AppMark logo={logo} icon={meta.appearance?.icon}/></div>}
          <AppLogin slug={slug} appName={meta.name} accent={meta.theme.accent} initialError={query.error??null} purpose="app"/>
        </div>
      </BuilderV2Theme>
    }
    return <PublishedV2Runtime key={builderV2Revision([data.app.id,data.actor.id??data.actor.email])} data={data}/>
  }catch{return <main className={ui.preview}><div className={ui.publishedLogin}><h1>Страница недоступна</h1><p>Возможно, ссылка устарела или у вас нет доступа.</p><p><a href={`/a/${encodeURIComponent(slug)}`}>К разделам приложения</a></p><a href={`/a/${encodeURIComponent(slug)}?login=1`}>Войти другой почтой</a></div></main>}
}
export async function publishedBuilderV2Title(slug:string){try{return (await publishedV2Definition(slug))?.app.name??'Приложение'}catch{return 'Приложение'}}
