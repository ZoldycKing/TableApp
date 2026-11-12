'use client'

import { useEffect, useState, type ReactNode } from 'react'
import type { AppV2, AppV2Actor, AppV2Record } from '@tableapp/schema/app-v2'
import { readBuilderV2RecordAction } from '@/app/builder-v2-data-actions'
import type { BuilderV2Table } from '@/lib/builder-v2'
import { builderV2CatalogCell, builderV2CatalogPrice, builderV2FormattedAmount } from '@/lib/builder-v2-catalog'
import { builderV2ShopCatalogFields, builderV2ShopProductActive, builderV2ShopStockValue } from '@/lib/builder-v2-shop-stock'
import { addShopBasketItem, changeShopBasketQty, readShopBasket, removeShopBasketItem, subscribeShopBasket, writeShopBasket, type ShopBasket } from '@/lib/shop-basket'
import styles from '../prototype/prototype.module.css'
import { ProtoIcon } from '../prototype/icons'
import { builderV2MediaItems } from './media-values'
import { BuilderV2Picture } from './media'
import { usePublishedV2 } from './published-context'
import shell from './layout-shell.module.css'
import { ShopQtyStepper } from './shop-storefront'
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

export function ShopAddToBasket({ app, productId, actor }: { app: AppV2; productId: string; actor: AppV2Actor }) {
  const shop = app.shop
  const { basket, update } = useShopBasket(app.id)
  if (!shop) return null
  const count = basket.items.find(item => item.id === productId)?.qty ?? 0
  return <div className={ui.shopActions}>
    <button type="button" className={styles.primary} onClick={() => update(addShopBasketItem(basket.requestId ? basket : readShopBasket(app.id), productId))}>
      {count ? `В корзине: ${count}. Добавить ещё` : 'В корзину'}
    </button>
    {!actor.authenticated && <p className={ui.hint}>Чтобы оформить заказ, подтвердите почту. Корзина сохранится в этой вкладке.</p>}
  </div>
}

export function ShopBasketPanel({
  app,
  tables,
  actor,
  onCheckout,
  checkout,
}: {
  app: AppV2
  tables: readonly BuilderV2Table[]
  actor: AppV2Actor
  onCheckout?: () => void
  checkout?: ReactNode
}) {
  const shop = app.shop, published = usePublishedV2()
  const { basket, update } = useShopBasket(app.id)
  const [rows, setRows] = useState<Record<string, AppV2Record | null>>({})
  const ids = basket.items.map(item => item.id).join(',')
  useEffect(() => {
    if (!shop || !ids) { setRows({}); return }
    let cancelled = false
    void Promise.all(basket.items.map(async item => {
      const result = published
        ? await published.readRecord({ screenId: shop.detailScreenId, recordId: item.id })
        : await readBuilderV2RecordAction(app.id, app, { screenId: shop.detailScreenId, recordId: item.id })
      return [item.id, result.ok ? result.record : null] as const
    })).then(loaded => { if (!cancelled) setRows(Object.fromEntries(loaded)) })
    return () => { cancelled = true }
  }, [app, ids, published, shop, basket.items])
  if (!shop) return null
  const goods = tables.find(table => table.id === shop.catalogTableId)
  const fields = builderV2ShopCatalogFields(shop, goods)
  const priceField = goods?.fields.find(field => field.id === shop.priceFieldId)
  const loading = Boolean(ids) && basket.items.some(item => !(item.id in rows))
  const count = basket.items.length
  const meta = count === 0 ? 'Пусто' : count === 1 ? '1 позиция' : count > 1 && count < 5 ? `${count} позиции` : `${count} позиций`
  let total = 0
  const lines = basket.items.map(item => {
    const record = rows[item.id] ?? undefined
    const name = record ? builderV2CatalogCell(record, shop.productTitleFieldId) || 'Товар' : 'Загружаем товар…'
    const price = record ? Number(record.values[shop.priceFieldId]) : Number.NaN
    if (Number.isFinite(price)) total += price * item.qty
    const unit = Number.isFinite(price) ? builderV2FormattedAmount(price, 'Цена, ₽') : ''
    const lineTotal = Number.isFinite(price) ? builderV2FormattedAmount(price * item.qty, 'Сумма позиции') : unit
    const image = shop.imageFieldId && record
      ? builderV2MediaItems(record.values[shop.imageFieldId], published?.slug).find(entry => entry.image)
      : undefined
    const stock = record ? builderV2ShopStockValue(record, fields.stockFieldId) : null
    const active = record ? builderV2ShopProductActive(record, shop) : true
    const max = !active ? 0 : stock == null ? 1000 : stock
    return { item, name, unit, lineTotal, image, max }
  })
  return <div className={shell.shell} data-layout="list" data-commerce="basket">
    <header className={shell.header}>
      <div className={shell.headerCopy}>
        <h2 className={shell.headerTitle}>Корзина</h2>
        <p className={shell.headerMeta}>{meta}</p>
      </div>
    </header>
    <div className={ui.commerceLayout}>
      <section className={ui.shopBasket} data-shop-basket aria-label="Состав корзины" aria-busy={loading || undefined}>
        {lines.length === 0 ? <p className={ui.hint}>Откройте каталог и добавьте товар в корзину.</p> : <ul className={ui.shopLineList}>
          {lines.map(({ item, name, unit, lineTotal, image, max }) => (
            <li key={item.id} className={ui.shopLine}>
              <span className={ui.shopLineThumb}>{image ? <BuilderV2Picture item={image} /> : null}</span>
              <div className={ui.shopLineCopy}>
                <strong>{name}</strong>
                {unit ? <small>{unit}</small> : null}
                <div className={ui.shopQty}>
                  <ShopQtyStepper
                    name={name}
                    qty={item.qty}
                    max={max || 1}
                    disabled={max < 1}
                    onChange={next => update(changeShopBasketQty(basket, item.id, next, max))}
                  />
                  <button type="button" className={ui.shopRemove} aria-label={`Удалить: ${name}`} onClick={() => update(removeShopBasketItem(basket, item.id))}>
                    <ProtoIcon name="trash" size={18} />
                  </button>
                </div>
              </div>
              <span className={ui.shopLineAmount}>{lineTotal || ''}</span>
            </li>
          ))}
        </ul>}
        {!actor.authenticated && published && <a className={styles.primary} href={`/a/${encodeURIComponent(published.slug)}?login=1`}>Войти и оформить</a>}
        {actor.authenticated && lines.length > 0 && onCheckout
          ? <button type="button" className={`${styles.secondary} ${ui.shopCheckoutCta}`} onClick={onCheckout}>Перейти к оформлению</button>
          : null}
      </section>
      <div className={ui.commerceCheckout}>
        {lines.length > 0
          ? <p className={`${ui.orderLinesTotal} ${ui.shopBasketTotal}`}><span>Итого</span><strong>{builderV2FormattedAmount(total, 'Итого')}</strong></p>
          : null}
        {checkout}
      </div>
    </div>
  </div>
}
