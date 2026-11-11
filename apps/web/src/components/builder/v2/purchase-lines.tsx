'use client'
import { useEffect, useId, useRef, useState } from 'react'
import type { AppV2Record } from '@tableapp/schema/app-v2'
import { builderV2MediaItems } from './media-values'
import { InventoryProductThumb } from './record-visuals'
import { useBuilderV2FormContext } from './form-preview'
import { usePublishedV2 } from './published-context'
import ui from './view.module.css'

type Line = { productId: string; name: string; qty: number; price: number; image?: ReturnType<typeof builderV2MediaItems>[number] }

function idsOf(value: unknown) {
  if (typeof value === 'string' && value.trim()) return [value.trim()]
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
}

function money(value: number) {
  return value.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

/** Line editor for a purchase form. Writes JSON into the hidden payload field. */
export function PurchaseLinesEditor({ record }: { record?: AppV2Record }) {
  const context = useBuilderV2FormContext()
  const published = usePublishedV2()
  const inventory = context?.app.inventory
  const searchId = useId()
  const [lines, setLines] = useState<Line[]>([])
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<Line[]>([])
  const [loading, setLoading] = useState(false)
  const [note, setNote] = useState('')
  const [lookup, setLookup] = useState('')
  const [lookupReady, setLookupReady] = useState(false)
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
        return [{ productId, name, qty: Number.isFinite(qty) && qty > 0 ? qty : 1, price: Number.isFinite(price) && price >= 0 ? price : 0, image }]
      })
      hydrated.current = key
      sync(next)
      setLoading(false)
    }).catch(() => { if (!cancelled) { setNote('Не удалось загрузить позиции'); setLoading(false) } })
    return () => { cancelled = true }
  }, [record?.id, published?.revision, payloadId])

  useEffect(() => {
    if (!published || !inventory) return
    const itemsNode = context?.app.nodes.find(node => node.type === 'collection' && node.layout === 'list' && context.app.sources.some(source => source.id === node.sourceId && source.tableId === inventory.itemsTableId && !source.screenTableId))
    if (!itemsNode) {
      setLookup('Список товаров недоступен')
      setLookupReady(true)
      return
    }
    const timer = setTimeout(() => {
      void published.readData({ nodeId: itemsNode.id, screenId: inventory.itemsScreenId, search: query.trim() }).then(result => {
        if (!result.ok) {
          setLookup(result.error)
          setHits([])
          setLookupReady(true)
          return
        }
        setLookup('')
        setLookupReady(true)
        setHits(result.page.rows.slice(0, 8).map(row => {
          const price = Number(row.values[inventory.itemCostFieldId])
          const image = inventory.itemPhotoFieldId ? builderV2MediaItems(row.values[inventory.itemPhotoFieldId], published.slug).find(item => item.image) : undefined
          return { productId: row.id, name: row.display[inventory.itemNameFieldId] || 'Товар', qty: 1, price: Number.isFinite(price) && price >= 0 ? price : 0, image }
        }))
      }).catch(() => {
        setLookup('Не удалось загрузить товары')
        setHits([])
        setLookupReady(true)
      })
    }, 200)
    return () => clearTimeout(timer)
  }, [query, published?.revision, published?.dataVersion, inventory?.itemsScreenId, Boolean(context)])

  if (!context || !inventory || !payloadId) return null
  const payloadInput = context.app.nodes.find(node => node.type === 'input' && node.fieldId === payloadId && context.app.nodes.some(form => form.id === context.scope.formId && form.type === 'form' && form.childIds.includes(node.id)))
  const error = payloadInput ? context.errors[payloadInput.id] : undefined
  const total = lines.reduce((sum, line) => sum + line.qty * line.price, 0)
  const add = (hit: Line) => {
    if (lines.some(line => line.productId === hit.productId)) return
    sync([...lines, hit])
    setQuery('')
  }
  return <div className={ui.purchaseEditor}>
    <div className={ui.purchaseEditorHead}>
      <h3>Позиции</h3>
      <strong>{lines.length ? `${money(total)} ₽` : 'Добавьте товар'}</strong>
    </div>
    {error ? <p role="alert" className={ui.dataError}>{error}</p> : null}
    {note ? <p className={ui.hint}>{note}</p> : null}
    {loading ? <p className={ui.hint}>Загружаем позиции…</p> : null}
    <ul className={ui.purchaseEditorLines}>
      {lines.map(line => <li key={line.productId} className={ui.purchaseEditorLine}>
        <InventoryProductThumb image={line.image} size="journal" label={line.name} />
        <div className={ui.purchaseEditorCopy}>
          <strong>{line.name}</strong>
          <span>{money(line.qty * line.price)} ₽</span>
        </div>
        <label className={ui.purchaseEditorField}>
          <span>Кол-во</span>
          <input type="number" inputMode="numeric" min={1} max={1000000} step={1} value={line.qty} aria-label={`Количество: ${line.name}`} onChange={event => {
            const qty = Math.round(Number(event.target.value))
            sync(lines.map(item => item.productId === line.productId ? { ...item, qty: Number.isFinite(qty) ? Math.min(1_000_000, Math.max(1, qty)) : item.qty } : item))
          }} />
        </label>
        <label className={ui.purchaseEditorField}>
          <span>Цена, ₽</span>
          <input type="number" inputMode="decimal" min={0} step="0.01" value={line.price} aria-label={`Цена: ${line.name}`} onChange={event => {
            const price = Number(event.target.value)
            sync(lines.map(item => item.productId === line.productId ? { ...item, price: Number.isFinite(price) ? Math.max(0, price) : item.price } : item))
          }} />
        </label>
        <button type="button" className={ui.purchaseEditorRemove} aria-label={`Убрать ${line.name}`} onClick={() => sync(lines.filter(item => item.productId !== line.productId))}>Убрать</button>
      </li>)}
    </ul>
    <label className={ui.purchaseEditorSearch} htmlFor={searchId}>
      <span>Товар</span>
      <input id={searchId} type="search" placeholder="Найти по названию или артикулу" value={query} maxLength={200} onChange={event => setQuery(event.target.value)} />
    </label>
    {hits.length ? <ul className={ui.purchasePicks}>
      {hits.map(hit => {
        const taken = lines.some(line => line.productId === hit.productId)
        return <li key={hit.productId}>
          <button type="button" className={ui.purchasePick} disabled={taken} onClick={() => add(hit)}>
            <InventoryProductThumb image={hit.image} size="journal" label={hit.name} />
            <span>{hit.name}</span>
            <strong>{taken ? 'Уже в заказе' : 'Добавить'}</strong>
          </button>
        </li>
      })}
    </ul> : <p className={ui.hint}>{lookup || (lookupReady && query.trim() ? 'Ничего не нашлось. Уточните название.' : published ? 'Найдите товар по названию или артикулу.' : 'Список товаров откроется в опубликованном приложении.')}</p>}
  </div>
}
