'use client'
import {BuilderV2Gallery,BuilderV2Files,BuilderV2Picture} from './media'
import {builderV2MediaItems} from './media-values'
import Link from 'next/link'
import {BuilderV2Chart} from './chart'
import {BuilderV2Video} from './video'
import {builderV2ButtonAction,builderV2NodeAction} from '@/lib/builder-v2-button-action'
import {builderCalendarTime} from '@/lib/builder-v2-calendar'
import { formatInventoryAuthor, formatInventoryJournalWhen } from '@/lib/inventory-author'
import { formatPurchaseDate, purchaseMoney } from '@/lib/purchase-format'
import { createPortal } from 'react-dom'
import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { PurchaseDialogTotalContext } from './purchase-dialog-total'

function InventoryTypeFilter({ choices, value, onChange }: { choices: readonly { id: string; name: string }[]; value: string; onChange: (id: string) => void }) {
  if (!choices.length) return null
  return <div className={ui.typeFilter} role="group" aria-label="Фильтр по виду операции">
    <button type="button" aria-pressed={!value} onClick={() => onChange('')}>Все</button>
    {choices.map(choice => <button key={choice.id} type="button" aria-pressed={value === choice.id} onClick={() => onChange(choice.id)}>{choice.name}</button>)}
  </div>
}

/** Purchases toolbar link with live low-stock counter («Что заказать · N»). */
function ReorderToolbarLink({
  app, node, screenId, buttonClassName, buttonContent,
}: {
  app: AppV2
  node: Extract<AppV2Node, { type: 'button' }>
  screenId: string
  buttonClassName: string
  buttonContent?: ReactNode
}) {
  const published = usePublishedV2()
  const inventory = app.inventory
  const [count, setCount] = useState<number | null>(null)
  useEffect(() => {
    if (!published) return
    let cancelled = false
    void import('@/app/builder-v2-published-actions').then(async ({ readPublishedV2LowStockCountAction }) => {
      const result = await readPublishedV2LowStockCountAction(published.slug, { revision: published.revision })
      if (cancelled || !result.ok) return
      setCount(result.count)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [published?.revision, published?.dataVersion])
  const label = count != null && count > 0 ? `Что заказать · ${count}` : 'Что заказать'
  return <PublishedV2Button
    node={{ ...node, label }}
    screenId={screenId}
    buttonClassName={buttonClassName}
    buttonContent={buttonContent}
  />
}

/** Centred dialog on desktop, bottom sheet on a narrow screen. */
function InventoryCreateDialog({
  label, children, defaultOpen = false, onDismiss, title = 'Новый товар', submitLabel = 'Сохранить товар', wide = false, buttonClassName, iconOnly, icon,
}: {
  label: ReactNode
  children: ReactNode
  defaultOpen?: boolean
  onDismiss?: () => void
  title?: string
  submitLabel?: string
  wide?: boolean
  buttonClassName?: string
  iconOnly?: boolean
  icon?: string
}) {
  const [open, setOpen] = useState(defaultOpen)
  const [mounted, setMounted] = useState(false)
  const [total, setTotal] = useState<number | null>(null)
  const panelRef = useRef<HTMLElement>(null)
  const titleId = useId()
  useEffect(() => { setMounted(true) }, [])
  useEffect(() => { if (defaultOpen) setOpen(true) }, [defaultOpen])
  useEffect(() => {
    if (!open) { setTotal(null); return }
    const focusable = panelRef.current?.querySelector<HTMLElement>('input:not([type="hidden"]), textarea, select, button:not([data-action-cancel])')
    queueMicrotask(() => focusable?.focus())
  }, [open])
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); setOpen(false); onDismiss?.() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onDismiss])
  const close = () => { setOpen(false); onDismiss?.() }
  const submit = () => panelRef.current?.querySelector<HTMLButtonElement>('form button[type="submit"]')?.click()
  // Same reveal context as edit/ops so a successful save dismisses the dialog and refreshes the list.
  const dialog = open && mounted ? createPortal(<OrderActionPanelContext.Provider value={{ mode: 'reveal', close }}>
    <button type="button" className={ui.orderActionScrim} aria-label="Закрыть" onClick={close} />
    <aside ref={panelRef} className={ui.orderActionPanel} data-mode="reveal" data-open="true" data-dialog data-wide={wide ? 'true' : undefined} aria-labelledby={titleId} role="dialog" aria-modal="true">
      <div className={ui.orderActionHeader}>
        <h2 className={presentation.sectionTitle} id={titleId}>{title}</h2>
        <button type="button" className={ui.orderActionClose} aria-label="Закрыть" data-action-cancel onClick={close}><ProtoIcon name="close" size={18} /></button>
      </div>
      <div className={ui.orderActionBody}>
        <PurchaseDialogTotalContext.Provider value={setTotal}>{children}</PurchaseDialogTotalContext.Provider>
      </div>
      <div className={ui.orderActionFooter} data-purchase-total={wide || undefined}>
        {wide && total != null ? <p className={ui.purchaseDialogTotal}><span>Итого</span><strong>{purchaseMoney(total)}</strong></p> : null}
        <div className={ui.orderActionFooterActions}>
          <button type="button" className={styles.secondary} data-action-cancel onClick={close}>Отмена</button>
          <button type="button" className={styles.primary} onClick={submit}>{submitLabel}</button>
        </div>
      </div>
    </aside>
  </OrderActionPanelContext.Provider>, document.body) : null
  const labelText = typeof label === 'string' ? label : title
  return <>
    <button type="button" className={buttonClassName ?? styles.primary} aria-label={iconOnly ? labelText : undefined} title={iconOnly ? labelText : undefined} onClick={() => setOpen(true)}>
      {iconOnly && icon ? <ProtoIcon name={icon} size={20} /> : label}
    </button>
    {dialog}
  </>
}

function CountDiscrepancyRows({ rows, diffFieldId, renderRows }: {
  rows: readonly AppV2Record[]
  diffFieldId?: string
  renderRows: (rows: readonly AppV2Record[]) => ReactNode
}) {
  const [onlyDiff, setOnlyDiff] = useState(false)
  const hasDiff = Boolean(diffFieldId && rows.some(row => {
    const value = Number(row.values[diffFieldId!])
    return Number.isFinite(value) && value !== 0
  }))
  const visible = onlyDiff && diffFieldId
    ? rows.filter(row => {
      const value = Number(row.values[diffFieldId])
      return Number.isFinite(value) && value !== 0
    })
    : rows
  return <>
    {hasDiff ? <label className={ui.countOnlyDiff}>
      <input type="checkbox" checked={onlyDiff} onChange={event => setOnlyDiff(event.target.checked)} />
      Только расхождения
    </label> : null}
    {visible.length ? renderRows(visible) : <div className={ui.collectionEmpty}><p>Нет расхождений</p></div>}
  </>
}

function InventoryJournalRows({ rows, typeFieldId, choices, renderRows }: {
  rows: readonly AppV2Record[]
  typeFieldId: string
  choices: readonly { id: string; name: string }[]
  renderRows: (rows: readonly AppV2Record[]) => ReactNode
}) {
  const [type, setType] = useState('')
  const visible = type ? rows.filter(row => row.values[typeFieldId] === type) : rows
  return <>
    <InventoryTypeFilter choices={choices} value={type} onChange={setType} />
    {visible.length ? renderRows(visible) : <div className={ui.collectionEmpty}><p>Нет операций этого вида.</p></div>}
  </>
}

const inventoryPhotoCache = new Map<string, import('./media-values').BuilderV2MediaItem | null>()

/** Loads a related product photo once and reuses it across journal rows. */
function InventoryRelatedThumb({
  itemId, inventory, label, size = 'journal',
}: {
  itemId?: string
  inventory: NonNullable<AppV2['inventory']>
  label?: string
  size?: 'list' | 'journal' | 'card'
}) {
  const published = usePublishedV2()
  const [image, setImage] = useState<import('./media-values').BuilderV2MediaItem | undefined>(() => {
    if (!itemId) return undefined
    const cached = inventoryPhotoCache.get(itemId)
    return cached === null ? undefined : cached
  })
  useEffect(() => {
    if (!itemId || !published || !inventory.itemPhotoFieldId) return
    if (inventoryPhotoCache.has(itemId)) {
      const cached = inventoryPhotoCache.get(itemId)
      setImage(cached === null ? undefined : cached)
      return
    }
    let cancelled = false
    void import('@/app/builder-v2-published-actions').then(async ({ readPublishedV2RelatedRowsAction }) => {
      const result = await readPublishedV2RelatedRowsAction(published.slug, {
        revision: published.revision, tableId: inventory.itemsTableId, recordIds: [itemId],
      })
      if (cancelled) return
      const row = result.ok ? result.rows.find(entry => entry.id === itemId) : undefined
      const found = row
        ? builderV2MediaItems(row.values[inventory.itemPhotoFieldId!], published.slug).find(item => item.image)
        : undefined
      inventoryPhotoCache.set(itemId, found ?? null)
      setImage(found)
    })
    return () => { cancelled = true }
  }, [itemId, published, inventory])
  return <InventoryProductThumb image={image} size={size} label={label} />
}

/** First product photos for a purchase-order list row (+N when more lines remain). */
function PurchaseOrderThumbs({
  lineIds, inventory,
}: {
  lineIds: string[]
  inventory: NonNullable<AppV2['inventory']>
}) {
  const published = usePublishedV2()
  const [thumb, setThumb] = useState<{ id: string; image?: import('./media-values').BuilderV2MediaItem; label: string } | null>(null)
  const [extra, setExtra] = useState(0)
  useEffect(() => {
    if (!published || !inventory.purchaseLinesTableId || !inventory.lineProductFieldId || !lineIds.length) {
      setThumb(null)
      setExtra(0)
      return
    }
    let cancelled = false
    void import('@/app/builder-v2-published-actions').then(async ({ readPublishedV2RelatedRowsAction }) => {
      const lines = await readPublishedV2RelatedRowsAction(published.slug, {
        revision: published.revision, tableId: inventory.purchaseLinesTableId!, recordIds: lineIds,
      })
      if (cancelled || !lines.ok) return
      const productIds = lines.rows.flatMap(row => {
        const raw = row.values[inventory.lineProductFieldId!]
        const id = typeof raw === 'string' ? raw : Array.isArray(raw) ? raw.find((item): item is string => typeof item === 'string') : undefined
        return id ? [id] : []
      })
      const unique = [...new Set(productIds)]
      const firstId = unique[0]
      const products = firstId
        ? await readPublishedV2RelatedRowsAction(published.slug, {
          revision: published.revision, tableId: inventory.itemsTableId, recordIds: [firstId],
        })
        : { ok: true as const, rows: [] }
      if (cancelled || !products.ok) return
      const row = firstId ? products.rows.find(item => item.id === firstId) : undefined
      const image = row && inventory.itemPhotoFieldId
        ? builderV2MediaItems(row.values[inventory.itemPhotoFieldId], published.slug).find(item => item.image)
        : undefined
      const label = row?.display?.[inventory.itemNameFieldId] || 'Товар'
      setThumb(firstId ? { id: firstId, image, label } : null)
      setExtra(Math.max(0, unique.length - 1))
    })
    return () => { cancelled = true }
  }, [published, inventory, lineIds.join('|')])
  return <span className={ui.purchaseThumbs} aria-hidden="true">
    {thumb ? <InventoryProductThumb image={thumb.image} size="journal" label={thumb.label} /> : <InventoryProductThumb size="journal" />}
    {extra > 0 ? <span className={ui.purchaseThumbsMore}>+{extra}</span> : null}
  </span>
}

/** First catalog product photos for a shop-order list row. */
function ShopOrderThumbs({
  lineIds, shop,
}: {
  lineIds: string[]
  shop: NonNullable<AppV2['shop']>
}) {
  const published = usePublishedV2()
  const [thumb, setThumb] = useState<{ id: string; image?: import('./media-values').BuilderV2MediaItem; label: string } | null>(null)
  const [extra, setExtra] = useState(0)
  useEffect(() => {
    if (!published || !lineIds.length) {
      setThumb(null)
      setExtra(0)
      return
    }
    let cancelled = false
    void import('@/app/builder-v2-published-actions').then(async ({ readPublishedV2RelatedRowsAction }) => {
      const lines = await readPublishedV2RelatedRowsAction(published.slug, {
        revision: published.revision, tableId: shop.itemsTableId, recordIds: lineIds,
      })
      if (cancelled || !lines.ok) return
      const productIds = lines.rows.flatMap(row => {
        const id = builderV2OrderLineProductId(row.values[shop.productFieldId])
        return id ? [id] : []
      })
      const unique = [...new Set(productIds)]
      const firstId = unique[0]
      const products = firstId && shop.imageFieldId
        ? await readPublishedV2RelatedRowsAction(published.slug, {
          revision: published.revision, tableId: shop.catalogTableId, recordIds: [firstId],
        })
        : { ok: true as const, rows: [] }
      if (cancelled || !products.ok) return
      const row = firstId ? products.rows.find(item => item.id === firstId) : undefined
      const image = row && shop.imageFieldId
        ? builderV2MediaItems(row.values[shop.imageFieldId], published.slug).find(item => item.image)
        : undefined
      const label = row?.display?.[shop.productTitleFieldId] || 'Товар'
      setThumb(firstId ? { id: firstId, image, label } : null)
      setExtra(Math.max(0, unique.length - 1))
    })
    return () => { cancelled = true }
  }, [published, shop, lineIds.join('|')])
  return <span className={ui.purchaseThumbs} aria-hidden="true">
    {thumb ? <InventoryProductThumb image={thumb.image} size="journal" label={thumb.label} /> : <BuilderV2RecordAvatar id={lineIds[0] || 'order'} icon="receipt" tone />}
    {extra > 0 ? <span className={ui.purchaseThumbsMore}>+{extra}</span> : null}
  </span>
}

type SupplierOrderStat = { orders: number; lastOrder: string; purchased: number }

/** Loads purchase orders once and derives per-supplier list metrics. */
function useSupplierOrderStats(app: AppV2, inventory?: NonNullable<AppV2['inventory']> | null) {
  const published = usePublishedV2()
  const [stats, setStats] = useState<Map<string, SupplierOrderStat>>(new Map())
  useEffect(() => {
    if (!published || !inventory?.purchasesScreenId || !inventory.purchaseOrdersTableId) return
    const purchasesNode = app.nodes.find(node => node.type === 'collection' && node.layout === 'list'
      && app.sources.some(source => source.id === node.sourceId && source.tableId === inventory.purchaseOrdersTableId && !source.screenTableId))
    if (!purchasesNode) return
    let cancelled = false
    void published.readData({ nodeId: purchasesNode.id, screenId: inventory.purchasesScreenId }).then(result => {
      if (cancelled || !result.ok) return
      const next = new Map<string, SupplierOrderStat>()
      for (const row of result.page.rows) {
        const supplierRaw = inventory.purchaseSupplierFieldId ? row.values[inventory.purchaseSupplierFieldId] : undefined
        const supplierId = typeof supplierRaw === 'string' ? supplierRaw
          : Array.isArray(supplierRaw) ? supplierRaw.find((id): id is string => typeof id === 'string') : undefined
        if (!supplierId) continue
        const current = next.get(supplierId) ?? { orders: 0, lastOrder: '', purchased: 0 }
        current.orders += 1
        const rawDate = inventory.purchaseDateFieldId ? String(row.values[inventory.purchaseDateFieldId] ?? '') : ''
        if (rawDate && (!current.lastOrder || rawDate > current.lastOrder)) current.lastOrder = rawDate
        const status = inventory.purchaseStatusFieldId ? String(row.values[inventory.purchaseStatusFieldId] ?? '') : ''
        const received = Boolean(inventory.statusReceived && status === inventory.statusReceived)
        const totalRaw = inventory.purchaseTotalFieldId ? row.values[inventory.purchaseTotalFieldId] : null
        if (received && typeof totalRaw === 'number' && Number.isFinite(totalRaw)) current.purchased += totalRaw
        next.set(supplierId, current)
      }
      setStats(next)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [published, published?.revision, published?.dataVersion, app.nodes, inventory])
  return stats
}

/** Open supplier purchase orders total (status «Заказано») for items metrics. */
function useOpenPurchaseOrdersTotal(app: AppV2, inventory?: NonNullable<AppV2['inventory']> | null) {
  const published = usePublishedV2()
  const [total, setTotal] = useState<number | null>(null)
  useEffect(() => {
    if (!published || !inventory?.purchaseOrdersTableId || !inventory.statusOrdered) return
    const purchasesNode = app.nodes.find(node => node.type === 'collection' && node.layout === 'list'
      && app.sources.some(source => source.id === node.sourceId && source.tableId === inventory.purchaseOrdersTableId && !source.screenTableId))
    if (!purchasesNode || !inventory.purchasesScreenId) return
    let cancelled = false
    void published.readData({ nodeId: purchasesNode.id, screenId: inventory.purchasesScreenId }).then(result => {
      if (cancelled || !result.ok) return
      let sum = 0
      for (const row of result.page.rows) {
        const status = inventory.purchaseStatusFieldId ? String(row.values[inventory.purchaseStatusFieldId] ?? '') : ''
        if (status !== inventory.statusOrdered) continue
        const totalRaw = inventory.purchaseTotalFieldId ? row.values[inventory.purchaseTotalFieldId] : null
        if (typeof totalRaw === 'number' && Number.isFinite(totalRaw)) sum += totalRaw
      }
      setTotal(sum > 0 ? sum : null)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [published, published?.revision, published?.dataVersion, app.nodes, inventory])
  return total
}

type ClientDealStat = { deals: number; sum: number; lastContact: string }

function useClientDealStats(app: AppV2, crm?: NonNullable<AppV2['crm']> | null) {
  const published = usePublishedV2()
  const [stats, setStats] = useState<Map<string, ClientDealStat>>(new Map())
  const [rollup, setRollup] = useState<{ openDeals: number; pipeline: number }>({ openDeals: 0, pipeline: 0 })
  useEffect(() => {
    if (!published || !crm?.dealsTableId) return
    let cancelled = false
    // Deal collections are not shipped on the clients screen projection — load via server action.
    void import('@/app/builder-v2-published-actions').then(async ({ readPublishedV2ClientDealStatsAction }) => {
      const result = await readPublishedV2ClientDealStatsAction(published.slug, { revision: published.revision })
      if (cancelled || !result.ok) return
      const next = new Map<string, ClientDealStat>()
      for (const [clientId, value] of Object.entries(result.stats)) next.set(clientId, value)
      setStats(next)
      setRollup({ openDeals: result.openDeals, pipeline: result.pipeline })
    }).catch(() => {})
    return () => { cancelled = true }
  }, [published, published?.revision, published?.dataVersion, crm?.dealsTableId, app.id])
  return { stats, rollup }
}

function InventoryWarehouseFacts({ record, inventory, unit }: {
  record: AppV2Record
  inventory: NonNullable<AppV2['inventory']>
  unit: string
}) {
  const published = usePublishedV2()
  const [rows, setRows] = useState<{ id: string; name: string; qty: number }[]>([])
  useEffect(() => {
    if (!published) return
    const linked = Array.isArray(record.values[inventory.itemMovementsFieldId])
      ? (record.values[inventory.itemMovementsFieldId] as unknown[]).filter((id): id is string => typeof id === 'string')
      : []
    if (!linked.length) { setRows([]); return }
    let cancelled = false
    void import('@/app/builder-v2-published-actions').then(async ({ readPublishedV2RelatedRowsAction }) => {
      const result = await readPublishedV2RelatedRowsAction(published.slug, {
        revision: published.revision, tableId: inventory.movementsTableId, recordIds: linked,
      })
      if (cancelled || !result.ok) return
      const balances = new Map<string, number>()
      const names = new Map<string, string>()
      for (const row of result.rows) {
        const warehouseRaw = row.values[inventory.movementWarehouseFieldId]
        const warehouseId = typeof warehouseRaw === 'string' ? warehouseRaw
          : Array.isArray(warehouseRaw) ? warehouseRaw.find((id): id is string => typeof id === 'string') : undefined
        if (!warehouseId) continue
        const qty = Number(row.values[inventory.movementQtyFieldId] ?? 0)
        if (!Number.isFinite(qty)) continue
        balances.set(warehouseId, (balances.get(warehouseId) ?? 0) + qty)
        const label = row.display?.[inventory.movementWarehouseFieldId]
        if (label) names.set(warehouseId, label)
      }
      const warehouseIds = [...balances.keys()]
      if (warehouseIds.length > 1 && inventory.warehousesTableId) {
        const warehouses = await readPublishedV2RelatedRowsAction(published.slug, {
          revision: published.revision, tableId: inventory.warehousesTableId, recordIds: warehouseIds,
        })
        if (!cancelled && warehouses.ok) {
          for (const row of warehouses.rows) {
            const label = row.display?.[inventory.warehouseNameFieldId] ?? String(row.values[inventory.warehouseNameFieldId] ?? '')
            if (label) names.set(row.id, label)
          }
        }
      }
      if (cancelled) return
      const list = [...balances.entries()]
        .map(([id, qty]) => ({ id, name: names.get(id) || 'Склад', qty }))
        .filter(item => item.qty !== 0)
        .sort((left, right) => right.qty - left.qty || left.name.localeCompare(right.name, 'ru'))
      setRows(list.length > 1 ? list : [])
    })
    return () => { cancelled = true }
  }, [published, record.id, record.values, inventory, unit])
  if (rows.length < 2) return null
  return <section className={`${presentation.panel} ${ui.orderFacts}`} aria-label="Остатки по складам">
    <h2 className={presentation.sectionTitle}>Остатки по складам</h2>
    <ul className={ui.warehouseBreakdown}>
      {rows.map(row => <li key={row.id}><span>{row.name}</span><strong>{row.qty} {unit}</strong></li>)}
    </ul>
  </section>
}
import { appV2ChildIds, appV2NavigationUrl, evaluateAppV2Condition, matchesAppV2Audience, resolveAppV2Binding, type AppV2, type AppV2Actor, type AppV2Binding, type AppV2Node, type AppV2Record } from '@tableapp/schema/app-v2'
import type { BuilderV2Table } from '@/lib/builder-v2'
import { ProtoIcon } from '../prototype/icons'
import styles from '../prototype/prototype.module.css'
import ui from './view.module.css'
import { NODE_KINDS } from './model'
import { builderV2PreviewRecordParent, builderV2RecordParent, collectionCardScreen } from './collection-navigation'
import { BuilderV2FormPreview, BuilderV2FormInput, type WorkingFormOptions } from './form-preview'
import { BuilderV2DataNode } from './data-node'
import type { BuilderV2DataPage, BuilderV2DataRecord, BuilderV2OrderSummary } from '@/lib/builder-v2-data-types'
import { builderV2OrderLineFields, builderV2StatusColumn } from '@/lib/builder-v2-order-summary'
import { builderV2DueTone, builderV2OrderDetailParts, builderV2OrderFactKind, builderV2OrderLineProductId, builderV2StatusProgress } from '@/lib/builder-v2-order-detail'
import { builderV2StatusForm } from '@/lib/builder-v2-status-form'
import {usePublishedV2} from './published-context'
import {PublishedV2Delete} from './published-delete'
import {PublishedV2Button} from './published-button'
import {BoardMoveRow} from './board-move'
import {CollectionActionRow} from './collection-action-row'
import { BuilderBusinessOperation } from './business-operation'
import type { BuilderBusinessApp, BuilderBusinessLink } from '@/lib/builder-v2-business-types'
import { builderV2CardLayout, builderV2CatalogPrice, builderV2FormattedAmount } from '@/lib/builder-v2-catalog'
import presentation from '@/components/runtime/app-presentation.module.css'
import { BuilderV2CatalogDetail } from './catalog-detail'
import { ShopAddToBasket, ShopBasketPanel } from './shop-basket'
import { builderV2ContactHref, builderV2StatusTone, isBuilderV2BusinessDetail, isBuilderV2ContactProfile, isBuilderV2ContactTable, isBuilderV2OrderTable } from './record-presentation'
import { RecordFieldLabel } from '@/components/runtime/record-field-label'
import { BuilderV2OrderHero, BuilderV2RecordAvatar, InventoryProductThumb } from './record-visuals'
import { PurchaseLinesEditor } from './purchase-lines'
import { CountLinesEditor } from './count-lines'
import { ReorderPanel } from './reorder-panel'
import { BuilderV2OrderActionPanel, BuilderV2OrderFacts, BuilderV2OrderIdentity, BuilderV2OrderSummaryCard, BuilderV2ShopOrderLines, OrderActionPanelContext, builderV2BlankFact, builderV2OrderStatusChoices, type BuilderV2OrderActionTrigger } from './order-detail'
import { DetailCardShell, DetailSection, ListScreenShell, ShellSearchField } from './layout-shell'
import shellLayout from './layout-shell.module.css'
import {
  aggregateSupplierStats,
  buildListShellMeta,
  buildListShellMetrics,
  buildListShellTabs,
  filterInventoryItemRows,
  filterListShellRows,
  inventoryStockListFooter,
  listShellScreen,
  listShellTitle,
  resolveShopOrderCustomerFieldId,
  resolveShopOrderTotalFieldId,
  type ListShellKind,
} from './list-shell'

const cell = (row: AppV2Record, fieldId: string) => (row as Partial<BuilderV2DataRecord>).display?.[fieldId] ?? String(row.values[fieldId] ?? '')

export type AppV2RendererProps = { app: AppV2; screenId: string; tables: readonly BuilderV2Table[]; actor: AppV2Actor; rows?: Readonly<Record<string, readonly AppV2Record[]>>; record?: AppV2Record; live?: boolean; editing?: boolean; selectedId?: string | null; onSelect?: (id: string) => void; onAdd?: (parentId: string | null) => void; onNavigate?: (screenId: string, recordId?: string) => void; workingForm?: WorkingFormOptions & { formId: string }; rootNodeIds?: readonly string[]; businessApps?: readonly BuilderBusinessApp[]; businessLinks?: Readonly<Record<string, BuilderBusinessLink>>; statusFormId?: string; openCreate?: boolean }

/** One component tree for the editor and authenticated preview; no mutation engine lives here. */
export function AppV2Renderer(props: AppV2RendererProps) {
  const published=usePublishedV2()
  const screen = props.app.screens.find(screen => screen.id === props.screenId), nodes = new Map(props.app.nodes.map(node => [node.id, node]))
  const recordTable = props.tables.find(table => table.id === screen?.contextTableId)
  const profile = isBuilderV2ContactProfile(props.app, props.screenId, props.tables)
  const orderGroup = (published ? builderV2RecordParent(props.app, props.screenId) : builderV2PreviewRecordParent(props.app, props.screenId, props.actor))?.queue?.recordGroup
  const inventory = props.app.inventory
  const supplierStats = useSupplierOrderStats(props.app, inventory && (screen?.id === inventory.suppliersScreenId || screen?.id === inventory.supplierScreenId) ? inventory : null)
  const rootButtonByLabel = (label: string) => screen?.rootIds.find(id => {
    const node = nodes.get(id)
    return node?.type === 'button' && node.label === label
  }) ?? null
  // Fold the screen create button into the collection search toolbar (shop-like density).
  const foldedCreateId = !props.editing && inventory && screen
    ? screen.id === inventory.itemsScreenId ? rootButtonByLabel('Новый товар')
      : screen.id === inventory.movementsScreenId ? rootButtonByLabel('Новая операция')
      : screen.id === inventory.purchasesScreenId ? rootButtonByLabel('Новый заказ')
      : screen.id === inventory.suppliersScreenId ? rootButtonByLabel('Новый поставщик')
      : screen.id === inventory.countsScreenId ? rootButtonByLabel('Новая инвентаризация')
      : null
    : null
  const foldedExtraIds = new Set<string>()
  const suppliersLinkId = !props.editing && inventory && screen?.id === inventory.purchasesScreenId ? rootButtonByLabel('Поставщики') : null
  if (suppliersLinkId) foldedExtraIds.add(suppliersLinkId)
  const reorderOnList = Boolean(!props.editing && inventory?.reorderScreenId
    && (screen?.id === inventory.purchasesScreenId || screen?.id === inventory.itemsScreenId))
  const reorderLinkId = reorderOnList
    ? props.app.nodes.find(node => node.type === 'button' && (node.label === 'Что заказать' || node.label.startsWith('Что заказать')))?.id ?? null
    : null
  if (reorderLinkId) foldedExtraIds.add(reorderLinkId)
  const inventoryCreateFormId = !props.editing && inventory && screen?.id === inventory.itemsScreenId
    ? inventory.createItemFormId ?? null
    : screen?.id === inventory?.purchasesScreenId ? inventory?.createPurchaseFormId ?? null
    : screen?.id === inventory?.suppliersScreenId ? inventory?.createSupplierFormId ?? null
    : screen?.id === inventory?.countsScreenId ? inventory?.createCountFormId ?? null
    : null
  const rootIds = (props.rootNodeIds ?? screen?.rootIds ?? []).filter(id => id !== inventoryCreateFormId)
  const visible = (node: AppV2Node, row = props.record) => {
    if (node.visibleTo && !matchesAppV2Audience(node.visibleTo, props.actor)) return false
    const result = node.visibleWhen && evaluateAppV2Condition(node.visibleWhen, { actor: props.actor, row, screenRow: props.record })
    return !result || (result.ok && result.value)
  }
  const order = props.record && !screen?.catalog && isBuilderV2OrderTable(recordTable) && !props.rootNodeIds
  const crm = props.app.crm
  const detail = Boolean(props.record && !screen?.catalog && !props.rootNodeIds && screen && isBuilderV2BusinessDetail(props.app, screen.id, recordTable))
  const composition = order && rootIds.map(id => nodes.get(id)).flatMap(node => {
    if (node?.type !== 'collection' || !visible(node)) return []
    const source = props.app.sources.find(source => source.id === node.sourceId)
    const fields = source && builderV2OrderLineFields(node, source, recordTable!.fields)
    return fields ? [{ id: node.id, amount: fields.amount }] : []
  })
  const lines = composition && composition.length === 1 ? composition[0] : undefined
  const summaryKey = lines && JSON.stringify([props.app.id, props.screenId, props.record?.id, lines.id, published?.dataVersion, published?.revision])
  const [summaryState, setSummary] = useState<{ key?: string; value?: BuilderV2OrderSummary; pending?: boolean }>({})
  const receiveSummary = useCallback((page: BuilderV2DataPage | undefined, pending: boolean) => {
    setSummary(old => old.key === summaryKey && old.value === page?.orderSummary && old.pending === pending ? old : { key: summaryKey, value: page?.orderSummary, pending })
  }, [summaryKey])
  const summary = summaryKey && summaryState.key === summaryKey ? summaryState.value : undefined
  const statusColumn = order ? recordTable?.fields.find(builderV2StatusColumn)
    : detail && crm && screen?.id === crm.dealScreenId ? recordTable?.fields.find(field => field.id === crm.stageFieldId) : undefined
  const facts = detail ? rootIds.flatMap(id => {
    const node = nodes.get(id)
    if (!node || !visible(node)) return []
    return node.type === 'field' ? [node] : node.type === 'columns' ? node.childIds.flatMap(child => {
      const field = nodes.get(child)
      return field?.type === 'field' && visible(field) ? [field] : []
    }) : []
  }) : []
  const statusNode = facts.find(node => 'fieldId' in node.value && node.value.fieldId === statusColumn?.id)
  const amountColumn = detail && !lines && !orderGroup ? (
    crm && screen?.id === crm.dealScreenId ? recordTable?.fields.find(field => field.id === crm.sumFieldId)
      : inventory && screen?.id === inventory.itemScreenId ? recordTable?.fields.find(field => field.id === inventory.itemStockFieldId)
      : recordTable?.fields.find(field =>
        ['number', 'formula', 'rollup'].includes(field.type) && /^(?:сумма(?: заказа)?|итого|order total|total)(?:\s|[,(_]|$)/iu.test(field.name.trim()) &&
        !/^(?:сумма (?:позиции|строки))/iu.test(field.name.trim()))
  ) : undefined
  const amountNode = facts.find(node => 'fieldId' in node.value && node.value.fieldId === amountColumn?.id)
  const rawTotal = amountNode && amountColumn && props.record?.values[amountColumn.id]
  const amount = summary?.amount != null && lines ? builderV2FormattedAmount(summary.amount, lines.amount.name)
    : typeof rawTotal === 'number' && Number.isFinite(rawTotal) && amountColumn ? builderV2FormattedAmount(rawTotal, amountColumn.name) : undefined
  const status = statusNode && statusColumn && props.record && Object.hasOwn(props.record.values, statusColumn.id)
    ? lines ? summary?.scoped ? undefined : summary?.status?.kind === 'mixed' ? 'Разные статусы позиций' : summary?.status?.label
      : !orderGroup ? cell(props.record, statusColumn.id) : undefined
    : undefined
  const shellKind: ListShellKind | null = !props.editing && !props.record ? listShellScreen(props.app, props.screenId) : null
  const openPurchaseTotal = useOpenPurchaseOrdersTotal(props.app, shellKind === 'inventory-items' ? inventory : null)
  const crmDealStats = useClientDealStats(props.app, shellKind === 'crm-clients' || shellKind === 'crm-board' ? crm : null)
  const shellCollectionId = shellKind && screen
    ? screen.rootIds.find(id => {
      const node = nodes.get(id)
      return node?.type === 'collection' && node.layout !== 'calendar'
    })
    : undefined
  const [shellSearch, setShellSearch] = useState('')
  const [shellPage, setShellPage] = useState<BuilderV2DataPage | undefined>()
  const [shellTab, setShellTab] = useState('all')
  const [shellWarehouse, setShellWarehouse] = useState('all')
  const [shellCategory, setShellCategory] = useState('all')
  const [shellLowStock, setShellLowStock] = useState<number | null>(null)
  useEffect(() => {
    setShellSearch('')
    setShellTab('all')
    setShellWarehouse('all')
    setShellCategory('all')
    setShellPage(undefined)
  }, [props.screenId])
  useEffect(() => {
    if (!published || !inventory || (shellKind !== 'inventory-items' && shellKind !== 'inventory-purchases')) return
    let cancelled = false
    void import('@/app/builder-v2-published-actions').then(async ({ readPublishedV2LowStockCountAction }) => {
      const result = await readPublishedV2LowStockCountAction(published.slug, { revision: published.revision })
      if (cancelled || !result.ok) return
      setShellLowStock(result.count)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [published?.revision, published?.dataVersion, shellKind, inventory])
  const statusFormId = published ? props.statusFormId : detail && !lines && !orderGroup && statusColumn?.type === 'single_select' && !props.editing
    ? rootIds.find(id => {
      const form = nodes.get(id)
      return form?.type === 'form' && form.tableId === recordTable?.id && visible(form) && (
        order ? builderV2StatusForm(props.app, form, props.actor, statusColumn.id)
          : crm && form.id === crm.contactFormId
      )
    }) : undefined
  const resolve = (value: AppV2Binding, record: AppV2Record | undefined): string => {
    const result = resolveAppV2Binding(value, { actor: props.actor, row: record, screenRow: props.record })
    if (result.ok && value.kind === 'screen_row' && props.record) return cell(props.record, value.fieldId)
    if (result.ok && value.kind === 'row' && record) return cell(record, value.fieldId)
    if (result.ok) return result.value === null ? '' : typeof result.value === 'object' ? JSON.stringify(result.value) : String(result.value)
    return value.kind === 'row' || value.kind === 'screen_row' ? props.tables.flatMap(table => table.fields).find(field => field.id === value.fieldId)?.name ?? 'Значение записи' : 'Значение появится здесь'
  }
  const raw=(value:AppV2Binding,record:AppV2Record|undefined)=>{const result=resolveAppV2Binding(value,{actor:props.actor,row:record,screenRow:props.record});return result.ok?result.value:null}
  function buildInventoryListToolbar(): ReactNode | undefined {
    if (!inventory || props.editing || (!foldedCreateId && !suppliersLinkId && !reorderOnList)) return undefined
    const parts: ReactNode[] = []
    if (suppliersLinkId) {
      const link = nodes.get(suppliersLinkId)
      if (link?.type === 'button' && visible(link)) {
        parts.push(<span key={link.id} className={ui.purchaseSuppliersSlot}>
          {published
            ? <>
              <PublishedV2Button node={link} screenId={props.screenId} recordId={props.record?.id} buttonClassName={`${styles.secondary} ${ui.purchaseSuppliersDesktop}`} />
              <PublishedV2Button node={link} screenId={props.screenId} recordId={props.record?.id} buttonClassName={`${ui.orderActionIcon} ${ui.purchaseSuppliersMobile}`} buttonContent={<ProtoIcon name="truck" size={20} />} />
            </>
            : <>
              <button type="button" className={`${styles.secondary} ${ui.purchaseSuppliersDesktop}`} disabled>{link.label}</button>
              <button type="button" className={`${ui.orderActionIcon} ${ui.purchaseSuppliersMobile}`} aria-label={link.label} title={link.label} disabled><ProtoIcon name="truck" size={20} /></button>
            </>}
        </span>)
      }
    }
    if (reorderOnList && inventory?.reorderScreenId) {
      const link = reorderLinkId ? nodes.get(reorderLinkId) : undefined
      const reorderNode = link?.type === 'button' ? link : {
        id: reorderLinkId ?? 'reorder-shell',
        name: 'Что заказать',
        type: 'button' as const,
        label: 'Что заказать',
        variant: 'secondary' as const,
        visibleTo: null,
        visibleWhen: null,
        events: { press: null },
      }
      parts.push(<span key={reorderNode.id} className={ui.purchaseSuppliersSlot}>
        {published
          ? link?.type === 'button'
            ? <>
              <ReorderToolbarLink app={props.app} node={link} screenId={props.screenId} buttonClassName={`${styles.secondary} ${ui.purchaseSuppliersDesktop}`} />
              <ReorderToolbarLink app={props.app} node={link} screenId={props.screenId} buttonClassName={`${ui.orderActionIcon} ${ui.purchaseSuppliersMobile}`} buttonContent={<ProtoIcon name="box" size={20} />} />
            </>
            : <>
              <button type="button" className={`${styles.secondary} ${ui.purchaseSuppliersDesktop}`} onClick={() => published.navigate(inventory.reorderScreenId!)}>Что заказать</button>
              <button type="button" className={`${ui.orderActionIcon} ${ui.purchaseSuppliersMobile}`} aria-label="Что заказать" title="Что заказать" onClick={() => published.navigate(inventory.reorderScreenId!)}><ProtoIcon name="box" size={20} /></button>
            </>
          : <>
            <button type="button" className={`${styles.secondary} ${ui.purchaseSuppliersDesktop}`} disabled>Что заказать</button>
            <button type="button" className={`${ui.orderActionIcon} ${ui.purchaseSuppliersMobile}`} aria-label="Что заказать" title="Что заказать" disabled><ProtoIcon name="box" size={20} /></button>
          </>}
      </span>)
    }
    if (foldedCreateId) {
      const button = nodes.get(foldedCreateId)
      if (button?.type === 'button' && visible(button)) {
        const toolbarButton = inventory && screen?.id === inventory.movementsScreenId ? { ...button, label: 'Операция' } : button
        const purchaseCreate = Boolean(inventory && screen?.id === inventory.purchasesScreenId)
        const supplierCreate = Boolean(inventory && screen?.id === inventory.suppliersScreenId)
        const countCreate = Boolean(inventory && screen?.id === inventory.countsScreenId)
        const createLabel = countCreate
          ? <><span className={ui.countCreateFull}>Новая инвентаризация</span><span className={ui.countCreateShort}>Новая</span></>
          : toolbarButton.label
        if (inventoryCreateFormId && nodes.get(inventoryCreateFormId)) {
          parts.push(<InventoryCreateDialog
            key={button.id}
            label={createLabel}
            title={purchaseCreate ? 'Новый заказ' : supplierCreate ? 'Новый поставщик' : countCreate ? 'Новая инвентаризация' : 'Новый товар'}
            submitLabel={purchaseCreate ? 'Сохранить заказ' : supplierCreate ? 'Сохранить поставщика' : countCreate ? 'Сохранить' : 'Сохранить товар'}
            wide={purchaseCreate || countCreate}
            defaultOpen={Boolean(props.openCreate && !purchaseCreate && !supplierCreate && !countCreate)}
            onDismiss={() => {
              if (props.openCreate && inventory && published && !purchaseCreate && !supplierCreate && !countCreate) published.navigate(inventory.itemsScreenId, undefined, { replace: true })
            }}
          >{render([inventoryCreateFormId])}</InventoryCreateDialog>)
        } else {
          parts.push(published
            ? <PublishedV2Button key={button.id} node={toolbarButton} screenId={props.screenId} recordId={props.record?.id} />
            : <button key={button.id} type="button" className={button.variant === 'primary' ? styles.primary : button.variant === 'danger' ? styles.danger : styles.secondary} disabled>{createLabel}</button>)
        }
      }
    }
    if (!parts.length) return undefined
    return parts.length === 1 ? parts[0] : <div className={ui.purchaseToolbarEnd}>{parts}</div>
  }
  function buildShellRootActions(): ReactNode | undefined {
    if (!shellKind || props.editing) return undefined
    const inventoryToolbar = buildInventoryListToolbar()
    if (inventoryToolbar) return inventoryToolbar
    const parts = rootIds.flatMap(id => {
      const node = nodes.get(id)
      if (node?.type !== 'button' || !visible(node)) return []
      const buttonStyle = node.variant === 'primary' ? styles.primary : node.variant === 'danger' ? styles.danger : styles.secondary
      return [published
        ? <PublishedV2Button key={node.id} node={node} screenId={props.screenId} recordId={props.record?.id} buttonClassName={buttonStyle} />
        : <button key={node.id} type="button" className={buttonStyle} disabled>{node.label}</button>]
    })
    return parts.length ? <div className={ui.purchaseToolbarEnd}>{parts}</div> : undefined
  }
  function render(ids: readonly string[], record = props.record, formTableId: string | null = null,itemId?:string,itemLabel?:string): ReactNode[] {
    return ids.map(id => {
      const node = nodes.get(id)
      if (!node || (!props.editing && (id === statusNode?.id && status || id === amountNode?.id && amount))) return null
      if(published&&itemId&&Array.isArray((record as BuilderV2DataRecord|undefined)?.visibleNodeIds)&&!(record as BuilderV2DataRecord).visibleNodeIds!.includes(id))return null
      if(published&&'value'in node&&(node.value.kind==='row'||node.value.kind==='screen_row')){const bound=node.value.kind==='row'?record:props.record;if(bound&&!Object.hasOwn(bound.values,node.value.fieldId))return null}
      if (!props.editing && !visible(node, record)) return null
      let content: ReactNode
      if (node.type === 'heading') content = <h2 className={ui.heading} data-size={node.size}>{resolve(node.value, record)}</h2>
      else if (node.type === 'text') content = <p className={styles.bodyText}>{resolve(node.value, record)}</p>
      else if (node.type === 'field') {
        const fieldId = 'fieldId' in node.value ? node.value.fieldId : undefined
        const fieldTable = node.value.kind === 'row' && record && record.tableId !== recordTable?.id
          ? props.tables.find(table => table.id === record.tableId)
          : recordTable
        const field = fieldTable?.fields.find(field => field.id === fieldId)
        const value = resolve(node.value, record)
        const href = !props.editing ? builderV2ContactHref(field?.type, raw(node.value, record)) : undefined
        content = <div className={ui.row}>
          <RecordFieldLabel as="small" label={node.label} field={field} />
          <strong>{href ? <a className={ui.contactLink} href={href}>{value}</a> : value || '—'}</strong>
        </div>
      }
      else if (node.type === 'divider') content = <hr className={styles.divider} />
      else if(node.type==='gallery')content=<BuilderV2Gallery value={raw(node.value,record)} caption={node.caption} columns={node.columns} editing={Boolean(props.editing)} slug={published?.slug}/>
      else if(node.type==='files')content=<BuilderV2Files value={raw(node.value,record)} caption={node.caption} editing={Boolean(props.editing)} slug={published?.slug}/>
      else if(node.type==='video')content=<BuilderV2Video value={resolve(node.value,record)} caption={node.caption} editing={Boolean(props.editing)}/>
      else if (node.type === 'image') { const url=builderV2MediaItems(raw(node.value,record),published?.slug).find(item=>item.image)?.url; content = url ? <img className={ui.image} src={url} alt={node.alt} loading="lazy" decoding="async" /> : <div className={ui.placeholder}><ProtoIcon name="apps" size={24} /><strong>Изображение</strong><span>Укажите ссылку в свойствах</span></div> }
      else if(node.type==='button'){
        if (id === foldedCreateId || foldedExtraIds.has(id)) return []
        const buttonStyle=node.variant==='primary'?styles.primary:node.variant==='danger'?styles.danger:styles.secondary
        content=published?published.buttonState(node.id)?.kind==='delete'?<PublishedV2Delete node={node} screenId={props.screenId} recordId={props.record?.id}/>:<PublishedV2Button node={node} screenId={props.screenId} recordId={props.record?.id} itemId={itemId} itemLabel={itemLabel}/>:itemId&&!props.editing&&props.live&&builderV2ButtonAction(props.app,node)?<Link href={`/apps/${encodeURIComponent(props.app.id)}/actions/${encodeURIComponent(node.id)}?screen=${encodeURIComponent(props.screenId)}${props.record?`&row=${encodeURIComponent(props.record.id)}`:''}&item=${encodeURIComponent(itemId)}`} className={buttonStyle} aria-label={itemLabel?`${node.label}: ${itemLabel}`:undefined}>{node.label}</Link>:<button type="button" className={buttonStyle} disabled>{node.label}</button>
      }
      else if (node.type === 'business') content = <BuilderBusinessOperation node={node} link={props.businessLinks?.[node.id]} apps={props.businessApps} />
      else if (node.type === 'input') {
        const countPayload = Boolean(inventory?.countPayloadFieldId && node.fieldId === inventory.countPayloadFieldId)
        const parentForm = props.app.nodes.find(entry => entry.type === 'form' && entry.childIds.includes(node.id))
        const reorderPayload = Boolean(inventory && parentForm?.id === inventory.reorderFormId
          && (node.fieldId === inventory.reorderPayloadFieldId || node.fieldId === inventory.purchasePayloadFieldId))
        const purchasePayload = Boolean(inventory?.purchasePayloadFieldId && node.fieldId === inventory.purchasePayloadFieldId && !reorderPayload)
        content = !props.editing && countPayload
          ? <CountLinesEditor record={record} />
          : !props.editing && reorderPayload
            ? <ReorderPanel />
            : purchasePayload && !props.editing
              ? <PurchaseLinesEditor record={record} />
              : <BuilderV2FormInput node={node} table={props.tables.find(table => table.id === formTableId)} />
      }
      else if (node.type === 'form') {
        const supplierEdit = Boolean(inventory?.editSupplierFormId && node.id === inventory.editSupplierFormId)
        const preview = <BuilderV2FormPreview app={props.app} form={node} screenId={props.screenId} recordId={props.record?.id} enabled={Boolean(props.live)} editing={Boolean(props.editing)} working={props.workingForm?.formId === node.id ? props.workingForm : undefined}>{render(node.childIds, record, node.tableId)}{props.editing && <button type="button" className={styles.addInside} onClick={() => props.onAdd?.(node.id)}><ProtoIcon name="plus" />Добавить поле</button>}</BuilderV2FormPreview>
        // Count draft facts edit inline on the card (no separate «Изменить» dialog).
        content = (node.id === inventory?.editPurchaseFormId || supplierEdit) && !props.editing
          ? <InventoryCreateDialog
            label="Изменить"
            buttonClassName={styles.secondary}
            title={supplierEdit ? 'Изменить поставщика' : 'Изменить заказ'}
            submitLabel="Сохранить"
            wide={node.id === inventory?.editPurchaseFormId}
          >{preview}</InventoryCreateDialog>
          : preview
      }
      else if (node.type === 'group' || node.type === 'columns') {
        const children = appV2ChildIds(node)
        const facts = node.type === 'columns' && screen?.contextTableId && screen.rootIds.includes(node.id) && children.length > 0 && children.every(id => nodes.get(id)?.type === 'field')
        const items = render(children, record, formTableId,itemId,itemLabel)
        if (facts && !props.editing && !items.some(Boolean)) return null
        content = <div className={facts ? `${presentation.panel} ${ui.facts}` : node.type === 'columns' ? ui.columns : ui.group} style={node.type === 'columns' ? { '--columns': node.columns } as CSSProperties : undefined} data-plain={node.type === 'group' && node.appearance === 'plain'} data-order-facts={facts && detail || undefined}>
          {facts && <h2 className={presentation.sectionTitle}>{node.name}</h2>}
          <div className={node.type === 'columns' ? ui.columns : styles.canvasBlocks} style={node.type === 'columns' ? { '--columns': node.columns, gridColumn: '1 / -1' } as CSSProperties : undefined}>{items}</div>
          {props.editing && <button type="button" className={styles.addInside} style={{ gridColumn: '1 / -1' }} onClick={() => props.onAdd?.(node.id)}><ProtoIcon name="plus" />Добавить элемент</button>}
        </div>
      } else {
        const useShell = Boolean(shellKind && shellCollectionId === id && !props.record)
        const inventoryListToolbar = node.type === 'collection' ? buildInventoryListToolbar() : undefined
        const showCollectionHeading = Boolean(props.editing || screen?.name !== node.name) && !useShell
        const shellCollectionTable = props.tables.find(table => table.id === props.app.sources.find(source => source.id === node.sourceId)?.tableId)
        content = <BuilderV2DataNode app={props.app} node={node} live={Boolean(props.live)} allowWrites={Boolean(props.live&&!props.editing)} table={shellCollectionTable} heading={showCollectionHeading} toolbarEnd={useShell ? undefined : inventoryListToolbar} shell={useShell || undefined} searchValue={useShell ? shellSearch : undefined} onSearchChange={useShell ? setShellSearch : undefined} scope={{ screenId: props.screenId, ...(props.record ? { recordId: props.record.id } : {}) }} onPage={(page, pending) => {
          if (useShell) setShellPage(page)
          if (id === lines?.id) receiveSummary(page, pending)
        }}>{page => {
        let body: ReactNode
        const source = props.app.sources.find(source => source.id === node.sourceId), table = props.tables.find(table => table.id === source?.tableId)
        const loadedRows = page ? page.rows : source && props.rows && Object.hasOwn(props.rows, source.id) ? props.rows[source.id] : undefined
        let rows = useShell && shellKind && loadedRows
          ? filterListShellRows(shellKind, shellTab, loadedRows, inventory ?? undefined)
          : loadedRows
        if (useShell && shellKind === 'inventory-items' && inventory && rows) {
          rows = filterInventoryItemRows(rows, inventory, { warehouse: shellWarehouse, category: shellCategory })
        }
        if(node.type==='chart')body=<BuilderV2Chart node={node} data={page?.chart}/>
        else if (node.type === 'metric') {
          const numbers = rows?.map(row => row.values[node.fieldId ?? '']).filter((value): value is number => typeof value === 'number' && Number.isFinite(value)) ?? []
          const sum = numbers.reduce((sum, value) => sum + value, 0)
          const result = page ? page.value : !rows ? null : node.operation === 'count' ? rows.length : node.operation === 'sum' ? sum : !numbers.length ? null : node.operation === 'avg' ? sum / numbers.length : node.operation === 'min' ? Math.min(...numbers) : Math.max(...numbers)
          body = <div className={`${styles.metric} ${presentation.panel}`}><span>{node.name}</span><strong>{result ?? '—'}</strong><small>{table?.name ?? 'Выберите источник'}</small></div>
        } else {
          const catalog = node.layout === 'catalog'
          const timeline = node.layout === 'timeline'
          const compact = node.layout === 'list' && !node.itemIds.length && id !== lines?.id
          const contacts = compact && isBuilderV2ContactTable(table)
          const orders = compact && isBuilderV2OrderTable(table)
          const cardLayout = builderV2CardLayout(node.layout)
          const cardTarget = collectionCardScreen(props.app, node)
          const cardScreen = !props.editing && props.onNavigate ? cardTarget : undefined
          const rowAction = props.editing ? undefined : published ? published.rowAction?.(node.id) : props.live && !cardTarget ? builderV2NodeAction(props.app,node)?.flow : undefined
          const open = (row: AppV2Record) => props.onNavigate?.(cardScreen!, row.id)
          const title = table?.fields.find(field => field.id === node.titleFieldId)?.name ?? 'Название записи'
          const amountField = table?.fields.find(field => field.id === node.recordGroup?.amountFieldId)
          const subtitleField = node.layout==='kanban'&&node.subtitleFieldId===node.groupFieldId?undefined:table?.fields.find(field => field.id === node.subtitleFieldId)
          const statusSubtitle = subtitleField?.type === 'single_select'
          const subtitle = subtitleField?.name
          const moneySubtitle = Boolean(subtitle && /[₽$€£₸]/u.test(subtitle))
          const time=(row?:AppV2Record)=>node.layout==='calendar'&&table?.fields.find(field=>field.id===node.dateFieldId)?.type==='datetime'?builderCalendarTime(row?.values[node.dateFieldId!],page?.calendar?.timeZone??table?.fields.find(field=>field.id===node.dateFieldId)?.timeZone):null
          const inventoryStockList = Boolean(inventory && node.cardDetailFieldId === inventory.itemStockFieldId)
          const shopOrdersList = Boolean(props.app.shop && source?.tableId === props.app.shop.ordersTableId && node.layout === 'list' && screen?.id === props.app.shop.ordersScreenId)
          const clientList = Boolean(crm && screen?.id === crm.clientsScreenId && source?.tableId === crm.clientsTableId && node.layout === 'list')
          const inventoryJournalList = Boolean(inventory && screen?.id === inventory.movementsScreenId && node.layout === 'list')
          const purchaseList = Boolean(inventory?.purchaseOrdersTableId && source?.tableId === inventory.purchaseOrdersTableId && node.layout === 'list' && (!source?.screenTableId || source.screenTableId === inventory.suppliersTableId))
          const supplierOrdersList = Boolean(purchaseList && source?.screenTableId === inventory?.suppliersTableId)
          const purchaseLineList = Boolean(inventory?.purchaseLinesTableId && source?.tableId === inventory.purchaseLinesTableId)
          const supplierList = Boolean(inventory?.suppliersTableId && source?.tableId === inventory.suppliersTableId && node.layout === 'list' && !source?.screenTableId && screen?.id === inventory.suppliersScreenId)
          const countList = Boolean(inventory?.inventoryCountsTableId && source?.tableId === inventory.inventoryCountsTableId && node.layout === 'list' && !source?.screenTableId)
          const countLineList = Boolean(inventory?.inventoryCountLinesTableId && source?.tableId === inventory.inventoryCountLinesTableId)
          const inventoryHistory = Boolean(inventory && node.layout === 'timeline' && node.dateFieldId === inventory.movementDateFieldId)
          const unitOf = (row?: AppV2Record) => {
            if (!inventory || !row) return 'шт.'
            if (inventoryStockList) {
              const unit = cell(row, inventory.itemUnitFieldId)
              return unit || 'шт.'
            }
            return 'шт.'
          }
          const signedQty = (row: AppV2Record, raw: string) => {
            const qty = Number(row.values[node.cardDetailFieldId!])
            if (!Number.isFinite(qty)) return raw ? `${raw} шт.` : ''
            const sign = qty > 0 ? '+' : ''
            return `${sign}${qty} шт.`
          }
          const item = (row?: AppV2Record) => {
            if (node.itemIds.length) return render(node.itemIds, row, null, row?.id, row ? cell(row, node.titleFieldId) : undefined)
            const imageFieldId = inventoryStockList && inventory?.itemPhotoFieldId
              ? inventory.itemPhotoFieldId
              : node.cardImageFieldId
            const image = (cardLayout || inventoryStockList) && imageFieldId && row
              ? builderV2MediaItems(row.values[imageFieldId], published?.slug).find(item => item.image)
              : undefined
            const rawDetail = node.cardDetailFieldId && row
              ? catalog ? builderV2CatalogPrice(row, table?.fields.find(field => field.id === node.cardDetailFieldId)) : cell(row, node.cardDetailFieldId)
              : ''
            const detail = row && inventoryStockList && rawDetail !== ''
              ? `${rawDetail} ${unitOf(row)}`
              : row && (inventoryJournalList || inventoryHistory) && node.cardDetailFieldId
                ? signedQty(row, String(rawDetail))
                : rawDetail
            const detailNode = detail
              ? <span className={cardLayout ? ui.catalogDetail : ui.recordMetaDetail}>{detail}</span>
              : null
            const summary = (row as BuilderV2DataRecord | undefined)?.summary
            const total = summary?.amount != null && amountField ? builderV2FormattedAmount(summary.amount, amountField.name) : ''
            const subtitleValue = row && subtitleField
              ? moneySubtitle ? builderV2CatalogPrice(row, subtitleField) : cell(row, subtitleField.id)
              : subtitle
            const label = row ? cell(row, node.titleFieldId) || 'Без названия' : title
            const journalWarehouse = inventoryJournalList && row && inventory
              ? cell(row, inventory.movementWarehouseFieldId)
              : ''
            const journalWhen = inventoryJournalList && row && inventory
              ? formatInventoryJournalWhen(cell(row, inventory.movementDateFieldId))
              : ''
            const journalAuthor = inventoryJournalList && row && inventory
              ? formatInventoryAuthor(cell(row, inventory.movementAuthorFieldId))
              : ''
            const lowBadge = inventoryStockList && row && row.values[inventory!.itemLowFieldId] === true
              ? <span className={ui.statusBadge} data-tone="rose">Ниже минимума</span>
              : null
            if (clientList && crm && row) {
              const name = cell(row, crm.clientTitleFieldId)
              const contactField = crm.clientNameFieldId
                ?? table?.fields.find(field =>
                  /^(?:контакт(?:ное лицо)?|имя(?:\s+контакт(?:а|ного)?)?)$/iu.test(field.name.trim())
                  && field.id !== crm.clientTitleFieldId
                  && field.id !== crm.clientPhoneFieldId)?.id
              const contact = contactField && Object.hasOwn(row.values, contactField) ? cell(row, contactField) : ''
              const phone = Object.hasOwn(row.values, crm.clientPhoneFieldId) ? cell(row, crm.clientPhoneFieldId) : ''
              const logoField = table?.fields.find(field => field.type === 'image' && /logo|логотип|фото/iu.test(field.name))
              const logo = logoField ? builderV2MediaItems(row.values[logoField.id], published?.slug).find(item => item.image) : undefined
              const stat = crmDealStats.stats.get(row.id)
              const deals = stat?.deals ?? 0
              const dealSum = stat && stat.sum > 0 ? purchaseMoney(stat.sum) : '—'
              const last = stat?.lastContact ? formatPurchaseDate(stat.lastContact) : '—'
              return <>
                {logo ? <InventoryProductThumb image={logo} size="list" label={name} /> : <BuilderV2RecordAvatar id={row.id} icon="building" forceIcon tone />}
                <div className={ui.clientListCopy}>
                  <strong>{name || '—'}</strong>
                  <span className={ui.clientListMobileMeta}>
                    {contact ? <span>{contact}</span> : null}
                    {phone ? <span>{phone}</span> : null}
                    <span>{deals} сделок · {dealSum}</span>
                    {last !== '—' ? <span>Последний контакт {last}</span> : null}
                  </span>
                </div>
                <span className={ui.clientListCol} data-col="contact">{contact || '—'}</span>
                <span className={ui.clientListCol} data-col="phone">{phone || '—'}</span>
                <span className={ui.clientListCol} data-col="deals">{deals}</span>
                <span className={ui.clientListCol} data-col="sum">{dealSum}</span>
                <span className={ui.clientListCol} data-col="last">{last}</span>
              </>
            }
            if (shopOrdersList && props.app.shop && row) {
              const shop = props.app.shop
              const customerFieldId = resolveShopOrderCustomerFieldId(table)
              const totalFieldId = node.cardDetailFieldId ?? resolveShopOrderTotalFieldId(shop, table)
              const when = node.dateFieldId ? formatPurchaseDate(cell(row, node.dateFieldId) || String(row.values[node.dateFieldId] ?? '')) : shop.createdFieldId ? formatPurchaseDate(cell(row, shop.createdFieldId)) : ''
              const number = cell(row, node.titleFieldId) || '—'
              const customer = customerFieldId ? cell(row, customerFieldId) : ''
              const statusLabel = shop.statusFieldId && (node.subtitleFieldId === shop.statusFieldId || !node.subtitleFieldId) ? cell(row, shop.statusFieldId) : node.subtitleFieldId ? cell(row, node.subtitleFieldId) : ''
              const totalRaw = totalFieldId ? row.values[totalFieldId] : null
              const summary = (row as BuilderV2DataRecord).summary
              const amount = typeof totalRaw === 'number' && Number.isFinite(totalRaw)
                ? purchaseMoney(totalRaw)
                : summary?.amount != null && Number.isFinite(summary.amount) ? purchaseMoney(summary.amount)
                  : totalFieldId ? cell(row, totalFieldId) : ''
              const positionIds = shop.positionsFieldId && Array.isArray(row.values[shop.positionsFieldId])
                ? (row.values[shop.positionsFieldId] as unknown[]).filter((id): id is string => typeof id === 'string')
                : []
              return <>
                <ShopOrderThumbs lineIds={positionIds} shop={shop} />
                <div className={ui.purchaseListCopy}>
                  <strong>{number}</strong>
                  <span className={ui.purchaseListDate}>{when || '—'}</span>
                  <span className={ui.purchaseListMobileMeta}>
                    {customer ? <span>{customer}</span> : null}
                  </span>
                </div>
                <span className={ui.purchaseListCol} data-col="customer">{customer || '—'}</span>
                <span className={ui.purchaseListCol} data-col="date">{when || '—'}</span>
                {statusLabel ? <span className={ui.statusBadge} data-tone={builderV2StatusTone(statusLabel)}>{statusLabel}</span> : <span />}
                <span className={ui.purchaseListAmount}>{amount || '—'}</span>
              </>
            }
            if (supplierList && inventory && row) {
              const name = inventory.supplierNameFieldId ? cell(row, inventory.supplierNameFieldId) : label
              const contact = inventory.supplierContactFieldId ? cell(row, inventory.supplierContactFieldId) : ''
              const phone = inventory.supplierPhoneFieldId ? cell(row, inventory.supplierPhoneFieldId) : ''
              const stat = supplierStats.get(row.id)
              const lastOrder = stat?.lastOrder ? formatPurchaseDate(stat.lastOrder) : '—'
              const purchased = stat && stat.purchased > 0 ? purchaseMoney(stat.purchased) : '—'
              const ordersCount = stat?.orders ?? 0
              const ordersLabel = `${ordersCount}`
              const ordersWord = ordersCount === 1 ? 'заказ' : ordersCount > 1 && ordersCount < 5 ? 'заказа' : 'заказов'
              return <>
                <BuilderV2RecordAvatar id={row.id} name={name} icon="truck" tone />
                <div className={ui.supplierListCopy}>
                  <strong>{name || '—'}</strong>
                  {contact ? <span className={ui.supplierListContact}>{contact}</span> : null}
                  <span className={ui.supplierListMobileMeta}>
                    {phone ? <span>{phone}</span> : null}
                    <span>{ordersLabel} {ordersWord} · {lastOrder}</span>
                    <span>Закуплено на {purchased}</span>
                  </span>
                </div>
                <span className={ui.supplierListCol} data-col="phone">{phone || '—'}</span>
                <span className={ui.supplierListCol} data-col="orders">{ordersLabel}</span>
                <span className={ui.supplierListCol} data-col="last">{lastOrder}</span>
                <span className={ui.supplierListCol} data-col="sum">{purchased}</span>
              </>
            }
            if (purchaseList && inventory && row) {
              const when = inventory.purchaseDateFieldId ? formatPurchaseDate(cell(row, inventory.purchaseDateFieldId) || String(row.values[inventory.purchaseDateFieldId] ?? '')) : ''
              const number = inventory.purchaseNumberFieldId ? cell(row, inventory.purchaseNumberFieldId) || String(row.values[inventory.purchaseNumberFieldId] ?? '') : ''
              const supplier = inventory.purchaseSupplierFieldId ? cell(row, inventory.purchaseSupplierFieldId) : ''
              const warehouse = inventory.purchaseWarehouseFieldId ? cell(row, inventory.purchaseWarehouseFieldId) : ''
              const statusLabel = inventory.purchaseStatusFieldId ? cell(row, inventory.purchaseStatusFieldId) : ''
              const totalRaw = inventory.purchaseTotalFieldId ? row.values[inventory.purchaseTotalFieldId] : null
              const amount = typeof totalRaw === 'number' && Number.isFinite(totalRaw)
                ? purchaseMoney(totalRaw)
                : inventory.purchaseTotalFieldId ? cell(row, inventory.purchaseTotalFieldId) : ''
              const countRaw = inventory.purchaseCountFieldId ? Number(row.values[inventory.purchaseCountFieldId]) : NaN
              const countLabel = Number.isFinite(countRaw) ? `${countRaw}` : ''
              const lineIds = inventory.purchaseLinesFieldId
                ? (Array.isArray(row.values[inventory.purchaseLinesFieldId])
                  ? (row.values[inventory.purchaseLinesFieldId] as unknown[]).filter((id): id is string => typeof id === 'string')
                  : [])
                : []
              return <>
                <PurchaseOrderThumbs lineIds={lineIds} inventory={inventory} />
                <div className={ui.purchaseListCopy}>
                  <strong>{number || '—'}</strong>
                  <span className={ui.purchaseListDate}>{when || '—'}</span>
                  <span className={ui.purchaseListMobileMeta}>
                    {!supplierOrdersList && supplier ? <span>{supplier}</span> : null}
                    {(warehouse || countLabel) ? <span>{[warehouse, countLabel && `${countLabel} поз.`].filter(Boolean).join(' · ')}</span> : null}
                  </span>
                </div>
                {!supplierOrdersList ? <span className={ui.purchaseListCol} data-col="supplier">{supplier || '—'}</span> : null}
                <span className={ui.purchaseListCol} data-col="count">{countLabel || '—'}</span>
                <span className={ui.purchaseListCol} data-col="warehouse">{warehouse || '—'}</span>
                {statusLabel ? <span className={ui.statusBadge} data-tone={builderV2StatusTone(statusLabel)}>{statusLabel}</span> : <span />}
                <span className={ui.purchaseListAmount}>{amount || '—'}</span>
              </>
            }
            if (countList && inventory && row) {
              const when = inventory.countDateFieldId ? formatPurchaseDate(cell(row, inventory.countDateFieldId) || String(row.values[inventory.countDateFieldId] ?? '')) : ''
              const number = inventory.countNumberFieldId ? cell(row, inventory.countNumberFieldId) || String(row.values[inventory.countNumberFieldId] ?? '') : ''
              const warehouse = inventory.countWarehouseFieldId ? cell(row, inventory.countWarehouseFieldId) : ''
              const author = inventory.countAuthorFieldId
                ? formatInventoryAuthor(cell(row, inventory.countAuthorFieldId) || String(row.values[inventory.countAuthorFieldId] ?? ''))
                : ''
              const statusLabel = inventory.countStatusFieldId ? cell(row, inventory.countStatusFieldId) : ''
              const productsRaw = inventory.countProductCountFieldId ? Number(row.values[inventory.countProductCountFieldId]) : NaN
              const products = Number.isFinite(productsRaw) ? String(Math.trunc(productsRaw)) : inventory.countProductCountFieldId ? cell(row, inventory.countProductCountFieldId) : ''
              const discrepancyRaw = inventory.countDiscrepancyCountFieldId ? Number(row.values[inventory.countDiscrepancyCountFieldId]) : NaN
              const discrepancy = Number.isFinite(discrepancyRaw) ? String(Math.trunc(discrepancyRaw)) : inventory.countDiscrepancyCountFieldId ? cell(row, inventory.countDiscrepancyCountFieldId) : ''
              const shortageRaw = inventory.countShortageFieldId ? Number(row.values[inventory.countShortageFieldId]) : NaN
              const surplusRaw = inventory.countSurplusFieldId ? Number(row.values[inventory.countSurplusFieldId]) : NaN
              const shortage = Number.isFinite(shortageRaw) && shortageRaw > 0 ? shortageRaw : 0
              const surplus = Number.isFinite(surplusRaw) && surplusRaw > 0 ? surplusRaw : 0
              const amountParts = [
                ...(shortage ? [`−${purchaseMoney(shortage)}`] : []),
                ...(surplus ? [`+${purchaseMoney(surplus)}`] : []),
              ]
              const amount = amountParts.length ? amountParts.join(' / ') : '—'
              return <>
                <div className={ui.purchaseListCopy}>
                  <strong>{number || '—'}</strong>
                  <span className={ui.purchaseListDate}>{when || '—'}</span>
                  <span className={ui.purchaseListMobileMeta}>
                    {warehouse ? <span>{warehouse}</span> : null}
                    {(author || products) ? <span>{[author, products && `${products}\u00a0тов.`].filter(Boolean).join(' · ')}</span> : null}
                  </span>
                </div>
                <span className={ui.purchaseListCol} data-col="warehouse">{warehouse || '—'}</span>
                <span className={ui.purchaseListCol} data-col="author">{author || '—'}</span>
                <span className={ui.purchaseListCol} data-col="products">{products || '—'}</span>
                <span className={ui.purchaseListCol} data-col="discrepancy">{discrepancy || '0'}</span>
                {statusLabel ? <span className={ui.statusBadge} data-tone={builderV2StatusTone(statusLabel)}>{statusLabel}</span> : <span />}
                <span className={ui.purchaseListAmount}>{amount}</span>
              </>
            }
            if (countLineList && inventory && row) {
              const productRaw = inventory.countLineProductFieldId ? row.values[inventory.countLineProductFieldId] : undefined
              const productId = typeof productRaw === 'string' ? productRaw : Array.isArray(productRaw) ? productRaw.find((id): id is string => typeof id === 'string') : undefined
              const system = inventory.countLineSystemFieldId ? cell(row, inventory.countLineSystemFieldId) : ''
              const actual = inventory.countLineActualFieldId ? cell(row, inventory.countLineActualFieldId) : ''
              const diffRaw = inventory.countLineDiffFieldId ? Number(row.values[inventory.countLineDiffFieldId]) : NaN
              const diffLabel = Number.isFinite(diffRaw) ? `${diffRaw > 0 ? '+' : ''}${diffRaw}` : inventory.countLineDiffFieldId ? cell(row, inventory.countLineDiffFieldId) : ''
              const amountRaw = inventory.countLineAmountFieldId ? Number(row.values[inventory.countLineAmountFieldId]) : NaN
              const amountLabel = Number.isFinite(amountRaw) && amountRaw !== 0
                ? `${amountRaw > 0 ? '+' : '−'}${purchaseMoney(Math.abs(amountRaw))}`
                : Number.isFinite(amountRaw) ? '—' : inventory.countLineAmountFieldId ? cell(row, inventory.countLineAmountFieldId) : '—'
              const tone = Number.isFinite(diffRaw) ? (diffRaw < 0 ? 'rose' : diffRaw > 0 ? 'mint' : undefined) : undefined
              return <>
                <InventoryRelatedThumb itemId={productId} inventory={inventory} label={label} size="journal" />
                <div className={ui.purchaseLineCopy}>
                  <strong>{label}</strong>
                  <span className={ui.purchaseLineMeta}>
                    <span>Учёт {system || '—'} · факт {actual || '—'}</span>
                    {diffLabel && diffLabel !== '0' ? <span className={ui.countDiffBadge} data-tone={tone}>{diffLabel}</span> : null}
                  </span>
                </div>
                <span className={ui.countLineCol} data-col="system">{system || '—'}</span>
                <span className={ui.countLineCol} data-col="actual">{actual || '—'}</span>
                <span className={ui.countLineCol} data-col="diff" data-tone={tone}>{diffLabel || '—'}</span>
                <span className={ui.countLineCol} data-col="amount" data-tone={tone}>{amountLabel}</span>
              </>
            }
            if (purchaseLineList && inventory && row) {
              const productRaw = inventory.lineProductFieldId ? row.values[inventory.lineProductFieldId] : undefined
              const productId = typeof productRaw === 'string' ? productRaw : Array.isArray(productRaw) ? productRaw.find((id): id is string => typeof id === 'string') : undefined
              const qty = inventory.lineQtyFieldId ? cell(row, inventory.lineQtyFieldId) : ''
              const priceRaw = inventory.linePriceFieldId ? row.values[inventory.linePriceFieldId] : null
              const price = typeof priceRaw === 'number' && Number.isFinite(priceRaw) ? purchaseMoney(priceRaw) : inventory.linePriceFieldId ? cell(row, inventory.linePriceFieldId) : ''
              const sumRaw = inventory.lineTotalFieldId ? row.values[inventory.lineTotalFieldId] : null
              const qtyNum = inventory.lineQtyFieldId ? Number(row.values[inventory.lineQtyFieldId]) : NaN
              const sumNumber = typeof sumRaw === 'number' && Number.isFinite(sumRaw)
                ? sumRaw
                : Number.isFinite(qtyNum) && typeof priceRaw === 'number' && Number.isFinite(priceRaw) ? qtyNum * priceRaw : null
              const sum = sumNumber != null ? purchaseMoney(sumNumber) : '—'
              return <>
                <InventoryRelatedThumb itemId={productId} inventory={inventory} label={label} size="journal" />
                <div className={ui.purchaseLineCopy}>
                  <strong>{label}</strong>
                  <span className={ui.purchaseLineMeta}>
                    <span>{[qty && `${qty} шт.`, price].filter(Boolean).join(' × ')}</span>
                    <span className={ui.purchaseLineAmountMobile}>{sum}</span>
                  </span>
                </div>
                <span className={ui.purchaseListAmount}>{sum}</span>
              </>
            }
            if (inventoryStockList && inventory && row) {
              const category = cell(row, inventory.itemCategoryFieldId) || '—'
              const warehouse = cell(row, inventory.itemWarehouseFieldId) || '—'
              const stockNum = Number(row.values[inventory.itemStockFieldId])
              const minNum = Number(row.values[inventory.itemMinFieldId])
              const costNum = Number(row.values[inventory.itemCostFieldId])
              const unit = unitOf(row)
              const stockLabel = Number.isFinite(stockNum) ? `${stockNum} ${unit}` : ''
              const stockVsMin = Number.isFinite(stockNum) && Number.isFinite(minNum) ? `из мин. ${minNum}` : ''
              const minRatio = Number.isFinite(stockNum) && Number.isFinite(minNum) && minNum > 0
                ? Math.max(0, Math.min(1, stockNum / minNum))
                : null
              const minBar = minRatio !== null
                ? <span className={ui.stockMinBar} data-low={lowBadge || undefined} aria-hidden="true"><i style={{ width: `${Math.round(minRatio * 100)}%` }} /></span>
                : null
              const costLabel = Number.isFinite(costNum) ? purchaseMoney(costNum) : inventory.itemCostFieldId ? cell(row, inventory.itemCostFieldId) : ''
              const lineValue = Number.isFinite(stockNum) && Number.isFinite(costNum) ? purchaseMoney(stockNum * costNum) : ''
              return <>
                <InventoryProductThumb image={image} size="list" label={label} />
                <div className={ui.recordStockCopy}>
                  <strong>{label}</strong>
                  <span className={ui.recordSkuLine}>
                    {subtitleValue ? <span>{subtitleValue}</span> : null}
                    {lowBadge}
                  </span>
                  <span className={ui.recordStockMobileMeta}>
                    <span className={ui.recordStockMobileLine}>{category} · {warehouse}</span>
                    {stockLabel ? <span className={ui.recordStockMobileStock}>{minBar}<span>{stockLabel} {stockVsMin}</span></span> : null}
                    {lineValue ? <span>{lineValue}</span> : null}
                  </span>
                </div>
                <span className={ui.recordStockCol} data-col="category">{category}</span>
                <span className={ui.recordStockCol} data-col="warehouse">{warehouse}</span>
                <span className={ui.recordStockCol} data-col="stock">
                  {stockLabel ? <><strong>{stockLabel}</strong>{stockVsMin ? <span>{stockVsMin}</span> : null}{minBar}</> : '—'}
                </span>
                <span className={ui.recordStockCol} data-col="cost">{costLabel || ''}</span>
                <span className={ui.recordStockCol} data-col="value">{lineValue || ''}</span>
              </>
            }
            if (inventoryJournalList && inventory) {
              const itemRaw = row ? row.values[inventory.movementItemFieldId] : undefined
              const itemId = typeof itemRaw === 'string' ? itemRaw
                : Array.isArray(itemRaw) ? itemRaw.find((id): id is string => typeof id === 'string') : undefined
              return <>
                <InventoryRelatedThumb itemId={itemId} inventory={inventory} label={label} size="journal" />
                <div className={ui.recordJournalCopy}>
                  <strong>{label}</strong>
                  <span className={ui.recordJournalMeta}>
                    {subtitleValue ? <span className={ui.statusBadge} data-tone={builderV2StatusTone(subtitleValue)}>{subtitleValue}</span> : null}
                    {(journalWarehouse || journalWhen) ? <span className={ui.journalMetaPrimary}>
                      {journalWarehouse ? <span className={ui.journalUnit}>{journalWarehouse}</span> : null}
                      {journalWarehouse && journalWhen ? <span className={ui.journalSep} aria-hidden="true"> · </span> : null}
                      {journalWhen ? <span className={ui.journalUnit}>{journalWhen}</span> : null}
                    </span> : null}
                    {journalAuthor ? <span className={ui.journalAuthor}>{journalAuthor}</span> : null}
                  </span>
                </div>
                {detailNode}
              </>
            }
            return <>
              {cardLayout && <span className={catalog ? presentation.photo : ui.catalogPhoto} data-illustrated={Boolean(image)} aria-hidden="true">
                {image ? <BuilderV2Picture item={image} /> : <BuilderV2RecordAvatar id={row?.id ?? node.id} name={row && label !== 'Без названия' ? label : undefined} icon={catalog ? 'box' : 'apps'} />}
              </span>}
              <strong>{label}</strong>
              {time(row) && <small>{time(row)}</small>}
              {subtitleValue && node.subtitleFieldId !== node.dateFieldId && (statusSubtitle
                ? <span className={ui.recordMeta}>
                  <span className={ui.statusBadge} data-tone={builderV2StatusTone(subtitleValue)}>{subtitleValue}</span>
                  {detailNode ? detailNode : null}
                </span>
                : <small data-money={moneySubtitle || undefined}>{subtitleValue}</small>)}
              {detailNode && (!statusSubtitle) && (cardLayout || !subtitleValue || inventory) ? detailNode : null}
              {summary && <span className={ui.recordSummary}><span>Позиций: {summary.count}</span>{total && <strong>{total}</strong>}</span>}
            </>
          }
          const timelineItem = (row: AppV2Record) => {
            const when = node.dateFieldId ? cell(row, node.dateFieldId) : ''
            if (inventoryHistory && inventory) {
              const type = cell(row, inventory.movementTypeFieldId) || cell(row, node.titleFieldId) || 'Операция'
              const qty = Number(row.values[inventory.movementQtyFieldId])
              const qtyLabel = Number.isFinite(qty) ? `${qty > 0 ? '+' : ''}${qty} шт.` : ''
              const warehouse = cell(row, inventory.movementWarehouseFieldId)
              const author = formatInventoryAuthor(cell(row, inventory.movementAuthorFieldId))
              return <li key={row.id} className={ui.timelineItem}>
                <time className={ui.timelineDate}>{when || 'Без даты'}</time>
                <div className={ui.timelineBody}>
                  <p className={ui.timelineText}>{[type, qtyLabel].filter(Boolean).join(' ')}</p>
                  {(warehouse || author) && <p className={ui.timelineMeta}>{[warehouse, author].filter(Boolean).join(' · ')}</p>}
                </div>
              </li>
            }
            const text = cell(row, node.titleFieldId) || '—'
            const meta = node.subtitleFieldId ? cell(row, node.subtitleFieldId) : ''
            const detail = node.cardDetailFieldId ? cell(row, node.cardDetailFieldId) : ''
            const detailLabel = inventory ? (detail ? `${detail} шт.` : '') : detail ? `Следующий контакт: ${detail}` : ''
            return <li key={row.id} className={ui.timelineItem}>
              <time className={ui.timelineDate}>{when || 'Без даты'}</time>
              <div className={ui.timelineBody}>
                <p className={ui.timelineText}>{text}</p>
                {(meta || detailLabel) && <p className={ui.timelineMeta}>{[meta, detailLabel].filter(Boolean).join(' · ')}</p>}
              </div>
            </li>
          }
          const actionRow = (row:AppV2Record,as:'div'|'tr') => <CollectionActionRow key={row.id} appId={props.app.id} nodeId={node.id} screenId={props.screenId} recordId={props.record?.id} itemId={row.id} title={cell(row,node.titleFieldId)} actionName={rowAction!.name} as={as} whole={!node.itemIds.length&&as!=='tr'} content={!node.itemIds.length?(as==='tr'?cell(row,node.titleFieldId):<>{item(row)}<ProtoIcon name="arrow" size={16}/></>):undefined}>{control=>as==='tr'?node.itemIds.length?<td colSpan={subtitle?2:1}>{item(row)}{control}</td>:<><td>{control}</td>{subtitle&&<td>{cell(row,node.subtitleFieldId!)}</td>}</>:node.itemIds.length?<>{item(row)}{control}</>:control}</CollectionActionRow>
          const showHeading = !useShell && !['calendar','kanban'].includes(node.layout) && (props.editing || (screen?.name !== node.name && !(inventoryJournalList && screen?.id === inventory?.movementsScreenId) && !(countList && screen?.id === inventory?.countsScreenId)))
          const GroupHeading = showHeading ? 'h3' : 'h2'
          const groups = new Map<string, { label?: string; rows: AppV2Record[] }>()
          for (const row of rows ?? []) {
            const group = (row as BuilderV2DataRecord).group
            const key = group?.key ?? 'all'
            const bucket = groups.get(key) ?? { label: group?.label, rows: [] }
            bucket.rows.push(row)
            groups.set(key, bucket)
          }
          const cols = subtitle ? 2 : 1
          const openRecord = (row: AppV2Record) => cardScreen && <button type="button" className={ui.recordLink} onClick={() => open(row)}>Открыть запись</button>
          const tableRow = (row: AppV2Record) => rowAction ? actionRow(row, 'tr') : <tr key={row.id}>
            {node.itemIds.length ? <td colSpan={cols}>{item(row)}{openRecord(row)}</td> : <>
              <td>{cardScreen ? <button type="button" className={ui.recordLink} onClick={() => open(row)}>{cell(row, node.titleFieldId)}</button> : cell(row, node.titleFieldId)}</td>
              {subtitle && <td>{cell(row, node.subtitleFieldId!)}</td>}
            </>}
          </tr>
          const listRow = (row: AppV2Record) => {
            const defaultCard = !node.itemIds.length && (cardScreen || props.editing && cardTarget || cardLayout || compact)
            const RecordControl = cardScreen ? 'button' : 'div'
            const lowStock = Boolean(inventoryStockList && row.values[inventory!.itemLowFieldId] === true)
            const countLineDiff = countLineList && inventory?.countLineDiffFieldId
              ? Number(row.values[inventory.countLineDiffFieldId])
              : NaN
            const countLineMismatch = Number.isFinite(countLineDiff) && countLineDiff !== 0
            const body = rowAction ? actionRow(row, 'div') : <div key={row.id} className={catalog ? `${ui.row} ${presentation.catalogCard}` : ui.row} data-low={lowStock || undefined} data-diff={countLineMismatch || undefined}>
              {defaultCard ? <RecordControl className={ui.recordButton} data-compact={compact || undefined} data-status={(statusSubtitle && !inventoryStockList && !inventoryJournalList && !purchaseList && !countList && !supplierList && !shopOrdersList) || undefined} data-stock={inventoryStockList || undefined} data-journal={inventoryJournalList || undefined} data-purchase={purchaseList || shopOrdersList || undefined} data-purchase-line={purchaseLineList || undefined} data-count-line={countLineList || undefined} data-count={countList || undefined} data-supplier={supplierList || undefined} data-supplier-orders={supplierOrdersList || undefined} data-shop-orders={shopOrdersList || undefined} data-clients={clientList || undefined} data-low={lowStock || undefined} data-diff={countLineMismatch || undefined} {...(cardScreen ? { type: 'button' as const, onClick: () => open(row) } : {})}>
                {compact && !inventoryStockList && !inventoryJournalList && !purchaseList && !purchaseLineList && !countList && !countLineList && !supplierList && !shopOrdersList && !clientList && !(statusSubtitle) && <BuilderV2RecordAvatar id={row.id} name={orders || clientList ? undefined : contacts ? undefined : cell(row, node.titleFieldId)} icon={orders || shopOrdersList ? 'receipt' : clientList ? 'building' : contacts ? 'users' : inventory ? 'box' : 'list'} tone forceIcon={Boolean(orders || clientList || contacts)} />}
                {item(row)}
                {!catalog && !inventoryStockList && !inventoryJournalList && !purchaseList && !purchaseLineList && !countList && !countLineList && !clientList && !supplierList && (cardScreen || props.editing && cardTarget) && <ProtoIcon name="arrow" size={16} />}
              </RecordControl> : <>{item(row)}{openRecord(row)}</>}
            </div>
            return node.layout === 'kanban' ? <BoardMoveRow key={row.id} row={row as BuilderV2DataRecord} label={cell(row, node.titleFieldId)}>{body}</BoardMoveRow> : body
          }
          const rowsClass = catalog ? `${ui.catalogRows} ${presentation.catalogGrid}` : cardLayout ? ui.cards : timeline ? ui.timelineList : node.layout === 'list' && !rowAction ? (node.recordGroup ? ui.groupedRecords : ui.plainList) : styles.collectionRows
          const inventoryList = Boolean((inventoryStockList || inventoryJournalList || purchaseList || countList || supplierList || shopOrdersList || clientList) && !node.recordGroup)
          const typeChoices = inventoryJournalList && inventory
            ? (table?.fields.find(field => field.id === inventory.movementTypeFieldId)?.choices ?? [])
              .filter(choice => ['Приход', 'Расход', 'Списание', 'Перемещение'].includes(choice.name))
            : []
          const renderListGroups = (listRows: readonly AppV2Record[]) => {
            const buckets = new Map<string, { label?: string; rows: AppV2Record[] }>()
            for (const row of listRows) {
              const group = (row as BuilderV2DataRecord).group
              const key = group?.key ?? 'all'
              const bucket = buckets.get(key) ?? { label: group?.label, rows: [] }
              bucket.rows.push(row)
              buckets.set(key, bucket)
            }
            const stockHeader = inventoryStockList && !node.recordGroup
              ? <div className={ui.stockListHeader} aria-hidden="true">
                <span />
                <span>Товар</span>
                <span>Категория</span>
                <span>Склад</span>
                <span>Остаток</span>
                <span className={ui.stockListMoney}>Себестоимость</span>
                <span className={ui.stockListMoney}>Стоимость</span>
              </div>
              : null
            const shopOrdersHeader = shopOrdersList && !node.recordGroup
              ? <div className={ui.shopOrdersListHeader} aria-hidden="true">
                <span />
                <span>Заказ</span>
                <span>Клиент</span>
                <span>Дата</span>
                <span>Статус</span>
                <span>Сумма</span>
              </div>
              : null
            const clientHeader = clientList && !node.recordGroup
              ? <div className={ui.clientListHeader} aria-hidden="true">
                <span />
                <span>Клиент</span>
                <span>Контакт</span>
                <span>Телефон</span>
                <span>Сделок</span>
                <span>Сумма</span>
                <span>Последний контакт</span>
              </div>
              : null
            const purchaseHeader = purchaseList && !node.recordGroup
              ? <div className={ui.purchaseListHeader} data-supplier-orders={supplierOrdersList || undefined} aria-hidden="true">
                <span />
                <span>№/Дата</span>
                {!supplierOrdersList ? <span>Поставщик</span> : null}
                <span>Позиции</span>
                <span>Склад</span>
                <span>Статус</span>
                <span>Сумма</span>
              </div>
              : null
            const countHeader = countList && !node.recordGroup
              ? <div className={ui.countListHeader} aria-hidden="true">
                <span>№/Дата</span>
                <span>Склад</span>
                <span>Автор</span>
                <span>Товаров</span>
                <span>Расхождений</span>
                <span>Статус</span>
                <span>Недостача/излишек</span>
              </div>
              : null
            const countLineHeader = countLineList && !node.recordGroup
              ? <div className={ui.countLineListHeader} aria-hidden="true">
                <span />
                <span>Товар</span>
                <span>Учёт</span>
                <span>Факт</span>
                <span>Разница</span>
                <span>Сумма разницы</span>
              </div>
              : null
            const supplierHeader = supplierList && !node.recordGroup
              ? <div className={ui.supplierListHeader} aria-hidden="true">
                <span>Поставщик</span>
                <span>Телефон</span>
                <span>Заказов</span>
                <span>Последний заказ</span>
                <span>Закуплено на</span>
              </div>
              : null
            return [...buckets].map(([key, group]) => <div key={key} className={group.label ? ui.listGroup : undefined}>
              {group.label && <GroupHeading className={ui.listGroupHeading}>{group.label}</GroupHeading>}
              <div className={rowsClass} data-inventory={inventoryList || countLineList || undefined} data-stock={inventoryStockList || undefined} data-purchase={purchaseList || undefined} data-count={countList || undefined} data-count-line={countLineList || undefined} data-supplier={supplierList || undefined} data-supplier-orders={supplierOrdersList || undefined} data-shop-orders={shopOrdersList || undefined} data-clients={clientList || undefined}>
                {stockHeader}
                {shopOrdersHeader}
                {clientHeader}
                {purchaseHeader}
                {countHeader}
                {countLineHeader}
                {supplierHeader}
                {group.rows.map(listRow)}
              </div>
            </div>)
          }
          const collection = node.layout === 'table' ? <div className={ui.tableScroll}><table className={ui.table} aria-label={node.name}>
            <thead><tr><th scope="col">{title}</th>{subtitle && <th scope="col">{subtitle}</th>}</tr></thead>
            {rows ? [...groups].map(([key, group]) => <tbody key={key}>
              {group.label && <tr><th className={ui.tableGroupHeading} scope="rowgroup" colSpan={cols}>{group.label}</th></tr>}{group.rows.map(tableRow)}
            </tbody>) : <tbody><tr><td colSpan={cols}>{node.itemIds.length ? render(node.itemIds) : <span className={ui.hint}>Здесь будут записи из этой таблицы</span>}</td></tr></tbody>}
          </table></div> : timeline ? (rows
            ? <ol className={ui.timelineList} aria-label={node.name}>{rows.map(timelineItem)}</ol>
            : <div className={ui.placeholder}><span>Здесь появится хронология записей</span></div>)
          : rows ? (inventoryJournalList && inventory && typeChoices.length && !useShell
            ? <InventoryJournalRows rows={rows} typeFieldId={inventory.movementTypeFieldId} choices={typeChoices} renderRows={renderListGroups} />
            : countLineList && inventory
              ? <CountDiscrepancyRows rows={rows} diffFieldId={inventory.countLineDiffFieldId} renderRows={renderListGroups} />
              : renderListGroups(rows))
          : <div className={rowsClass}>
            {Array.from({ length: cardLayout && !node.itemIds.length ? 2 : 1 }, (_, index) => <div key={index} className={ui.placeholder}>{item()}<span>Здесь будут записи из этой таблицы</span></div>)}
          </div>
          const searching = Boolean((page as { search?: string } | undefined)?.search?.trim())
          const clearSearch = (page as { clearSearch?: () => void } | undefined)?.clearSearch
          const emptyCopy = (() => {
            if (node.layout === 'calendar') return page?.calendar?.month === 'undated' ? 'Записей без даты нет' : 'На этот день записей нет'
            if (node.layout === 'kanban') return 'В этой колонке записей нет'
            if (timeline) return inventoryHistory ? 'Операций по этому товару пока нет' : 'Записей в истории пока нет'
            if (catalog) return 'В каталоге пока ничего нет'
            if (inventoryStockList) return null
            if (inventoryJournalList) return null
            if (purchaseList) return null
            if (countList) return null
            return 'Нет доступных записей'
          })()
          const emptyState = rows?.length === 0 ? (
            searching ? <div className={ui.collectionEmpty}>
              <p>Ничего не найдено</p>
              {clearSearch && <button type="button" className={styles.secondary} onClick={clearSearch}>Сбросить поиск</button>}
            </div>
            : inventoryStockList ? <div className={ui.collectionEmpty} data-centered>
              <ProtoIcon name="box" size={28} />
              <strong>Товаров пока нет</strong>
              <p>Добавьте первую позицию, чтобы вести остатки.</p>
              {!useShell && inventoryListToolbar}
            </div>
            : inventoryJournalList ? <div className={ui.collectionEmpty} data-centered>
              <ProtoIcon name="list" size={28} />
              <strong>Операций пока нет</strong>
              <p>Оформите приход, расход или перемещение — журнал заполнится сам.</p>
              {!useShell && inventoryListToolbar}
            </div>
            : purchaseList ? <div className={ui.collectionEmpty} data-centered>
              <ProtoIcon name="clipboard" size={28} />
              <strong>Заказов пока нет</strong>
              <p>Создайте заказ поставщику и примите его на склад, когда товар приедет.</p>
              {!useShell && inventoryListToolbar}
            </div>
            : countList ? <div className={ui.collectionEmpty} data-centered>
              <ProtoIcon name="list" size={28} />
              <strong>Инвентаризаций пока нет</strong>
              <p>Создайте пересчёт склада и внесите фактические остатки.</p>
              {!useShell && inventoryListToolbar}
            </div>
            : <p className={ui.hint}>{emptyCopy}</p>
          ) : null
          body = <div className={`${styles.collection} ${catalog ? presentation.catalog : cardLayout ? ui.cardCollection : timeline ? `${presentation.panel} ${ui.timelineCollection}` : ''} ${id === lines?.id ? `${presentation.panel} ${ui.orderLines}` : ''}`} data-catalog={catalog || undefined} data-tiles={node.layout === 'tiles' || undefined} data-timeline={timeline || undefined} data-in-shell={useShell || undefined}>
            {showHeading && <div className={styles.collectionHeading}><h2 className={presentation.sectionTitle}>{node.name}</h2>{props.editing && table?.name !== node.name && <span>{table?.name ?? 'Таблица удалена'}</span>}</div>}
            {emptyState ?? collection}
            {props.editing && node.layout!=='kanban' && <button type="button" className={styles.addInside} onClick={() => props.onAdd?.(node.id)}><ProtoIcon name="plus" />{catalog?'Добавить элемент карточки':timeline?'Настроить запись ленты':'Настроить строку списка'}</button>}
          </div>
        }
        return body
        }}</BuilderV2DataNode>
        if(node.type==='collection'&&node.layout==='kanban'&&props.editing)content=<>{content}<button type="button" className={styles.addInside} onClick={()=>props.onAdd?.(node.id)}><ProtoIcon name="plus"/>Настроить строку списка</button></>
      }
      const container = 'childIds' in node || node.type === 'collection'
      return <section key={id} className={styles.canvasBlock} data-kind={node.type} data-selected={props.editing && props.selectedId === id} data-editing={props.editing}>
        {props.editing && <button type="button" className={container ? styles.groupPick : styles.blockPick} aria-label={`Выбрать элемент «${node.name}»`} onClick={() => props.onSelect?.(id)}><span>{NODE_KINDS[node.type][0]}</span></button>}{content}
      </section>
    })
  }
  if (!props.editing && inventory?.reorderScreenId && screen?.id === inventory.reorderScreenId) {
    const reorderForm = inventory.reorderFormId ? nodes.get(inventory.reorderFormId) : undefined
    return <div className={`${styles.canvasBlocks} ${ui.reorderScreen}`}>
      <header className={ui.reorderScreenHead}>
        <h2 className={ui.purchaseCardTitle}>Что заказать</h2>
        <p className={ui.purchaseComment}>Товары с остатком ниже минимума</p>
      </header>
      {reorderForm?.type === 'form' && visible(reorderForm) ? render([reorderForm.id]) : null}
    </div>
  }
  if (!props.editing && inventory?.countScreenId && screen?.id === inventory.countScreenId && props.record) {
    const countRecord = props.record
    const number = inventory.countNumberFieldId
      ? cell(countRecord, inventory.countNumberFieldId) || String(countRecord.values[inventory.countNumberFieldId] ?? '')
      : ''
    const status = inventory.countStatusFieldId ? cell(countRecord, inventory.countStatusFieldId) : ''
    const draft = Boolean(inventory.countStatusDraft && inventory.countStatusFieldId
      && countRecord.values[inventory.countStatusFieldId] === inventory.countStatusDraft)
    const when = inventory.countDateFieldId
      ? formatPurchaseDate(cell(countRecord, inventory.countDateFieldId) || String(countRecord.values[inventory.countDateFieldId] ?? ''))
      : ''
    const warehouse = inventory.countWarehouseFieldId ? cell(countRecord, inventory.countWarehouseFieldId) : ''
    const author = inventory.countAuthorFieldId
      ? formatInventoryAuthor(cell(countRecord, inventory.countAuthorFieldId) || String(countRecord.values[inventory.countAuthorFieldId] ?? ''))
      : ''
    const productCount = inventory.countProductCountFieldId ? cell(countRecord, inventory.countProductCountFieldId) : ''
    const discrepancyRaw = inventory.countDiscrepancyCountFieldId ? Number(countRecord.values[inventory.countDiscrepancyCountFieldId]) : NaN
    const discrepancy = Number.isFinite(discrepancyRaw) ? String(Math.trunc(discrepancyRaw)) : inventory.countDiscrepancyCountFieldId ? cell(countRecord, inventory.countDiscrepancyCountFieldId) : ''
    const shortageRaw = inventory.countShortageFieldId ? countRecord.values[inventory.countShortageFieldId] : null
    const surplusRaw = inventory.countSurplusFieldId ? countRecord.values[inventory.countSurplusFieldId] : null
    const shortageNum = typeof shortageRaw === 'number' && Number.isFinite(shortageRaw) ? shortageRaw : NaN
    const surplusNum = typeof surplusRaw === 'number' && Number.isFinite(surplusRaw) ? surplusRaw : NaN
    const shortage = Number.isFinite(shortageNum) && shortageNum > 0 ? purchaseMoney(shortageNum) : ''
    const surplus = Number.isFinite(surplusNum) && surplusNum > 0 ? purchaseMoney(surplusNum) : ''
    const linesId = rootIds.find(id => nodes.get(id)?.type === 'collection')
    const editFormId = rootIds.find(id => nodes.get(id)?.type === 'form' && visible(nodes.get(id)!))
    const actionButtons = rootIds.flatMap(id => {
      const node = nodes.get(id)
      return node?.type === 'button' && visible(node) ? [node] : []
    })
    const primaryAction = actionButtons.find(node => node.variant === 'primary')
    const secondaryActions = actionButtons.filter(node => node !== primaryAction)
    const history = ([
      { key: 'created', label: 'Создана', atId: inventory.countCreatedAtFieldId, byId: inventory.countCreatedByFieldId },
      { key: 'posted', label: 'Проведена', atId: inventory.countPostedAtFieldId, byId: inventory.countPostedByFieldId },
      { key: 'cancelled', label: 'Отменена', atId: inventory.countCancelledAtFieldId, byId: inventory.countCancelledByFieldId },
    ] as const).flatMap(item => {
      if (!item.atId) return []
      const rawAt = String(countRecord.values[item.atId] ?? '')
      const at = formatPurchaseDate(rawAt) || rawAt
      if (!at) return []
      const byRaw = item.byId ? String(countRecord.values[item.byId] ?? '') : ''
      const by = formatInventoryAuthor(byRaw) || byRaw
      return [{ ...item, at, by }]
    })
    // Draft: facts edit inline via CountLinesEditor — keep «Сохранить», hide «Изменить» dialog.
    const hasActions = Boolean((!draft && editFormId) || primaryAction || secondaryActions.length)
    const countTitle = number ? `Инвентаризация ${number}` : 'Инвентаризация'
    const countActions = hasActions ? <div className={ui.purchaseCardActions}>
      {primaryAction ? (published
        ? <PublishedV2Button node={primaryAction} screenId={props.screenId} recordId={countRecord.id} refreshOnSuccess buttonClassName={styles.primary} />
        : <button type="button" className={styles.primary} disabled>{primaryAction.label}</button>) : null}
      {!draft && editFormId ? render([editFormId]) : null}
      {secondaryActions.map(node => published
        ? <PublishedV2Button key={node.id} node={node} screenId={props.screenId} recordId={countRecord.id} refreshOnSuccess buttonClassName={node.variant === 'danger' ? styles.danger : styles.secondary} />
        : <button key={node.id} type="button" className={node.variant === 'danger' ? styles.danger : styles.secondary} disabled>{node.label}</button>)}
    </div> : null
    const countMetrics = [
      { key: 'products', value: productCount || '—', caption: 'Товаров' },
      { key: 'diff', value: discrepancy || '—', caption: 'Расхождений' },
      { key: 'shortage', value: shortage ? `−${shortage}` : '—', caption: 'Недостача', ...(shortage ? { tone: 'rose' as const } : {}) },
      { key: 'surplus', value: surplus ? `+${surplus}` : '—', caption: 'Излишек', ...(surplus ? { tone: 'mint' as const } : {}) },
    ]
    return <div className={`${styles.canvasBlocks} ${ui.purchaseCard} ${ui.countCard}`} data-draft={draft || undefined}>
      <DetailCardShell
        title={countTitle}
        subtitle={[warehouse, when].filter(Boolean).join(' · ') || undefined}
        badge={status ? <span className={ui.heroStatus} data-tone={builderV2StatusTone(status)}>{status}</span> : undefined}
        actions={countActions ? <div className={ui.purchaseCardActionsDesktop}>{countActions}</div> : undefined}
        stickyActions={countActions ? <div className={ui.purchaseCardActionsMobile}>{countActions}</div> : undefined}
        metrics={countMetrics}
      >
        {draft && editFormId
          ? <DetailSection title="Строки пересчёта"><div className={ui.countDraftPanel}>{render([editFormId])}</div></DetailSection>
          : linesId ? <DetailSection title="Строки пересчёта">{render([linesId])}</DetailSection> : null}
        {history.length ? <DetailSection title="История">
          <ul className={ui.purchaseHistory}>
            {history.map(item => <li key={item.key}><span>{item.label}</span><strong>{item.at}{item.by ? ` · ${item.by}` : ''}</strong></li>)}
          </ul>
        </DetailSection> : null}
      </DetailCardShell>
    </div>
  }
  if (!props.editing && inventory?.purchaseScreenId && screen?.id === inventory.purchaseScreenId && props.record) {
    const purchaseRecord = props.record
    const number = inventory.purchaseNumberFieldId
      ? cell(purchaseRecord, inventory.purchaseNumberFieldId) || String(purchaseRecord.values[inventory.purchaseNumberFieldId] ?? '')
      : ''
    const status = inventory.purchaseStatusFieldId ? cell(purchaseRecord, inventory.purchaseStatusFieldId) : ''
    const totalRaw = inventory.purchaseTotalFieldId ? purchaseRecord.values[inventory.purchaseTotalFieldId] : null
    const amount = typeof totalRaw === 'number' && Number.isFinite(totalRaw)
      ? purchaseMoney(totalRaw)
      : inventory.purchaseTotalFieldId ? cell(purchaseRecord, inventory.purchaseTotalFieldId) : ''
    const when = inventory.purchaseDateFieldId
      ? formatPurchaseDate(cell(purchaseRecord, inventory.purchaseDateFieldId) || String(purchaseRecord.values[inventory.purchaseDateFieldId] ?? ''))
      : ''
    const supplier = inventory.purchaseSupplierFieldId ? cell(purchaseRecord, inventory.purchaseSupplierFieldId) : ''
    const warehouse = inventory.purchaseWarehouseFieldId ? cell(purchaseRecord, inventory.purchaseWarehouseFieldId) : ''
    const comment = inventory.purchaseCommentFieldId ? cell(purchaseRecord, inventory.purchaseCommentFieldId) : ''
    const count = inventory.purchaseCountFieldId ? cell(purchaseRecord, inventory.purchaseCountFieldId) : ''
    const linesId = rootIds.find(id => nodes.get(id)?.type === 'collection')
    const editFormId = rootIds.find(id => nodes.get(id)?.type === 'form' && visible(nodes.get(id)!))
    const actionButtons = rootIds.flatMap(id => {
      const node = nodes.get(id)
      return node?.type === 'button' && visible(node) ? [node] : []
    })
    const primaryAction = actionButtons.find(node => node.variant === 'primary')
    const secondaryActions = actionButtons.filter(node => node !== primaryAction)
    const history = ([
      { key: 'created', label: 'Создан', atId: inventory.purchaseCreatedAtFieldId, byId: inventory.purchaseCreatedByFieldId },
      { key: 'ordered', label: 'Заказан', atId: inventory.purchaseOrderedAtFieldId, byId: inventory.purchaseOrderedByFieldId },
      { key: 'received', label: 'Получен', atId: inventory.purchaseReceivedAtFieldId, byId: inventory.purchaseReceivedByFieldId },
      { key: 'cancelled', label: 'Отменён', atId: inventory.purchaseCancelledAtFieldId, byId: inventory.purchaseCancelledByFieldId },
    ] as const).flatMap(item => {
      if (!item.atId) return []
      const rawAt = String(purchaseRecord.values[item.atId] ?? '')
      const at = formatPurchaseDate(rawAt) || rawAt
      if (!at) return []
      const byRaw = item.byId ? String(purchaseRecord.values[item.byId] ?? '') : ''
      const by = formatInventoryAuthor(byRaw) || byRaw
      return [{ ...item, at, by }]
    })
    const hasActions = Boolean(editFormId || primaryAction || secondaryActions.length)
    const purchaseTitle = [number && `Заказ ${number}`, supplier].filter(Boolean).join(' · ') || 'Заказ поставщику'
    const purchaseActions = hasActions ? <div className={ui.purchaseCardActions}>
      {primaryAction ? (published
        ? <PublishedV2Button node={primaryAction} screenId={props.screenId} recordId={purchaseRecord.id} refreshOnSuccess buttonClassName={styles.primary} />
        : <button type="button" className={styles.primary} disabled>{primaryAction.label}</button>) : null}
      {editFormId ? render([editFormId]) : null}
      {secondaryActions.map(node => published
        ? <PublishedV2Button key={node.id} node={node} screenId={props.screenId} recordId={purchaseRecord.id} refreshOnSuccess buttonClassName={styles.secondary} />
        : <button key={node.id} type="button" className={styles.secondary} disabled>{node.label}</button>)}
    </div> : null
    const purchaseMetrics = [
      { key: 'amount', value: amount || '—', caption: 'Сумма' },
      { key: 'count', value: count || '—', caption: 'Позиций' },
      { key: 'warehouse', value: warehouse || '—', caption: 'Склад' },
      { key: 'date', value: when || '—', caption: 'Дата' },
    ]
    return <div className={`${styles.canvasBlocks} ${ui.purchaseCard}`}>
      <DetailCardShell
        title={purchaseTitle}
        subtitle={when || undefined}
        badge={status ? <span className={ui.heroStatus} data-tone={builderV2StatusTone(status)}>{status}</span> : undefined}
        actions={purchaseActions ? <div className={ui.purchaseCardActionsDesktop}>{purchaseActions}</div> : undefined}
        stickyActions={purchaseActions ? <div className={ui.purchaseCardActionsMobile}>{purchaseActions}</div> : undefined}
        metrics={purchaseMetrics}
      >
        {comment ? <DetailSection><p className={ui.purchaseComment}>{comment}</p></DetailSection> : null}
        {linesId ? <DetailSection title="Позиции заказа">{render([linesId])}</DetailSection> : null}
        {history.length ? <DetailSection title="История">
          <ul className={ui.purchaseHistory}>
            {history.map(item => <li key={item.key}><span>{item.label}</span><strong>{item.at}{item.by ? ` · ${item.by}` : ''}</strong></li>)}
          </ul>
        </DetailSection> : null}
      </DetailCardShell>
    </div>
  }
  if (!props.editing && inventory?.supplierScreenId && screen?.id === inventory.supplierScreenId && props.record) {
    const supplierRecord = props.record
    const name = inventory.supplierNameFieldId ? cell(supplierRecord, inventory.supplierNameFieldId) : ''
    const contact = inventory.supplierContactFieldId ? cell(supplierRecord, inventory.supplierContactFieldId) : ''
    const phone = inventory.supplierPhoneFieldId ? cell(supplierRecord, inventory.supplierPhoneFieldId) : ''
    const comment = inventory.supplierCommentFieldId ? cell(supplierRecord, inventory.supplierCommentFieldId) : ''
    const phoneHref = inventory.supplierPhoneFieldId
      ? builderV2ContactHref('phone', supplierRecord.values[inventory.supplierPhoneFieldId] ?? phone)
      : undefined
    const stat = supplierStats.get(supplierRecord.id)
    const ordersCount = stat?.orders ?? 0
    const lastOrder = stat?.lastOrder ? formatPurchaseDate(stat.lastOrder) : '—'
    const purchased = stat && stat.purchased > 0 ? purchaseMoney(stat.purchased) : '—'
    const ordersId = rootIds.find(id => nodes.get(id)?.type === 'collection')
    const editFormId = rootIds.find(id => nodes.get(id)?.type === 'form' && visible(nodes.get(id)!))
    const createPurchaseForm = inventory.createPurchaseFormId ? nodes.get(inventory.createPurchaseFormId) : undefined
    const canCreatePurchase = Boolean(createPurchaseForm?.type === 'form' && visible(createPurchaseForm))
    const supplierActions = (canCreatePurchase || editFormId) ? <div className={ui.purchaseCardActions}>
      {canCreatePurchase && createPurchaseForm?.type === 'form' ? <InventoryCreateDialog
        label="Новый заказ"
        title="Новый заказ"
        submitLabel="Сохранить заказ"
        wide
        buttonClassName={styles.primary}
      >{render([createPurchaseForm.id], supplierRecord, createPurchaseForm.tableId)}</InventoryCreateDialog> : null}
      {editFormId ? render([editFormId]) : null}
    </div> : null
    const supplierMetrics = [
      { key: 'phone', value: phoneHref && phone ? <a className={ui.contactLink} href={phoneHref}>{phone}</a> : phone || '—', caption: 'Телефон' },
      { key: 'orders', value: String(ordersCount), caption: 'Заказов' },
      { key: 'last', value: lastOrder, caption: 'Последний заказ' },
      { key: 'sum', value: purchased, caption: 'Закуплено на' },
    ]
    return <div className={`${styles.canvasBlocks} ${ui.purchaseCard} ${ui.supplierCard}`}>
      <DetailCardShell
        media={<BuilderV2RecordAvatar id={supplierRecord.id} name={name} icon="truck" tone />}
        title={name || 'Поставщик'}
        subtitle={contact || undefined}
        actions={supplierActions ? <div className={ui.purchaseCardActionsDesktop}>{supplierActions}</div> : undefined}
        stickyActions={supplierActions ? <div className={ui.purchaseCardActionsMobile}>{supplierActions}</div> : undefined}
        metrics={supplierMetrics}
      >
        {comment ? <DetailSection><p className={ui.purchaseComment}>{comment}</p></DetailSection> : null}
        {ordersId ? <DetailSection title="Заказы поставщика">{render([ordersId])}</DetailSection> : null}
      </DetailCardShell>
    </div>
  }
  if (screen?.catalog) {
    const featured = new Set(Object.values(screen.catalog))
    const specs: string[] = [], blocks: string[] = []
    for (const id of rootIds) {
      const node = nodes.get(id)
      const bound = node && 'value' in node && (node.value.kind === 'row' || node.value.kind === 'screen_row') && node.value.fieldId
      if (!props.editing && bound && featured.has(bound) && (node.type === 'field' || node.type === 'heading' || node.type === 'gallery')) continue
      if (!props.editing && node?.type === 'field') specs.push(id)
      else blocks.push(id)
    }
    const attributes = render(specs)
    return <div className={`${styles.canvasBlocks} ${ui.catalogPage}`}>
      <BuilderV2CatalogDetail catalog={screen.catalog} record={props.record} table={props.tables.find(table => table.id === screen.contextTableId)} slug={published?.slug} editing={props.editing}>
        {attributes.some(Boolean) && <section className={ui.catalogSpecs}><h2>Характеристики</h2><div>{attributes}</div></section>}
        {!props.editing && props.app.shop?.detailScreenId === screen.id && props.record && <ShopAddToBasket app={props.app} productId={props.record.id} actor={props.actor} />}
      </BuilderV2CatalogDetail>
      {render(blocks)}
    </div>
  }
  if (detail && !props.editing && props.record) {
    const titleFieldId = screen?.recordTitleFieldId ?? recordTable?.primaryFieldId
    const title = titleFieldId ? cell(props.record, titleFieldId) : screen?.name
    const crmDeal = Boolean(crm && screen?.id === crm.dealScreenId)
    const crmClient = Boolean(crm && screen?.id === crm.clientScreenId)
    const inventoryItem = Boolean(inventory && screen?.id === inventory.itemScreenId)
    const editFormId = crmDeal ? crm?.dealEditFormId : inventoryItem ? inventory?.itemEditFormId : undefined
    const inventoryActionForms = inventoryItem && inventory
      ? [inventory.receiptFormId, inventory.issueFormId, inventory.writeOffFormId, inventory.transferFormId]
      : []
    const parts = builderV2OrderDetailParts({
      app: props.app, rootIds, nodes, recordTable, statusFieldId: statusColumn?.id, amountFieldId: amountColumn?.id,
      dueFieldId: crmDeal ? crm?.dueFieldId : inventoryItem ? inventory?.itemMinFieldId : undefined,
      positionsFieldId: props.app.shop?.positionsFieldId, statusFormId, editFormId,
      actionFormIds: inventoryActionForms,
    })
    const manage = Boolean(parts.processingFormId || parts.editFormId || inventoryActionForms.length)
    const statusValue = statusColumn && props.record.values[statusColumn.id]
    const choices = builderV2OrderStatusChoices(recordTable, statusColumn?.id)
    const terminals = props.app.shop?.terminalStatuses ?? crm?.terminalStages ?? []
    const progress = !manage && choices.length ? builderV2StatusProgress(choices, typeof statusValue === 'string' ? statusValue : null, terminals) : undefined
    const dueColumn = crmDeal && crm ? recordTable?.fields.find(field => field.id === crm.dueFieldId)
      : inventoryItem && inventory ? recordTable?.fields.find(field => field.id === inventory.itemMinFieldId) : undefined
    const dueRaw = dueColumn ? props.record.values[dueColumn.id] : undefined
    const dueValue = dueColumn && Object.hasOwn(props.record.values, dueColumn.id) ? cell(props.record, dueColumn.id) : ''
    const due = crmDeal && dueValue ? { label: dueColumn?.name || 'Вернуться к разговору', value: dueValue, tone: builderV2DueTone(dueRaw) } : undefined
    const inventoryLow = inventoryItem && inventory ? props.record.values[inventory.itemLowFieldId] === true : false
    const inventoryUnit = inventoryItem && inventory ? (cell(props.record, inventory.itemUnitFieldId) || 'шт.') : 'шт.'
    const inventoryMin = inventoryItem && dueValue ? dueValue : ''
    const inventoryStatus = inventoryItem
      ? (inventoryLow ? `Ниже минимума (${inventoryMin || '—'})` : undefined)
      : status
    const inventoryAmount = inventoryItem && amount
      ? `${amount.replace(/[^\d\s−-]/g, '').trim() || String(rawTotal ?? '')} ${inventoryUnit}`.replace(/\s+/g, ' ').trim()
      : amount
    // Prefer explicit stock number + unit for inventory identity.
    const inventoryStockLabel = inventoryItem && inventory && typeof rawTotal === 'number' && Number.isFinite(rawTotal)
      ? `${rawTotal} ${inventoryUnit}`
      : inventoryAmount
    const factItems = parts.factIds.flatMap(id => {
      const node = nodes.get(id)
      if (!node || node.type !== 'field' || !visible(node)) return []
      const fieldId = 'fieldId' in node.value ? node.value.fieldId : undefined
      const field = recordTable?.fields.find(item => item.id === fieldId)
      const rawValue = fieldId ? props.record!.values[fieldId] : null
      if (published && fieldId && !Object.hasOwn(props.record!.values, fieldId)) return []
      if (inventoryItem && inventory && fieldId && (fieldId === inventory.itemLowFieldId || fieldId === inventory.itemMinFieldId || fieldId === inventory.itemStockFieldId)) return []
      const value = resolve(node.value, props.record)
      const href = builderV2ContactHref(field?.type, rawValue)
      const label = node.label || field?.name || node.name
      return [{
        id, label, kind: builderV2OrderFactKind(label), blank: builderV2BlankFact(rawValue) && !value,
        value: href ? <a className={ui.contactLink} href={href}>{value}</a> : value || '—',
      }]
    })
    const linesBlock = props.app.shop?.positionsFieldId
      ? <BuilderV2ShopOrderLines app={props.app} record={props.record} amount={manage ? amount : undefined} />
      : parts.collectionIds.length ? render(parts.collectionIds) : null
    const replyFacts = factItems.filter(item => item.kind === 'reply')
    const clientRaw = crmDeal && crm ? props.record.values[crm.clientRelationFieldId] : undefined
    const clientId = typeof clientRaw === 'string' ? clientRaw : Array.isArray(clientRaw) ? clientRaw.find((id): id is string => typeof id === 'string' && Boolean(id.trim())) : undefined
    const clientText = crmDeal && crm && Object.hasOwn(props.record.values, crm.clientRelationFieldId)
      ? cell(props.record, crm.clientRelationFieldId) || undefined
      : undefined
    const openClient = clientId && crm ? () => {
      if (published) published.navigate(crm.clientScreenId, clientId)
      else props.onNavigate?.(crm.clientScreenId, clientId)
    } : undefined
    const clientFact = clientText
      ? openClient
        ? <button type="button" className={ui.contactLink} onClick={openClient}>{clientText}</button>
        : clientText
      : undefined
    // Identity already shows the client / inventory warehouse+cost; keep only non-duplicated facts.
    const deliveryFacts = factItems.filter(item => {
      if (item.kind === 'reply') return false
      const node = nodes.get(item.id)
      const fieldId = node?.type === 'field' && 'fieldId' in node.value ? node.value.fieldId : undefined
      if (crmDeal && crm && fieldId === crm.clientRelationFieldId) return false
      if (inventoryItem && inventory && fieldId && (fieldId === inventory.itemWarehouseFieldId || fieldId === inventory.itemCostFieldId)) return false
      return true
    })
    const factsTitle = inventoryItem ? 'О товаре' : crmDeal ? 'Исполнитель' : crm ? (crmClient ? 'О клиенте' : 'Клиент') : 'Клиент и доставка'
    const sideFactsTitle = crm ? (crmClient ? 'О клиенте' : 'Клиент') : 'Доставка'
    const actionTitle = inventoryItem ? 'Складская операция' : crm ? 'Добавить запись' : 'Обработка заказа'
    // Shop keeps the processing form open; CRM/inventory forms open on demand.
    const actionMode = crmDeal || inventoryItem ? 'reveal' as const : 'persistent' as const
    const stack = Boolean(crm || inventoryItem)
    const formVisible = (id: string) => {
      const node = nodes.get(id)
      return Boolean(node && visible(node))
    }
    const inventoryTriggers: BuilderV2OrderActionTrigger[] | undefined = inventoryItem && inventory ? [
      ...(parts.editFormId && formVisible(parts.editFormId) ? [{ id: 'edit', title: 'Изменить товар', icon: 'edit', children: render([parts.editFormId]) }] : []),
      ...(formVisible(inventory.receiptFormId) ? [{ id: 'receipt', title: 'Приход', primary: true as const, children: render([inventory.receiptFormId]) }] : []),
      ...(formVisible(inventory.issueFormId) ? [{ id: 'issue', title: 'Расход', children: render([inventory.issueFormId]) }] : []),
      ...(formVisible(inventory.writeOffFormId) ? [{ id: 'write_off', title: 'Списание', children: render([inventory.writeOffFormId]) }] : []),
      ...(formVisible(inventory.transferFormId) ? [{ id: 'transfer', title: 'Переместить', children: render([inventory.transferFormId]) }] : []),
    ] : undefined
    const triggers: BuilderV2OrderActionTrigger[] | undefined = inventoryTriggers ?? (crmDeal ? [
      ...(parts.editFormId ? [{ id: 'edit', title: 'Изменить сделку', icon: 'edit', children: render([parts.editFormId]) }] : []),
      ...(parts.processingFormId ? [{ id: 'journal', title: 'Добавить запись', primary: true as const, children: render([parts.processingFormId]) }] : []),
    ] : undefined)
    // Shop manage identity is amount/status only (title stays in the frame). Skip a title-only plate.
    const showCustomerIdentity = Boolean(inventoryStatus || inventoryStockLabel || amount || (progress && progress.length > 1) || (crmDeal && (due || clientText)))
    const inventoryPhoto = inventoryItem && inventory?.itemPhotoFieldId
      ? builderV2MediaItems(props.record.values[inventory.itemPhotoFieldId], published?.slug).find(item => item.image)
      : undefined
    const inventorySku = inventoryItem && inventory
      ? cell(props.record, inventory.itemSkuFieldId).trim()
      : ''
    const inventoryCategory = inventoryItem && inventory
      ? cell(props.record, inventory.itemCategoryFieldId).trim()
      : ''
    const inventoryDescField = inventoryItem && recordTable?.fields.find(field =>
      field.type === 'text' && /^(?:описание|description|примечание)$/iu.test(field.name.trim()))
    const inventoryDesc = inventoryDescField && Object.hasOwn(props.record.values, inventoryDescField.id)
      ? cell(props.record, inventoryDescField.id).trim()
      : ''
    const inventoryWarehouseLabel = inventoryItem && inventory
      ? cell(props.record, inventory.itemWarehouseFieldId).trim()
      : ''
    const inventoryCostLabel = inventoryItem && inventory && Object.hasOwn(props.record.values, inventory.itemCostFieldId)
      ? cell(props.record, inventory.itemCostFieldId).trim()
      : ''
    const inventoryCostRaw = inventoryItem && inventory ? props.record.values[inventory.itemCostFieldId] : undefined
    const inventoryCostNum = typeof inventoryCostRaw === 'number' ? inventoryCostRaw : Number(inventoryCostRaw)
    const inventoryStockValue = inventoryItem && Number.isFinite(inventoryCostNum) && typeof rawTotal === 'number' && Number.isFinite(rawTotal)
      ? builderV2FormattedAmount(inventoryCostNum * rawTotal, 'Стоимость остатка, ₽')
      : ''
    const inventoryMinLabel = inventoryMin
      ? (/\bшт\.?\b/i.test(inventoryMin) ? inventoryMin : `${inventoryMin} ${inventoryUnit}`.replace(/\s+/g, ' ').trim())
      : ''
    const inventoryDeficit = inventoryLow && inventory && typeof rawTotal === 'number' && Number.isFinite(rawTotal)
      ? (() => {
        const minRaw = Number(props.record.values[inventory.itemMinFieldId])
        if (!Number.isFinite(minRaw)) return ''
        const delta = minRaw - rawTotal
        return delta > 0 ? `Ниже минимума на ${delta} ${inventoryUnit}`.replace(/\s+/g, ' ').trim() : 'Ниже минимума'
      })()
      : (inventoryLow ? 'Ниже минимума' : '')
    const inventoryChips = inventoryItem ? <>
      {inventorySku ? <span className={ui.productChip}>SKU {inventorySku}</span> : null}
      {inventoryCategory ? <span className={ui.productChip}>{inventoryCategory}</span> : null}
      {inventoryDeficit ? <span className={ui.statusBadge} data-tone="rose">{inventoryDeficit}</span> : null}
    </> : null
    const inventoryMetrics = inventoryItem ? [
      {
        key: 'stock',
        value: inventoryStockLabel || '—',
        caption: 'Остаток',
        ...(inventoryLow ? { tone: 'rose' as const } : {}),
        ...(inventoryWarehouseLabel ? { pill: inventoryWarehouseLabel } : {}),
      },
      ...(inventoryMinLabel ? [{ key: 'min', value: inventoryMinLabel, caption: 'Минимум' }] : []),
      ...(inventoryCostLabel ? [{ key: 'cost', value: inventoryCostLabel, caption: 'Себестоимость' }] : []),
      ...(inventoryStockValue ? [{
        key: 'stock_value',
        value: inventoryStockValue,
        caption: 'Стоимость остатка',
        ...(typeof rawTotal === 'number' && Number.isFinite(rawTotal) && inventoryCostLabel
          ? { pill: `${rawTotal} ${inventoryUnit} × ${inventoryCostLabel}`.replace(/\s+/g, ' ').trim() }
          : {}),
      }] : []),
    ] : undefined
    const inventoryIdentityFacts = inventoryItem ? [
      inventoryWarehouseLabel ? { id: 'warehouse', label: 'Склад', value: inventoryWarehouseLabel } : null,
      inventoryCostLabel ? { id: 'cost', label: 'Себестоимость', value: inventoryCostLabel } : null,
      inventoryStockValue ? { id: 'stock_value', label: 'Стоимость остатка', value: inventoryStockValue } : null,
    ].filter(Boolean) as { id: string; label: string; value: string }[] : []
    const revealIdentity = inventoryItem
      ? {
          amount: inventoryStockLabel,
          amountLabel: 'Остаток',
          amountBadge: inventoryLow ? `Ниже минимума (${inventoryMin || '—'})` : undefined,
          due: inventoryMinLabel ? { label: 'Минимум', value: inventoryMinLabel } : undefined,
          media: <InventoryProductThumb image={inventoryPhoto} size="card" label={title || undefined} />,
          productTitle: title || undefined,
          chips: inventoryChips,
          subtitle: inventoryDesc || undefined,
          metrics: inventoryMetrics,
          facts: inventoryIdentityFacts,
        }
      : {
          status: inventoryStatus,
          statusLabel: undefined as string | undefined,
          amount,
          amountLabel: 'Сумма',
          due,
          client: clientFact,
        }
    const inventoryDetailBody = inventoryItem && inventory ? <>
      <div className={shellLayout.detailCols}>
        <div className={shellLayout.detailMainCol}>
          <InventoryWarehouseFacts record={props.record} inventory={inventory} unit={inventoryUnit} />
          {linesBlock ? <DetailSection title="История движений">{linesBlock}</DetailSection> : null}
          {manage && render([...parts.buttonIds, ...parts.otherIds])}
        </div>
        <aside className={shellLayout.detailSideCol}>
          {manage ? <BuilderV2OrderFacts items={deliveryFacts} title="Детали" /> : null}
        </aside>
      </div>
    </> : null
    const shopOrderDetail = Boolean(props.app.shop && !crm && !inventoryItem)
    return <div className={`${styles.canvasBlocks} ${ui.screenBlocks} ${ui.businessDetail} ${ui.orderDetail}`} data-manage={manage || undefined} data-layout={stack ? 'stack' : undefined} data-shell-detail={shopOrderDetail || stack || undefined}>
      {!manage && showCustomerIdentity && <BuilderV2OrderIdentity title={title || undefined} status={inventoryStatus} amount={undefined} scoped={summary?.scoped} progress={progress} manage={false} />}
      <div className={ui.orderDetailBody}>
        <div className={ui.orderDetailMain}>
          {manage && inventoryItem && triggers
            ? <BuilderV2OrderActionPanel title={actionTitle} mode="reveal" triggers={triggers} identity={revealIdentity} detailBody={inventoryDetailBody} />
            : null}
          {manage && crmDeal && triggers
            ? <BuilderV2OrderActionPanel title={actionTitle} mode="reveal" triggers={triggers} identity={revealIdentity} />
            : null}
          {manage && !crmDeal && !inventoryItem && <BuilderV2OrderIdentity status={status} amount={amount} scoped={summary?.scoped} manage />}
          {!inventoryItem && linesBlock}
          {manage && !inventoryItem && <BuilderV2OrderFacts items={deliveryFacts} title={factsTitle} />}
          {manage && !inventoryItem && render([...parts.buttonIds, ...parts.otherIds])}
        </div>
        {manage && (crmDeal || inventoryItem) ? null : manage && parts.processingFormId
          ? <BuilderV2OrderActionPanel title={actionTitle} mode={actionMode}>{render([parts.processingFormId])}</BuilderV2OrderActionPanel>
          : <div className={ui.orderDetailSide}>
            {!crm && !inventoryItem && <BuilderV2OrderSummaryCard amount={amount} scoped={summary?.scoped} />}
            <BuilderV2OrderFacts items={deliveryFacts} title={sideFactsTitle} />
            {!crm && !inventoryItem && <BuilderV2OrderFacts items={replyFacts} title="Сообщение магазина" />}
            {render([...parts.buttonIds, ...parts.otherIds])}
          </div>}
      </div>
    </div>
  }
  const basketScreen = !props.editing && props.app.shop?.basketScreenId === screen?.id
  const shellHiddenButtons = new Set([foldedCreateId, suppliersLinkId, reorderLinkId].filter((id): id is string => Boolean(id)))
  const shellListRootIds = shellKind
    ? rootIds.filter(id => {
      const node = nodes.get(id)
      if (node?.type === 'button' && shellHiddenButtons.has(id)) return false
      if (node?.type === 'button' && shellKind !== 'inventory-items') return false
      return true
    })
    : rootIds
  const effectiveRootIds = statusFormId && !shellKind ? rootIds.filter(id => id !== statusFormId) : shellKind ? shellListRootIds : rootIds
  const listCanvas = basketScreen ? <div className={ui.commerceLayout}>
    <ShopBasketPanel app={props.app} tables={props.tables} actor={props.actor} onCheckout={() => document.getElementById('shop-checkout')?.querySelector<HTMLElement>('input,textarea,select')?.focus()} />
    <div className={ui.commerceCheckout}>
      {!shellKind && <BuilderV2OrderHero status={status} amount={amount} scoped={summary?.scoped} loading={Boolean(props.live && summaryKey && (summaryState.key !== summaryKey || summaryState.pending))} editor={statusFormId ? render([statusFormId]) : undefined} />}
      {render(statusFormId ? rootIds.filter(id => id !== statusFormId) : rootIds)}
    </div>
  </div> : <>
    {!shellKind && <BuilderV2OrderHero status={status} amount={amount} scoped={summary?.scoped} loading={Boolean(props.live && summaryKey && (summaryState.key !== summaryKey || summaryState.pending))} editor={statusFormId ? render([statusFormId]) : undefined} />}
    {render(effectiveRootIds)}
  </>
  const shellCollectionNode = shellCollectionId ? nodes.get(shellCollectionId) : undefined
  const shellCollectionSource = shellCollectionNode && 'sourceId' in shellCollectionNode
    ? props.app.sources.find(source => source.id === shellCollectionNode.sourceId)
    : undefined
  const shellCollectionTable = props.tables.find(table => table.id === shellCollectionSource?.tableId)
  const supplierAgg = aggregateSupplierStats(supplierStats)
  const shellMetricsInput = shellKind ? {
    kind: shellKind,
    page: shellPage,
    rows: shellPage?.rows,
    inventory: inventory ?? undefined,
    crm: crm ?? undefined,
    shop: props.app.shop ?? undefined,
    table: shellCollectionTable,
    lowStockCount: shellLowStock,
    supplierOrdersTotal: supplierAgg.orders,
    supplierPurchasedTotal: supplierAgg.purchased,
    openPurchaseTotal,
    clientOpenDeals: crmDealStats.rollup.openDeals,
    clientPipelineAmount: crmDealStats.rollup.pipeline,
    activeTab: shellTab,
  } : null
  const shellTabsConfig = shellMetricsInput ? buildListShellTabs(shellMetricsInput) : null
  const shellDisplayRows = useMemo(() => {
    if (!shellKind || !shellPage?.rows) return []
    let rows = filterListShellRows(shellKind, shellTab, shellPage.rows, inventory ?? undefined)
    if (shellKind === 'inventory-items' && inventory) {
      rows = filterInventoryItemRows(rows, inventory, { warehouse: shellWarehouse, category: shellCategory })
    }
    return rows
  }, [shellKind, shellPage?.rows, shellTab, shellWarehouse, shellCategory, inventory])
  const shellFooter = shellKind === 'inventory-items' && inventory && shellDisplayRows.length
    ? (() => {
      const footer = inventoryStockListFooter(shellDisplayRows, inventory)
      if (!footer) return undefined
      return <><span>{footer.label} · {footer.units}</span>{footer.total ? <span>{footer.total}</span> : null}</>
    })()
    : undefined
  const inventoryShellSelects = shellKind === 'inventory-items' && inventory && shellPage?.rows?.length
    ? (() => {
      const warehouses = new Map<string, string>()
      const categories = new Map<string, string>()
      const categoryField = shellCollectionTable?.fields.find(field => field.id === inventory.itemCategoryFieldId)
      for (const row of shellPage.rows) {
        const wh = cell(row, inventory.itemWarehouseFieldId)
        const whKey = String(row.values[inventory.itemWarehouseFieldId] ?? '')
        if (whKey && wh) warehouses.set(whKey, wh)
        const catKey = String(row.values[inventory.itemCategoryFieldId] ?? '')
        const catLabel = categoryField?.choices?.find(choice => choice.id === catKey)?.name
        if (catKey && catLabel) categories.set(catKey, catLabel)
      }
      return <span className={shellLayout.filterSelects}>
        {warehouses.size > 1 ? <label className={shellLayout.filterSearch}>
          <select value={shellWarehouse} onChange={event => setShellWarehouse(event.target.value)} aria-label="Склад">
            <option value="all">Склад: все</option>
            {[...warehouses.entries()].map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </label> : null}
        {categories.size > 1 ? <label className={shellLayout.filterSearch}>
          <select value={shellCategory} onChange={event => setShellCategory(event.target.value)} aria-label="Категория">
            <option value="all">Категория: все</option>
            {[...categories.entries()].map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </label> : null}
      </span>
    })()
    : undefined
  const shellBody = shellKind && shellCollectionId ? (
    <ListScreenShell
      title={screen?.name ?? listShellTitle(shellKind)}
      meta={shellMetricsInput ? buildListShellMeta(shellMetricsInput) : undefined}
      actions={buildShellRootActions()}
      metrics={shellMetricsInput ? buildListShellMetrics(shellMetricsInput) : undefined}
      tabs={shellTabsConfig?.tabs}
      activeTab={shellTab}
      onTabChange={setShellTab}
      search={shellCollectionSource?.searchFieldIds.length ? <ShellSearchField value={shellSearch} onChange={setShellSearch} placeholder={shellKind === 'shop-orders' ? 'Найти заказ' : shellKind === 'inventory-items' ? 'Поиск по названию или SKU' : 'Найти в списке'} /> : undefined}
      selects={inventoryShellSelects}
      footer={shellFooter}
    >
      {listCanvas}
    </ListScreenShell>
  ) : listCanvas
  return <div className={`${styles.canvasBlocks} ${ui.screenBlocks} ${screen?.contextTableId ? ui.businessDetail : ''} ${basketScreen ? ui.commerceScreen : ''} ${shellKind ? ui.shellScreen : ''}`} data-profile={profile || undefined} data-commerce={basketScreen ? 'basket' : undefined} data-layout={shellKind ? 'list' : undefined}>
    {shellBody}
    {!effectiveRootIds.length && (props.editing ? <button type="button" className={styles.emptyCanvas} onClick={() => props.onAdd?.(null)}><ProtoIcon name="plus" size={24} /><strong>Добавьте первый элемент</strong><span>Текст, список или форму</span></button> : <p className={styles.empty}>На этом экране пока нет элементов</p>)}
  </div>
}
