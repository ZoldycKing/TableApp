'use client'

import { useEffect, useRef, useState } from 'react'
import type { InventoryConfig } from '@tableapp/schema'
import { newId } from '@tableapp/schema'
import { receiveStockAction, type SavedReceipt } from '@/app/inventory-actions'
import { useRouter } from 'next/navigation'
import type { RuntimeApp } from '@/lib/app-runtime'
import { useUnsaved } from '@/lib/unsaved'
import { formatCell } from '@/lib/format'
import { Icon } from './icons'
import { accentClasses } from './bindings'
import { navFromHistory, withNav } from './nav-history'

export function InventoryReceipt({ runtime, itemId, config, demo, onBack }: {
  runtime: RuntimeApp; itemId: string | null; config: InventoryConfig; demo: boolean; onBack: () => void
}) {
  const router = useRouter()
  const accent = accentClasses(runtime.app.theme.accent)
  const table = runtime.tables[config.tables.items]
  const item = table?.rows.find(row => row.id === itemId)
  const canReceive = runtime.app.screens.some(screen => screen.id === config.receiptScreenId && screen.type === 'form' &&
    [config.movement.item, config.movement.qty].every(fieldId => screen.components.some(component => component.type === 'form_field' && component.fieldId === fieldId)))
  const noteAllowed = runtime.app.screens.some(screen => screen.id === config.receiptScreenId && screen.type === 'form' && screen.components
    .some(component => component.type === 'form_field' && component.fieldId === config.movement.note))
  const [quantity, setQuantity] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState<SavedReceipt | null>(null)
  const sending = useRef(false)
  const receiptId = useRef<string>(newId('row'))
  const dirty = !saved && (quantity !== '' || note !== '')
  useUnsaved(`receipt:${runtime.app.id}:${itemId}`, dirty)
  useEffect(() => {
    const entry = navFromHistory(window.history.state, id => runtime.app.screens.some(screen => screen.id === id))?.stack.at(-1)
    const receipt = entry?.screenId === config.receiptScreenId && entry.rowId === itemId ? entry.receipt : undefined
    receiptId.current = receipt?.operationId ?? newId('row')
    setQuantity(''); setNote(''); setError(''); setSaved(receipt?.result ?? null)
    // Only reset on another item; live data must not clear the current form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId, config.receiptScreenId])
  const stockField = table?.fields.find(field => field.id === config.item.stock)
  const stock = stockField && item ? formatCell(stockField, item.data[config.item.stock]) : '—'
  const title = item ? String(item.data[config.item.name] ?? 'Товар') : ''
  const submit = async () => {
    if (sending.current) return
    if (demo) { setError('Это предпросмотр: приёмка не будет записана.'); return }
    if (!item) return
    sending.current = true; setBusy(true); setError('')
    try {
      const result = await receiveStockAction(runtime.app.slug, { id: receiptId.current, itemId: item.id, quantity: Number(quantity), note: noteAllowed ? note : '' })
      if (!result.ok) { setError(result.error); return }
      setSaved(result)
      const nav = navFromHistory(window.history.state, id => runtime.app.screens.some(screen => screen.id === id))
      const entry = nav?.stack.at(-1)
      if (nav && entry?.screenId === config.receiptScreenId && entry.rowId === item.id) {
        const stack = [...nav.stack.slice(0, -1), { ...entry, receipt: { operationId: receiptId.current, result } }]
        // Keep confirmation across a server refresh, scoped to this history entry.
        window.history.replaceState(withNav(null, { ...nav, stack }), '')
      }
      router.refresh()
    } catch {
      setError('Не удалось получить ответ. Повторите сохранение — приёмка не задвоится.')
    } finally { sending.current = false; setBusy(false) }
  }
  if (!item) return <div className="rounded-2xl border border-sand-200 bg-white p-5 text-sm text-ink-soft">Выберите товар в списке «Товары».<button type="button" onClick={onBack} className="mt-3 block text-sage-700 underline">К товарам</button></div>
  if (!canReceive) return <p className="rounded-2xl border border-sand-200 bg-white p-5 text-sm text-ink-soft">Приёмка вам недоступна. Владелец должен открыть поля товара и количества для вашей роли.</p>
  if (saved) return <div className="space-y-4 rounded-2xl border border-sand-200 bg-white p-5 shadow-soft sm:p-6" role="status">
    <p className="flex items-center gap-2 text-sm font-semibold text-sage-700"><Icon name="check" />{saved.repeated ? 'Приёмка уже записана' : 'Приёмка записана'}</p>
    <p className="text-sm">{saved.name}</p>
    <p className="text-sm text-ink-soft">{saved.repeated ? `Повторно товар не добавлен. Текущий остаток: ${saved.after} шт.` : `Принято ${saved.quantity} шт. Остаток: ${saved.before} → ${saved.after} шт.`}</p>
    <button type="button" onClick={onBack} className={`rounded-xl px-4 py-3 text-sm font-medium text-white ${accent.bg}`}>К товарам</button>
  </div>
  return <form className="space-y-5 rounded-2xl border border-sand-200 bg-white p-5 shadow-soft sm:p-6" onSubmit={event => { event.preventDefault(); void submit() }}>
    <div><h2 className="text-base font-semibold">{title}</h2><p className="mt-1 text-xs text-ink-muted">Сейчас на складе: <strong className="font-medium tabular-nums text-ink">{stock} шт</strong></p></div>
    {demo && <p className="rounded-lg bg-sand-100 px-3 py-2 text-xs text-ink-soft">Предпросмотр: данные не сохраняются.</p>}
    <label className="block space-y-1.5"><span className="text-[13px] font-medium text-ink-soft">Принято, шт</span>
      <input type="number" inputMode="numeric" required min="1" max="1000000" step="1" value={quantity} disabled={busy}
        onChange={event => { setQuantity(event.target.value); setError('') }} className="w-full rounded-xl border border-sand-200 px-3 py-2.5 text-sm outline-none focus:border-sage-500" /></label>
    {noteAllowed && <label className="block space-y-1.5"><span className="text-[13px] font-medium text-ink-soft">Комментарий <small className="font-normal text-ink-muted">необязательно</small></span>
      <textarea value={note} maxLength={2000} disabled={busy} rows={2} onChange={event => setNote(event.target.value)} className="w-full resize-y rounded-xl border border-sand-200 px-3 py-2.5 text-sm outline-none focus:border-sage-500" /></label>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <button type="submit" disabled={busy} className={`flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-soft hover:brightness-95 disabled:opacity-60 ${accent.bg}`}><Icon name="check" className="size-4" />{busy ? 'Сохраняем…' : 'Принять товар'}</button>
    <p className="text-xs leading-relaxed text-ink-muted">Приёмка попадёт в журнал с вашей почтой и временем. Остаток пересчитается автоматически.</p>
  </form>
}
