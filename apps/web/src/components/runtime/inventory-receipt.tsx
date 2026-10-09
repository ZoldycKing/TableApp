'use client'

import { useEffect, useRef, useState } from 'react'
import type { InventoryConfig, InventoryOperation } from '@tableapp/schema'
import { newId } from '@tableapp/schema'
import { receiveStockAction, saveStockOperationAction, type SavedReceipt } from '@/app/inventory-actions'
import { INVENTORY_COPY, inventoryScreen } from '@/lib/inventory'
import { useRouter } from 'next/navigation'
import type { RuntimeApp } from '@/lib/app-runtime'
import { useUnsaved } from '@/lib/unsaved'
import { formatCell } from '@/lib/format'
import { Icon } from './icons'
import { accentClasses } from './bindings'
import { navFromHistory, withNav, type NavEntry } from './nav-history'

export function InventoryReceipt({ runtime, itemId, config, demo, onBack, operation = 'receipt', confirmation, onSaved }: {
  runtime: RuntimeApp; itemId: string | null; config: InventoryConfig; demo: boolean; onBack: () => void; operation?: InventoryOperation
  confirmation?: NavEntry['receipt']; onSaved?: (receipt: NonNullable<NavEntry['receipt']>) => void
}) {
  const copy = INVENTORY_COPY[operation], screenId = inventoryScreen(config, operation)
  const router = useRouter()
  const accent = accentClasses(runtime.app.theme.accent)
  const table = runtime.tables[config.tables.items]
  const item = table?.rows.find(row => row.id === itemId)
  const canReceive = runtime.app.screens.some(screen => screen.id === screenId && screen.type === 'form' &&
    [config.movement.item, config.movement.qty].every(fieldId => screen.components.some(component => component.type === 'form_field' && component.fieldId === fieldId)))
  const noteAllowed = runtime.app.screens.some(screen => screen.id === screenId && screen.type === 'form' && screen.components
    .some(component => component.type === 'form_field' && component.fieldId === config.movement.note))
  const [quantity, setQuantity] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState<SavedReceipt | null>(null)
  const sending = useRef(false)
  const receiptId = useRef<string>(newId('row'))
  const baseVersion = useRef(item?.version)
  const dirty = !saved && (quantity !== '' || note !== '')
  useUnsaved(`inventory:${runtime.app.id}:${screenId}:${itemId}`, dirty)
  useEffect(() => {
    const entry = navFromHistory(window.history.state, id => runtime.app.screens.some(screen => screen.id === id))?.stack.at(-1)
    const candidate = confirmation ?? (entry?.screenId === screenId && entry.rowId === itemId ? entry.receipt : undefined)
    const receipt = candidate && (candidate.result.operation ?? 'receipt') === operation ? candidate : undefined
    receiptId.current = receipt?.operationId ?? newId('row')
    baseVersion.current = item?.version
    setQuantity(''); setNote(''); setError(''); setSaved(receipt?.result ?? null)
    // Only reset on another item; live data must not clear the current form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId, screenId])
  const stockField = table?.fields.find(field => field.id === config.item.stock)
  const stock = stockField && item ? formatCell(stockField, item.data[config.item.stock]) : '—'
  const previewStock = operation === 'stocktake' ? Number(quantity) : Number(item?.data[config.item.stock]) + copy.sign * Number(quantity)
  const title = item ? String(item.data[config.item.name] ?? 'Товар') : ''
  const submit = async () => {
    if (sending.current) return
    if (demo) { setError('Это предпросмотр: операция не будет записана.'); return }
    if (!item) return
    sending.current = true; setBusy(true); setError('')
    try {
      const input = { id: receiptId.current, itemId: item.id, quantity: Number(quantity), note: noteAllowed ? note : '',
        ...(operation === 'stocktake' ? { baseVersion: baseVersion.current } : {}) }
      const result = operation === 'receipt' ? await receiveStockAction(runtime.app.slug, input) : await saveStockOperationAction(runtime.app.slug, operation, input)
      if (!result.ok) { setError(result.error); return }
      setSaved(result)
      onSaved?.({ operationId: receiptId.current, result })
      const nav = navFromHistory(window.history.state, id => runtime.app.screens.some(screen => screen.id === id))
      const entry = nav?.stack.at(-1)
      if (!onSaved && nav && entry?.screenId === screenId && entry.rowId === item.id) {
        const stack = [...nav.stack.slice(0, -1), { ...entry, receipt: { operationId: receiptId.current, result } }]
        // Keep confirmation across a server refresh, scoped to this history entry.
        window.history.replaceState(withNav(null, { ...nav, stack }), '')
      }
      router.refresh()
    } catch {
      setError('Не удалось получить ответ. Повторите сохранение — операция не задвоится.')
    } finally { sending.current = false; setBusy(false) }
  }
  if (!item) return <div className="rounded-2xl border border-sand-200 bg-white p-5 text-sm text-ink-soft">Выберите товар в списке «Товары».<button type="button" onClick={onBack} className="mt-3 block text-sage-700 underline">К товарам</button></div>
  if (!canReceive || (copy.reason && !noteAllowed)) return <p className="rounded-2xl border border-sand-200 bg-white p-5 text-sm text-ink-soft">{copy.name} вам недоступна. Владелец должен открыть поля товара, количества и комментария для вашей роли.</p>
  if (saved) return <div className="space-y-4 rounded-2xl border border-sand-200 bg-white p-5 shadow-soft sm:p-6" role="status">
    <p className="flex items-center gap-2 text-sm font-semibold text-sage-700"><Icon name="check" />{operation === 'receipt' ? saved.repeated ? 'Приёмка уже записана' : 'Приёмка записана' : saved.repeated ? 'Операция уже записана' : 'Операция записана'}</p>
    <p className="text-sm">{saved.name}</p>
    <p className="text-sm text-ink-soft">{saved.legacyRepeat ? `Повторно остаток не изменён. Текущий остаток: ${saved.after} шт.` : <>{saved.repeated ? 'Повторно остаток не изменён. ' : ''}{operation === 'stocktake' ? `Фактический остаток: ${saved.quantity} шт.` : `${copy.done} ${saved.quantity} шт.`} Остаток при этой операции: {saved.before} → {saved.after} шт.</>}</p>
    <button type="button" onClick={onBack} className={`rounded-xl px-4 py-3 text-sm font-medium text-white ${accent.bg}`}>К товарам</button>
  </div>
  return <form className="space-y-5 rounded-2xl border border-sand-200 bg-white p-5 shadow-soft sm:p-6" onSubmit={event => { event.preventDefault(); void submit() }}>
    <div><h2 className="text-base font-semibold">{title}</h2><p className="mt-1 text-xs text-ink-muted">Сейчас на складе: <strong className="font-medium tabular-nums text-ink">{stock} шт</strong></p></div>
    {demo && <p className="rounded-lg bg-sand-100 px-3 py-2 text-xs text-ink-soft">Предпросмотр: данные не сохраняются.</p>}
    <label className="block space-y-1.5"><span className="text-[13px] font-medium text-ink-soft">{copy.quantity}</span>
      <input type="number" inputMode="numeric" required min={operation === 'stocktake' ? 0 : 1} max="1000000" step="1" value={quantity} disabled={busy}
        onChange={event => { setQuantity(event.target.value); setError('') }} className="w-full rounded-xl border border-sand-200 px-3 py-2.5 text-sm outline-none focus:border-sage-500" /></label>
    {operation === 'stocktake' && <p className="text-xs leading-relaxed text-ink-soft">Пересчитайте товар и укажите полное количество, которое есть сейчас. Сохранится только разница с учётным остатком.</p>}
    {noteAllowed && <label className="block space-y-1.5"><span className="text-[13px] font-medium text-ink-soft">{copy.note} {!copy.reason && <small className="font-normal text-ink-muted">необязательно</small>}</span>
      <textarea value={note} required={copy.reason} maxLength={2000} disabled={busy} rows={2} onChange={event => setNote(event.target.value)} className="w-full resize-y rounded-xl border border-sand-200 px-3 py-2.5 text-sm outline-none focus:border-sage-500" /></label>}
    {quantity !== '' && Number.isSafeInteger(Number(quantity)) && Number(quantity) >= (operation === 'stocktake' ? 0 : 1) && <p className={`rounded-lg px-3 py-2 text-sm ${previewStock < 0 ? 'bg-red-50 text-red-700' : 'bg-sand-100 text-ink-soft'}`}>
      {previewStock < 0 ? `Недостаточно товара: доступно ${stock} шт. Уменьшите количество.` : <>Остаток после операции: <strong className="tabular-nums text-ink">{previewStock} шт.</strong></>}
    </p>}
    {operation === 'stocktake' && item.version !== baseVersion.current && <p role="alert" className="text-sm text-amber-800">Товар изменился, пока форма была открыта. Вернитесь к товарам и откройте инвентаризацию заново.</p>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <button type="submit" disabled={busy} className={`flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-soft hover:brightness-95 disabled:opacity-60 ${accent.bg}`}><Icon name="check" className="size-4" />{busy ? 'Сохраняем…' : copy.action}</button>
    <p className="text-xs leading-relaxed text-ink-muted">Операция попадёт в журнал с вашей почтой и временем. Остаток пересчитается автоматически.</p>
  </form>
}
