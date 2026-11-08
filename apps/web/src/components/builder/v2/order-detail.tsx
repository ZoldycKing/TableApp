'use client'

import { useEffect, useState, type ReactNode } from 'react'
import type { AppV2, AppV2Record } from '@tableapp/schema/app-v2'
import { builderV2CatalogPrice, builderV2FormattedAmount } from '@/lib/builder-v2-catalog'
import { builderV2OrderFactKind, builderV2OrderLineProductId, builderV2StatusProgress } from '@/lib/builder-v2-order-detail'
import type { BuilderV2DataRecord } from '@/lib/builder-v2-data-types'
import type { BuilderV2Table } from '@/lib/builder-v2'
import { ProtoIcon } from '../prototype/icons'
import presentation from '@/components/runtime/app-presentation.module.css'
import { builderV2MediaItems } from './media-values'
import { builderV2StatusTone } from './record-presentation'
import { usePublishedV2 } from './published-context'
import ui from './view.module.css'

export function BuilderV2OrderIdentity({
  title, status, amount, scoped = false, progress, manage = false,
}: {
  title?: string
  status?: string
  amount?: string
  scoped?: boolean
  progress?: ReturnType<typeof builderV2StatusProgress>
  manage?: boolean
}) {
  if (!title && !status && !amount && !progress?.length) return null
  const showCopy = Boolean(title || (status && !manage))
  const showMeta = Boolean((status && manage) || amount)
  return <section className={`${presentation.panel} ${ui.orderIdentity}`} data-manage={manage || undefined} aria-label="Главное о заказе">
    <div className={ui.orderIdentityMain}>
      {showCopy && <div className={ui.orderIdentityCopy}>
        {title && <h2 className={ui.orderTitle}>{title}</h2>}
        {status && !manage && <p className={ui.orderStatusLead} data-tone={builderV2StatusTone(status)}>{status}</p>}
      </div>}
      {showMeta && <div className={ui.orderIdentityMeta}>
        {status && manage && <span className={ui.heroStatus} data-tone={builderV2StatusTone(status)}><ProtoIcon name="box" size={18} />{status}</span>}
        {amount && <div className={ui.heroAmount}><span>{scoped ? 'Сумма доступных позиций' : 'Итого'}</span><strong>{amount}</strong></div>}
      </div>}
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

export function BuilderV2OrderActionPanel({ title = 'Обработка заказа', children }: { title?: string; children: ReactNode }) {
  if (!children) return null
  return <aside className={`${presentation.panel} ${ui.orderActionPanel}`} aria-label={title}>
    <h2 className={presentation.sectionTitle}>{title}</h2>
    <div className={ui.orderActionBody}>{children}</div>
  </aside>
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
  const name = row.display[shop.itemNameFieldId] || String(row.values[shop.itemNameFieldId] ?? 'Товар')
  const qtyLabel = typeof qty === 'number' && Number.isFinite(qty) ? `${qty.toLocaleString('ru-RU')} шт.` : undefined
  const priceField = { id: shop.itemPriceFieldId, name: 'Цена за штуку', type: 'number' as const }
  const priceLabel = typeof price === 'number' && Number.isFinite(price) ? builderV2CatalogPrice(row, priceField) : undefined
  const lineTotal = typeof qty === 'number' && typeof price === 'number' && Number.isFinite(qty) && Number.isFinite(price)
    ? builderV2FormattedAmount(qty * price, 'Сумма позиции')
    : priceLabel
  return { id: row.id, name, qty: qtyLabel, price: priceLabel, lineTotal }
}

export function builderV2BlankFact(value: unknown) {
  return value == null || value === '' || (Array.isArray(value) && value.length === 0)
}

export function builderV2OrderStatusChoices(table: BuilderV2Table | undefined, statusFieldId: string | undefined) {
  const field = table?.fields.find(item => item.id === statusFieldId)
  if (field?.type !== 'single_select') return []
  return (field.choices ?? []).map(choice => ({ id: choice.id, label: choice.name }))
}

export function BuilderV2OrderSummaryCard({
  title = 'Ваш заказ',
  amount,
  scoped = false,
}: {
  title?: string
  amount?: string
  scoped?: boolean
}) {
  if (!amount) return null
  return <section className={`${presentation.panel} ${ui.orderSummaryCard}`} aria-label={title}>
    <h2 className={presentation.sectionTitle}>{title}</h2>
    <div className={ui.orderSummaryRow}><span>{scoped ? 'Доступные позиции' : 'Товары'}</span><strong>{amount}</strong></div>
    <p className={ui.orderLinesTotal}><span>Итого</span><strong>{amount}</strong></p>
  </section>
}
