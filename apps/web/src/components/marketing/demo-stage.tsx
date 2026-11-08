'use client'

import Link from 'next/link'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowsOutIcon, ArrowCounterClockwiseIcon, DesktopIcon, DeviceMobileIcon, XIcon } from '@phosphor-icons/react/ssr'
import type { Device } from '@/lib/demo-view'
import styles from './elaya/inner-pages.module.css'

const FRAMES = { desktop: { width: 1280, height: 680, bezel: 0 }, mobile: { width: 390, height: 680, bezel: 8 } }

/** One application stays mounted while its frame changes. Roles still load on the server. */
export function DemoStage({ roles, activeRole, initialDevice, deviceChosen, description, children, onRolePick, onReset, summary, note = 'Учебные данные · изменения не сохраняются' }: {
  roles: readonly { id: string; name: string }[]; activeRole: string; initialDevice: Device; deviceChosen: boolean; description: ReactNode; children: ReactNode
  onRolePick?: (role: string) => void; onReset?: () => void; summary?: ReactNode; note?: string
}) {
  const [device, setDevice] = useState<Device>(initialDevice)
  const [expanded, setExpanded] = useState(false)
  const [reset, setReset] = useState(0)
  const [available, setAvailable] = useState(0)
  const stage = useRef<HTMLDivElement>(null), dialog = useRef<HTMLDivElement>(null)
  const opener = useRef<HTMLButtonElement>(null), closer = useRef<HTMLButtonElement>(null)
  useLayoutEffect(() => { if (!deviceChosen && window.innerWidth < 900) setDevice('mobile') }, [deviceChosen])
  useLayoutEffect(() => {
    const node = stage.current
    if (!node) return
    const measure = () => setAvailable(node.getBoundingClientRect().width)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    const sync = () => { const value = new URL(location.href).searchParams.get('device'); if (value === 'mobile' || value === 'desktop') setDevice(value) }
    window.addEventListener('popstate', sync)
    return () => window.removeEventListener('popstate', sync)
  }, [])
  useEffect(() => {
    if (!expanded) return
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const background = [...document.querySelectorAll<HTMLElement>('[data-elaya-header],[data-site-footer],[data-demo-background]')]
    const inert = background.map(node => node.inert)
    background.forEach(node => { node.inert = true })
    closer.current?.focus()
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setExpanded(false)
      if (event.key !== 'Tab') return
      const focusable = [...(dialog.current?.querySelectorAll<HTMLElement>('a,button,input,select,textarea,[tabindex="0"]') ?? [])].filter(node => !node.hasAttribute('disabled') && node.getClientRects().length > 0)
      const first = focusable[0], last = focusable.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    document.addEventListener('keydown', key)
    return () => {
      document.body.style.overflow = overflow
      background.forEach((node,index) => { node.inert = inert[index]! })
      document.removeEventListener('keydown', key)
      opener.current?.focus()
    }
  }, [expanded])
  const pick = (value: Device) => { setDevice(value); const url = new URL(location.href); url.searchParams.set('device', value); history.replaceState(null, '', url) }
  const frame = FRAMES[device], phone = device === 'mobile'
  const tight = phone && available > 0 && available < frame.width + frame.bezel * 2
  const bezel = tight ? 0 : frame.bezel
  const width = phone && tight ? Math.max(available, 240) : frame.width
  const outerWidth = width + bezel * 2, outerHeight = frame.height + bezel * 2
  const scale = expanded || phone || available === 0 ? 1 : Math.min(1, available / outerWidth)
  return <div className={styles.demoStage} data-demo-stage data-device={device}>
    <div className={styles.demoToolbar} data-demo-background>
      <nav aria-label="Посмотреть как" className={styles.segment}>{roles.map(role => <Link key={role.id} href={`/templates?role=${role.id}&device=${device}`} scroll={false} aria-current={role.id === activeRole ? 'page' : undefined} onClick={event => {
        if (!onRolePick || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return
        event.preventDefault(); onRolePick(role.id)
      }}>{role.id === 'anonymous' ? 'Гость' : role.name}</Link>)}</nav>
      <div className={styles.demoTools}>
        <div className={styles.segment} role="group" aria-label="Размер экрана"><button type="button" aria-pressed={device === 'desktop'} onClick={() => pick('desktop')}><DesktopIcon size={18} aria-hidden /><span>Компьютер</span></button><button type="button" aria-pressed={device === 'mobile'} onClick={() => pick('mobile')}><DeviceMobileIcon size={18} aria-hidden /><span>Телефон</span></button></div>
        <button type="button" className={styles.iconButton} onClick={() => { setReset(value => value + 1); onReset?.() }} aria-label="Сбросить демо" title="Сбросить демо"><ArrowCounterClockwiseIcon size={20} aria-hidden /></button>
        <button type="button" ref={opener} className={styles.iconButton} onClick={() => setExpanded(true)} aria-label="Открыть демо крупнее" title="Открыть крупнее"><ArrowsOutIcon size={20} aria-hidden /></button>
      </div>
    </div>
    <div className={styles.demoDescription} data-demo-background>{description}<span>{note}</span></div>
    {summary && <div data-demo-background>{summary}</div>}
    <div className={styles.stageMeasure}>
      <div ref={dialog} className={expanded ? styles.expanded : styles.demoCanvas} role={expanded ? 'dialog' : undefined} aria-modal={expanded || undefined} aria-label={expanded ? 'Демо приложения' : undefined}>
        {expanded && <div className={styles.expandedHeader}><strong>Демо приложения</strong><button type="button" ref={closer} onClick={() => setExpanded(false)}><XIcon size={20} aria-hidden />Закрыть</button></div>}
        <div key="frame" ref={stage} className={styles.frameScroll}><div className={styles.frameSizer} style={{ width: outerWidth * scale, height: outerHeight * scale }}><div className={styles.scaledFrame} style={{ width: outerWidth, height: outerHeight, transform: `scale(${scale})` }}><DeviceFrame device={device} height={frame.height} bezel={bezel}><div className={styles.runtimeTheme} key={reset}>{children}</div></DeviceFrame></div></div></div>
      </div>
    </div>
  </div>
}

export function DeviceFrame({ device, height, bezel, children }: { device: Device; height: number; bezel: number; children: ReactNode }) {
  return <div className={styles.deviceFrame} data-device={device} data-bezel={bezel > 0} style={{ height: height + bezel * 2, ...(device === 'mobile' && bezel ? { padding: bezel } : {}) }}>
    {device === 'desktop' && <div className={styles.browserChrome}><span aria-hidden><i /><i /><i /></span><span>Приложение TableApp</span><span>Пример</span></div>}
    <div className={`demo-frame ${styles.deviceContent}`} style={{ height }}>{children}</div>
  </div>
}
