'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { confirmOrderStockAction, issueOrderStockAction, readInventoryBalanceAction, readOrderStockAction, returnOrderStockAction } from '@/app/order-stock-actions'
import type { OrderStockState, StockBalanceState } from '@/lib/order-stock-config'

type Props = { tableId: string; rowId: string; version: number; slug?: string; business?: boolean }
export function OrderStockPanel({ tableId, rowId, version, slug, business = false }: Props) {
  const identity = JSON.stringify([tableId, rowId, version, slug, business])
  const context = useRef(identity); context.current = identity
  const [loaded, setLoaded] = useState<{ identity: string; state: OrderStockState } | null>(null)
  const [error, setError] = useState<string | null>(null), [pending, setPending] = useState(false), [confirmReturn, setConfirmReturn] = useState(false)
  const generation = useRef(0), inFlight = useRef<number | null>(null), router = useRouter()
  useEffect(() => {
    const request = ++generation.current; setLoaded(null); setError(null); setPending(false); setConfirmReturn(false); inFlight.current = null
    void readOrderStockAction(tableId, rowId, slug, business).then(result => {
      if (generation.current === request && context.current === identity && result.ok) setLoaded(result.state ? { identity, state: result.state } : null)
    }).catch(() => {})
    return () => { generation.current++ }
  }, [tableId, rowId, version, slug, business])
  const state = loaded?.identity === identity ? loaded.state : null
  if (!state) return null
  const label = ({ waiting: 'Ожидает подтверждения', reserved: 'Товары закреплены за заказом', released: 'Резерв освобождён', issued: 'Товары выданы со склада', returned: 'Товары возвращены на склад' } as const)[state.state]
  const run = async (operation: 'confirm' | 'issue' | 'return') => {
    if (context.current !== identity || inFlight.current === generation.current || operation === 'return' && state.canReturn !== true || operation === 'issue' && !state.canIssue || operation === 'confirm' && !state.canConfirm) return
    const request = generation.current
    const current = () => request === generation.current && context.current === identity
    inFlight.current = request; setPending(true); setError(null)
    try {
      const action = operation === 'return' ? returnOrderStockAction : operation === 'issue' ? issueOrderStockAction : confirmOrderStockAction
      const result = await action(tableId, rowId, version, slug, business)
      if (!current()) return
      if (!result.ok) { setError(result.error); return }
      const updated = await readOrderStockAction(tableId, rowId, slug, business)
      if (!current()) return
      if (updated.ok) setLoaded(updated.state ? { identity, state: updated.state } : null); else setError(updated.error)
      setConfirmReturn(false)
      router.refresh()
    } catch {
      if (current()) setError('Не удалось получить ответ. Обновите карточку и проверьте состояние заказа перед повтором.')
    } finally {
      if (inFlight.current === request) inFlight.current = null
      if (current()) setPending(false)
    }
  }
  return <section aria-label="Товары заказа" className="mt-4 min-w-0 space-y-3 rounded-2xl border border-sand-200 bg-white p-4 [overflow-wrap:anywhere]">
    <p className="font-semibold">{label}</p>
    {state.state === 'waiting' ? <p className="text-xs leading-relaxed text-ink-muted">Подтверждение закрепит товары за заказом. Получение оплаты согласуется отдельно.</p> : null}
    {state.state === 'reserved' ? <p className="text-xs leading-relaxed text-ink-muted">Отмена освободит товары. Выдача или передача курьеру спишет их со склада один раз.</p> : null}
    {state.reason ? <p className="text-xs leading-relaxed text-ink-muted">{state.reason}</p> : null}
    {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
    {state.canConfirm || state.canIssue || state.canReturn === true && !confirmReturn ? <div className="flex flex-wrap items-center gap-2">
      {state.canConfirm || state.canIssue ? <button type="button" disabled={pending} onClick={() => void run(state.canIssue ? 'issue' : 'confirm')} className="rounded-xl bg-sage-700 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40">{pending ? 'Сохранение…' : state.canIssue ? 'Выдать заказ' : 'Подтвердить заказ'}</button> : null}
      {state.canReturn === true && !confirmReturn ? <button type="button" disabled={pending} onClick={() => { setError(null); setConfirmReturn(true) }} className="rounded-xl border border-sand-200 px-4 py-2.5 text-sm font-medium text-ink-soft hover:bg-sand-50 disabled:opacity-40">Оформить возврат</button> : null}
    </div> : null}
    {state.canReturn === true && confirmReturn ? <div className="space-y-3 rounded-xl border border-sand-200 bg-sand-50 p-3">
      <p className="text-sm leading-relaxed text-ink-soft">Подтвердите, что все товары заказа фактически приняты обратно. Они вернутся на склад; возврат оплаты согласуется с клиентом отдельно.</p>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={pending} onClick={() => void run('return')} className="rounded-xl bg-sage-700 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40">{pending ? 'Сохранение…' : 'Подтвердить возврат'}</button>
        <button type="button" disabled={pending} onClick={() => { setConfirmReturn(false); setError(null) }} className="rounded-xl border border-sand-200 bg-white px-4 py-2.5 text-sm text-ink-soft hover:bg-sand-50 disabled:opacity-40">Отмена</button>
      </div>
    </div> : null}
  </section>
}

export function InventoryBalancePanel({ tableId, rowId, version, slug, business = false }: Props) {
  const [state, setState] = useState<StockBalanceState | null>(null), generation = useRef(0)
  useEffect(() => {
    const request = ++generation.current; setState(null)
    void readInventoryBalanceAction(tableId, rowId, slug, business).then(result => { if (request === generation.current && result.ok) setState(result.state) }).catch(() => {})
    return () => { generation.current++ }
  }, [tableId, rowId, version, slug, business])
  return state ? <section aria-label="Доступность товара" className="mt-4 grid grid-cols-3 gap-3 rounded-2xl border border-sand-200 bg-white p-4 text-center @min-[860px]:divide-x @min-[860px]:divide-sand-200 @min-[860px]:py-6">{[
    ['На складе', state.stock], ['В заказах', state.reserved], ['Свободно', state.available],
  ].map(([label, value]) => <div key={label}><p className="text-xs text-ink-muted">{label}</p><p className="mt-1 font-semibold tabular-nums @min-[860px]:mt-2 @min-[860px]:text-2xl">{value}</p></div>)}</section> : null
}
