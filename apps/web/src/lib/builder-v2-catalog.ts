import type { AppV2, AppV2Node, AppV2Record } from '@tableapp/schema/app-v2'
import type { BuilderV2Table } from './builder-v2'
import type { BuilderV2DataRecord } from './builder-v2-data-types'

type Catalog = NonNullable<AppV2['screens'][number]['catalog']>
type Collection = Extract<AppV2Node, { type: 'collection' }>
type Column = BuilderV2Table['fields'][number]

export const builderCatalogImageField = (field: Column) => field.type === 'image' || field.type === 'url'
export const builderV2CardLayout = (layout: Collection['layout']) => layout === 'cards' || layout === 'tiles' || layout === 'catalog'

export function builderV2CatalogDefaults(table: BuilderV2Table): Catalog | undefined {
  const find = (names: RegExp, types: string[]) => table.fields.find(field => types.includes(field.type) && names.test(field.name.trim()))?.id
  const title = find(/^(название(?:\s+.+)?|товар|услуга|наименование(?:\s+.+)?|title|name|product(?: name)?|service(?: name)?)$/iu, ['text', 'long_text'])
  const titleFieldId = title ?? table.primaryFieldId ?? table.fields[0]?.id
  if (!titleFieldId) return
  const imageFieldId = table.fields.find(field => field.type === 'image')?.id ?? find(/фото|изображение|картинка|image|photo|picture/iu, ['url'])
  const priceFieldId = find(/^(?:цена|стоимость|price)(?:\s|[,(_]|$)/iu, ['number', 'formula', 'rollup', 'text'])
  const descriptionFieldId = find(/^(?:описание|description|подробности)(?:\s|$)/iu, ['text', 'long_text'])
  return {
    titleFieldId,
    ...(imageFieldId ? { imageFieldId } : {}),
    ...(priceFieldId ? { priceFieldId } : {}),
    ...(descriptionFieldId ? { descriptionFieldId } : {}),
  }
}

export function builderV2StarterCatalog(table: BuilderV2Table): Catalog | undefined {
  if (!/^(?:(?:каталог\s+)?(?:товары|товаров|услуги|услуг)|прайс(?:-лист)?|products?|services?|product catalog|service catalog)$/iu.test(table.name.trim())) return
  const fields = builderV2CatalogDefaults(table)
  return fields?.priceFieldId || fields?.imageFieldId ? fields : undefined
}

export function builderV2CatalogCollection(node: Collection, catalog: Catalog): Collection {
  const { listGroupFieldId: _listGroup, recordGroup: _recordGroup, dateFieldId: _date, groupFieldId: _group, kanbanMoveRoleIds: _roles, cardImageFieldId: _image, cardDetailFieldId: _detail, ...base } = node
  return {
    ...base,
    layout: 'catalog',
    titleFieldId: catalog.titleFieldId,
    subtitleFieldId: null,
    ...(catalog.imageFieldId ? { cardImageFieldId: catalog.imageFieldId } : {}),
    ...(catalog.priceFieldId ? { cardDetailFieldId: catalog.priceFieldId } : {}),
  }
}

export function builderV2CatalogCell(row: AppV2Record, fieldId: string | undefined): string {
  if (!fieldId || !Object.hasOwn(row.values, fieldId)) return ''
  return (row as Partial<BuilderV2DataRecord>).display?.[fieldId] ?? String(row.values[fieldId] ?? '')
}

export function builderV2CatalogPrice(row: AppV2Record, field: Column | undefined): string {
  if (!field) return ''
  const label = builderV2CatalogCell(row, field.id)
  const value = row.values[field.id]
  if (typeof value !== 'number' || !Number.isFinite(value)) return label
  if (!/[₽$€£₸]/u.test(field.name) && label) return label
  return builderV2FormattedAmount(value, field.name)
}

export function builderV2FormattedAmount(value: number, fieldName: string): string {
  const symbol = fieldName.match(/[₽$€£₸]/u)?.[0]
    ?? (/^(?:сумма|итого|total|amount)\b/iu.test(fieldName.trim()) ? '₽' : undefined)
  const amount = value.toLocaleString('ru-RU', { maximumFractionDigits: 2 })
  return symbol ? `${amount} ${symbol}` : amount
}
