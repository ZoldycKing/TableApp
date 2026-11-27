'use client'
import Link from 'next/link'
import {createContext,useEffect,useId,useLayoutEffect,useRef,useState,type ReactNode} from 'react'
import type {AppV2} from '@tableapp/schema/app-v2'
import {ProtoIcon} from '../prototype/icons'
import styles from '../prototype/prototype.module.css'
import {BuilderThemeContext} from '../prototype/theme-context'
import {builderV2Menu,builderV2MenuLabel,builderV2ThemeStyle} from './appearance'
import { builderV2LogoUrl } from '@/lib/builder-v2-logo-types'
import css from './app-frame.module.css'
import presentation from '@/components/runtime/app-presentation.module.css'
import { Avatar } from '@/components/ui/avatar'
import { BuilderV2RecordAvatar } from './record-visuals'
import { BookingJourneyProvider } from './booking-journey'
import { PhoneMockup } from '@/components/phone-mockup'

/** Desktop and phone toggles in the builder override width. Published apps measure themselves. */
export const AppFrameDeviceContext = createContext<'auto' | 'desktop' | 'phone'>('auto')

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
  return <details className={css.account} ref={root} onKeyDown={event=>{if(event.key==='Escape'&&root.current?.open){event.preventDefault();root.current.open=false;root.current.querySelector('summary')?.focus()}}}><summary aria-label="Аккаунт" title="Аккаунт"><Avatar id={email || slug} size={28} /></summary><div><small>Вы вошли как</small><span>{email}</span>{!preview&&<a href={href}>Сменить почту</a>}</div></details>
}
export function BuilderV2AppMark({ logo, icon = 'apps' }: { logo?: string; icon?: string }) {
  const [failed, setFailed] = useState<string>()
  const image = logo && failed !== logo ? logo : undefined
  return <span className={css.appIcon} data-custom={Boolean(image)} aria-hidden>
    {image ? <img src={image} alt="" width={40} height={40} onError={() => setFailed(image)} /> : <ProtoIcon name={icon} size={22} />}
  </span>
}

export function BuilderV2AppFrame({app,screenId,sectionId=screenId,title,children,onNavigate,back,notice,phone=false,deviceMode='auto',headerAction,draftLogo=false,fullScreen=false,scrollKey,profile=false,accountProfile,navBadges}:{app:AppV2;screenId:string;sectionId?:string;title:string;children:ReactNode;onNavigate:(id:string)=>void;back?:()=>void;notice?:ReactNode;phone?:boolean;deviceMode?:'auto'|'desktop'|'phone';headerAction?:ReactNode;draftLogo?:boolean;fullScreen?:boolean;scrollKey?:string;profile?:boolean;accountProfile?:{name:string;role:string};navBadges?:Readonly<Record<string,{count:number;alert?:boolean}>>}) {
  const screenTitle = title
  const calendarScreen = app.screens.find(screen => screen.id === screenId)?.rootIds.some(id => app.nodes.some(node => node.id === id && node.type === 'team_calendar'))
  if (calendarScreen) title = ''
  const phoneCap=4
  const phoneFirst = ['Главная', 'Сегодня', 'Брони', 'Записи', 'Занятость', 'Расписание', 'Клиенты']
  const menu=builderV2Menu(app)
  const forceDesktop = deviceMode === 'desktop'
  const forcePhone = deviceMode === 'phone' || phone
  const [compact,setCompact]=useState(()=>forcePhone||(!forceDesktop&&typeof window!=='undefined'&&typeof window.matchMedia==='function'&&window.matchMedia('(max-width: 1023px)').matches))
  useLayoutEffect(()=>{
    if(forcePhone){setCompact(true);return}
    if(forceDesktop){setCompact(false);return}
    if(typeof window.matchMedia!=='function')return
    const query=window.matchMedia('(max-width: 1023px)')
    const apply=()=>setCompact(query.matches)
    apply()
    query.addEventListener('change',apply)
    return()=>query.removeEventListener('change',apply)
  },[forcePhone,forceDesktop])
  const screens=(forcePhone||compact)?[...menu].sort((a,b)=>{
    const rank=(screen:AppV2['screens'][number])=>{const index=phoneFirst.indexOf(builderV2MenuLabel(screen,app,{phone:true}));return index<0?phoneFirst.length:index}
    return rank(a)-rank(b)
  }):menu
  const [more,setMore]=useState(false),menuId=useId(),root=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null),navItems=useRef<HTMLDivElement>(null)
  const staticFit=screens.length>phoneCap?phoneCap:screens.length
  const [fit,setFit]=useState(staticFit)
  const catalogDetail = Boolean(app.screens.find(screen => screen.id === screenId)?.catalog)
  const body = useRef<HTMLDivElement>(null)
  const contents = useRef<HTMLDivElement>(null)
  const previousScreen = useRef(screenId)
  const contained = fullScreen || scrollKey !== undefined
  const centered = app.appearance?.presentation === 'centered'
  const navigation = centered ? 'bottom' : app.appearance?.navigation ?? 'bottom'
  // Mockup: one desktop top row (logo + pills + user). Detail back lives in page content.
  const showNav = screens.length > 1
  const shellTopNav = showNav && (navigation === 'tabs' || navigation === 'bottom')
  const showBrand = shellTopNav || !showNav
  // Compact mobile brand bar; desktop sidebar hides the header via CSS. Top-nav shells drop the empty band.
  const showChromeHeader = forcePhone || compact || catalogDetail || profile || Boolean(title && !back) || !(shellTopNav || (navigation === 'sidebar' && !compact))
  const mobileBrandOnly = shellTopNav && !(catalogDetail || profile || (title && !back))
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
  useLayoutEffect(()=>{
    const row=navItems.current
    if(!row)return
    const measure=()=>{
      const phoneNav=Boolean(forcePhone||(!forceDesktop&&typeof window!=='undefined'&&typeof window.matchMedia==='function'&&window.matchMedia('(max-width: 1023px)').matches))
      const hardCap=phoneNav?phoneCap:screens.length
      if(phoneNav){setFit(screens.length>phoneCap?phoneCap:screens.length);return}
      if(forceDesktop||navigation==='sidebar'||row.clientWidth<8){setFit(navigation==='sidebar'||forceDesktop?screens.length:Math.min(hardCap,screens.length>phoneCap?phoneCap:screens.length));return}
      const tabs=[...row.querySelectorAll<HTMLElement>(':scope > [data-nav-item]')]
      const extra=row.querySelector<HTMLElement>(':scope > [data-nav-more]')
      const reveal=(count:number)=>{
        tabs.forEach((tab,index)=>{tab.hidden=index>=count})
        if(extra)extra.hidden=count>=tabs.length
      }
      reveal(Math.min(hardCap,tabs.length))
      if(!phoneNav&&row.scrollWidth<=row.clientWidth+1){setFit(current=>current===tabs.length?current:tabs.length);return}
      let count=Math.min(hardCap,tabs.length)
      while(count>0){
        reveal(count)
        if(row.scrollWidth<=row.clientWidth+1)break
        count-=1
      }
      setFit(current=>current===count?current:count)
    }
    measure()
    if(typeof ResizeObserver==='undefined')return
    const observer=new ResizeObserver(measure)
    observer.observe(row)
    return()=>observer.disconnect()
  },[screens.map(screen=>screen.id).join('|'),navigation,phone,forcePhone,forceDesktop])
  useEffect(()=>{
    if(!more)return
    const outside=(event:PointerEvent)=>{if(event.target instanceof Node&&!root.current?.contains(event.target))setMore(false)}
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();setMore(false);trigger.current?.focus()}}
    document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape)
    return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape)}
  },[more])
  const choose=(id:string)=>{setMore(false);onNavigate(id)}
  const navButton=(screen:AppV2['screens'][number],extra=false)=>{
    const raw=builderV2MenuLabel(screen,app,{phone:phone||compact})
    const label=(phone||compact)&&raw==='Главная'?'Сегодня':raw
    const badge=navBadges?.[screen.id]
    return <button type="button" key={screen.id} title={builderV2MenuLabel(screen,app)} aria-current={screen.id===sectionId?'page':undefined} className={extra?css.extraItem:undefined} onClick={()=>choose(screen.id)}><ProtoIcon name={screen.icon} size={16}/><span>{label}</span>{badge&&badge.count>0?compact?<i className={css.navDot} />:<em data-alert={badge.alert||undefined}>{badge.count}</em>:null}</button>
  }
  const settingsScreen=!compact&&navigation==='sidebar'?screens.find(screen=>screen.icon==='settings'):undefined
  const listed=settingsScreen?screens.filter(screen=>screen.id!==settingsScreen.id):screens
  const limit=(phone||compact) ? fit : navigation==='sidebar' ? listed.length : fit
  const rest=screens.slice(limit),overflow=rest.length>0,activeExtra=rest.some(screen=>screen.id===sectionId)
  const appName = (app.name || 'Моё приложение').replaceAll(' · ', '\u00A0·\u00A0')
  const sectionScreen = app.screens.find(screen => screen.id === sectionId)
  const mark = <BuilderV2AppMark logo={builderV2LogoUrl(app, draftLogo)} icon={app.appearance?.icon} />
  const account = headerAction ? <span className={css.headerAction}>{headerAction}</span> : null
  const frame = <div className={css.container} data-app-frame="" data-phone={forcePhone || undefined} data-device-force={forceDesktop ? 'desktop' : forcePhone ? 'phone' : undefined} data-contained={contained || undefined} data-fullscreen={fullScreen && !forcePhone || undefined}>
    <section className={`${styles.surface} ${css.frame}`} data-navigation={navigation} data-shell-topnav={shellTopNav || undefined} data-template={app.support ? 'support' : app.prokat ? 'prokat' : undefined}>
    {showChromeHeader ? <header className={`${styles.appHeader} ${css.header}`} data-brand-only={mobileBrandOnly || undefined}>
      <div className={`${css.chromeBar} ${presentation.contentWidth}`}>
        {back && !shellTopNav ? <button type="button" className={presentation.iconControl} onClick={back} aria-label="Назад" title="Назад"><ProtoIcon name="back" /></button> : <span className={css.headerMark}>{mark}</span>}
        {compact && navigation === 'sidebar'
          ? <span className={css.railBrand} aria-hidden="true" />
          : showBrand || compact ? <span className={css.railBrand}><span>{appName}</span></span> : null}
        {profile && <BuilderV2RecordAvatar name={title} id={scrollKey || screenId} icon="users" />}
        {!mobileBrandOnly && catalogDetail ? <span className={css.catalogIdentity}>{sectionScreen?.name ?? appName}</span>
          : !mobileBrandOnly && title && !compact ? <div>
            <h1 className={presentation.pageTitle}>{title.replaceAll('-', '\u2011')}</h1>
          </div> : calendarScreen || (compact && title) ? <h1 className="sr-only">{screenTitle || title}</h1> : null}
        {navigation === 'sidebar' && !compact ? null : compact ? null : account}
        {compact ? <span className={css.mobileTools}>{account}<button type="button" className={css.iconBtn} aria-label="Поиск" onClick={()=>document.querySelector<HTMLInputElement>('input[type="search"]')?.focus()}><ProtoIcon name="search" size={16}/></button><button type="button" className={css.iconBtn} aria-label="Уведомления"><ProtoIcon name="bell" size={16}/></button></span> : null}
      </div>
    </header> : null}
    <div ref={body} className={css.body} role={contained ? 'region' : undefined} aria-label={contained ? 'Содержимое экрана' : undefined} tabIndex={contained ? 0 : undefined}><AppFrameDeviceContext.Provider value={deviceMode}><div ref={contents} className={`${styles.appContent} ${css.content} ${presentation.contentWidth}`}>{notice}{children}</div></AppFrameDeviceContext.Provider></div>
    {showNav&&<nav className={css.navigation} aria-label="Разделы приложения">
      <div className={navigation === 'sidebar' ? css.navStack : `${css.chromeBar} ${presentation.contentWidth}`}>
        <div className={css.workspace}>{mark}<div><strong>{appName}</strong><small>Кабинет владельца</small></div><span className={css.workspaceSwitch} aria-hidden="true"><ProtoIcon name="down" size={14}/></span></div>
        <div className={css.navItems} ref={navItems}>{listed.map((screen,index)=><div key={screen.id} data-nav-item="" hidden={index>=limit}>{navButton(screen)}</div>)}<div className={css.more} data-nav-more="" ref={root} hidden={!overflow}><button type="button" ref={trigger} aria-expanded={more} aria-controls={menuId} aria-current={activeExtra?'true':undefined} onClick={()=>setMore(!more)}><ProtoIcon name="more" size={22}/><span>Ещё</span></button>{more&&<div className={css.morePanel} id={menuId} role="region" aria-label="Другие разделы"><strong>Разделы</strong>{rest.map(screen=>navButton(screen,true))}{compact ? <><Link className={css.extraItem} href={`/apps/${app.id}`}>Конструктор</Link><Link className={css.extraItem} href={`/a/${encodeURIComponent(app.slug)}`}>Страница для клиентов</Link></> : null}</div>}</div></div>
        {navigation === 'sidebar' && !compact ? <div className={css.railLinks}><span>Приложение</span><Link href={`/apps/${app.id}`}><ProtoIcon name="apps" size={16}/>Конструктор</Link>{settingsScreen?navButton(settingsScreen):null}<div className={css.plan}><a href={`/a/${encodeURIComponent(app.slug)}`}><strong>Страница для клиентов</strong><span>{app.slug}.scatta.ru</span></a><button type="button" aria-label="Скопировать адрес" onClick={()=>void navigator.clipboard?.writeText(`https://${app.slug}.scatta.ru`)}><ProtoIcon name="copy" size={14}/></button></div></div> : null}
        {navigation === 'sidebar' && !compact ? <div className={css.me}><Avatar id={accountProfile?.name || app.slug} size={24}/><div><strong>{accountProfile?.name || 'Владелец'}</strong><small>{accountProfile?.role || 'Владелец'}</small></div><button type="button" aria-label="Меню профиля"><ProtoIcon name="more" size={16}/></button></div> : null}
        {shellTopNav ? account : null}
      </div>
    </nav>}
  </section></div>
  return <BookingJourneyProvider key={app.id}><div className={`${css.stage} ${centered && !forcePhone ? css.centeredStage : ''}`} data-frame-stage data-device-force={forceDesktop ? 'desktop' : forcePhone ? 'phone' : undefined} data-fullscreen={fullScreen && !forcePhone || undefined}>
    {forcePhone ? <PhoneMockup scheme={app.theme.scheme === 'dark' ? 'dark' : 'light'}>{frame}</PhoneMockup> : frame}
  </div></BookingJourneyProvider>
}
