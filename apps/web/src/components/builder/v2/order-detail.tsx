'use client'

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode, type Ref } from 'react'
import type { AppV2, AppV2Record } from '@tableapp/schema/app-v2'
import { builderV2CatalogPrice, builderV2FormattedAmount } from '@/lib/builder-v2-catalog'
import { builderV2OrderFactKind, builderV2OrderLineProductId, builderV2StatusProgress } from '@/lib/builder-v2-order-detail'
import type { BuilderV2DataRecord } from '@/lib/builder-v2-data-types'
import type { BuilderV2Table } from '@/lib/builder-v2'
import { ProtoIcon } from '../prototype/icons'
import presentation from '@/components/runtime/app-presentation.module.css'
import styles from '../prototype/prototype.module.css'
import { builderV2MediaItems } from './media-values'
import { builderV2StatusTone } from './record-presentation'
import { usePublishedV2 } from './published-context'
import ui from './view.module.css'

export type BuilderV2OrderActionMode = 'persistent' | 'reveal'
export type BuilderV2OrderIdentityVariant = 'order' | 'pipeline'

export type BuilderV2OrderActionTrigger = {
  id: string
  title: string
  icon?: string
  primary?: boolean
  children: ReactNode
}

type OrderActionPanelContextValue = { mode: BuilderV2OrderActionMode; close: () => void }
const OrderActionPanelContext = createContext<OrderActionPanelContextValue | null>(null)

/** Shared action-panel controls for order/deal detail forms (persistent shop vs reveal-on-demand). */
export function useBuilderV2OrderActionPanel() {
  return useContext(OrderActionPanelContext)
}

export function BuilderV2OrderIdentity({
  title, status, amount, scoped = false, progress, manage = false,
  variant = 'order', amountLabel, due, client, actions,
}: {
  title?: string
  status?: string
  amount?: string
  scoped?: boolean
  progress?: ReturnType<typeof builderV2StatusProgress>
  manage?: boolean
  variant?: BuilderV2OrderIdentityVariant
  amountLabel?: string
  due?: { label: string; value: string; tone?: 'overdue' | 'today' }
  client?: ReactNode
  actions?: ReactNode
}) {
  if (!title && !status && !amount && !progress?.length && !due && !client && !actions) return null
  const pipeline = variant === 'pipeline' && manage
  const moneyLabel = amountLabel === undefined ? (scoped ? 'Сумма доступных позиций' : 'Итого') : amountLabel
  if (pipeline) {
    const facts = [
      status ? { id: 'stage', label: 'Этап', value: status as ReactNode, tone: builderV2StatusTone(status) } : null,
      due ? { id: 'due', label: due.label, value: due.value as ReactNode, tone: due.tone } : null,
      amount ? { id: 'amount', label: moneyLabel || 'Сумма', value: amount as ReactNode, tone: 'amount' as const } : null,
      client ? { id: 'client', label: 'Клиент', value: client } : null,
    ].filter(Boolean) as { id: string; label: string; value: ReactNode; tone?: string }[]
    return <section className={`${presentation.panel} ${ui.orderIdentity}`} data-manage data-variant="pipeline" aria-label="Главное о сделке">
      <div className={ui.orderIdentityMain}>
        {facts.length > 0 && <div className={ui.orderIdentityFacts}>
          {facts.map(fact => <div key={fact.id} className={ui.orderIdentityFact} data-tone={fact.tone} data-kind={fact.id}>
            <span>{fact.label}</span>
            <strong>{fact.value}</strong>
          </div>)}
        </div>}
        {actions && <div className={ui.orderIdentityActions} data-placement="desktop">{actions}</div>}
      </div>
    </section>
  }
  const showCopy = Boolean(title || (status && !manage))
  const showMeta = Boolean((status && manage) || amount || due)
  return <section className={`${presentation.panel} ${ui.orderIdentity}`} data-manage={manage || undefined} aria-label="Главное о заказе">
    <div className={ui.orderIdentityMain}>
      {showCopy && <div className={ui.orderIdentityCopy}>
        {title && <h2 className={ui.orderTitle}>{title}</h2>}
        {status && !manage && <p className={ui.orderStatusLead} data-tone={builderV2StatusTone(status)}>{status}</p>}
      </div>}
      {showMeta && <div className={ui.orderIdentityMeta}>
        {amount && <div className={ui.heroAmount} data-bare={!moneyLabel || undefined}>{moneyLabel ? <span>{moneyLabel}</span> : null}<strong>{amount}</strong></div>}
        {status && manage && <span className={ui.heroStatus} data-tone={builderV2StatusTone(status)}><ProtoIcon name="box" size={18} />{status}</span>}
        {due && <div className={ui.orderDue} data-tone={due.tone}><span>{due.label}</span><strong>{due.value}</strong></div>}
      </div>}
      {actions && <div className={ui.orderIdentityActions}>{actions}</div>}
    </div>
    {progress && progress.length > 1 && <ol className={ui.orderProgress} aria-label="Статус заказа">
      {progress.map(step => <li key={step.id} data-state={step.state} aria-current={step.state === 'current' ? 'step' : undefined}><span>{step.label}</span></li>)}
    </ol>}
  </section>
}

export function BuilderV2OrderFacts({
  title = 'Клиент и доставка',
  items,
}: {
  title?: string
  items: readonly { id: string; label: string; value: ReactNode; blank?: boolean; kind: ReturnType<typeof builderV2OrderFactKind> }[]
}) {
  const visible = items.filter(item => !item.blank)
  if (!visible.length) return null
  const contacts = visible.filter(item => item.kind === 'contact')
  const rest = visible.filter(item => item.kind !== 'contact')
  return <section className={`${presentation.panel} ${ui.orderFacts}`} aria-label={title}>
    <h2 className={presentation.sectionTitle}>{title}</h2>
    {contacts.length > 0 && <div className={ui.orderContactRow}>
      {contacts.map(item => <div key={item.id} className={ui.orderFact} data-kind={item.kind}>
        <small>{item.label}</small>
        <strong>{item.value}</strong>
      </div>)}
    </div>}
    {rest.map(item => <div key={item.id} className={ui.orderFact} data-kind={item.kind}>
      <small>{item.label}</small>
      <strong>{item.value}</strong>
    </div>)}
  </section>
}

export type BuilderV2OrderLine = {
  id: string
  name: string
  qty?: string
  price?: string
  lineTotal?: string
  imageUrl?: string
}

function BuilderV2OrderLineThumb({ url, alt }: { url: string; alt: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) return null
  return <img className={ui.orderLineThumb} src={url} alt={alt} loading="lazy" decoding="async" onError={() => setFailed(true)} />
}

export function BuilderV2OrderLinesPanel({
  title = 'Состав заказа',
  lines,
  total,
  loading = false,
}: {
  title?: string
  lines: readonly BuilderV2OrderLine[]
  total?: string
  loading?: boolean
}) {
  return <section className={`${presentation.panel} ${ui.orderLinesPanel}`} aria-label={title} aria-busy={loading}>
    <h2 className={presentation.sectionTitle}>{title}</h2>
    {loading && !lines.length ? <p className={ui.hint}>Загружаем позиции…</p> : !lines.length ? <p className={ui.hint}>Позиций пока нет</p> : <ul className={ui.orderLineList}>
      {lines.map(line => <li key={line.id}>
        {line.imageUrl ? <BuilderV2OrderLineThumb url={line.imageUrl} alt="" /> : null}
        <div>
          <strong>{line.name}</strong>
          {line.qty && <small>{line.qty}</small>}
        </div>
        <span>{line.lineTotal || line.price || ''}</span>
      </li>)}
    </ul>}
    {total && <p className={ui.orderLinesTotal}><span>Итого</span><strong>{total}</strong></p>}
  </section>
}

function orderActionFocusables(root: HTMLElement) {
  return [...root.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')]
    .filter(node => node.getAttribute('aria-hidden') !== 'true' && !node.hasAttribute('disabled') && node.tabIndex !== -1)
}

function BuilderV2OrderActionToolbar({
  items,
  onOpen,
  dockRef,
  placement,
}: {
  items: readonly { id: string; title: string; icon?: string; primary?: boolean }[]
  onOpen: (id: string) => void
  dockRef?: Ref<HTMLDivElement>
  placement?: 'desktop' | 'mobile'
}) {
  return <div ref={dockRef} className={placement === 'desktop' ? ui.orderIdentityActions : ui.orderActionDock} data-mode={placement === 'mobile' ? 'reveal' : undefined} data-placement={placement} aria-label="Действия">
    {items.map(item => item.primary || !item.icon
      ? <button key={item.id} type="button" className={`${styles.primary} ${ui.orderActionTrigger}`} onClick={() => onOpen(item.id)}>{item.title}</button>
      : <button key={item.id} type="button" className={ui.orderActionIcon} aria-label={item.title} title={item.title} onClick={() => onOpen(item.id)}><ProtoIcon name={item.icon!} size={20} /></button>)}
  </div>
}

export function BuilderV2OrderActionPanel({
  title = 'Обработка заказа',
  mode = 'persistent',
  triggers,
  children,
  identity,
}: {
  title?: string
  mode?: BuilderV2OrderActionMode
  triggers?: readonly BuilderV2OrderActionTrigger[]
  children?: ReactNode
  identity?: {
    status?: string
    amount?: string
    amountLabel?: string
    due?: { label: string; value: string; tone?: 'overdue' | 'today' }
    client?: ReactNode
  }
}) {
  const multi = Boolean(triggers?.length)
  const [openId, setOpenId] = useState<string | null>(mode === 'persistent' && !multi ? 'default' : null)
  const dockRef = useRef<HTMLDivElement>(null)
  const lastTrigger = useRef<HTMLElement | null>(null)
  const panelRef = useRef<HTMLElement>(null)
  const titleId = useId()
  const active = multi ? triggers!.find(item => item.id === openId) : openId ? { id: 'default', title, children } : null
  const close = useCallback(() => {
    setOpenId(null)
    queueMicrotask(() => (lastTrigger.current ?? dockRef.current?.querySelector<HTMLButtonElement>('button'))?.focus())
  }, [])
  const open = useCallback((id: string) => {
    lastTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setOpenId(id)
  }, [])
  const submitForm = useCallback(() => {
    panelRef.current?.querySelector<HTMLButtonElement>('form button[type="submit"]')?.click()
  }, [])
  useEffect(() => {
    if (mode === 'persistent' && !multi) setOpenId('default')
  }, [mode, multi])
  useEffect(() => {
    if (!active || mode !== 'reveal') return
    const focusable = panelRef.current?.querySelector<HTMLElement>('input:not([type="hidden"]), textarea, select, button:not([data-action-cancel])')
    queueMicrotask(() => focusable?.focus())
  }, [active, mode, openId])
  useEffect(() => {
    if (!active || mode !== 'reveal') return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); close(); return }
      if (event.key !== 'Tab' || !panelRef.current) return
      const nodes = orderActionFocusables(panelRef.current)
      if (!nodes.length) return
      const first = nodes[0]!, last = nodes[nodes.length - 1]!
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, mode, close])
  if (!multi && !children) return null
  const items = multi ? triggers! : [{ id: 'default', title, primary: true as const, children }]
  const toolbarItems = items.map(({ id, title: itemTitle, icon, primary }) => ({ id, title: itemTitle, icon, primary }))
  if (mode === 'reveal') {
    const dialog = active ? <OrderActionPanelContext.Provider value={{ mode, close }}>
      <button type="button" className={ui.orderActionScrim} aria-label="Закрыть" onClick={close} />
      <aside ref={panelRef} className={ui.orderActionPanel} data-mode={mode} data-open="true" data-dialog aria-labelledby={titleId} role="dialog" aria-modal="true">
        <div className={ui.orderActionHeader}>
          <h2 className={presentation.sectionTitle} id={titleId}>{active.title}</h2>
        </div>
        <div className={ui.orderActionBody}>{active.children}</div>
        <div className={ui.orderActionFooter}>
          <button type="button" className={styles.secondary} data-action-cancel onClick={close}>Отмена</button>
          <button type="button" className={styles.primary} onClick={submitForm}>Сохранить</button>
        </div>
      </aside>
    </OrderActionPanelContext.Provider> : null
    if (identity) {
      return <>
        <BuilderV2OrderIdentity variant="pipeline" manage status={identity.status} amount={identity.amount} amountLabel={identity.amountLabel ?? ''} due={identity.due} client={identity.client}
          actions={<BuilderV2OrderActionToolbar items={toolbarItems} onOpen={open} placement="desktop" />} />
        {!active && <BuilderV2OrderActionToolbar items={toolbarItems} onOpen={open} dockRef={dockRef} placement="mobile" />}
        {dialog}
      </>
    }
    if (!active) return <BuilderV2OrderActionToolbar items={toolbarItems} onOpen={open} dockRef={dockRef} placement="mobile" />
    return dialog
  }
  return <OrderActionPanelContext.Provider value={{ mode, close }}>
    <aside ref={panelRef} className={`${presentation.panel} ${ui.orderActionPanel}`} data-mode={mode} data-open={active ? 'true' : undefined} aria-labelledby={titleId}>
      <div className={ui.orderActionHeader}>
        <h2 className={presentation.sectionTitle} id={titleId}>{active?.title ?? title}</h2>
      </div>
      <div className={ui.orderActionBody}>{active?.children}</div>
    </aside>
  </OrderActionPanelContext.Provider>
}

export function BuilderV2ShopOrderLines({
  app, record, amount,
}: {
  app: AppV2
  record: AppV2Record
  amount?: string
}) {
  const shop = app.shop
  const published = usePublishedV2()
  const [lines, setLines] = useState<BuilderV2OrderLine[]>([])
  const [loading, setLoading] = useState(false)
  const ids = shop && Array.isArray(record.values[shop.positionsFieldId])
    ? (record.values[shop.positionsFieldId] as string[]).filter((id): id is string => typeof id === 'string')
    : []
  useEffect(() => {
    if (!shop || !published || !ids.length) { setLines([]); return }
    let cancelled = false
    setLoading(true)
    void import('@/app/builder-v2-published-actions').then(async ({ readPublishedV2RelatedRowsAction }) => {
      const result = await readPublishedV2RelatedRowsAction(published.slug, {
        revision: published.revision, tableId: shop.itemsTableId, recordIds: ids,
      })
      if (cancelled) return
      if (!result.ok) { setLines([]); setLoading(false); return }
      const projected = result.rows.map(row => projectShopLine(row, shop))
      const productIds = [...new Set(result.rows.flatMap(row => {
        const id = builderV2OrderLineProductId(row.values[shop.productFieldId])
        return id ? [id] : []
      }))]
      let images = new Map<string, string>()
      if (shop.imageFieldId && productIds.length) {
        const products = await readPublishedV2RelatedRowsAction(published.slug, {
          revision: published.revision, tableId: shop.catalogTableId, recordIds: productIds,
        })
        if (cancelled) return
        if (products.ok) {
          images = new Map(products.rows.flatMap(row => {
            const url = builderV2MediaItems(row.values[shop.imageFieldId!], published.slug).find(item => item.image)?.url
            return url ? [[row.id, url] as const] : []
          }))
        }
      }
      if (cancelled) return
      setLines(projected.map((line, index) => {
        const productId = builderV2OrderLineProductId(result.rows[index]?.values[shop.productFieldId])
        const imageUrl = productId ? images.get(productId) : undefined
        return imageUrl ? { ...line, imageUrl } : line
      }))
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [shop, published, ids.join('|')])
  if (!shop) return null
  return <BuilderV2OrderLinesPanel lines={lines} total={amount} loading={loading} />
}

function projectShopLine(row: BuilderV2DataRecord, shop: NonNullable<AppV2['shop']>): BuilderV2OrderLine {
  const qty = row.values[shop.itemQtyFieldId]
  const price = row.values[shop.itemPriceFieldId]
  const name = row.display?.[shop.itemNameFieldId] ?? String(row.values[shop.itemNameFieldId] ?? 'Позиция')
  const qtyLabel = typeof qty === 'number' && Number.isFinite(qty) ? `${qty} шт.` : undefined
  const priceLabel = typeof price === 'number' && Number.isFinite(price) ? builderV2FormattedAmount(price, 'Цена, ₽') : undefined
  const lineTotal = typeof qty === 'number' && typeof price === 'number' && Number.isFinite(qty) && Number.isFinite(price)
    ? builderV2FormattedAmount(qty * price, 'Сумма, ₽')
    : priceLabel
  return { id: row.id, name, qty: qtyLabel, price: priceLabel, lineTotal }
}

export function BuilderV2OrderSummaryCard({ amount, scoped = false }: { amount?: string; scoped?: boolean }) {
  if (!amount) return null
  return <section className={`${presentation.panel} ${ui.orderSummaryCard}`} aria-label="Сумма">
    <div className={ui.orderSummaryRow}><span>{scoped ? 'Сумма доступных позиций' : 'Итого'}</span><strong>{amount}</strong></div>
  </section>
}

export function builderV2OrderStatusChoices(table: BuilderV2Table | undefined, statusFieldId?: string) {
  const field = table?.fields.find(item => item.id === statusFieldId)
  return field?.choices?.map(choice => ({ id: choice.id, label: choice.name })) ?? []
}

export function builderV2BlankFact(value: unknown) {
  return value == null || value === '' || (Array.isArray(value) && value.length === 0)
}
