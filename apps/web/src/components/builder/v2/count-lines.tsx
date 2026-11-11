'use client'
import { useEffect, useRef, useState } from 'react'
import type { AppV2Record } from '@tableapp/schema/app-v2'
import { builderV2MediaItems } from './media-values'
import { InventoryProductThumb } from './record-visuals'
import { useBuilderV2FormContext } from './form-preview'
import { usePublishedV2 } from './published-context'
import ui from './view.module.css'

type CountLine = {
  productId: string
  name: string
  sku?: string
  systemQty: number
  actualQty: number
  image?: ReturnType<typeof builderV2MediaItems>[number]
}

function idsOf(value: unknown) {
  if (typeof value === 'string' && value.trim()) return [value.trim()]
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
}

/** Line editor for inventory count forms. Writes `{lines:[{productId,actualQty}]}` into the payload field. */
export function CountLinesEditor({ record }: { record?: AppV2Record }) {
  const context = useBuilderV2FormContext()
  const published = usePublishedV2()
  const inventory = context?.app.inventory
  const [lines, setLines] = useState<CountLine[]>([])
  const [loading, setLoading] = useState(false)
  const [note, setNote] = useState('')
  const hydrated = useRef<string | null>(null)
  const payloadId = inventory?.countPayloadFieldId
  const createMode = Boolean(inventory?.createCountFormId && context?.scope.formId === inventory.createCountFormId)

  const sync = (next: CountLine[]) => {
    setLines(next)
    if (!payloadId) return
    context?.change(payloadId, JSON.stringify({ lines: next.map(line => ({ productId: line.productId, actualQty: line.actualQty })) }))
  }

  useEffect(() => {
    if (!inventory?.inventoryCountLinesTableId || !inventory.countLinesFieldId || !payloadId || !published) return
    const key = record?.id ?? 'new'
    if (hydrated.current === key) return
    if (!record || createMode) {
      hydrated.current = key
      if (createMode) context?.change(payloadId, '')
      else sync([])
      return
    }
    const lineIds = idsOf(record.values[inventory.countLinesFieldId])
    if (!lineIds.length) {
      hydrated.current = key
      sync([])
      return
    }
    let cancelled = false
    setLoading(true)
    void import('@/app/builder-v2-published-actions').then(async ({ readPublishedV2RelatedRowsAction }) => {
      const linesResult = await readPublishedV2RelatedRowsAction(published.slug, {
        revision: published.revision, tableId: inventory.inventoryCountLinesTableId!, recordIds: lineIds,
      })
      if (cancelled) return
      if (!linesResult.ok) { setNote(linesResult.error); setLoading(false); return }
      const productIds = [...new Set(linesResult.rows.flatMap(row => idsOf(row.values[inventory.countLineProductFieldId ?? ''])))]
      const products = productIds.length && inventory.countLineProductFieldId
        ? await readPublishedV2RelatedRowsAction(published.slug, { revision: published.revision, tableId: inventory.itemsTableId, recordIds: productIds })
        : { ok: true as const, rows: [] }
      if (cancelled) return
      const byId = new Map((products.ok ? products.rows : []).map(row => [row.id, row]))
      const next = linesResult.rows.flatMap(row => {
        const productId = idsOf(row.values[inventory.countLineProductFieldId ?? ''])[0]
        if (!productId) return []
        const product = byId.get(productId)
        const systemQty = Number(row.values[inventory.countLineSystemFieldId ?? ''])
        const actualQty = Number(row.values[inventory.countLineActualFieldId ?? ''])
        const image = product && inventory.itemPhotoFieldId
          ? builderV2MediaItems(product.values[inventory.itemPhotoFieldId], published.slug).find(item => item.image)
          : undefined
        const name = product?.display[inventory.itemNameFieldId]
          || row.display[inventory.countLineNameFieldId ?? '']
          || 'Товар'
        const sku = product && inventory.itemSkuFieldId
          ? String(product.display[inventory.itemSkuFieldId] || product.values[inventory.itemSkuFieldId] || '').trim() || undefined
          : undefined
        return [{
          productId,
          name,
          sku,
          systemQty: Number.isFinite(systemQty) ? Math.trunc(systemQty) : 0,
          actualQty: Number.isFinite(actualQty) ? Math.trunc(actualQty) : (Number.isFinite(systemQty) ? Math.trunc(systemQty) : 0),
          image,
        }]
      })
      hydrated.current = key
      sync(next)
      setLoading(false)
    }).catch(() => { if (!cancelled) { setNote('Не удалось загрузить позиции'); setLoading(false) } })
    return () => { cancelled = true }
  }, [record?.id, published?.revision, payloadId, createMode])

  if (!context || !inventory || !payloadId) return null
  const payloadInput = context.app.nodes.find(node => node.type === 'input' && node.fieldId === payloadId && context.app.nodes.some(form => form.id === context.scope.formId && form.type === 'form' && form.childIds.includes(node.id)))
  const error = payloadInput ? context.errors[payloadInput.id] : undefined

  if (createMode) {
    return <div className={ui.countEditor} data-count-field="lines" data-mode="create">
      <p className={ui.hint}>После сохранения появятся все товары склада</p>
      {error ? <p role="alert" className={ui.dataError}>{error}</p> : null}
    </div>
  }

  const updateActual = (productId: string, raw: string) => {
    const qty = Math.round(Number(raw))
    sync(lines.map(item => item.productId === productId
      ? { ...item, actualQty: Number.isFinite(qty) ? Math.min(1_000_000, Math.max(0, qty)) : item.actualQty }
      : item))
  }

  return <div className={ui.countEditor} data-count-field="lines" data-mode="edit">
    <div className={ui.purchaseEditorHead}>
      <h3>Позиции</h3>
      {lines.length ? <span>{lines.length} поз.</span> : null}
    </div>
    {error ? <p role="alert" className={ui.dataError}>{error}</p> : null}
    {note ? <p className={ui.hint}>{note}</p> : null}
    {loading ? <p className={ui.hint}>Загружаем позиции…</p> : null}
    {!loading && !lines.length ? <p className={ui.hint}>Нет позиций для пересчёта</p> : null}
    {lines.length ? <ul className={ui.purchaseEditorLines}>
      {lines.map(line => <li key={line.productId} className={`${ui.purchaseEditorLine} ${ui.countEditorLine}`}>
        <InventoryProductThumb image={line.image} size="journal" label={line.name} />
        <div className={ui.purchaseEditorCopy}>
          <strong>{line.name}</strong>
          {line.sku ? <span className={ui.purchaseEditorSku}>{line.sku}</span> : null}
          <span className={ui.countEditorSystem}>Учёт: {line.systemQty}</span>
        </div>
        <label className={ui.purchaseEditorField} data-field="actual">
          <span>Факт</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={1000000}
            step={1}
            value={line.actualQty}
            aria-label={`Факт: ${line.name}`}
            onChange={event => updateActual(line.productId, event.target.value)}
          />
        </label>
      </li>)}
    </ul> : null}
  </div>
}
