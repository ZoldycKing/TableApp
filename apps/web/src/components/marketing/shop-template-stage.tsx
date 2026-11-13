import type { ReactNode } from 'react'
import { TemplateDemoStage } from './template-demo-stage'
import { TemplateDemoControls } from './template-demo-controls'

export function ShopTemplateStage({ screens, selected, path, phone, children }: {
  screens: readonly { id: string; label: string }[]; selected: string; path: string; phone: boolean; children: ReactNode
}) {
  const href = (view: string, mobile: boolean) => {
    const query = new URLSearchParams({ view })
    if (mobile) query.set('device', 'phone')
    return `${path}?${query}#shop-example`
  }
  return <TemplateDemoStage id="shop-example" phone={phone} controls={<TemplateDemoControls
    screens={screens.map(screen => ({ ...screen, href: href(screen.id, phone) }))} selected={selected} phone={phone}
    label="Экраны магазина" deviceLinks={{ desktop: href(selected, false), phone: href(selected, true) }}
  />} note="Это пример магазина «Стол и свет». Открывайте товары и заказы на учебных данных.">{children}</TemplateDemoStage>
}
