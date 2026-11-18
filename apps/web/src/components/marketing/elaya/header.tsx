'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { ArrowUpRightIcon } from '@phosphor-icons/react/ssr'
import { isCurrent, NAV_HEADER } from '@/lib/site'
import { ElayaBrand } from './brand'
import styles from './site.module.css'

const LINKS = NAV_HEADER

export function ElayaHeader({ signedIn }: { signedIn: boolean }) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname() ?? '/'
  const toggle = useRef<HTMLButtonElement>(null)
  const overlay = useRef<HTMLDivElement>(null)
  const header = useRef<HTMLElement>(null)

  useEffect(() => { setOpen(false) }, [pathname])
  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const background = Array.from(document.querySelectorAll<HTMLElement>('main, footer'))
    const inertBefore = background.map(node => node.inert)
    background.forEach(node => { node.inert = true })
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setOpen(false); toggle.current?.focus() }
      if (event.key !== 'Tab') return
      const focusable = [...(header.current?.querySelectorAll<HTMLElement>('a,button') ?? []), ...(overlay.current?.querySelectorAll<HTMLElement>('a,button') ?? [])].filter(node => node.getClientRects().length > 0)
      const first = focusable[0], last = focusable.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    document.addEventListener('keydown', keydown)
    return () => {
      document.body.style.overflow = previousOverflow
      background.forEach((node, index) => { node.inert = inertBefore[index]! })
      document.removeEventListener('keydown', keydown)
    }
  }, [open])
  useEffect(() => {
    const query = window.matchMedia('(min-width: 761px)')
    const change = () => { if (query.matches) setOpen(false) }
    query.addEventListener('change', change)
    return () => query.removeEventListener('change', change)
  }, [])

  return <div role={open ? 'dialog' : undefined} aria-modal={open || undefined} aria-label={open ? 'Меню сайта' : undefined}>
    <div className={styles.headerSpace} />
    <header className={styles.navigation} ref={header} data-elaya-header>
      <Link href="/" aria-label="Scatta, главная"><ElayaBrand /></Link>
      <nav className={styles.navLinks} aria-label="Разделы сайта">
        {LINKS.map(link => <Link key={link.href} href={link.href} aria-current={isCurrent(pathname, link.href) ? 'page' : undefined}>{link.label}</Link>)}
      </nav>
      <div className={styles.navActions}>
        {!signedIn && <Link href="/login" className={styles.login}>Войти</Link>}
        <Link href={signedIn ? '/app' : '/login?next=%2Fimport'} className={styles.navCta}><span className={styles.desktopCtaText}>{signedIn ? 'Моё пространство' : 'Начать бесплатно'}</span><span className={styles.mobileCtaText}>{signedIn ? 'Открыть' : 'Начать'}</span><ArrowUpRightIcon size={16} aria-hidden /></Link>
        <button ref={toggle} type="button" className={styles.menuButton} aria-label={open ? 'Закрыть меню' : 'Открыть меню'} aria-expanded={open} aria-controls="elaya-mobile-menu" onClick={() => setOpen(value => !value)}>
          <span className={styles.menuBars} aria-hidden><span /><span /></span>
        </button>
      </div>
    </header>
    {open && <div className={styles.menuOverlay} id="elaya-mobile-menu" ref={overlay}>
      <nav className={styles.menuInner} aria-label="Мобильная навигация">
        {LINKS.map(link => <Link href={link.href} key={link.href} onClick={() => setOpen(false)} aria-current={isCurrent(pathname, link.href) ? 'page' : undefined}>{link.label}<ArrowUpRightIcon size={28} aria-hidden /></Link>)}
        <Link href="/how-it-works" onClick={() => setOpen(false)}>Как это работает<ArrowUpRightIcon size={28} aria-hidden /></Link>
        <Link href={signedIn ? '/app' : '/login'} onClick={() => setOpen(false)}>{signedIn ? 'Моё пространство' : 'Войти'}<ArrowUpRightIcon size={28} aria-hidden /></Link>
      </nav>
    </div>}
  </div>
}
