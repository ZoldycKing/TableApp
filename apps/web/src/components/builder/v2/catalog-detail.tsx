import type { AppV2, AppV2Record } from '@tableapp/schema/app-v2'
import type { ReactNode } from 'react'
import type { BuilderV2Table } from '@/lib/builder-v2'
import { builderV2CatalogCell, builderV2CatalogPrice } from '@/lib/builder-v2-catalog'
import { BuilderV2Gallery } from './media'
import { builderV2MediaItems } from './media-values'
import ui from './view.module.css'

export function BuilderV2CatalogDetail({ catalog, record, table, slug, editing, children }: {
  catalog: NonNullable<AppV2['screens'][number]['catalog']>
  record?: AppV2Record
  table?: BuilderV2Table
  slug?: string
  editing?: boolean
  children?: ReactNode
}) {
  if (!record && !editing) return null
  const title = (record && builderV2CatalogCell(record, catalog.titleFieldId)) || (editing && !record ? 'Название товара или услуги' : 'Без названия')
  const price = record ? builderV2CatalogPrice(record, table?.fields.find(field => field.id === catalog.priceFieldId)) : ''
  const description = record && builderV2CatalogCell(record, catalog.descriptionFieldId)
  const image = catalog.imageFieldId && record?.values[catalog.imageFieldId]
  const hasImage = builderV2MediaItems(image, slug).some(item => item.image)

  return <section className={ui.catalogHero} data-media={hasImage}>
    {hasImage && <BuilderV2Gallery value={image} caption="" columns={1} slug={slug} alt={title} />}
    <div className={ui.catalogSummary}>
      <h1>{title}</h1>
      {price && <p className={ui.catalogPrice}>{price}</p>}
      {description && <div className={ui.catalogDescription}><h2>Описание</h2><p>{description}</p></div>}
      {children}
    </div>
  </section>
}
