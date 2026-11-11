'use client'
import { useEffect, useId, useRef, useState } from 'react'
import type { AppV2Record } from '@tableapp/schema/app-v2'
import { purchaseMoney } from '@/lib/purchase-format'
import { builderV2MediaItems } from './media-values'
import { InventoryProductThumb } from './record-visuals'
import { useBuilderV2FormContext } from './form-preview'
import { usePublishedV2 } from './published-context'
import { usePurchaseDialogTotal } from './purchase-dialog-total'
import { ProtoIcon } from '../prototype/icons'
import styles from '../prototype/prototype.module.css'
import ui from './view.module.css'

type Line = {
  productId: string
  name: string
  sku?: string
  qty: number
  price: number
  image?: ReturnType<typeof builderV2MediaItems>[number]
}

function idsOf(value: unknown) {
  if (typeof value === 'string' && value.trim()) return [value.trim()]
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
}

/** Line editor for a purchase form. Writes JSON into the hidden payload field. */
export function PurchaseLinesEditor({ record }: { record?: AppV2Record }) {
  const context = useBuilderV2FormContext()
  const published = usePublishedV2()
  const setDialogTotal = usePurchaseDialogTotal()
  const inventory = context?.app.inventory
  const searchId = useId()
  const [lines, setLines] = useState<Line[]>([])
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<Line[]>([])
  const [loading, setLoading] = useState(false)
  const [note, setNote] = useState('')
  const [lookup, setLookup] = useState('')
  const [lookupReady, setLookupReady] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const hydrated = useRef<string | null>(null)
  const payloadId = inventory?.purchasePayloadFieldId

  const sync = (next: Line[]) => {
    setLines(next)
    if (!payloadId) return
    context?.change(payloadId, JSON.stringify({ lines: next.map(line => ({ productId: line.productId, qty: line.qty, price: line.price })) }))
  }

  useEffect(() => {
    if (!inventory?.purchaseLinesTableId || !inventory.purchaseLinesFieldId || !payloadId || !published) return
    const key = record?.id ?? 'new'
    if (hydrated.current === key) return
    if (!record) {
      hydrated.current = key
      sync([])
      return
    }
    const lineIds = idsOf(record.values[inventory.purchaseLinesFieldId])
    if (!lineIds.length) {
      hydrated.current = key
      sync([])
      return
    }
    let cancelled = false
    setLoading(true)
    void import('@/app/builder-v2-published-actions').then(async ({ readPublishedV2RelatedRowsAction }) => {
      const linesResult = await readPublishedV2RelatedRowsAction(published.slug, { revision: published.revision, tableId: inventory.purchaseLinesTableId!, recordIds: lineIds })
      if (cancelled) return
      if (!linesResult.ok) { setNote(linesResult.error); setLoading(false); return }
      const productIds = [...new Set(linesResult.rows.flatMap(row => idsOf(row.values[inventory.lineProductFieldId ?? ''])))]
      const products = productIds.length && inventory.lineProductFieldId
        ? await readPublishedV2RelatedRowsAction(published.slug, { revision: published.revision, tableId: inventory.itemsTableId, recordIds: productIds })
        : { ok: true as const, rows: [] }
      if (cancelled) return
      const byId = new Map((products.ok ? products.rows : []).map(row => [row.id, row]))
      const next = linesResult.rows.flatMap(row => {
        const productId = idsOf(row.values[inventory.lineProductFieldId ?? ''])[0]
        if (!productId) return []
        const product = byId.get(productId)
        const qty = Number(row.values[inventory.lineQtyFieldId ?? ''])
        const price = Number(row.values[inventory.linePriceFieldId ?? ''])
        const image = product && inventory.itemPhotoFieldId
          ? builderV2MediaItems(product.values[inventory.itemPhotoFieldId], published.slug).find(item => item.image)
          : undefined
        const name = product?.display[inventory.itemNameFieldId] || row.display[inventory.lineNameFieldId ?? ''] || 'Товар'
        const sku = product && inventory.itemSkuFieldId
          ? String(product.display[inventory.itemSkuFieldId] || product.values[inventory.itemSkuFieldId] || '').trim() || undefined
          : undefined
        return [{ productId, name, sku, qty: Number.isFinite(qty) && qty > 0 ? qty : 1, price: Number.isFinite(price) && price >= 0 ? price : 0, image }]
      })
      hydrated.current = key
      sync(next)
      setLoading(false)
    }).catch(() => { if (!cancelled) { setNote('Не удалось загрузить позиции'); setLoading(false) } })
    return () => { cancelled = true }
  }, [record?.id, published?.revision, payloadId])

  useEffect(() => {
    if (!published || !inventory || !searchOpen) return
    const itemsNode = context?.app.nodes.find(node => node.type === 'collection' && node.layout === 'list' && context.app.sources.some(source => source.id === node.sourceId && source.tableId === inventory.itemsTableId && !source.screenTableId))
    if (!itemsNode) {
      setLookup('Список товаров недоступен')
      setLookupReady(true)
      return
    }
    setLookupReady(false)
    const timer = setTimeout(() => {
      void published.readData({ nodeId: itemsNode.id, screenId: inventory.itemsScreenId, search: query.trim() }).then(async result => {
        if (!result.ok) {
          setLookup(result.error)
          setHits([])
          setLookupReady(true)
          return
        }
        setLookup('')
        const mapped = result.page.rows.slice(0, 8).map(row => {
          const price = Number(row.values[inventory.itemCostFieldId])
          const image = inventory.itemPhotoFieldId ? builderV2MediaItems(row.values[inventory.itemPhotoFieldId], published.slug).find(item => item.image) : undefined
          const sku = inventory.itemSkuFieldId
            ? String(row.display[inventory.itemSkuFieldId] || row.values[inventory.itemSkuFieldId] || '').trim() || undefined
            : undefined
          return {
            productId: row.id,
            name: row.display[inventory.itemNameFieldId] || 'Товар',
            sku,
            qty: 1,
            price: Number.isFinite(price) && price >= 0 ? price : 0,
            image,
          }
        })
        const missing = mapped.filter(hit => !(hit.price > 0)).map(hit => hit.productId)
        if (missing.length) {
          const { readPublishedV2PurchaseCostsAction } = await import('@/app/builder-v2-published-actions')
          const costs = await readPublishedV2PurchaseCostsAction(published.slug, { revision: published.revision, productIds: missing })
          if (costs.ok) {
            for (const hit of mapped) {
              const price = costs.costs[hit.productId]
              if (typeof price === 'number' && Number.isFinite(price) && price >= 0) hit.price = price
            }
          }
        }
        setLookupReady(true)
        setHits(mapped)
      }).catch(() => {
        setLookup('Не удалось загрузить товары')
        setHits([])
        setLookupReady(true)
      })
    }, 120)
    return () => clearTimeout(timer)
  }, [query, searchOpen, published?.revision, published?.dataVersion, inventory?.itemsScreenId, Boolean(context)])

  const total = lines.reduce((sum, line) => sum + line.qty * line.price, 0)
  useEffect(() => {
    setDialogTotal?.(total)
    return () => setDialogTotal?.(null)
  }, [total, setDialogTotal])

  if (!context || !inventory || !payloadId) return null
  const payloadInput = context.app.nodes.find(node => node.type === 'input' && node.fieldId === payloadId && context.app.nodes.some(form => form.id === context.scope.formId && form.type === 'form' && form.childIds.includes(node.id)))
  const error = payloadInput ? context.errors[payloadInput.id] : undefined
  const add = (hit: Line) => {
    if (lines.some(line => line.productId === hit.productId)) return
    sync([...lines, hit])
    setQuery('')
    setSearchOpen(false)
  }
  const updateQty = (productId: string, raw: string) => {
    const qty = Math.round(Number(raw))
    sync(lines.map(item => item.productId === productId
      ? { ...item, qty: Number.isFinite(qty) ? Math.min(1_000_000, Math.max(1, qty)) : item.qty }
      : item))
  }
  const updatePrice = (productId: string, raw: string) => {
    const price = Number(raw)
    sync(lines.map(item => item.productId === productId
      ? { ...item, price: Number.isFinite(price) ? Math.max(0, price) : item.price }
      : item))
  }
  return <div className={ui.purchaseEditor} data-purchase-field="lines">
    <div className={ui.purchaseEditorHead}>
      <h3>Позиции</h3>
      {lines.length ? <span>{lines.length} поз. · {purchaseMoney(total)}</span> : null}
    </div>
    {error ? <p role="alert" className={ui.dataError}>{error}</p> : null}
    {note ? <p className={ui.hint}>{note}</p> : null}
    {loading ? <p className={ui.hint}>Загружаем позиции…</p> : null}
    {!loading && !lines.length ? <div className={ui.purchaseEditorEmpty}>
      <p>Добавьте товары в заказ</p>
      {!searchOpen ? <button type="button" className={styles.primary} onClick={() => setSearchOpen(true)}>Добавить товар</button> : null}
    </div> : null}
    {lines.length ? <ul className={ui.purchaseEditorLines}>
      {lines.map(line => <li key={line.productId} className={ui.purchaseEditorLine}>
        <InventoryProductThumb image={line.image} size="journal" label={line.name} />
        <div className={ui.purchaseEditorCopy}>
          <strong>{line.name}</strong>
          {line.sku ? <span className={ui.purchaseEditorSku}>{line.sku}</span> : null}
        </div>
        <label className={ui.purchaseEditorField} data-field="qty">
          <span>Кол-во</span>
          <input type="number" inputMode="numeric" min={1} max={1000000} step={1} value={line.qty} aria-label={`Количество: ${line.name}`} onChange={event => updateQty(line.productId, event.target.value)} />
        </label>
        <label className={ui.purchaseEditorField} data-field="price">
          <span>Цена, ₽</span>
          <input type="number" inputMode="decimal" min={0} step="0.01" value={line.price} aria-label={`Цена: ${line.name}`} onChange={event => updatePrice(line.productId, event.target.value)} />
        </label>
        <strong className={ui.purchaseEditorTotal}>{purchaseMoney(line.qty * line.price)}</strong>
        <button type="button" className={ui.purchaseEditorRemove} aria-label={`Убрать ${line.name}`} onClick={() => sync(lines.filter(item => item.productId !== line.productId))}>
          <ProtoIcon name="trash" size={18} />
        </button>
      </li>)}
    </ul> : null}
    {searchOpen ? <div className={ui.purchaseEditorSearchBlock}>
      <label className={ui.purchaseEditorSearch} htmlFor={searchId}>
        <span>Найти товар</span>
        <input id={searchId} type="search" placeholder="Название или артикул" value={query} maxLength={200} autoFocus onChange={event => setQuery(event.target.value)} />
      </label>
      <button type="button" className={styles.textButton} onClick={() => { setSearchOpen(false); setQuery('') }}>Скрыть поиск</button>
      {hits.length ? <ul className={ui.purchasePicks}>
        {hits.map(hit => {
          const taken = lines.some(line => line.productId === hit.productId)
          return <li key={hit.productId}>
            <button type="button" className={ui.purchasePick} disabled={taken} onClick={() => add(hit)}>
              <InventoryProductThumb image={hit.image} size="journal" label={hit.name} />
              <span className={ui.purchasePickCopy}>
                <strong>{hit.name}</strong>
                {hit.sku ? <small>{hit.sku}</small> : null}
              </span>
              <span className={ui.purchasePickAction}>{taken ? 'Уже в заказе' : 'Добавить'}</span>
            </button>
          </li>
        })}
      </ul> : <p className={ui.hint}>{lookup || (!lookupReady ? 'Ищем товары…' : query.trim() ? 'Ничего не нашлось. Уточните название.' : published ? 'Товары не найдены.' : 'Список товаров откроется в опубликованном приложении.')}</p>}
    </div> : lines.length ? <button type="button" className={styles.secondary} onClick={() => setSearchOpen(true)}>Добавить товар</button> : null}
  </div>
}
