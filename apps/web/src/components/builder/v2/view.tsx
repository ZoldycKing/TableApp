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
import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { PurchaseDialogTotalContext } from './purchase-dialog-total'

function InventoryTypeFilter({ choices, value, onChange }: { choices: readonly { id: string; name: string }[]; value: string; onChange: (id: string) => void }) {
  if (!choices.length) return null
  return <div className={ui.typeFilter} role="group" aria-label="Фильтр по виду операции">
    <button type="button" aria-pressed={!value} onClick={() => onChange('')}>Все</button>
    {choices.map(choice => <button key={choice.id} type="button" aria-pressed={value === choice.id} onClick={() => onChange(choice.id)}>{choice.name}</button>)}
  </div>
}

/** Centred dialog on desktop, bottom sheet on a narrow screen. */
function InventoryCreateDialog({
  label, children, defaultOpen = false, onDismiss, title = 'Новый товар', submitLabel = 'Сохранить товар', wide = false, buttonClassName, iconOnly, icon,
}: {
  label: string
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
        <button type="button" className={styles.secondary} data-action-cancel onClick={close}>Отмена</button>
        <button type="button" className={styles.primary} onClick={submit}>{submitLabel}</button>
      </div>
    </aside>
  </OrderActionPanelContext.Provider>, document.body) : null
  return <>
    <button type="button" className={buttonClassName ?? styles.primary} aria-label={iconOnly ? label : undefined} title={iconOnly ? label : undefined} onClick={() => setOpen(true)}>
      {iconOnly && icon ? <ProtoIcon name={icon} size={20} /> : label}
    </button>
    {dialog}
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
  lineIds, inventory, max = 3,
}: {
  lineIds: string[]
  inventory: NonNullable<AppV2['inventory']>
  max?: number
}) {
  const published = usePublishedV2()
  const [thumbs, setThumbs] = useState<{ id: string; image?: import('./media-values').BuilderV2MediaItem; label: string }[]>([])
  const [extra, setExtra] = useState(0)
  useEffect(() => {
    if (!published || !inventory.purchaseLinesTableId || !inventory.lineProductFieldId || !lineIds.length) {
      setThumbs([])
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
      const shown = unique.slice(0, max)
      const products = shown.length
        ? await readPublishedV2RelatedRowsAction(published.slug, {
          revision: published.revision, tableId: inventory.itemsTableId, recordIds: shown,
        })
        : { ok: true as const, rows: [] }
      if (cancelled || !products.ok) return
      setThumbs(shown.map(id => {
        const row = products.rows.find(item => item.id === id)
        const image = row && inventory.itemPhotoFieldId
          ? builderV2MediaItems(row.values[inventory.itemPhotoFieldId], published.slug).find(item => item.image)
          : undefined
        const label = row?.display?.[inventory.itemNameFieldId] || 'Товар'
        return { id, image, label }
      }))
      setExtra(Math.max(0, unique.length - shown.length))
    })
    return () => { cancelled = true }
  }, [published, inventory, lineIds.join('|'), max])
  return <span className={ui.purchaseThumbs} aria-hidden="true">
    {thumbs.map(item => <InventoryProductThumb key={item.id} image={item.image} size="journal" label={item.label} />)}
    {extra > 0 ? <span className={ui.purchaseThumbsMore}>+{extra}</span> : null}
    {!thumbs.length ? <InventoryProductThumb size="journal" /> : null}
  </span>
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
  return <section className={`${presentation.panel} ${ui.orderFacts}`} aria-label="По складам">
    <h2 className={presentation.sectionTitle}>По складам</h2>
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
import { builderV2DueTone, builderV2OrderDetailParts, builderV2OrderFactKind, builderV2StatusProgress } from '@/lib/builder-v2-order-detail'
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
import { BuilderV2OrderActionPanel, BuilderV2OrderFacts, BuilderV2OrderIdentity, BuilderV2OrderSummaryCard, BuilderV2ShopOrderLines, OrderActionPanelContext, builderV2BlankFact, builderV2OrderStatusChoices, type BuilderV2OrderActionTrigger } from './order-detail'

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
      : null
    : null
  const foldedExtraIds = new Set<string>()
  const suppliersLinkId = !props.editing && inventory && screen?.id === inventory.purchasesScreenId ? rootButtonByLabel('Поставщики') : null
  if (suppliersLinkId) foldedExtraIds.add(suppliersLinkId)
  const inventoryCreateFormId = !props.editing && inventory && screen?.id === inventory.itemsScreenId
    ? inventory.createItemFormId ?? null
    : screen?.id === inventory?.purchasesScreenId ? inventory?.createPurchaseFormId ?? null
    : screen?.id === inventory?.suppliersScreenId ? inventory?.createSupplierFormId ?? null
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
      else if (node.type === 'input') content = <BuilderV2FormInput node={node} table={props.tables.find(table => table.id === formTableId)} />
      else if (node.type === 'form') {
        const purchaseForm = Boolean(inventory && (node.id === inventory.createPurchaseFormId || node.id === inventory.editPurchaseFormId))
        const supplierEdit = Boolean(inventory?.editSupplierFormId && node.id === inventory.editSupplierFormId)
        const preview = <BuilderV2FormPreview app={props.app} form={node} screenId={props.screenId} recordId={props.record?.id} enabled={Boolean(props.live)} editing={Boolean(props.editing)} working={props.workingForm?.formId === node.id ? props.workingForm : undefined}>{render(node.childIds, record, node.tableId)}{purchaseForm && !props.editing ? <PurchaseLinesEditor record={node.id === inventory?.editPurchaseFormId ? props.record : undefined} /> : null}{props.editing && <button type="button" className={styles.addInside} onClick={() => props.onAdd?.(node.id)}><ProtoIcon name="plus" />Добавить поле</button>}</BuilderV2FormPreview>
        content = (node.id === inventory?.editPurchaseFormId || supplierEdit) && !props.editing
          ? <InventoryCreateDialog label="Изменить" buttonClassName={styles.secondary} title={supplierEdit ? 'Изменить поставщика' : 'Изменить заказ'} submitLabel="Сохранить" wide={node.id === inventory?.editPurchaseFormId}>{preview}</InventoryCreateDialog>
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
        const inventoryListToolbar = (() => {
          if (node.type !== 'collection' || (!foldedCreateId && !suppliersLinkId)) return undefined
          const parts: ReactNode[] = []
          if (suppliersLinkId) {
            const link = nodes.get(suppliersLinkId)
            if (link?.type === 'button' && visible(link)) {
              parts.push(published
                ? <PublishedV2Button key={link.id} node={link} screenId={props.screenId} recordId={props.record?.id} buttonClassName={ui.orderActionIcon} buttonContent={<ProtoIcon name="users" size={20} />} />
                : <button key={link.id} type="button" className={ui.orderActionIcon} aria-label={link.label} title={link.label} disabled><ProtoIcon name="users" size={20} /></button>)
            }
          }
          if (foldedCreateId) {
            const button = nodes.get(foldedCreateId)
            if (button?.type === 'button' && visible(button)) {
              const buttonStyle = button.variant === 'primary' ? styles.primary : button.variant === 'danger' ? styles.danger : styles.secondary
              const toolbarButton = inventory && screen?.id === inventory.movementsScreenId ? { ...button, label: 'Операция' } : button
              const purchaseCreate = Boolean(inventory && screen?.id === inventory.purchasesScreenId)
              const supplierCreate = Boolean(inventory && screen?.id === inventory.suppliersScreenId)
              if (inventoryCreateFormId && nodes.get(inventoryCreateFormId)) {
                parts.push(<InventoryCreateDialog
                  key={button.id}
                  label={toolbarButton.label}
                  title={purchaseCreate ? 'Новый заказ' : supplierCreate ? 'Новый поставщик' : 'Новый товар'}
                  submitLabel={purchaseCreate ? 'Сохранить заказ' : supplierCreate ? 'Сохранить поставщика' : 'Сохранить товар'}
                  wide={purchaseCreate}
                  defaultOpen={Boolean(props.openCreate && !purchaseCreate && !supplierCreate)}
                  onDismiss={() => {
                    if (props.openCreate && inventory && published && !purchaseCreate && !supplierCreate) published.navigate(inventory.itemsScreenId, undefined, { replace: true })
                  }}
                >{render([inventoryCreateFormId])}</InventoryCreateDialog>)
              } else {
                parts.push(published
                  ? <PublishedV2Button key={button.id} node={toolbarButton} screenId={props.screenId} recordId={props.record?.id} />
                  : <button key={button.id} type="button" className={buttonStyle} disabled>{toolbarButton.label}</button>)
              }
            }
          }
          if (!parts.length) return undefined
          // Keep suppliers icon + primary create on one toolbar row (Товары pattern).
          return parts.length === 1 ? parts[0] : <div className={ui.purchaseToolbarEnd}>{parts}</div>
        })()
        const showCollectionHeading = Boolean(props.editing || screen?.name !== node.name)
        content = <BuilderV2DataNode app={props.app} node={node} live={Boolean(props.live)} allowWrites={Boolean(props.live&&!props.editing)} table={props.tables.find(table=>table.id===props.app.sources.find(source=>source.id===node.sourceId)?.tableId)} heading={showCollectionHeading} toolbarEnd={inventoryListToolbar} scope={{ screenId: props.screenId, ...(props.record ? { recordId: props.record.id } : {}) }} onPage={id === lines?.id ? receiveSummary : undefined}>{page => {
        let body: ReactNode
        const source = props.app.sources.find(source => source.id === node.sourceId), table = props.tables.find(table => table.id === source?.tableId)
        const rows = page ? page.rows : source && props.rows && Object.hasOwn(props.rows, source.id) ? props.rows[source.id] : undefined
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
          const inventoryJournalList = Boolean(inventory && screen?.id === inventory.movementsScreenId && node.layout === 'list')
          const purchaseList = Boolean(inventory?.purchaseOrdersTableId && source?.tableId === inventory.purchaseOrdersTableId && node.layout === 'list' && !source?.screenTableId)
          const purchaseLineList = Boolean(inventory?.purchaseLinesTableId && source?.tableId === inventory.purchaseLinesTableId)
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
              ? <span className={ui.statusBadge} data-tone="rose">Мало</span>
              : null
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
                  <span className={ui.purchaseListMobileMeta}>{[supplier, warehouse, countLabel && `${countLabel} поз.`].filter(Boolean).join(' · ')}</span>
                </div>
                <span className={ui.purchaseListCol} data-col="supplier">{supplier || '—'}</span>
                <span className={ui.purchaseListCol} data-col="count">{countLabel || '—'}</span>
                <span className={ui.purchaseListCol} data-col="warehouse">{warehouse || '—'}</span>
                {statusLabel ? <span className={ui.statusBadge} data-tone={builderV2StatusTone(statusLabel)}>{statusLabel}</span> : <span />}
                <span className={ui.purchaseListAmount}>{amount || '—'}</span>
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
                  <span>{[qty && `${qty} шт.`, price].filter(Boolean).join(' × ')}</span>
                </div>
                <span className={ui.purchaseListAmount}>{sum}</span>
              </>
            }
            if (inventoryStockList && inventory && row) {
              const category = cell(row, inventory.itemCategoryFieldId) || '—'
              const warehouse = cell(row, inventory.itemWarehouseFieldId) || '—'
              const stockNum = Number(row.values[inventory.itemStockFieldId])
              const minNum = Number(row.values[inventory.itemMinFieldId])
              const stockVsMin = Number.isFinite(stockNum) && Number.isFinite(minNum)
                ? `${stockNum} из мин. ${minNum}`
                : ''
              const minRatio = Number.isFinite(stockNum) && Number.isFinite(minNum) && minNum > 0
                ? Math.max(0, Math.min(1, stockNum / minNum))
                : null
              const minBar = minRatio !== null
                ? <span className={ui.stockMinBar} aria-hidden="true"><i style={{ width: `${Math.round(minRatio * 100)}%` }} /></span>
                : null
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
                    {stockVsMin ? <span className={ui.recordStockMobileStock}>{minBar}<span>{stockVsMin}</span></span> : null}
                  </span>
                </div>
                <span className={ui.recordStockCol} data-col="category">{category}</span>
                <span className={ui.recordStockCol} data-col="warehouse">{warehouse}</span>
                <span className={ui.recordStockCol} data-col="min">
                  {stockVsMin ? <><span>{stockVsMin}</span>{minBar}</> : '—'}
                </span>
                {detailNode}
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
          const showHeading = !['calendar','kanban'].includes(node.layout) && (props.editing || (screen?.name !== node.name && !(inventoryJournalList && screen?.id === inventory?.movementsScreenId)))
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
            const body = rowAction ? actionRow(row, 'div') : <div key={row.id} className={catalog ? `${ui.row} ${presentation.catalogCard}` : ui.row} data-low={lowStock || undefined}>
              {defaultCard ? <RecordControl className={ui.recordButton} data-compact={compact || undefined} data-status={(statusSubtitle && !inventoryStockList && !inventoryJournalList && !purchaseList) || undefined} data-stock={inventoryStockList || undefined} data-journal={inventoryJournalList || undefined} data-purchase={purchaseList || undefined} data-purchase-line={purchaseLineList || undefined} data-low={lowStock || undefined} {...(cardScreen ? { type: 'button' as const, onClick: () => open(row) } : {})}>
                {compact && !inventoryStockList && !inventoryJournalList && !purchaseList && !purchaseLineList && !(statusSubtitle) && <BuilderV2RecordAvatar id={row.id} name={orders ? undefined : cell(row, node.titleFieldId)} icon={orders ? 'receipt' : contacts ? 'users' : inventory ? 'box' : 'list'} tone />}
                {item(row)}
                {!catalog && !inventoryStockList && !inventoryJournalList && !purchaseList && !purchaseLineList && (cardScreen || props.editing && cardTarget) && <ProtoIcon name="arrow" size={16} />}
              </RecordControl> : <>{item(row)}{openRecord(row)}</>}
            </div>
            return node.layout === 'kanban' ? <BoardMoveRow key={row.id} row={row as BuilderV2DataRecord} label={cell(row, node.titleFieldId)}>{body}</BoardMoveRow> : body
          }
          const rowsClass = catalog ? `${ui.catalogRows} ${presentation.catalogGrid}` : cardLayout ? ui.cards : timeline ? ui.timelineList : node.layout === 'list' && !rowAction ? (node.recordGroup ? ui.groupedRecords : ui.plainList) : styles.collectionRows
          const inventoryList = Boolean((inventoryStockList || inventoryJournalList || purchaseList) && !node.recordGroup)
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
                <span>Запас</span>
                <span>Остаток</span>
              </div>
              : null
            const purchaseHeader = purchaseList && !node.recordGroup
              ? <div className={ui.purchaseListHeader} aria-hidden="true">
                <span />
                <span>№/Дата</span>
                <span>Поставщик</span>
                <span>Позиции</span>
                <span>Склад</span>
                <span>Статус</span>
                <span>Сумма</span>
              </div>
              : null
            return [...buckets].map(([key, group]) => <div key={key} className={group.label ? ui.listGroup : undefined}>
              {group.label && <GroupHeading className={ui.listGroupHeading}>{group.label}</GroupHeading>}
              <div className={rowsClass} data-inventory={inventoryList || undefined} data-stock={inventoryStockList || undefined} data-purchase={purchaseList || undefined}>
                {stockHeader}
                {purchaseHeader}
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
          : rows ? (inventoryJournalList && inventory && typeChoices.length
            ? <InventoryJournalRows rows={rows} typeFieldId={inventory.movementTypeFieldId} choices={typeChoices} renderRows={renderListGroups} />
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
              {inventoryListToolbar}
            </div>
            : inventoryJournalList ? <div className={ui.collectionEmpty} data-centered>
              <ProtoIcon name="list" size={28} />
              <strong>Операций пока нет</strong>
              <p>Оформите приход, расход или перемещение — журнал заполнится сам.</p>
              {inventoryListToolbar}
            </div>
            : purchaseList ? <div className={ui.collectionEmpty} data-centered>
              <ProtoIcon name="clipboard" size={28} />
              <strong>Заказов пока нет</strong>
              <p>Создайте заказ поставщику и примите его на склад, когда товар приедет.</p>
              {inventoryListToolbar}
            </div>
            : <p className={ui.hint}>{emptyCopy}</p>
          ) : null
          body = <div className={`${styles.collection} ${catalog ? presentation.catalog : cardLayout ? ui.cardCollection : timeline ? `${presentation.panel} ${ui.timelineCollection}` : ''} ${id === lines?.id ? `${presentation.panel} ${ui.orderLines}` : ''}`} data-catalog={catalog || undefined} data-tiles={node.layout === 'tiles' || undefined} data-timeline={timeline || undefined}>
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
    return <div className={`${styles.canvasBlocks} ${ui.purchaseCard}`}>
      <section className={`${presentation.panel} ${ui.orderIdentity}`} data-manage aria-label="Главное о заказе">
        <div className={ui.orderIdentityMain}>
          {hasActions ? <div className={ui.purchaseCardActions}>
            {editFormId ? render([editFormId]) : null}
            {primaryAction ? (published
              ? <PublishedV2Button node={primaryAction} screenId={props.screenId} recordId={purchaseRecord.id} refreshOnSuccess buttonClassName={styles.primary} />
              : <button type="button" className={styles.primary} disabled>{primaryAction.label}</button>) : null}
            {secondaryActions.map(node => published
              ? <PublishedV2Button key={node.id} node={node} screenId={props.screenId} recordId={purchaseRecord.id} refreshOnSuccess buttonClassName={styles.secondary} />
              : <button key={node.id} type="button" className={styles.secondary} disabled>{node.label}</button>)}
          </div> : null}
          <div className={ui.orderIdentityMeta}>
            {amount ? <div className={ui.heroAmount} data-bare><span>Сумма</span><strong>{amount}</strong></div> : null}
            {status ? <span className={ui.heroStatus} data-tone={builderV2StatusTone(status)}>{status}</span> : null}
          </div>
          <div className={ui.orderIdentityFacts}>
            <div className={ui.orderIdentityFact}><span>Поставщик</span><strong>{supplier || '—'}</strong></div>
            <div className={ui.orderIdentityFact}><span>Склад</span><strong>{warehouse || '—'}</strong></div>
            <div className={ui.orderIdentityFact}><span>Дата</span><strong>{when || '—'}</strong></div>
            <div className={ui.orderIdentityFact}><span>Позиций</span><strong>{count || '—'}</strong></div>
          </div>
          {comment ? <p className={ui.purchaseComment}>{comment}</p> : null}
        </div>
      </section>
      {linesId ? <div className={`${presentation.panel} ${ui.orderLinesPanel}`}>{render([linesId])}</div> : null}
      {history.length ? <section className={`${presentation.panel} ${ui.orderFacts}`} aria-label="История заказа">
        <h2 className={presentation.sectionTitle}>История</h2>
        <ul className={ui.purchaseHistory}>
          {history.map(item => <li key={item.key}><span>{item.label}</span><strong>{item.at}{item.by ? ` · ${item.by}` : ''}</strong></li>)}
        </ul>
      </section> : null}
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
          due: inventoryMin
            ? { label: 'Минимум', value: /\bшт\.?\b/i.test(inventoryMin) ? inventoryMin : `${inventoryMin} ${inventoryUnit}`.replace(/\s+/g, ' ').trim() }
            : undefined,
          media: <InventoryProductThumb image={inventoryPhoto} size="card" label={title || undefined} />,
          productTitle: title || undefined,
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
    return <div className={`${styles.canvasBlocks} ${ui.screenBlocks} ${ui.businessDetail} ${ui.orderDetail}`} data-manage={manage || undefined} data-layout={stack ? 'stack' : undefined}>
      {!manage && showCustomerIdentity && <BuilderV2OrderIdentity title={title || undefined} status={inventoryStatus} amount={undefined} scoped={summary?.scoped} progress={progress} manage={false} />}
      <div className={ui.orderDetailBody}>
        <div className={ui.orderDetailMain}>
          {manage && (crmDeal || inventoryItem) && triggers
            ? <BuilderV2OrderActionPanel title={actionTitle} mode="reveal" triggers={triggers} identity={revealIdentity} />
            : null}
          {manage && !crmDeal && !inventoryItem && <BuilderV2OrderIdentity status={status} amount={amount} scoped={summary?.scoped} manage />}
          {inventoryItem && inventory ? <InventoryWarehouseFacts record={props.record} inventory={inventory} unit={inventoryUnit} /> : null}
          {linesBlock}
          {manage && <BuilderV2OrderFacts items={deliveryFacts} title={factsTitle} />}
          {manage && render([...parts.buttonIds, ...parts.otherIds])}
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
  return <div className={`${styles.canvasBlocks} ${ui.screenBlocks} ${screen?.contextTableId ? ui.businessDetail : ''} ${basketScreen ? ui.commerceScreen : ''}`} data-profile={profile || undefined} data-commerce={basketScreen ? 'basket' : undefined}>
    {basketScreen ? <div className={ui.commerceLayout}>
      <ShopBasketPanel app={props.app} tables={props.tables} actor={props.actor} onCheckout={() => document.getElementById('shop-checkout')?.querySelector<HTMLElement>('input,textarea,select')?.focus()} />
      <div className={ui.commerceCheckout}>
        <BuilderV2OrderHero status={status} amount={amount} scoped={summary?.scoped} loading={Boolean(props.live && summaryKey && (summaryState.key !== summaryKey || summaryState.pending))} editor={statusFormId ? render([statusFormId]) : undefined} />
        {render(statusFormId ? rootIds.filter(id => id !== statusFormId) : rootIds)}
      </div>
    </div> : <>
      <BuilderV2OrderHero status={status} amount={amount} scoped={summary?.scoped} loading={Boolean(props.live && summaryKey && (summaryState.key !== summaryKey || summaryState.pending))} editor={statusFormId ? render([statusFormId]) : undefined} />
      {render(statusFormId ? rootIds.filter(id => id !== statusFormId) : rootIds)}
    </>}
    {!rootIds.length && (props.editing ? <button type="button" className={styles.emptyCanvas} onClick={() => props.onAdd?.(null)}><ProtoIcon name="plus" size={24} /><strong>Добавьте первый элемент</strong><span>Текст, список или форму</span></button> : <p className={styles.empty}>На этом экране пока нет элементов</p>)}
  </div>
}
