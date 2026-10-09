'use client'

import type { CustomerCart } from '@/lib/customer-cart'
import type { RuntimeApp } from '@/lib/app-runtime'
import { accentTones } from './ui'

export function CustomerCartEditor({ runtime, cart, onChange }: { runtime: RuntimeApp; cart: CustomerCart; onChange: (cart: CustomerCart) => void }) {
  const config = runtime.app.customer!
  const goods = config.catalog ? runtime.tables[config.catalog.tableId]?.rows ?? [] : []
  let total = 0
  return <section className="space-y-3 rounded-2xl border border-sand-200 bg-white p-4" aria-label="Корзина">
    <h2 className="text-sm font-semibold">Ваш заказ</h2>
    {cart.items.length === 0 ? <p className="text-sm text-ink-muted">Откройте карточку товара и добавьте его в корзину.</p> : cart.items.map(item => {
      const product = goods.find(row => row.id === item.id)
      const name = String(product?.data[config.catalog!.titleFieldId] ?? 'Товар недоступен')
      const price = Number(product?.data[config.cart!.priceFieldId] ?? 0)
      total += price * item.qty
      return <div key={item.id} className="space-y-2 border-b border-sand-200 pb-3">
        <p className="text-sm font-medium">{name}</p>
        <div className="flex items-center gap-3"><label className="flex items-center gap-2 text-xs text-ink-muted">Количество
          <input aria-label={`Количество: ${name}`} type="number" min={1} max={1000} step={1} value={item.qty} className="w-20 rounded-lg border border-sand-300 px-2 py-1.5 text-sm text-ink" onChange={event => onChange({ ...cart, items: cart.items.map(row => row.id === item.id ? { ...row, qty: Math.max(1, Math.min(1000, Math.trunc(Number(event.target.value)) || 1)) } : row) })} />
        </label><span className="ml-auto text-sm">{(price * item.qty).toLocaleString('ru-RU')} ₽</span><button type="button" aria-label={`Удалить: ${name}`} onClick={() => onChange({ ...cart, items: cart.items.filter(row => row.id !== item.id) })} className="text-xs text-ink-muted hover:text-red-700">Удалить</button></div>
      </div>
    })}
    <p className="flex justify-between text-sm font-semibold"><span>Итого по каталогу</span><span>{total.toLocaleString('ru-RU')} ₽</span></p>
    <p className="text-xs leading-relaxed text-ink-muted">Это заказ без онлайн-оплаты. При подтверждении сервер проверит наличие в каталоге и сохранит актуальные цены. Способ получения согласует бизнес.</p>
  </section>
}

export function CustomerCartButton({ count, accent, onClick }: { count: number; accent: string; onClick: () => void }) {
  const tones = accentTones(accent)
  return <button type="button" onClick={onClick} className={`mt-4 w-full rounded-xl px-4 py-3 text-sm font-semibold text-white ${tones.solid}`}>Оформить заказ · {count} поз.</button>
}
