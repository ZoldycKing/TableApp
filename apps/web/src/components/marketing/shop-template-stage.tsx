import Link from 'next/link'
import type { ReactNode } from 'react'
import { DesktopIcon, DeviceMobileIcon } from '@phosphor-icons/react/ssr'
import styles from './shop-template-stage.module.css'

export function ShopTemplateStage({ screens, selected, path, phone, children }: {
  screens: readonly { id: string; label: string }[]; selected: string; path: string; phone: boolean; children: ReactNode
}) {
  const href = (view: string, mobile: boolean) => {
    const query = new URLSearchParams({ view })
    if (mobile) query.set('device', 'phone')
    return `${path}?${query}#shop-example`
  }
  return <div className={styles.stage} id="shop-example" data-phone={phone}>
    <div className={styles.controls}>
      <nav className={styles.screens} aria-label="Экраны магазина">
        {screens.map(({ id, label }) => <Link key={id} href={href(id, phone)} aria-current={selected === id ? 'page' : undefined}>{label}</Link>)}
      </nav>
      <nav className={styles.devices} aria-label="Размер экрана">
        <Link href={href(selected, false)} aria-label="Компьютер" aria-current={!phone ? 'page' : undefined}><DesktopIcon size={19} aria-hidden /></Link>
        <Link href={href(selected, true)} aria-label="Телефон" aria-current={phone ? 'page' : undefined}><DeviceMobileIcon size={19} aria-hidden /></Link>
      </nav>
    </div>
    <div className={styles.canvas}>
      <div className={`demo-frame ${styles.app}`}>{children}</div>
    </div>
    <p className={styles.note}>Это пример магазина «Стол и свет». Открывайте товары и заказы на учебных данных.</p>
  </div>
}
