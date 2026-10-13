'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { confirmOrderStockAction, issueOrderStockAction, readInventoryBalanceAction, readOrderStockAction } from '@/app/order-stock-actions'
import type { OrderStockState, StockBalanceState } from '@/lib/order-stock-config'

type Props = { tableId: string; rowId: string; version: number; slug?: string; business?: boolean }
export function OrderStockPanel({ tableId, rowId, version, slug, business = false }: Props) {
  const [state, setState] = useState<OrderStockState | null>(null), [error, setError] = useState<string | null>(null), [pending, start] = useTransition()
  const generation = useRef(0), router = useRouter()
  useEffect(() => {
    const request = ++generation.current; setState(null); setError(null)
    void readOrderStockAction(tableId, rowId, slug, business).then(result => { if (generation.current === request && result.ok) setState(result.state) }).catch(() => {})
    return () => { generation.current++ }
  }, [tableId, rowId, version, slug, business])
  if (!state) return null
  const label = ({ waiting: 'Ожидает подтверждения', reserved: 'Товары закреплены за заказом', released: 'Резерв освобождён', issued: 'Товары выданы со склада', returned: 'Товары возвращены на склад' } as const)[state.state]
  const run = (issue: boolean) => {
    const request = generation.current
    start(async () => {
      setError(null)
      try {
        const result = await (issue ? issueOrderStockAction : confirmOrderStockAction)(tableId, rowId, version, slug, business)
        if (request !== generation.current) return
        if (!result.ok) { setError(result.error); return }
        const updated = await readOrderStockAction(tableId, rowId, slug, business)
        if (request !== generation.current) return
        if (updated.ok) setState(updated.state); else setError(updated.error)
        router.refresh()
      } catch {
        if (request === generation.current) setError('Не удалось получить ответ. Обновите карточку и проверьте состояние заказа перед повтором.')
      }
    })
  }
  return <section aria-label="Товары заказа" className="mt-4 min-w-0 space-y-3 rounded-2xl border border-sand-200 bg-white p-4 [overflow-wrap:anywhere]">
    <p className="font-semibold">{label}</p>
    {state.state === 'waiting' ? <p className="text-xs leading-relaxed text-ink-muted">Подтверждение закрепит товары за заказом. Получение оплаты согласуется отдельно.</p> : null}
    {state.state === 'reserved' ? <p className="text-xs leading-relaxed text-ink-muted">Отмена освободит товары. Выдача или передача курьеру спишет их со склада один раз.</p> : null}
    {state.reason ? <p className="text-xs leading-relaxed text-ink-muted">{state.reason}</p> : null}
    {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
    {state.canConfirm || state.canIssue ? <button type="button" disabled={pending} onClick={() => run(state.canIssue)} className="rounded-xl bg-sage-700 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40">{pending ? 'Сохранение…' : state.canIssue ? 'Выдать заказ' : 'Подтвердить заказ'}</button> : null}
  </section>
}

export function InventoryBalancePanel({ tableId, rowId, version, slug, business = false }: Props) {
  const [state, setState] = useState<StockBalanceState | null>(null), generation = useRef(0)
  useEffect(() => {
    const request = ++generation.current; setState(null)
    void readInventoryBalanceAction(tableId, rowId, slug, business).then(result => { if (request === generation.current && result.ok) setState(result.state) }).catch(() => {})
    return () => { generation.current++ }
  }, [tableId, rowId, version, slug, business])
  return state ? <section aria-label="Доступность товара" className="mt-4 grid grid-cols-3 gap-3 rounded-2xl border border-sand-200 bg-white p-4 text-center"><div><p className="text-xs text-ink-muted">На складе</p><p className="mt-1 font-semibold tabular-nums">{state.stock}</p></div><div><p className="text-xs text-ink-muted">В заказах</p><p className="mt-1 font-semibold tabular-nums">{state.reserved}</p></div><div><p className="text-xs text-ink-muted">Свободно</p><p className="mt-1 font-semibold tabular-nums">{state.available}</p></div></section> : null
}
