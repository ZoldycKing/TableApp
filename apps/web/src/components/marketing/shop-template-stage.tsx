import Link from 'next/link'
import type { ReactNode } from 'react'
import { DesktopIcon, DeviceMobileIcon } from '@phosphor-icons/react/ssr'
import { TemplateDemoStage } from './template-demo-stage'
import styles from './template-demo-stage.module.css'

export function ShopTemplateStage({ screens, selected, path, phone, children }: {
  screens: readonly { id: string; label: string }[]; selected: string; path: string; phone: boolean; children: ReactNode
}) {
  const href = (view: string, mobile: boolean) => {
    const query = new URLSearchParams({ view })
    if (mobile) query.set('device', 'phone')
    return `${path}?${query}#shop-example`
  }
  return <TemplateDemoStage id="shop-example" phone={phone} controls={<>
      <nav className={styles.screens} aria-label="Экраны магазина">
        {screens.map(({ id, label }) => <Link key={id} href={href(id, phone)} aria-current={selected === id ? 'page' : undefined}>{label}</Link>)}
      </nav>
      <nav className={styles.devices} aria-label="Размер экрана">
        <Link href={href(selected, false)} aria-label="Компьютер" aria-current={!phone ? 'page' : undefined}><DesktopIcon size={19} aria-hidden /></Link>
        <Link href={href(selected, true)} aria-label="Телефон" aria-current={phone ? 'page' : undefined}><DeviceMobileIcon size={19} aria-hidden /></Link>
      </nav>
    </>} note="Это пример магазина «Стол и свет». Открывайте товары и заказы на учебных данных.">{children}</TemplateDemoStage>
}
