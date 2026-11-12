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
import {
  CatalogFilterSidebar,
  ListFilterChips,
  ListFilterToolbar,
  ListSortControl,
  type ListFilterDef,
} from './list-filters'
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
      <span className={`${presentation.photo} ${ui.shopCatalogPhoto}`} data-illustrated={Boolean(image)} aria-hidden="true">
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

function shopCatalogMatches(
  row: AppV2Record,
  draft: Record<string, string>,
  fields: ReturnType<typeof builderV2ShopCatalogFields>,
  shop: NonNullable<AppV2['shop']>,
  query: string,
) {
  const q = query.trim().toLowerCase()
  if (q) {
    const name = builderV2CatalogCell(row, shop.productTitleFieldId).toLowerCase()
    if (!name.includes(q)) return false
  }
  if (draft.category && draft.category !== 'all' && fields.categoryFieldId) {
    const label = builderV2CatalogCell(row, fields.categoryFieldId).trim() || 'Без категории'
    if (label !== draft.category) return false
  }
  if (draft.stock && draft.stock !== 'all') {
    const stock = builderV2ShopStockValue(row, fields.stockFieldId)
    const active = builderV2ShopProductActive(row, shop)
    const state = builderV2ShopStockState(stock, active)
    if (state !== draft.stock) return false
  }
  if (draft.price && draft.price !== 'all') {
    const price = Number(row.values[shop.priceFieldId])
    if (!Number.isFinite(price)) return false
    if (draft.price === 'lt1000' && !(price < 1000)) return false
    if (draft.price === '1000-3000' && !(price >= 1000 && price <= 3000)) return false
    if (draft.price === 'gt3000' && !(price > 3000)) return false
  }
  return true
}

export function ShopCatalogShell({
  app,
  rows,
  total: _total,
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
  const [filterValues, setFilterValues] = useState<Record<string, string>>({ category: 'all', stock: 'all', price: 'all' })
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
    if (filterValues.category !== 'all' && !categories.some(item => item.id === filterValues.category)) {
      setFilterValues(current => ({ ...current, category: 'all' }))
    }
  }, [categories, filterValues.category])
  const filtered = useMemo(() => {
    const base = rows.filter(row => shopCatalogMatches(row, filterValues, fields, shop, search))
    return builderV2SortShopCatalogRows(base, sort, shop.priceFieldId)
  }, [rows, filterValues, fields, shop, search, sort])
  const countLabel = loading && !rows.length
    ? 'Загружаем…'
    : filtered.length === 1 ? '1 товар' : filtered.length > 1 && filtered.length < 5 ? `${filtered.length} товара` : `${filtered.length} товаров`
  const stockCounts = useMemo(() => {
    const counts = { in: 0, low: 0, out: 0 }
    for (const row of rows) {
      const stock = builderV2ShopStockValue(row, fields.stockFieldId)
      const active = builderV2ShopProductActive(row, shop)
      counts[builderV2ShopStockState(stock, active)] += 1
    }
    return counts
  }, [rows, fields.stockFieldId, shop])
  const filterDefs: ListFilterDef[] = [
    ...(fields.categoryFieldId && categories.length > 1 ? [{
      id: 'category',
      label: 'Категория',
      appearance: 'nav' as const,
      options: [{ id: 'all', label: 'Все', count: rows.length }, ...categories],
    }] : []),
    {
      id: 'stock',
      label: 'Наличие',
      appearance: 'radio',
      options: [
        { id: 'all', label: 'Все', count: rows.length },
        { id: 'in', label: 'В наличии', count: stockCounts.in },
        { id: 'low', label: 'Мало', count: stockCounts.low },
        { id: 'out', label: 'Нет в наличии', count: stockCounts.out },
      ],
    },
    {
      id: 'price',
      label: 'Цена',
      appearance: 'radio',
      options: [
        { id: 'all', label: 'Любая' },
        { id: 'lt1000', label: 'До 1 000 ₽' },
        { id: '1000-3000', label: '1 000–3 000 ₽' },
        { id: 'gt3000', label: 'От 3 000 ₽' },
      ],
    },
  ]
  const filtersActive = Object.values(filterValues).some(value => value !== 'all') || Boolean(search.trim())
  const emptyHint = !filtered.length ? <div className={shell.filterEmpty}>
    <span>{filtersActive ? 'Ничего не нашли.' : 'В каталоге пока нет товаров.'}</span>
    {filtersActive ? <button type="button" className={styles.secondary} onClick={() => {
      onSearch('')
      setFilterValues({ category: 'all', stock: 'all', price: 'all' })
    }}>Сбросить фильтры</button> : null}
  </div> : null
  const grid = filtered.length ? <div className={ui.shopCatalogGrid} data-shop-catalog>
    {filtered.map(row => <ShopCatalogCard key={row.id} app={app} row={row} table={table} onOpen={() => onOpen(row)} />)}
  </div> : null
  return <div className={shell.shell} data-layout="list" data-catalog-filters>
    <header className={shell.header}>
      <div className={shell.headerCopy}>
        <h2 className={shell.headerTitle}>Каталог</h2>
        <p className={shell.headerMeta}>{countLabel}</p>
      </div>
    </header>
    <div className={shell.catalogLayout}>
      <CatalogFilterSidebar
        search={search}
        onSearch={onSearch}
        filters={filterDefs}
        values={filterValues}
        onValuesChange={setFilterValues}
      />
      <div className={shell.catalogMain}>
        <ListFilterToolbar
          mobileOnly
          search={search}
          onSearch={onSearch}
          filters={filterDefs}
          values={filterValues}
          onValuesChange={setFilterValues}
          sort={sort}
          sortOptions={SHOP_CATALOG_SORTS}
          onSortChange={value => setSort(value as ShopCatalogSort)}
          countMatches={draft => rows.filter(row => shopCatalogMatches(row, draft, fields, shop, search)).length}
        />
        <div className={shell.panel}>
          <div className={shell.catalogResultBar}>
            <ListFilterChips filters={filterDefs} values={filterValues} onValuesChange={setFilterValues} />
            <ListSortControl sort={sort} sortOptions={SHOP_CATALOG_SORTS} onSortChange={value => setSort(value as ShopCatalogSort)} />
          </div>
          <div className={shell.body}>
            {grid}
            {emptyHint}
          </div>
        </div>
      </div>
    </div>
  </div>
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
    if (!published || !shop) { setRows([]); return }
    let cancelled = false
    // Detail payloads strip other screens' collection nodes — resolve catalog on the server.
    void import('@/app/builder-v2-published-actions').then(async ({ readPublishedV2ShopCatalogAction }) => {
      const result = await readPublishedV2ShopCatalogAction(published.slug, { revision: published.revision })
      if (cancelled || !result.ok) return
      const fields = builderV2ShopCatalogFields(shop, table)
      const others = result.page.rows.filter(row => row.id !== currentId)
      const sameCategory = categoryValue && fields.categoryFieldId
        ? others.filter(row => builderV2CatalogCell(row, fields.categoryFieldId!).trim() === categoryValue)
        : []
      const related = (sameCategory.length >= 2 ? sameCategory : others).slice(0, 4)
      setRows(related)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [published, published?.revision, published?.dataVersion, published?.slug, shop, currentId, categoryValue, table])
  if (!rows.length) return null
  return <section className={ui.shopRelated} aria-label="Похожие товары">
    <h2>Похожие товары</h2>
    <div className={ui.shopRelatedGrid}>
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
