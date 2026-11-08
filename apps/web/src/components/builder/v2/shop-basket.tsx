'use client'

import { useEffect, useState } from 'react'
import type { AppV2, AppV2Actor, AppV2Record } from '@tableapp/schema/app-v2'
import { readBuilderV2RecordAction } from '@/app/builder-v2-data-actions'
import type { BuilderV2Table } from '@/lib/builder-v2'
import { builderV2CatalogCell, builderV2CatalogPrice } from '@/lib/builder-v2-catalog'
import { addShopBasketItem, changeShopBasketQty, readShopBasket, removeShopBasketItem, subscribeShopBasket, writeShopBasket, type ShopBasket } from '@/lib/shop-basket'
import styles from '../prototype/prototype.module.css'
import { usePublishedV2 } from './published-context'
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

export function ShopBasketPanel({ app, tables, actor, onCheckout }: { app: AppV2; tables: readonly BuilderV2Table[]; actor: AppV2Actor; onCheckout?: () => void }) {
  const shop = app.shop, published = usePublishedV2()
  const { basket, update } = useShopBasket(app.id)
  const [rows, setRows] = useState<Record<string, AppV2Record | null>>({})
  const ids = basket.items.map(item => item.id).join(',')
  useEffect(() => {
    if (!shop || !ids) return
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
  const priceField = goods?.fields.find(field => field.id === shop.priceFieldId)
  let total = 0
  return <section className={ui.shopBasket} aria-label="Корзина">
    <h2>Ваш заказ</h2>
    {basket.items.length === 0 ? <p className={ui.hint}>Откройте карточку товара и добавьте его в корзину.</p> : basket.items.map(item => {
      const record = rows[item.id] ?? undefined
      const name = record ? builderV2CatalogCell(record, shop.productTitleFieldId) || 'Товар' : 'Загружаем товар…'
      const price = record ? Number(record.values[shop.priceFieldId]) : Number.NaN
      if (Number.isFinite(price)) total += price * item.qty
      const label = record && priceField ? builderV2CatalogPrice(record, priceField) : ''
      return <div key={item.id} className={ui.shopLine}>
        <p>{name}</p>
        <div>
          <label>Количество
            <input aria-label={`Количество: ${name}`} type="number" min={1} max={1000} step={1} value={item.qty} onChange={event => update(changeShopBasketQty(basket, item.id, Number(event.target.value)))} />
          </label>
          <span>{label}</span>
          <button type="button" onClick={() => update(removeShopBasketItem(basket, item.id))}>Удалить</button>
        </div>
      </div>
    })}
    <p className={ui.shopTotal}><span>Итого по каталогу</span><strong>{total.toLocaleString('ru-RU')} ₽</strong></p>
    <p className={ui.hint}>Цена подтверждается сервером при оформлении. Изменение каталога не меняет уже принятый заказ.</p>
    {!actor.authenticated && published && <a className={styles.primary} href={`/a/${encodeURIComponent(published.slug)}?login=1`}>Войти и оформить</a>}
    {actor.authenticated && basket.items.length > 0 && onCheckout && <button type="button" className={styles.secondary} onClick={onCheckout}>Перейти к контактам</button>}
  </section>
}
