import { PRODUCTS } from './catalog-data'
import { ProductGlyph } from './product-glyph'

const COLS = 'grid grid-cols-[2.1fr_0.85fr_0.8fr_0.5fr]'

/**
 * Каталог в таблице: артикулы, наименования, цены, остатки и картинки.
 * Показан целиком и читаемо — человек должен увидеть свои данные,
 * а не гадать, что скрыто за обрезанным краем.
 */
export function CatalogTable() {
  return (
    <div className="rounded-2xl border border-sand-200 bg-white p-3 shadow-soft">
      <div className="mb-3 flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full bg-sand-300" />
        <span className="h-2.5 w-2.5 rounded-full bg-sand-300" />
        <span className="h-2.5 w-2.5 rounded-full bg-sand-300" />
        <span className="ml-2 truncate text-xs text-ink-muted">
          Каталог · 412 товаров
        </span>
      </div>

      <div className="overflow-hidden rounded-xl border border-sand-200">
        <div className={`${COLS} bg-sand-100 text-[11px] font-medium text-ink-muted`}>
          <span className="border-r border-sand-200 px-2 py-2">Наименование</span>
          <span className="border-r border-sand-200 px-2 py-2">Артикул</span>
          <span className="border-r border-sand-200 px-2 py-2">Цена</span>
          <span className="px-2 py-2">Ост.</span>
        </div>

        {PRODUCTS.map((item, index) => (
          <div
            key={item.code}
            className={`${COLS} border-t border-sand-200 text-[12px] ${
              index % 2 === 1 ? 'bg-sand-50/60' : 'bg-white'
            }`}
          >
            <span className="flex min-w-0 items-center gap-2 border-r border-sand-200 px-2 py-1.5">
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded ${item.tint}`}>
                <ProductGlyph kind={item.glyph} className={`h-5 w-5 ${item.ink}`} />
              </span>
              <span className="truncate">{item.name}</span>
            </span>
            <span className="truncate border-r border-sand-200 px-2 py-2 tabular-nums text-ink-muted">
              {item.code}
            </span>
            <span className="whitespace-nowrap border-r border-sand-200 px-2 py-2 text-right tabular-nums">
              {item.price}
            </span>
            <span className="px-2 py-2 text-right tabular-nums">{item.stock}</span>
          </div>
        ))}


      </div>

    </div>
  )
}
