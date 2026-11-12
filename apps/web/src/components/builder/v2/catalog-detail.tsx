import type { AppV2, AppV2Record } from '@tableapp/schema/app-v2'
import type { ReactNode } from 'react'
import type { BuilderV2Table } from '@/lib/builder-v2'
import { builderV2CatalogCell, builderV2CatalogPrice } from '@/lib/builder-v2-catalog'
import { builderV2ShopCatalogFields, builderV2ShopProductActive, builderV2ShopStockLabel, builderV2ShopStockState, builderV2ShopStockValue } from '@/lib/builder-v2-shop-stock'
import { BuilderV2Gallery } from './media'
import { builderV2MediaItems } from './media-values'
import { ShopCatalogBack, ShopStockPill } from './shop-storefront'
import ui from './view.module.css'

export function BuilderV2CatalogDetail({
  catalog,
  record,
  table,
  slug,
  editing,
  shop,
  onBack,
  actions,
  children,
}: {
  catalog: NonNullable<AppV2['screens'][number]['catalog']>
  record?: AppV2Record
  table?: BuilderV2Table
  slug?: string
  editing?: boolean
  shop?: NonNullable<AppV2['shop']> | null
  onBack?: () => void
  actions?: ReactNode
  children?: ReactNode
}) {
  if (!record && !editing) return null
  const title = (record && builderV2CatalogCell(record, catalog.titleFieldId)) || (editing && !record ? 'Название товара или услуги' : 'Без названия')
  const price = record ? builderV2CatalogPrice(record, table?.fields.find(field => field.id === catalog.priceFieldId)) : ''
  const description = record && builderV2CatalogCell(record, catalog.descriptionFieldId)
  const image = catalog.imageFieldId && record?.values[catalog.imageFieldId]
  const hasImage = builderV2MediaItems(image, slug).some(item => item.image)
  const stockMeta = shop && record ? (() => {
    const fields = builderV2ShopCatalogFields(shop, table)
    const stock = builderV2ShopStockValue(record, fields.stockFieldId)
    const active = builderV2ShopProductActive(record, shop)
    const state = builderV2ShopStockState(stock, active)
    return { stock, state, label: builderV2ShopStockLabel(state, stock) }
  })() : null

  return <>
    {onBack ? <div className={ui.catalogPageBack}><ShopCatalogBack onClick={onBack} /></div> : null}
    <section className={ui.catalogHero} data-media={hasImage}>
      {hasImage && <div className={ui.catalogHeroMedia}><BuilderV2Gallery value={image} caption="" columns={1} slug={slug} alt={title} /></div>}
      <div className={ui.catalogSummary}>
        <h1>{title}</h1>
        {price && <p className={ui.catalogPrice}>{price}</p>}
        {stockMeta ? <ShopStockPill state={stockMeta.state} stock={stockMeta.stock} /> : null}
        {actions}
        {description && <div className={ui.catalogDescription}><h2>Описание</h2><p>{description}</p></div>}
        {children}
      </div>
    </section>
  </>
}
