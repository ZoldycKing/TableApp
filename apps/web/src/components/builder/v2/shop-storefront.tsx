'use client'

import { useEffect, useMemo, useState } from 'react'
import type { AppV2, AppV2Actor, AppV2Node, AppV2Record } from '@tableapp/schema/app-v2'
import type { BuilderV2Table } from '@/lib/builder-v2'
import type { BuilderV2DataPage, BuilderV2ReadScope } from '@/lib/builder-v2-data-types'
import { BuilderV2DataNode } from './data-node'
import {
  builderV2CatalogCell,
  builderV2CatalogPrice,
} from '@/lib/builder-v2-catalog'
import {
  SHOP_CATALOG_SORTS,
  builderV2ShopCatalogFields,
  builderV2ShopProductActive,
  builderV2ShopSpecRows,
  builderV2ShopStockLabel,
  builderV2ShopStockState,
  builderV2ShopStockValue,
  builderV2SortShopCatalogRows,
  type ShopCatalogSort,
  type ShopStockState,
} from '@/lib/builder-v2-shop-stock'
import {
  addShopBasketItem,
  changeShopBasketQty,
  readShopBasket,
  subscribeShopBasket,
  writeShopBasket,
  type ShopBasket,
} from '@/lib/shop-basket'
import presentation from '@/components/runtime/app-presentation.module.css'
import styles from '../prototype/prototype.module.css'
import { ListScreenShell, ShellSearchField } from './layout-shell'
import shell from './layout-shell.module.css'
import { BuilderV2Picture } from './media'
import { builderV2MediaItems } from './media-values'
import { usePublishedV2 } from './published-context'
import { BuilderV2RecordAvatar } from './record-visuals'
import ui from './view.module.css'

function useShopBasket(appId: string) {
  const [basket, setBasket] = useState<ShopBasket>({ requestId: '', items: [] })
  useEffect(() => {
    setBasket(readShopBasket(appId))
    return subscribeShopBasket(appId, () => setBasket(readShopBasket(appId)))
  }, [appId])
  const update = (next: ShopBasket) => { writeShopBasket(appId, next); setBasket(next) }
  return { basket, update }
}

export function ShopStockPill({ state, stock }: { state: ShopStockState; stock: number | null }) {
  return <span className={ui.shopStockPill} data-state={state}>{builderV2ShopStockLabel(state, stock)}</span>
}

export function ShopQtyStepper({
  name,
  qty,
  max,
  onChange,
  disabled,
}: {
  name: string
  qty: number
  max: number
  onChange: (qty: number) => void
  disabled?: boolean
}) {
  const ceiling = Math.max(0, Math.trunc(max))
  return <div className={ui.shopStepper}>
    <button type="button" className={ui.shopQtyButton} aria-label={`Уменьшить количество: ${name}`} disabled={disabled || qty <= 1} onClick={() => onChange(qty - 1)}>−</button>
    <input
      className={ui.shopQtyInput}
      aria-label={`Количество: ${name}`}
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      autoComplete="off"
      disabled={disabled || ceiling < 1}
      value={String(qty)}
      onChange={event => {
        const digits = event.target.value.replace(/\D/g, '')
        onChange(digits ? Number(digits) : 1)
      }}
    />
    <button type="button" className={ui.shopQtyButton} aria-label={`Увеличить количество: ${name}`} disabled={disabled || qty >= ceiling} onClick={() => onChange(qty + 1)}>+</button>
  </div>
}

export function ShopAddToBasketControls({
  app,
  productId,
  actor,
  stock,
  active,
  sticky,
}: {
  app: AppV2
  productId: string
  actor: AppV2Actor
  stock: number | null
  active: boolean
  sticky?: boolean
}) {
  const shop = app.shop
  const { basket, update } = useShopBasket(app.id)
  const [qty, setQty] = useState(1)
  if (!shop) return null
  const inBasket = basket.items.find(item => item.id === productId)?.qty ?? 0
  const max = stock == null ? 1000 : stock
  const soldOut = !active || max < 1
  const clamp = (value: number) => Math.max(1, Math.min(max || 1, Math.trunc(value) || 1))
  const add = () => {
    if (soldOut) return
    let next = basket.requestId ? basket : readShopBasket(app.id)
    for (let i = 0; i < qty; i += 1) next = addShopBasketItem(next, productId, max)
    update(next)
  }
  const body = <>
    <ShopQtyStepper name="товар" qty={soldOut ? 0 : qty} max={soldOut ? 0 : max} disabled={soldOut} onChange={value => setQty(clamp(value))} />
    <button type="button" className={styles.primary} disabled={soldOut} onClick={add}>
      {soldOut ? 'Нет в наличии' : inBasket ? `В корзине: ${inBasket}. Добавить` : 'В корзину'}
    </button>
    {!actor.authenticated && !sticky ? <p className={ui.hint}>Чтобы оформить заказ, подтвердите почту. Корзина сохранится в этой вкладке.</p> : null}
  </>
  if (sticky) return <div className={ui.shopStickyBar} data-shop-sticky>{body}</div>
  return <div className={ui.shopActions} data-shop-actions>{body}</div>
}

export function ShopCatalogCard({
  app,
  row,
  table,
  onOpen,
}: {
  app: AppV2
  row: AppV2Record
  table?: BuilderV2Table
  onOpen: () => void
}) {
  const shop = app.shop!
  const published = usePublishedV2()
  const { basket, update } = useShopBasket(app.id)
  const fields = builderV2ShopCatalogFields(shop, table)
  const name = builderV2CatalogCell(row, shop.productTitleFieldId) || 'Товар'
  const price = builderV2CatalogPrice(row, table?.fields.find(field => field.id === shop.priceFieldId))
  const stock = builderV2ShopStockValue(row, fields.stockFieldId)
  const active = builderV2ShopProductActive(row, shop)
  const state = builderV2ShopStockState(stock, active)
  const soldOut = state === 'out'
  const image = shop.imageFieldId
    ? builderV2MediaItems(row.values[shop.imageFieldId], published?.slug).find(entry => entry.image)
    : undefined
  const max = stock == null ? 1000 : stock
  return <article className={`${ui.shopCatalogCard} ${presentation.catalogCard}`}>
    <button type="button" className={ui.shopCatalogMedia} onClick={onOpen} aria-label={name}>
      <span className={presentation.photo} data-illustrated={Boolean(image)} aria-hidden="true">
        {image ? <BuilderV2Picture item={image} /> : <BuilderV2RecordAvatar id={row.id} name={name} icon="box" />}
      </span>
    </button>
    <div className={ui.shopCatalogCopy}>
      <button type="button" className={ui.shopCatalogTitle} onClick={onOpen}><strong>{name}</strong></button>
      {price ? <span className={ui.shopCatalogPrice}>{price}</span> : null}
      <ShopStockPill state={state} stock={stock} />
      <button
        type="button"
        className={styles.secondary}
        disabled={soldOut}
        onClick={event => {
          event.stopPropagation()
          if (soldOut) return
          update(addShopBasketItem(basket.requestId ? basket : readShopBasket(app.id), productIdSafe(row.id), max))
        }}
      >
        {soldOut ? 'Нет в наличии' : 'В корзину'}
      </button>
    </div>
  </article>
}

function productIdSafe(id: string) {
  return id
}

export function ShopCatalogLive({
  app,
  node,
  table,
  live,
  scope,
  onOpen,
}: {
  app: AppV2
  node: Extract<AppV2Node, { type: 'collection' }>
  table?: BuilderV2Table
  live: boolean
  scope?: BuilderV2ReadScope
  onOpen: (row: AppV2Record) => void
}) {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState<BuilderV2DataPage | undefined>()
  const [pending, setPending] = useState(false)
  return <BuilderV2DataNode
    app={app}
    node={node}
    live={live}
    scope={scope}
    table={table}
    heading={false}
    shell
    searchValue={search}
    onSearchChange={setSearch}
    onPage={(next, loading) => { setPage(next); setPending(loading) }}
  >
    {data => <ShopCatalogShell
      app={app}
      rows={data?.rows ?? page?.rows ?? []}
      total={data?.total ?? page?.total ?? 0}
      table={table}
      search={search}
      onSearch={setSearch}
      onOpen={onOpen}
      loading={pending && !(data?.rows.length || page?.rows.length)}
    />}
  </BuilderV2DataNode>
}

export function ShopCatalogShell({
  app,
  rows,
  total,
  table,
  search,
  onSearch,
  onOpen,
  loading,
}: {
  app: AppV2
  rows: readonly AppV2Record[]
  total: number
  table?: BuilderV2Table
  search: string
  onSearch: (value: string) => void
  onOpen: (row: AppV2Record) => void
  loading?: boolean
}) {
  const shop = app.shop!
  const fields = builderV2ShopCatalogFields(shop, table)
  const [category, setCategory] = useState('all')
  const [sort, setSort] = useState<ShopCatalogSort>('popular')
  const categories = useMemo(() => {
    const counts = new Map<string, number>()
    for (const row of rows) {
      const label = fields.categoryFieldId ? builderV2CatalogCell(row, fields.categoryFieldId).trim() || 'Без категории' : 'Все'
      counts.set(label, (counts.get(label) ?? 0) + 1)
    }
    return [...counts.entries()].map(([label, count]) => ({ id: label, label, count }))
  }, [rows, fields.categoryFieldId])
  useEffect(() => {
    if (category !== 'all' && !categories.some(item => item.id === category)) setCategory('all')
  }, [categories, category])
  const filtered = useMemo(() => {
    const base = category === 'all' || !fields.categoryFieldId
      ? [...rows]
      : rows.filter(row => (builderV2CatalogCell(row, fields.categoryFieldId!).trim() || 'Без категории') === category)
    return builderV2SortShopCatalogRows(base, sort, shop.priceFieldId)
  }, [rows, category, fields.categoryFieldId, sort, shop.priceFieldId])
  const countLabel = total === 1 ? '1 товар' : total > 1 && total < 5 ? `${total} товара` : `${total} товаров`
  const tabs = [
    { id: 'all', label: 'Все', count: rows.length },
    ...categories,
  ]
  return <ListScreenShell
    title="Каталог"
    meta={loading && !rows.length ? 'Загружаем…' : countLabel}
    tabs={tabs}
    activeTab={category}
    onTabChange={setCategory}
    search={<ShellSearchField value={search} onChange={onSearch} placeholder="Поиск по каталогу" />}
    selects={<label className={ui.shopSort}>
      <span className={ui.srOnly}>Сортировка</span>
      <select value={sort} onChange={event => setSort(event.target.value as ShopCatalogSort)} aria-label="Сортировка">
        {SHOP_CATALOG_SORTS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
      </select>
    </label>}
  >
    {filtered.length ? <div className={`${ui.shopCatalogGrid} ${presentation.catalogGrid}`} data-shop-catalog>
      {filtered.map(row => <ShopCatalogCard key={row.id} app={app} row={row} table={table} onOpen={() => onOpen(row)} />)}
    </div> : <p className={ui.hint}>{search.trim() ? 'Ничего не нашли по запросу.' : 'В каталоге пока нет товаров.'}</p>}
  </ListScreenShell>
}

export function ShopRelatedProducts({
  app,
  currentId,
  categoryValue,
  table,
  onOpen,
}: {
  app: AppV2
  currentId: string
  categoryValue: string
  table?: BuilderV2Table
  onOpen: (id: string) => void
}) {
  const shop = app.shop
  const published = usePublishedV2()
  const [rows, setRows] = useState<AppV2Record[]>([])
  useEffect(() => {
    if (!published || !shop || !categoryValue) { setRows([]); return }
    const node = app.nodes.find(item => item.type === 'collection' && item.layout === 'catalog'
      && app.sources.some(source => source.id === item.sourceId && source.tableId === shop.catalogTableId && !source.screenTableId))
    if (!node) return
    let cancelled = false
    void published.readData({ nodeId: node.id, screenId: shop.catalogScreenId }).then(result => {
      if (cancelled || !result.ok) return
      const fields = builderV2ShopCatalogFields(shop, table)
      const others = result.page.rows.filter(row => row.id !== currentId)
      const sameCategory = fields.categoryFieldId
        ? others.filter(row => builderV2CatalogCell(row, fields.categoryFieldId!).trim() === categoryValue)
        : others
      const related = (sameCategory.length >= 2 ? sameCategory : others).slice(0, 4)
      setRows(related)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [published, published?.revision, published?.dataVersion, app.nodes, shop, currentId, categoryValue, table])
  if (!rows.length) return null
  return <section className={ui.shopRelated} aria-label="Похожие товары">
    <h2>Похожие товары</h2>
    <div className={`${ui.shopRelatedGrid} ${presentation.catalogGrid}`}>
      {rows.map(row => <ShopCatalogCard key={row.id} app={app} row={row} table={table} onOpen={() => onOpen(row.id)} />)}
    </div>
  </section>
}

export function ShopProductFacts({
  row,
  table,
  shop,
}: {
  row: AppV2Record
  table?: BuilderV2Table
  shop: NonNullable<AppV2['shop']>
}) {
  const fields = builderV2ShopCatalogFields(shop, table)
  const specs = builderV2ShopSpecRows(row, table, fields)
  const delivery = fields.leadFieldId ? builderV2CatalogCell(row, fields.leadFieldId).trim() : ''
  if (!specs.length && !delivery) return null
  return <div className={ui.shopProductExtras}>
    {specs.length ? <section className={ui.catalogSpecs}>
      <h2>Характеристики</h2>
      <div>
        {specs.map(item => <div key={item.id} className={ui.row} data-kind="spec">
          <span>{item.label}</span>
          <strong>{item.value}</strong>
        </div>)}
      </div>
    </section> : null}
    {delivery ? <section className={ui.shopDeliveryNote}>
      <h2>Доставка и получение</h2>
      <p>{delivery}</p>
    </section> : null}
  </div>
}

export function shopProductStock(row: AppV2Record, shop: NonNullable<AppV2['shop']>, table?: BuilderV2Table) {
  const fields = builderV2ShopCatalogFields(shop, table)
  const stock = builderV2ShopStockValue(row, fields.stockFieldId)
  const active = builderV2ShopProductActive(row, shop)
  const state = builderV2ShopStockState(stock, active)
  return { stock, active, state, fields }
}

/** Back-compat export used by basket qty clamps. */
export function clampShopQty(qty: number, max: number) {
  if (max < 1) return 0
  return Math.max(1, Math.min(max, Math.trunc(qty) || 1))
}

export function ShopCatalogBack({ label = 'Каталог', onClick }: { label?: string; onClick: () => void }) {
  return <button type="button" className={shell.detailBack} onClick={onClick}>← {label}</button>
}
