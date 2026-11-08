'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { confirmOrderStockAction, issueOrderStockAction, readInventoryBalanceAction, readOrderStockAction, returnOrderStockAction } from '@/app/order-stock-actions'
import type { OrderStockState, StockBalanceState } from '@/lib/order-stock-config'
import { accentTones } from './ui'
import { Icon } from './icons'

type Props = { tableId: string; rowId: string; version: number; slug?: string; business?: boolean }
export function OrderStockPanel({ tableId, rowId, version, slug, business = false, embedded = false, accent, pickup = false }: Props & { embedded?: boolean; accent?: string; pickup?: boolean }) {
  const identity = JSON.stringify([tableId, rowId, version, slug, business])
  const recordIdentity = JSON.stringify([tableId, rowId, slug, business])
  const context = useRef(identity); context.current = identity
  const [loaded, setLoaded] = useState<{ identity: string; state: OrderStockState } | null>(null)
  const [error, setError] = useState<string | null>(null), [pending, setPending] = useState(false), [confirmReturn, setConfirmReturn] = useState(false)
  const [read, setRead] = useState<{ identity: string; loading: boolean; error: string | null } | null>(null), [retry, setRetry] = useState(0)
  const generation = useRef(0), inFlight = useRef<number | null>(null), router = useRouter()
  const [notice, setNotice] = useState<{ identity: string; text: string } | null>(null)
  const tones = accent ? accentTones(accent) : { solid: 'bg-sage-700', soft: 'bg-sage-50', text: 'text-sage-700' }
  useEffect(() => {
    const request = ++generation.current; setLoaded(null); setError(null); setPending(false); setConfirmReturn(false); inFlight.current = null
    setRead({ identity, loading: true, error: null })
    void readOrderStockAction(tableId, rowId, slug, business).then(result => {
      if (generation.current !== request || context.current !== identity) return
      if (result.ok) setLoaded(result.state ? { identity, state: result.state } : null)
      setRead({ identity, loading: false, error: result.ok ? null : result.error })
    }).catch(() => {
      if (generation.current === request && context.current === identity) setRead({ identity, loading: false, error: 'Не удалось загрузить состояние товаров заказа. Проверьте соединение и попробуйте ещё раз.' })
    })
    return () => { generation.current++ }
  }, [tableId, rowId, version, slug, business, retry])
  const state = loaded?.identity === identity ? loaded.state : null
  if (read?.identity !== identity || read.loading || read.error) return <StockReadStatus label="Товары заказа" loading={read?.identity !== identity || read.loading} error={read?.identity === identity ? read.error : null} onRetry={() => setRetry(value => value + 1)} />
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
      if (updated.ok) {
        setLoaded(updated.state ? { identity, state: updated.state } : null)
        setNotice({ identity: recordIdentity, text: operation === 'confirm' ? 'Заказ подтверждён. Товары закреплены за ним.' : operation === 'issue' ? 'Заказ выдан. Товары списаны со склада.' : 'Возврат оформлен. Товары снова на складе.' })
      } else setError(updated.error)
      setConfirmReturn(false)
      router.refresh()
    } catch {
      if (current()) setError('Не удалось получить ответ. Обновите карточку и проверьте состояние заказа перед повтором.')
    } finally {
      if (inFlight.current === request) inFlight.current = null
      if (current()) setPending(false)
    }
  }
  return <section aria-label="Товары заказа" className={`mt-4 min-w-0 space-y-3 [overflow-wrap:anywhere] ${embedded ? 'border-t border-sand-200 pt-4' : 'rounded-2xl border border-sand-200 bg-white p-4'}`}>
    <div className="flex flex-col gap-3 @min-[760px]:flex-row @min-[760px]:items-center @min-[760px]:justify-between @min-[760px]:gap-5">
    <div className="min-w-0 space-y-1">
    <p className="text-sm font-semibold">{label}</p>
    {state.state === 'waiting' ? <p className="text-xs leading-relaxed text-ink-muted">Товары будут закреплены за этим заказом. Оплата согласуется отдельно.</p> : null}
    {state.state === 'reserved' && !state.reason ? <p className="text-xs leading-relaxed text-ink-muted">При выдаче товары спишутся со склада.</p> : null}
    {state.reason ? <p className="text-xs leading-relaxed text-ink-muted">{state.reason}</p> : null}
    </div>
    {state.canConfirm || state.canIssue || state.canReturn === true && !confirmReturn ? <div className="flex shrink-0 flex-wrap items-center gap-2">
      {state.canConfirm || state.canIssue ? <button type="button" disabled={pending} onClick={() => void run(state.canIssue ? 'issue' : 'confirm')} className={`min-h-11 w-full rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink @min-[760px]:w-auto ${state.canIssue && pickup ? 'border border-sand-200 text-ink-soft hover:bg-sand-50' : `text-white ${tones.solid}`}`}>{pending ? 'Сохранение…' : state.canIssue ? pickup ? 'Выдать самовывозом' : 'Выдать заказ' : 'Подтвердить заказ'}</button> : null}
      {state.canReturn === true && !confirmReturn ? <button type="button" disabled={pending} onClick={() => { setError(null); setConfirmReturn(true) }} className="min-h-11 rounded-xl border border-sand-200 px-4 py-2.5 text-sm font-medium text-ink-soft hover:bg-sand-50 disabled:opacity-40">Оформить возврат</button> : null}
    </div> : null}
    </div>
    {notice?.identity === recordIdentity ? <p role="status" className={`flex items-start gap-2 rounded-xl px-3 py-2.5 text-sm leading-relaxed ${tones.soft} ${tones.text}`}><Icon name="check" className="mt-0.5 size-4 shrink-0" />{notice.text}</p> : null}
    {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
    {state.canReturn === true && confirmReturn ? <div className="space-y-3 rounded-xl border border-sand-200 bg-sand-50 p-3">
      <p className="text-sm leading-relaxed text-ink-soft">Подтвердите, что все товары заказа фактически приняты обратно. Они вернутся на склад; возврат оплаты согласуется с клиентом отдельно.</p>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={pending} onClick={() => void run('return')} className={`min-h-11 rounded-xl px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40 ${tones.solid}`}>{pending ? 'Сохранение…' : 'Подтвердить возврат'}</button>
        <button type="button" disabled={pending} onClick={() => { setConfirmReturn(false); setError(null) }} className="rounded-xl border border-sand-200 bg-white px-4 py-2.5 text-sm text-ink-soft hover:bg-sand-50 disabled:opacity-40">Отмена</button>
      </div>
    </div> : null}
  </section>
}

export function InventoryBalancePanel({ tableId, rowId, version, slug, business = false }: Props) {
  const identity = JSON.stringify([tableId, rowId, version, slug, business])
  const context = useRef(identity); context.current = identity
  const [loaded, setLoaded] = useState<{ identity: string; state: StockBalanceState } | null>(null), generation = useRef(0)
  const [read, setRead] = useState<{ identity: string; loading: boolean; error: string | null } | null>(null), [retry, setRetry] = useState(0)
  useEffect(() => {
    const request = ++generation.current; setLoaded(null); setRead({ identity, loading: true, error: null })
    void readInventoryBalanceAction(tableId, rowId, slug, business).then(result => {
      if (request !== generation.current || context.current !== identity) return
      if (result.ok) setLoaded(result.state ? { identity, state: result.state } : null)
      setRead({ identity, loading: false, error: result.ok ? null : result.error })
    }).catch(() => {
      if (request === generation.current && context.current === identity) setRead({ identity, loading: false, error: 'Не удалось загрузить остатки товара. Проверьте соединение и попробуйте ещё раз.' })
    })
    return () => { generation.current++ }
  }, [tableId, rowId, version, slug, business, retry])
  const state = loaded?.identity === identity ? loaded.state : null
  if (read?.identity !== identity || read.loading || read.error) return <StockReadStatus label="Доступность товара" loading={read?.identity !== identity || read.loading} error={read?.identity === identity ? read.error : null} onRetry={() => setRetry(value => value + 1)} />
  return state ? <section aria-label="Доступность товара" className="mt-4 grid grid-cols-3 gap-3 rounded-2xl border border-sand-200 bg-white p-4 text-center @min-[860px]:divide-x @min-[860px]:divide-sand-200 @min-[860px]:py-6">{[
    ['На складе', state.stock], ['В заказах', state.reserved], ['Свободно', state.available],
  ].map(([label, value]) => <div key={label}><p className="text-xs text-ink-muted">{label}</p><p className="mt-1 font-semibold tabular-nums @min-[860px]:mt-2 @min-[860px]:text-2xl">{value}</p></div>)}</section> : null
}

function StockReadStatus({ label, loading, error, onRetry }: { label: string; loading: boolean; error: string | null; onRetry: () => void }) {
  return <section aria-label={label} className="mt-4 space-y-3 rounded-2xl border border-sand-200 bg-white p-4">
    {loading ? <p role="status" className="text-sm text-ink-muted">{label === 'Товары заказа' ? 'Загружаем состояние товаров заказа…' : 'Загружаем остатки товара…'}</p> : <>
      <p role="alert" className="text-sm text-red-700">{error}</p>
      <button type="button" onClick={onRetry} className="rounded-xl border border-sand-200 px-3 py-2 text-sm font-medium hover:bg-sand-50">Попробовать ещё раз</button>
    </>}
  </section>
}
