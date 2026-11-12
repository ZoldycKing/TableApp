import type { AppV2, AppV2Record } from '@tableapp/schema/app-v2'
import type { BuilderV2Table } from './builder-v2'
import { builderV2CatalogCell } from './builder-v2-catalog'

export type ShopStockState = 'in' | 'low' | 'out'

/** Resolve warehouse stock for a shop product (numeric Остаток / stock field). */
export function builderV2ShopStockValue(row: AppV2Record, stockFieldId: string | undefined): number | null {
  if (!stockFieldId || !Object.hasOwn(row.values, stockFieldId)) return null
  const raw = row.values[stockFieldId]
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.max(0, Math.trunc(raw))
  if (typeof raw === 'string' && raw.trim()) {
    const parsed = Number(raw.replace(/\s/g, '').replace(',', '.'))
    return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : null
  }
  return null
}

export function builderV2ShopStockState(stock: number | null, active: boolean): ShopStockState {
  if (!active || stock === 0) return 'out'
  if (stock != null && stock > 0 && stock <= 3) return 'low'
  return 'in'
}

export function builderV2ShopStockLabel(state: ShopStockState, stock: number | null): string {
  if (state === 'out') return 'Нет в наличии'
  if (state === 'low' && stock != null) return `Осталось ${stock}`
  return 'В наличии'
}

export function builderV2ShopProductActive(row: AppV2Record, shop: NonNullable<AppV2['shop']>): boolean {
  if (!shop.activeFieldId || !Object.hasOwn(row.values, shop.activeFieldId)) return true
  return row.values[shop.activeFieldId] === true
}

/** Discover optional shop catalog columns by Russian field names when schema bindings are absent. */
export function builderV2ShopCatalogFields(shop: NonNullable<AppV2['shop']>, table: BuilderV2Table | undefined) {
  const find = (re: RegExp) => table?.fields.find(field => re.test(field.name.trim()))?.id
  return {
    stockFieldId: shop.stockFieldId ?? find(/^(?:остаток|склад(?:ской)?\s*остаток|stock)$/iu),
    categoryFieldId: shop.categoryFieldId ?? find(/^(?:категория|раздел|category)$/iu),
    materialFieldId: find(/^(?:материал|material)$/iu),
    sizeFieldId: find(/^(?:размер|size|габарит(?:ы)?)$/iu),
    colorFieldId: find(/^(?:цвет|color|colour)$/iu),
    leadFieldId: find(/^(?:срок поставки|доставка|получение|lead)$/iu),
  }
}

export function builderV2ShopSpecRows(
  row: AppV2Record,
  table: BuilderV2Table | undefined,
  fields: ReturnType<typeof builderV2ShopCatalogFields>,
): { id: string; label: string; value: string }[] {
  const specs: { id: string; label: string; value: string }[] = []
  const push = (id: string | undefined, label: string) => {
    if (!id) return
    const value = builderV2CatalogCell(row, id).trim()
    if (!value) return
    // Drop useless unit/availability rows even if somehow bound.
    if (/^(?:ед(?:иница)?\.?|шт\.?|доступен(?:\s+для\s+заказа)?)$/iu.test(label.trim())) return
    if (/^(?:да|нет|true|false)$/iu.test(value) && /доступ/i.test(label)) return
    specs.push({ id, label, value })
  }
  const category = table?.fields.find(field => field.id === fields.categoryFieldId)
  push(fields.categoryFieldId, category?.name || 'Категория')
  push(fields.sizeFieldId, table?.fields.find(field => field.id === fields.sizeFieldId)?.name || 'Размер')
  push(fields.colorFieldId, table?.fields.find(field => field.id === fields.colorFieldId)?.name || 'Цвет')
  push(fields.materialFieldId, table?.fields.find(field => field.id === fields.materialFieldId)?.name || 'Материал')
  // Lead/delivery is rendered once as «Доставка и получение», not as a duplicate spec row.
  return specs
}

export type ShopCatalogSort = 'popular' | 'price-asc' | 'price-desc' | 'new'

export const SHOP_CATALOG_SORTS: { id: ShopCatalogSort; label: string }[] = [
  { id: 'popular', label: 'Популярные' },
  { id: 'price-asc', label: 'Цена ↑' },
  { id: 'price-desc', label: 'Цена ↓' },
  { id: 'new', label: 'Новинки' },
]

export function builderV2SortShopCatalogRows(
  rows: readonly AppV2Record[],
  sort: ShopCatalogSort,
  priceFieldId: string,
): AppV2Record[] {
  const next = [...rows]
  if (sort === 'price-asc' || sort === 'price-desc') {
    const dir = sort === 'price-asc' ? 1 : -1
    next.sort((a, b) => {
      const av = typeof a.values[priceFieldId] === 'number' ? a.values[priceFieldId] as number : Number.POSITIVE_INFINITY
      const bv = typeof b.values[priceFieldId] === 'number' ? b.values[priceFieldId] as number : Number.POSITIVE_INFINITY
      return (av - bv) * dir
    })
    return next
  }
  if (sort === 'new') {
    next.reverse()
    return next
  }
  return next
}
