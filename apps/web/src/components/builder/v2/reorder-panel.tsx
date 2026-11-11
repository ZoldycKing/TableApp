'use client'
import { useEffect, useRef, useState } from 'react'
import { purchaseMoney } from '@/lib/purchase-format'
import { builderV2MediaItems } from './media-values'
import { InventoryProductThumb } from './record-visuals'
import { useBuilderV2FormContext } from './form-preview'
import { usePublishedV2 } from './published-context'
import ui from './view.module.css'

type ReorderRow = {
  productId: string
  name: string
  sku?: string
  stock: number
  min: number
  suggested: number
  qty: number
  selected: boolean
  lastSupplier?: string
  lastPrice?: number
  image?: ReturnType<typeof builderV2MediaItems>[number]
}

function idsOf(value: unknown) {
  if (typeof value === 'string' && value.trim()) return [value.trim()]
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
}

/** Multi-select low-stock list for «Что заказать». Writes `{products:[{productId,qty}]}`. */
export function ReorderPanel() {
  const context = useBuilderV2FormContext()
  const published = usePublishedV2()
  const inventory = context?.app.inventory
  const [rows, setRows] = useState<ReorderRow[]>([])
  const [loading, setLoading] = useState(false)
  const [note, setNote] = useState('')
  const hydrated = useRef(false)
  const payloadId = inventory?.reorderPayloadFieldId ?? inventory?.purchasePayloadFieldId

  const sync = (next: ReorderRow[]) => {
    setRows(next)
    if (!payloadId || !context) return
    const products = next.filter(row => row.selected).map(row => ({ productId: row.productId, qty: row.qty }))
    context.change(payloadId, products.length ? JSON.stringify({ products }) : '')
  }

  useEffect(() => {
    if (!published || !inventory || !payloadId || !context || hydrated.current) return
    const reorderNode = context.app.nodes.find(node => node.type === 'collection'
      && context.app.sources.some(source => source.id === node.sourceId
        && source.tableId === inventory.itemsTableId
        && source.filter
        && 'op' in source.filter
        && source.filter.op === 'eq'
        && 'left' in source.filter
        && typeof source.filter.left === 'object'
        && source.filter.left
        && 'fieldId' in source.filter.left
        && source.filter.left.fieldId === inventory.itemLowFieldId))
    if (!reorderNode || !inventory.reorderScreenId) {
      setNote('Список товаров к заказу недоступен')
      return
    }
    let cancelled = false
    setLoading(true)
    void published.readData({ nodeId: reorderNode.id, screenId: inventory.reorderScreenId }).then(async result => {
      if (cancelled) return
      if (!result.ok) {
        setNote(result.error)
        setLoading(false)
        return
      }
      const mapped: ReorderRow[] = result.page.rows.map(row => {
        const stock = Number(row.values[inventory.itemStockFieldId])
        const min = Number(row.values[inventory.itemMinFieldId])
        const stockN = Number.isFinite(stock) ? Math.trunc(stock) : 0
        const minN = Number.isFinite(min) ? Math.trunc(min) : 0
        const suggested = Math.max(1, minN - stockN)
        const image = inventory.itemPhotoFieldId
          ? builderV2MediaItems(row.values[inventory.itemPhotoFieldId], published.slug).find(item => item.image)
          : undefined
        const sku = inventory.itemSkuFieldId
          ? String(row.display[inventory.itemSkuFieldId] || row.values[inventory.itemSkuFieldId] || '').trim() || undefined
          : undefined
        return {
          productId: row.id,
          name: row.display[inventory.itemNameFieldId] || 'Товар',
          sku,
          stock: stockN,
          min: minN,
          suggested,
          qty: suggested,
          selected: true,
          image,
        }
      })
      const productIds = mapped.map(row => row.productId)
      if (productIds.length) {
        try {
          const { readPublishedV2PurchaseCostsAction, readPublishedV2RelatedRowsAction } = await import('@/app/builder-v2-published-actions')
          const costs = await readPublishedV2PurchaseCostsAction(published.slug, { revision: published.revision, productIds })
          if (costs.ok) {
            for (const row of mapped) {
              const price = costs.costs[row.productId]
              if (typeof price === 'number' && Number.isFinite(price) && price >= 0) row.lastPrice = price
            }
          }
          if (inventory.purchaseOrdersTableId && inventory.purchaseLinesTableId && inventory.purchasesScreenId) {
            const purchasesNode = context.app.nodes.find(node => node.type === 'collection' && context.app.sources.some(source =>
              source.id === node.sourceId && source.tableId === inventory.purchaseOrdersTableId && !source.screenTableId))
            if (purchasesNode) {
              const purchases = await published.readData({ nodeId: purchasesNode.id, screenId: inventory.purchasesScreenId })
              if (purchases.ok) {
                const received = purchases.page.rows.filter(row => inventory.statusReceived
                  && inventory.purchaseStatusFieldId
                  && row.values[inventory.purchaseStatusFieldId] === inventory.statusReceived)
                const allLineIds = received.flatMap(row => inventory.purchaseLinesFieldId ? idsOf(row.values[inventory.purchaseLinesFieldId]) : [])
                if (allLineIds.length) {
                  const lines = await readPublishedV2RelatedRowsAction(published.slug, {
                    revision: published.revision, tableId: inventory.purchaseLinesTableId, recordIds: allLineIds.slice(0, 200),
                  })
                  if (lines.ok) {
                    const best = new Map<string, { at: string; supplier: string; price: number }>()
                    for (const order of received) {
                      const at = String(order.values[inventory.purchaseReceivedAtFieldId ?? '']
                        ?? order.values[inventory.purchaseDateFieldId ?? '']
                        ?? '')
                      const supplier = inventory.purchaseSupplierFieldId
                        ? String(order.display[inventory.purchaseSupplierFieldId] || '').trim()
                        : ''
                      const orderLineIds = new Set(inventory.purchaseLinesFieldId ? idsOf(order.values[inventory.purchaseLinesFieldId]) : [])
                      for (const line of lines.rows) {
                        if (!orderLineIds.has(line.id)) continue
                        const productId = idsOf(line.values[inventory.lineProductFieldId ?? ''])[0]
                        if (!productId) continue
                        const price = Number(line.values[inventory.linePriceFieldId ?? ''])
                        const current = best.get(productId)
                        if (!current || at > current.at) {
                          best.set(productId, {
                            at,
                            supplier,
                            price: Number.isFinite(price) && price >= 0 ? price : 0,
                          })
                        }
                      }
                    }
                    for (const row of mapped) {
                      const hint = best.get(row.productId)
                      if (!hint) continue
                      if (hint.supplier) row.lastSupplier = hint.supplier
                      if (hint.price > 0) row.lastPrice = hint.price
                    }
                  }
                }
              }
            }
          }
        } catch {
          // Hints are optional; selection still works without supplier/price.
        }
      }
      if (cancelled) return
      hydrated.current = true
      sync(mapped)
      setLoading(false)
    }).catch(() => {
      if (!cancelled) {
        setNote('Не удалось загрузить товары')
        setLoading(false)
      }
    })
    return () => { cancelled = true }
  }, [published?.revision, published?.dataVersion, payloadId, Boolean(context)])

  if (!context || !inventory || !payloadId) return null
  const payloadInput = context.app.nodes.find(node => node.type === 'input' && node.fieldId === payloadId
    && context.app.nodes.some(form => form.id === context.scope.formId && form.type === 'form' && form.childIds.includes(node.id)))
  const error = payloadInput ? context.errors[payloadInput.id] : undefined
  const selectedCount = rows.filter(row => row.selected).length

  const toggle = (productId: string) => {
    sync(rows.map(row => row.productId === productId ? { ...row, selected: !row.selected } : row))
  }
  const updateQty = (productId: string, raw: string) => {
    const qty = Math.round(Number(raw))
    sync(rows.map(row => row.productId === productId
      ? { ...row, qty: Number.isFinite(qty) ? Math.min(1_000_000, Math.max(1, qty)) : row.qty, selected: true }
      : row))
  }

  return <div className={ui.reorderPanel} data-reorder-field="products">
    <div className={ui.purchaseEditorHead}>
      <h3>Товары ниже минимума</h3>
      {rows.length ? <span>{selectedCount} из {rows.length}</span> : null}
    </div>
    {error ? <p role="alert" className={ui.dataError}>{error}</p> : null}
    {note ? <p className={ui.hint}>{note}</p> : null}
    {loading ? <p className={ui.hint}>Загружаем товары…</p> : null}
    {!loading && !rows.length ? <div className={ui.collectionEmpty} data-centered>
      <strong>Всё в норме</strong>
      <p>Нет товаров с остатком ниже минимума.</p>
    </div> : null}
    {rows.length ? <ul className={ui.reorderList}>
      {rows.map(row => <li key={row.productId} className={ui.reorderRow} data-selected={row.selected || undefined}>
        <label className={ui.reorderCheck}>
          <input type="checkbox" checked={row.selected} onChange={() => toggle(row.productId)} aria-label={`Выбрать ${row.name}`} />
          <InventoryProductThumb image={row.image} size="journal" label={row.name} />
        </label>
        <div className={ui.reorderCopy}>
          <strong>{row.name}</strong>
          {row.sku ? <span className={ui.purchaseEditorSku}>{row.sku}</span> : null}
          <span className={ui.reorderMeta}>
            <span>{row.stock} / мин. {row.min}</span>
            {row.lastSupplier ? <span>{row.lastSupplier}</span> : null}
            {row.lastPrice != null ? <span>{purchaseMoney(row.lastPrice)}</span> : null}
          </span>
        </div>
        <label className={ui.purchaseEditorField} data-field="qty">
          <span>Кол-во</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={1000000}
            step={1}
            value={row.qty}
            disabled={!row.selected}
            aria-label={`Количество: ${row.name}`}
            onChange={event => updateQty(row.productId, event.target.value)}
          />
        </label>
      </li>)}
    </ul> : null}
  </div>
}
