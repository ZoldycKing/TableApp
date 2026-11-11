'use client'

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode, type Ref } from 'react'
import { createPortal } from 'react-dom'
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
import { DetailCardShell, type ShellMetric } from './layout-shell'
import { ruPrepText } from './ru-prep-text'
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
export const OrderActionPanelContext = createContext<OrderActionPanelContextValue | null>(null)

/** Shared action-panel controls for order/deal detail forms (persistent shop vs reveal-on-demand). */
export function useBuilderV2OrderActionPanel() {
  return useContext(OrderActionPanelContext)
}

export type BuilderV2OrderIdentityFact = {
  id: string
  label: string
  value: ReactNode
  tone?: string
}

export function BuilderV2OrderIdentity({
  title, status, amount, scoped = false, progress, manage = false,
  variant = 'order', amountLabel, statusLabel, due, client, actions, amountBadge, media, productTitle, facts: extraFacts,
}: {
  title?: string
  status?: string
  amount?: string
  scoped?: boolean
  progress?: ReturnType<typeof builderV2StatusProgress>
  manage?: boolean
  variant?: BuilderV2OrderIdentityVariant
  amountLabel?: string
  statusLabel?: string
  due?: { label: string; value: string; tone?: 'overdue' | 'today' }
  client?: ReactNode
  actions?: ReactNode
  /** Optional nowrap badge rendered inline with the amount (inventory low-stock). */
  amountBadge?: string
  /** Optional product photo for warehouse item identity. */
  media?: ReactNode
  /** Full product name shown under/beside the photo (not truncated). */
  productTitle?: string
  /** Extra pipeline facts (warehouse, cost, …) shown with Остаток/Минимум. */
  facts?: readonly BuilderV2OrderIdentityFact[]
}) {
  if (!title && !status && !amount && !progress?.length && !due && !client && !actions && !media && !productTitle && !extraFacts?.length) return null
  const pipeline = variant === 'pipeline' && manage
  const moneyLabel = amountLabel === undefined ? (scoped ? 'Сумма доступных позиций' : 'Итого') : amountLabel
  if (pipeline) {
    const amountValue = amount
      ? amountBadge
        ? <span className={ui.stockWithBadge}><span className={ui.stockQty}>{amount}</span><span className={ui.warningBadge}>{amountBadge}</span></span>
        : <span className={ui.stockQty}>{amount}</span>
      : null
    const product = Boolean(media || productTitle)
    const facts = [
      status ? { id: 'stage', label: statusLabel || 'Этап', value: status as ReactNode, tone: builderV2StatusTone(status) } : null,
      amount ? { id: 'amount', label: moneyLabel || 'Сумма', value: amountValue as ReactNode, tone: 'amount' as const } : null,
      due ? { id: 'due', label: due.label, value: due.value as ReactNode, tone: due.tone } : null,
      client ? { id: 'client', label: 'Клиент', value: client } : null,
      ...(extraFacts ?? []),
    ].filter(Boolean) as BuilderV2OrderIdentityFact[]
    const renderFacts = (items: BuilderV2OrderIdentityFact[]) => items.length > 0 ? <div className={ui.orderIdentityFacts} data-count={items.length}>
      {items.map(fact => <div key={fact.id} className={ui.orderIdentityFact} data-tone={fact.tone} data-kind={fact.id}>
        {fact.label ? <span>{fact.label}</span> : null}
        {fact.id === 'stage' && fact.tone === 'rose'
          ? <strong className={ui.warningBadge}>{fact.value}</strong>
          : <strong>{fact.value}</strong>}
      </div>)}
    </div> : null
    return <section className={`${presentation.panel} ${ui.orderIdentity}`} data-manage data-variant="pipeline" data-product={product || undefined} aria-label={amountBadge || statusLabel === undefined && moneyLabel === 'Остаток' ? 'Главное о товаре' : 'Главное о сделке'}>
      <div className={ui.orderIdentityMain}>
        {product ? <div className={ui.productIdentity}>
          {media}
          <div className={ui.productIdentityCopy}>
            <div className={ui.productIdentityHead}>
              {productTitle ? <h2 className={ui.productIdentityTitle}>{productTitle}</h2> : null}
              {actions}
            </div>
            {renderFacts(facts)}
          </div>
        </div> : <>
          {renderFacts(facts)}
          {actions}
        </>}
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
    <h2 className={presentation.sectionTitle}>{ruPrepText(title)}</h2>
    {contacts.length > 0 && <div className={ui.orderContactRow}>
      {contacts.map(item => <div key={item.id} className={ui.orderFact} data-kind={item.kind}>
        <small>{item.label}</small>
        <strong>{item.value}</strong>
      </div>)}
    </div>}
    {rest.length > 0 && <div className={ui.orderFactsGrid}>
      {rest.map(item => <div key={item.id} className={ui.orderFact} data-kind={item.kind}>
        <small>{item.label}</small>
        <strong>{item.value}</strong>
      </div>)}
    </div>}
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
  iconsOnly = false,
  textOnly = false,
  collapseMobile = false,
}: {
  items: readonly { id: string; title: string; icon?: string; primary?: boolean }[]
  onOpen: (id: string) => void
  dockRef?: Ref<HTMLDivElement>
  placement?: 'desktop' | 'mobile'
  iconsOnly?: boolean
  textOnly?: boolean
  collapseMobile?: boolean
}) {
  const collapsed = textOnly && collapseMobile
  const head = collapsed
    ? items.filter(item => item.primary || item.title === 'Расход')
    : []
  const tail = collapsed ? items.filter(item => !head.includes(item)) : []
  const rendered = iconsOnly
    ? items.filter(item => Boolean(item.icon) && !item.primary)
    : collapsed
      ? head
      : textOnly
        ? items.filter(item => !(item.icon && !item.primary))
        : items
  const inIdentity = placement === 'desktop' || iconsOnly
  return <div ref={dockRef} className={inIdentity ? ui.orderIdentityActions : ui.orderActionDock} data-mode={!inIdentity && placement === 'mobile' ? 'reveal' : undefined} data-placement={placement} aria-label="Действия">
    {rendered.map(item => item.icon && !item.primary
      ? <button key={item.id} type="button" className={ui.orderActionIcon} aria-label={item.title} title={item.title} onClick={() => onOpen(item.id)}><ProtoIcon name={item.icon} size={20} /></button>
      : <button key={item.id} type="button" data-primary={item.primary || undefined} className={`${item.primary ? styles.primary : styles.secondary} ${ui.orderActionTrigger}`} onClick={() => onOpen(item.id)}>{item.title}</button>)}
    {collapsed && tail.length ? <details className={ui.orderActionOverflow}>
      <summary className={ui.orderActionIcon} aria-label="Другие действия" title="Другие действия"><ProtoIcon name="more" size={20} /></summary>
      <div className={ui.orderActionOverflowMenu} role="menu">
        {tail.map(item => <button key={item.id} type="button" role="menuitem" className={styles.secondary} onClick={() => onOpen(item.id)}>{item.title}</button>)}
      </div>
    </details> : null}
  </div>
}

export function BuilderV2OrderActionPanel({
  title = 'Обработка заказа',
  mode = 'persistent',
  triggers,
  children,
  identity,
  detailBody,
}: {
  title?: string
  mode?: BuilderV2OrderActionMode
  triggers?: readonly BuilderV2OrderActionTrigger[]
  children?: ReactNode
  identity?: {
    status?: string
    statusLabel?: string
    amount?: string
    amountLabel?: string
    amountBadge?: string
    due?: { label: string; value: string; tone?: 'overdue' | 'today' }
    client?: ReactNode
    media?: ReactNode
    productTitle?: string
    /** CRM deal H1 — routes to DetailCardShell with back + metrics. */
    dealTitle?: string
    facts?: readonly BuilderV2OrderIdentityFact[]
    chips?: ReactNode
    subtitle?: ReactNode
    metrics?: readonly ShellMetric[]
    back?: { label: string; onClick: () => void }
  }
  /** Extra sections under the product shell (warehouse / history / details). */
  detailBody?: ReactNode
}) {
  const multi = Boolean(triggers?.length)
  const published = usePublishedV2()
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
  const items = multi ? triggers! : [{ id: 'default', title, primary: true as const, children }]
  const toolbarItems = items.map(({ id, title: itemTitle, icon, primary }) => ({ id, title: itemTitle, icon, primary }))
  const headerIcons = toolbarItems.filter(item => Boolean(item.icon) && !item.primary)
  const headerIconKey = headerIcons.map(item => `${item.id}:${item.icon ?? ''}`).join('|')
  const setHeaderAccessory = published?.setHeaderAccessory
  const showHeaderEdit = Boolean(identity && headerIcons.length && setHeaderAccessory)
  useEffect(() => {
    if (!setHeaderAccessory) return
    if (!showHeaderEdit) {
      setHeaderAccessory(null)
      return () => setHeaderAccessory(null)
    }
    const icons = headerIconKey.split('|').map(entry => {
      const [id, icon] = entry.split(':')
      const title = toolbarItems.find(item => item.id === id)?.title ?? id!
      return { id: id!, icon: icon!, title }
    })
    setHeaderAccessory(
      <span className={ui.headerEditActions} data-placement="mobile">
        {icons.map(item => (
          <button key={item.id} type="button" className={ui.orderActionIcon} aria-label={item.title} title={item.title} onClick={() => open(item.id)}>
            <ProtoIcon name={item.icon} size={20} />
          </button>
        ))}
      </span>,
    )
    return () => setHeaderAccessory(null)
  }, [showHeaderEdit, headerIconKey, setHeaderAccessory, open])
  if (!multi && !children) return null
  if (mode === 'reveal') {
    const dialog = active && typeof document !== 'undefined' ? createPortal(<OrderActionPanelContext.Provider value={{ mode, close }}>
      <button type="button" className={ui.orderActionScrim} aria-label="Закрыть" onClick={close} />
      <aside ref={panelRef} className={ui.orderActionPanel} data-mode={mode} data-open="true" data-dialog aria-labelledby={titleId} role="dialog" aria-modal="true">
        <div className={ui.orderActionHeader}>
          <h2 className={presentation.sectionTitle} id={titleId}>{active.title}</h2>
          <button type="button" className={ui.orderActionClose} aria-label="Закрыть" data-action-cancel onClick={close}><ProtoIcon name="close" size={18} /></button>
        </div>
        <div className={ui.orderActionBody}>{active.children}</div>
        <div className={ui.orderActionFooter}>
          <button type="button" className={styles.secondary} data-action-cancel onClick={close}>Отмена</button>
          <button type="button" className={styles.primary} onClick={submitForm}>Сохранить</button>
        </div>
      </aside>
    </OrderActionPanelContext.Provider>, document.body) : null
    if (identity?.productTitle) {
      const desktopItems = toolbarItems.filter(item => !(item.icon && !item.primary))
      const editIcons = toolbarItems.filter(item => Boolean(item.icon) && !item.primary)
      const mobileItems = toolbarItems.filter(item => !(item.icon && !item.primary))
      return <>
        <DetailCardShell
          layout="product"
          back={identity.back}
          media={identity.media}
          title={identity.productTitle}
          chips={identity.chips}
          subtitle={identity.subtitle}
          metrics={identity.metrics}
          actions={<>
            <BuilderV2OrderActionToolbar items={desktopItems} onOpen={open} placement="desktop" textOnly />
            {editIcons.map(item => (
              <button key={item.id} type="button" className={ui.orderActionIcon} aria-label={item.title} title={item.title} onClick={() => open(item.id)}>
                <ProtoIcon name={item.icon!} size={20} />
              </button>
            ))}
          </>}
          stickyActions={!active
            ? <BuilderV2OrderActionToolbar
                items={[
                  ...mobileItems,
                  // Keep pencil reachable from the sticky dock (not only the app header).
                  ...editIcons.map(item => ({ ...item, primary: false as const })),
                ]}
                onOpen={open}
                dockRef={dockRef}
                placement="mobile"
                textOnly
                collapseMobile
              />
            : undefined}
        >
          {detailBody}
        </DetailCardShell>
        {dialog}
      </>
    }
    if (identity?.dealTitle) {
      const desktopItems = toolbarItems.filter(item => !(item.icon && !item.primary))
      const editIcons = toolbarItems.filter(item => Boolean(item.icon) && !item.primary)
      return <>
        <DetailCardShell
          back={identity.back}
          title={identity.dealTitle}
          subtitle={identity.subtitle}
          badge={identity.status ? <span className={ui.heroStatus} data-tone={builderV2StatusTone(identity.status)}>{identity.status}</span> : undefined}
          metrics={identity.metrics}
          actions={<>
            {editIcons.map(item => (
              <button key={item.id} type="button" className={ui.orderActionIcon} aria-label={item.title} title={item.title} onClick={() => open(item.id)}>
                <ProtoIcon name={item.icon!} size={20} />
              </button>
            ))}
            <BuilderV2OrderActionToolbar items={desktopItems} onOpen={open} placement="desktop" textOnly />
          </>}
          stickyActions={!active
            ? <BuilderV2OrderActionToolbar items={toolbarItems} onOpen={open} dockRef={dockRef} placement="mobile" textOnly collapseMobile />
            : undefined}
        >
          {detailBody}
        </DetailCardShell>
        {dialog}
      </>
    }
    if (identity) {
      return <>
        <BuilderV2OrderIdentity variant="pipeline" manage status={identity.status} statusLabel={identity.statusLabel} amount={identity.amount} amountLabel={identity.amountLabel ?? ''} amountBadge={identity.amountBadge} due={identity.due} client={identity.client} media={identity.media} productTitle={identity.productTitle} facts={identity.facts}
          actions={<>
            <BuilderV2OrderActionToolbar items={toolbarItems} onOpen={open} placement="desktop" />
          </>} />
        {!active && <BuilderV2OrderActionToolbar items={toolbarItems} onOpen={open} dockRef={dockRef} placement="mobile" textOnly collapseMobile={Boolean(identity?.productTitle)} />}
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
