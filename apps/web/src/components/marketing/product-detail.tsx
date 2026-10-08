'use client'

import type { CSSProperties } from 'react'
import type { Product } from './catalog-data'
import { ProductGlyph } from './product-glyph'

/** Открытая карточка: та же строка, но целиком и по-человечески. */
export function DetailScreen({ item, shared }: { item: Product; shared: (part: string) => CSSProperties }) {
  // Disabling an entrance only during a shared transition restarts it afterward.
  // Choose the fallback once at render so the settled screen stays visible.
  const animateEntrance = typeof document !== 'undefined' && !document.startViewTransition
  return (
    <div style={shared('screen')} className={`hero-detail ${animateEntrance ? 'animate-screen-in ' : ''}flex-1 space-y-2.5 overflow-hidden p-2.5`}>
      <span style={shared('image')} className={`flex h-[116px] items-center justify-center rounded-xl ${item.tint}`}>
        <ProductGlyph kind={item.glyph} className={`h-16 w-16 ${item.ink}`} />
      </span>

      <p style={shared('name')} className="text-[13px] font-semibold leading-tight">{item.name}</p>

      <div className="flex items-baseline justify-between gap-2">
        <span style={shared('price')} className="text-[19px] font-bold tabular-nums">{item.price} ₽</span>
        <span className="shrink-0 text-[11px] tabular-nums text-ink-muted">{item.code}</span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span
          className={`rounded-full px-2.5 py-1 text-[11px] ${
            item.stock > 0 ? 'bg-sage-100 text-sage-700' : 'bg-clay-400/20 text-clay-500'
          }`}
        >
          {item.stock > 0 ? `В наличии: ${item.stock} шт` : 'Нет в наличии'}
        </span>
      </div>

      <p className="flex items-start gap-1.5 text-[11px] leading-snug text-ink-soft">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden className="mt-0.5 shrink-0 text-ink-muted">
          <path d="M8 14s4.5-4.2 4.5-7.4A4.5 4.5 0 0 0 3.5 6.6C3.5 9.8 8 14 8 14Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
          <circle cx="8" cy="6.5" r="1.6" stroke="currentColor" strokeWidth="1.4" />
        </svg>
        {item.warehouse}
      </p>

      <div className="rounded-lg bg-sage-500 py-2.5 text-center text-[12px] font-medium text-white">
        Запросить счёт
      </div>
    </div>
  )
}
