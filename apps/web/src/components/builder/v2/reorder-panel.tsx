'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
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

const NO_SUPPLIER = '— не закупали'

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

  const writePayload = (next: ReorderRow[]) => {
    if (!payloadId || !context) return
    const products = next.filter(row => row.selected).map(row => ({ productId: row.productId, qty: row.qty }))
    context.change(payloadId, products.length ? JSON.stringify({ products }) : '')
  }

  const sync = (next: ReorderRow[]) => {
    setRows(next)
    writePayload(next)
  }

  // Form change() no-ops while the form is still loading; push selection once it is ready.
  useEffect(() => {
    if (!payloadId || !context?.state || context.disabled || !rows.length) return
    writePayload(rows)
  }, [Boolean(context?.state), context?.disabled, payloadId, rows])

  useEffect(() => {
    if (!published || !inventory || !payloadId || !context || hydrated.current) return
    const reorderScreen = inventory.reorderScreenId
      ? context.app.screens.find(screen => screen.id === inventory.reorderScreenId)
      : undefined
    const reorderNode = reorderScreen
      ? context.app.nodes.find(node => node.type === 'collection' && reorderScreen.rootIds.includes(node.id))
      : context.app.nodes.find(node => node.type === 'collection'
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
      // Strict below-minimum only (stock < min); ignore stale formula rows at equality.
      const mapped: ReorderRow[] = result.page.rows.flatMap(row => {
        const stock = Number(row.values[inventory.itemStockFieldId])
        const min = Number(row.values[inventory.itemMinFieldId])
        const stockN = Number.isFinite(stock) ? Math.trunc(stock) : 0
        const minN = Number.isFinite(min) ? Math.trunc(min) : 0
        if (!(stockN < minN)) return []
        const suggested = Math.max(1, minN - stockN)
        const image = inventory.itemPhotoFieldId
          ? builderV2MediaItems(row.values[inventory.itemPhotoFieldId], published.slug).find(item => item.image)
          : undefined
        const sku = inventory.itemSkuFieldId
          ? String(row.display[inventory.itemSkuFieldId] || row.values[inventory.itemSkuFieldId] || '').trim() || undefined
          : undefined
        return [{
          productId: row.id,
          name: row.display[inventory.itemNameFieldId] || 'Товар',
          sku,
          stock: stockN,
          min: minN,
          suggested,
          qty: suggested,
          selected: true,
          image,
        }]
      })
      const productIds = mapped.map(row => row.productId)
      if (productIds.length) {
        try {
          const { readPublishedV2PurchaseCostsAction, readPublishedV2ReorderHintsAction } = await import('@/app/builder-v2-published-actions')
          const [costs, hints] = await Promise.all([
            readPublishedV2PurchaseCostsAction(published.slug, { revision: published.revision, productIds }),
            readPublishedV2ReorderHintsAction(published.slug, { revision: published.revision, productIds }),
          ])
          if (costs.ok) {
            for (const row of mapped) {
              const price = costs.costs[row.productId]
              if (typeof price === 'number' && Number.isFinite(price) && price >= 0) row.lastPrice = price
            }
          }
          if (hints.ok) {
            for (const row of mapped) {
              const hint = hints.hints[row.productId]
              if (!hint) continue
              if (hint.supplier) row.lastSupplier = hint.supplier
              if (hint.price > 0) row.lastPrice = hint.price
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

  const groups = useMemo(() => {
    const map = new Map<string, ReorderRow[]>()
    for (const row of rows) {
      const key = row.lastSupplier?.trim() || NO_SUPPLIER
      const list = map.get(key) ?? []
      list.push(row)
      map.set(key, list)
    }
    return [...map.entries()].sort(([a], [b]) => {
      if (a === NO_SUPPLIER) return 1
      if (b === NO_SUPPLIER) return -1
      return a.localeCompare(b, 'ru')
    })
  }, [rows])

  if (!context || !inventory || !payloadId) return null
  const payloadInput = context.app.nodes.find(node => node.type === 'input' && node.fieldId === payloadId
    && context.app.nodes.some(form => form.id === context.scope.formId && form.type === 'form' && form.childIds.includes(node.id)))
  const error = payloadInput ? context.errors[payloadInput.id] : undefined
  const selected = rows.filter(row => row.selected)
  const selectedCount = selected.length
  const selectedSum = selected.reduce((sum, row) => sum + row.qty * (row.lastPrice ?? 0), 0)
  const orderGroups = new Set(selected.map(row => row.lastSupplier?.trim() || '')).size

  const toggle = (productId: string) => {
    sync(rows.map(row => row.productId === productId ? { ...row, selected: !row.selected } : row))
  }
  const updateQty = (productId: string, raw: string) => {
    const qty = Math.round(Number(raw))
    sync(rows.map(row => row.productId === productId
      ? { ...row, qty: Number.isFinite(qty) ? Math.min(1_000_000, Math.max(1, qty)) : row.qty, selected: true }
      : row))
  }
  const bumpQty = (productId: string, delta: number) => {
    sync(rows.map(row => {
      if (row.productId !== productId) return row
      return { ...row, qty: Math.min(1_000_000, Math.max(1, row.qty + delta)), selected: true }
    }))
  }

  return <div className={ui.reorderPanel} data-reorder-field="products">
    {error ? <p role="alert" className={ui.dataError}>{error}</p> : null}
    {note ? <p className={ui.hint}>{note}</p> : null}
    {loading ? <p className={ui.hint}>Загружаем товары…</p> : null}
    {!loading && !rows.length ? <div className={ui.collectionEmpty} data-centered>
      <strong>Всё в норме</strong>
      <p>Нет товаров с остатком ниже минимума.</p>
    </div> : null}
    {rows.length ? <div className={ui.reorderGroups}>
      {groups.map(([supplier, items]) => <section key={supplier} className={ui.reorderGroup}>
        <h3 className={ui.reorderGroupHeading}>{supplier}</h3>
        <ul className={ui.reorderList}>
          {items.map(row => {
            const below = row.stock < row.min
            const lineSum = row.qty * (row.lastPrice ?? 0)
            return <li key={row.productId} className={ui.reorderRow} data-selected={row.selected || undefined} data-low={below || undefined}>
              <label className={ui.reorderCheck}>
                <input type="checkbox" checked={row.selected} onChange={() => toggle(row.productId)} aria-label={`Выбрать ${row.name}`} />
              </label>
              <InventoryProductThumb image={row.image} size="journal" label={row.name} />
              <div className={ui.reorderCopy}>
                <strong>{row.name}</strong>
                {row.sku ? <span className={ui.purchaseEditorSku}>{row.sku}</span> : null}
                <span className={ui.reorderMobileMeta}>
                  <span data-low={below || undefined}>{row.stock} / мин. {row.min}</span>
                  <span>{row.lastSupplier || NO_SUPPLIER}</span>
                </span>
              </div>
              <span className={ui.reorderCol} data-col="stock" data-low={below || undefined}>{row.stock} / мин. {row.min}</span>
              <span className={ui.reorderCol} data-col="supplier">{row.lastSupplier || NO_SUPPLIER}</span>
              <span className={ui.reorderCol} data-col="price">{row.lastPrice != null ? purchaseMoney(row.lastPrice) : '—'}</span>
              <div className={ui.reorderQty} data-field="qty">
                <button type="button" className={ui.reorderStepper} aria-label={`Меньше: ${row.name}`} disabled={!row.selected || row.qty <= 1} onClick={() => bumpQty(row.productId, -1)}>−</button>
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
                <button type="button" className={ui.reorderStepper} aria-label={`Больше: ${row.name}`} disabled={!row.selected} onClick={() => bumpQty(row.productId, 1)}>+</button>
              </div>
              <span className={ui.reorderCol} data-col="sum">{lineSum > 0 ? purchaseMoney(lineSum) : '—'}</span>
              <span className={ui.reorderMobileSum}>{lineSum > 0 ? purchaseMoney(lineSum) : '—'}</span>
            </li>
          })}
        </ul>
      </section>)}
    </div> : null}
    {rows.length ? <div className={ui.reorderFooter}>
      <p className={ui.reorderFooterSummary}>
        Выбрано {selectedCount}
        {selectedSum > 0 ? ` · ${purchaseMoney(selectedSum)}` : ''}
        {selectedCount ? ` · будет создано ${orderGroups} ${orderGroups === 1 ? 'заказ' : orderGroups < 5 ? 'заказа' : 'заказов'}` : ''}
      </p>
      <button type="submit" className={ui.reorderFooterSubmit} disabled={!selectedCount || context.disabled}>
        Создать заказы
      </button>
    </div> : null}
  </div>
}
