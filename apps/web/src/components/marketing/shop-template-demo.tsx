import { templateAppPreview } from '@/lib/templates/app-preview'
import { templateExample } from '@/lib/templates/presentation'
import { TemplatePreviewShell } from './template-preview-shell'
import { ShopTemplateStage } from './shop-template-stage'

const SHOP_SCREENS = [
  { id: 'catalog', label: 'Витрина' },
  { id: 'product', label: 'Карточка товара' },
  { id: 'client', label: 'Кабинет клиента' },
  { id: 'team', label: 'Заказ у команды' },
] as const

export function ShopTemplateDemo({ example = templateExample('zakazy'), path, view, device }: {
  example?: ReturnType<typeof templateExample>; path: string; view?: string; device?: string
}) {
  const selected = SHOP_SCREENS.find(screen => screen.id === view)?.id ?? 'catalog'
  const customer = example.app.customer!
  const catalog = customer.catalog!
  const client = selected !== 'team' ? templateAppPreview(example, 'client', 'irina@example.com', 'Ольга Смирнова') : null
  const initial = selected === 'client' ? client! : templateAppPreview(example, selected === 'team' ? 'manager' : 'guest')
  const teamOrders = selected === 'team' ? initial.runtime.app.screens.find(screen => screen.type === 'list' && screen.onTapScreenId &&
    !screen.access.public && screen.access.roles.includes('manager') && initial.runtime.views[screen.source.viewId]?.tableId === customer.tableId) : null
  const screenId = selected === 'client' ? customer.listScreenId : selected === 'product' ? catalog.detailScreenId
    : teamOrders?.type === 'list' ? teamOrders.onTapScreenId ?? undefined : undefined
  const rowId = selected === 'product' ? initial.runtime.tables[catalog.tableId]?.rows[1]?.id
    : selected === 'team' ? initial.runtime.tables[customer.tableId]?.rows[0]?.id : undefined
  return <ShopTemplateStage screens={SHOP_SCREENS} selected={selected} path={path} phone={device === 'phone'}>
    <TemplatePreviewShell initial={initial} signedIn={selected === 'catalog' || selected === 'product' ? client : null}
      initialScreenId={screenId} initialRowId={rowId} />
  </ShopTemplateStage>
}
