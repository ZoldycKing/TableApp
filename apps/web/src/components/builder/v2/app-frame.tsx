'use client'
import {useEffect,useId,useRef,useState,type ReactNode} from 'react'
import type {AppV2} from '@tableapp/schema/app-v2'
import {ProtoIcon} from '../prototype/icons'
import styles from '../prototype/prototype.module.css'
import {BuilderThemeContext} from '../prototype/theme-context'
import {builderV2Menu,builderV2MenuLabel,builderV2ThemeStyle} from './appearance'
import { builderV2LogoUrl } from '@/lib/builder-v2-logo-types'
import css from './app-frame.module.css'
import presentation from '@/components/runtime/app-presentation.module.css'
import { BuilderV2RecordAvatar } from './record-visuals'

export function BuilderV2Theme({app,children,className='',as:Tag='div'}:{app:Pick<AppV2,'theme'|'appearance'>;children:ReactNode;className?:string;as?:'div'|'main'}) {
  const theme={className:css.theme??'',style:builderV2ThemeStyle(app.theme, app.appearance),scheme:app.theme.scheme}
  return <BuilderThemeContext.Provider value={theme}><Tag className={`${css.theme} ${className}`} data-scheme={theme.scheme} style={theme.style}>{children}</Tag></BuilderThemeContext.Provider>
}
export function BuilderV2Account({email,authenticated,slug,preview=false}:{email?:string|null;authenticated:boolean;slug:string;preview?:boolean}) {
  const root=useRef<HTMLDetailsElement>(null)
  useEffect(()=>{
    const close=(event:PointerEvent)=>{if(root.current?.open&&event.target instanceof Node&&!root.current.contains(event.target))root.current.open=false}
    document.addEventListener('pointerdown',close);return()=>document.removeEventListener('pointerdown',close)
  },[])
  const href=`/a/${encodeURIComponent(slug)}?login=1`
  if(!authenticated)return <a className={css.signIn} href={href}>Войти</a>
  return <details className={css.account} ref={root} onKeyDown={event=>{if(event.key==='Escape'&&root.current?.open){event.preventDefault();root.current.open=false;root.current.querySelector('summary')?.focus()}}}><summary aria-label="Аккаунт" title="Аккаунт"><ProtoIcon name="users"/></summary><div><small>Вы вошли как</small><span>{email}</span>{!preview&&<a href={href}>Сменить почту</a>}</div></details>
}
export function BuilderV2AppMark({ logo, icon = 'apps' }: { logo?: string; icon?: string }) {
  const [failed, setFailed] = useState<string>()
  const image = logo && failed !== logo ? logo : undefined
  return <span className={css.appIcon} data-custom={Boolean(image)} aria-hidden>
    {image ? <img src={image} alt="" width={40} height={40} onError={() => setFailed(image)} /> : <ProtoIcon name={icon} size={22} />}
  </span>
}

export function BuilderV2AppFrame({app,screenId,sectionId=screenId,title,children,onNavigate,back,notice,phone=false,headerAction,draftLogo=false,fullScreen=false,scrollKey,profile=false}:{app:AppV2;screenId:string;sectionId?:string;title:string;children:ReactNode;onNavigate:(id:string)=>void;back?:()=>void;notice?:ReactNode;phone?:boolean;headerAction?:ReactNode;draftLogo?:boolean;fullScreen?:boolean;scrollKey?:string;profile?:boolean}) {
  const screens=builderV2Menu(app),[more,setMore]=useState(false),menuId=useId(),root=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null)
  const catalogDetail = Boolean(app.screens.find(screen => screen.id === screenId)?.catalog)
  const body = useRef<HTMLDivElement>(null)
  const contents = useRef<HTMLDivElement>(null)
  const previousScreen = useRef(screenId)
  const contained = fullScreen || scrollKey !== undefined
  const centered = app.appearance?.presentation === 'centered'
  const navigation = centered ? 'bottom' : app.appearance?.navigation ?? 'bottom'
  useEffect(() => {
    if (contained && body.current) body.current.scrollTop = 0
  }, [contained, screenId, scrollKey])
  useEffect(() => {
    const changed = previousScreen.current !== screenId
    previousScreen.current = screenId
    if (!phone || !changed || !contents.current || typeof window.matchMedia !== 'function' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const element = contents.current
    let active = true
    let reset: (() => void) | undefined
    void import('gsap').then(({ gsap }) => {
      if (!active) return
      const tween = gsap.fromTo(element, { x: 24, opacity: .68 }, { x: 0, opacity: 1, duration: .22, ease: 'power2.out', clearProps: 'transform,opacity' })
      reset = () => { tween.kill(); gsap.set(element, { clearProps: 'transform,opacity' }) }
    }).catch(() => {})
    return () => { active = false; reset?.() }
  }, [phone, screenId])
  useEffect(()=>setMore(false),[screenId,navigation])
  useEffect(()=>{
    if(!more)return
    const outside=(event:PointerEvent)=>{if(event.target instanceof Node&&!root.current?.contains(event.target))setMore(false)}
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();setMore(false);trigger.current?.focus()}}
    document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape)
    return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape)}
  },[more])
  const choose=(id:string)=>{setMore(false);onNavigate(id)}
  const navButton=(screen:AppV2['screens'][number],extra=false)=><button type="button" key={screen.id} title={builderV2MenuLabel(screen)} aria-current={screen.id===sectionId?'page':undefined} className={extra?css.extraItem:undefined} onClick={()=>choose(screen.id)}><ProtoIcon name={screen.icon}/><span>{builderV2MenuLabel(screen)}</span></button>
  const overflow=screens.length>5,rest=screens.slice(4),activeExtra=rest.some(screen=>screen.id===sectionId)
  const appName = app.name || 'Моё приложение'
  const sectionScreen = app.screens.find(screen => screen.id === sectionId)
  // Record cards show the parent section (Клиенты / Сделки). If the parent is
  // unknown, sectionId falls back to the card itself — keep the app name then.
  const headerEyebrow = back && sectionScreen && sectionId !== screenId ? sectionScreen.name : appName
  const mark = <BuilderV2AppMark logo={builderV2LogoUrl(app, draftLogo)} icon={app.appearance?.icon} />
  return <div className={`${css.stage} ${centered && !phone ? css.centeredStage : ''}`} data-frame-stage data-fullscreen={fullScreen || undefined}>
    <div className={css.container} data-app-frame="" data-phone={phone} data-contained={contained || undefined} data-fullscreen={fullScreen || undefined}>
    {phone && <span className={css.island} aria-hidden="true" />}
    <section className={`${styles.surface} ${css.frame}`} data-navigation={screens.length ? navigation : 'bottom'}>
    <header className={`${styles.appHeader} ${css.header}`}>
      <div className={`${css.chromeBar} ${presentation.contentWidth}`}>
        {back ? <button type="button" className={presentation.iconControl} onClick={back} aria-label="Назад" title="Назад"><ProtoIcon name="back" /></button> : <span className={css.headerMark}>{mark}</span>}
        {profile && <BuilderV2RecordAvatar name={title} id={scrollKey || screenId} icon="users" />}
        {catalogDetail ? <span className={css.catalogIdentity}>{sectionScreen?.name ?? appName}</span>
          : title || (back && headerEyebrow) ? <div>
            {back && headerEyebrow ? <span className={css.headerIdentity}>{headerEyebrow}</span> : null}
            {title ? <h1 className={presentation.pageTitle}>{title.replaceAll('-', '\u2011')}</h1> : null}
          </div> : null}
        {headerAction&&<span className={css.headerAction}>{headerAction}</span>}
      </div>
    </header>
    <div ref={body} className={css.body} role={contained ? 'region' : undefined} aria-label={contained ? 'Содержимое экрана' : undefined} tabIndex={contained ? 0 : undefined}><div ref={contents} className={`${styles.appContent} ${css.content} ${presentation.contentWidth}`}>{notice}{children}</div></div>
    {screens.length>0&&<nav className={css.navigation} aria-label="Разделы приложения">
      <div className={navigation === 'sidebar' ? css.navStack : `${css.chromeBar} ${presentation.contentWidth}`}>
        <div className={css.railIdentity}>{mark}<strong>{appName}</strong></div>
        <div className={css.navItems}>{screens.map((screen,index)=><div key={screen.id} className={overflow&&index>=4?css.overflowItem:undefined}>{navButton(screen)}</div>)}{overflow&&<div className={css.more} ref={root}><button type="button" ref={trigger} aria-expanded={more} aria-controls={menuId} aria-current={activeExtra?'true':undefined} onClick={()=>setMore(!more)}><ProtoIcon name="more"/><span>Ещё</span></button>{more&&<div className={css.morePanel} id={menuId} role="region" aria-label="Другие разделы"><strong>Разделы</strong>{rest.map(screen=>navButton(screen,true))}</div>}</div>}</div>
      </div>
    </nav>}
  </section></div></div>
}
