'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { handoffOrderDeliveryAction, readOrderDeliveryAction } from '@/app/order-delivery-actions'
import type { OrderDeliveryState } from '@/lib/order-delivery-config'
import { accentTones } from './ui'

export function OrderDeliveryPanel({ tableId, rowId, version, slug, business = false, onOpen, embedded = false, accent }: { tableId: string; rowId: string; version: number; slug?: string; business?: boolean; onOpen?: (screenId: string, rowId: string) => void; embedded?: boolean; accent?: string }) {
  const [state, setState] = useState<OrderDeliveryState | null>(null), [error, setError] = useState<string | null>(null), [pending, start] = useTransition()
  const generation = useRef(0), router = useRouter()
  useEffect(() => {
    const request = ++generation.current
    setState(null); setError(null)
    void readOrderDeliveryAction(tableId, rowId, slug, business).then(result => {
      if (generation.current !== request) return
      if (result.ok) setState(result.state)
      else if (!business) setError(result.error)
    }).catch(() => { if (generation.current === request) setError('Не удалось загрузить доставку. Откройте карточку ещё раз.') })
    return () => { generation.current++ }
  }, [tableId, rowId, version, slug, business])
  if (!state && !error) return null
  const linked = state?.linked
  const tones = accent ? accentTones(accent) : { solid: 'bg-sage-700', text: 'text-sage-700' }
  return <section className={`mt-4 min-w-0 space-y-3 [overflow-wrap:anywhere] ${embedded ? 'border-t border-sand-200 pt-4' : 'rounded-2xl border border-sand-200 bg-white p-4'}`} aria-label="Доставка заказа">
    <h3 className="text-sm font-semibold">{linked?.side === 'delivery' ? 'Связанный заказ' : 'Доставка заказа'}</h3>
    {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
    {linked ? <>
      <p className="text-sm text-ink-soft">{linked.status}</p>
      <p className="text-xs text-ink-muted">{linked.stage === 'delivered' ? 'Доставка выполнена, заказ завершён. Сведения сохранены в истории.' : linked.stage === 'cancelled' ? 'Заказ и доставка отменены. Сведения сохранены в истории.' : linked.stage === 'returned' ? 'Доставка завершена возвратом. Дальнейшие действия согласуйте с бизнесом.' : linked.stage === 'shipped' || linked.stage === 'missed' ? 'Заказ у курьера. Изменение условий и возврат согласуйте с диспетчером.' : linked.stage === 'restricted' ? 'Подробности доставки доступны ответственному сотруднику.' : 'До передачи курьеру отмена отменяет и доставку, и заказ.'}</p>
      {linked.target ? business ? <a className={`inline-flex min-h-11 items-center text-sm underline underline-offset-4 ${tones.text}`} href={`/t/${encodeURIComponent(linked.target.tableId)}?r=${encodeURIComponent(linked.target.rowId)}`}>{linked.side === 'order' ? 'Открыть доставку' : 'Открыть заказ'}</a> : <button type="button" className={`min-h-11 text-sm underline underline-offset-4 ${tones.text}`} onClick={() => onOpen?.(linked.target!.screenId, linked.target!.rowId)}>{linked.side === 'order' ? 'Открыть доставку' : 'Открыть заказ'}</button> : null}
    </> : state?.canCreate ? <>
      <p className="text-xs leading-relaxed text-ink-muted">Адрес, получатель и состав будут взяты из заказа и зафиксированы. Курьера и время назначает диспетчер; передача не подтверждает оплату.</p>
      <button type="button" disabled={pending} className={`min-h-11 w-full rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40 @min-[760px]:w-auto ${tones.solid}`} onClick={() => {
        const request = generation.current
        start(async () => {
          setError(null)
          try {
            const result = await handoffOrderDeliveryAction(tableId, rowId, version, slug, business)
            if (generation.current !== request) return
            if (!result.ok) return setError(result.error)
            const updated = await readOrderDeliveryAction(tableId, rowId, slug, business)
            if (generation.current !== request) return
            if (updated.ok) setState(updated.state); else setError(updated.error)
            router.refresh()
          } catch { if (generation.current === request) setError('Не удалось передать заказ. Повторите действие: вторая доставка не создастся.') }
        })
      }}>Передать в доставку</button>
    </> : state?.reason ? <p className="text-sm text-ink-muted">{state.reason}</p> : null}
  </section>
}
