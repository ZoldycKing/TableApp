'use client'

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { PRODUCTS, type Product } from './catalog-data'
import { ProductGlyph } from './product-glyph'

const BEAT_MS = 900 // шаг между вылетами строк
const LAND_MS = 620 // столько копия строки летит до своей ячейки
const READY_MS = 900 // пауза на собранной витрине
const TAP_MS = 560 // нажатие на карточку
const DETAIL_MS = 3000 // сколько держим открытую карточку

const FILLED_MS = (PRODUCTS.length - 1) * BEAT_MS + LAND_MS

/*
 * Колонки появляются по мере места, и меру берём у контейнера, а не у экрана:
 * один и тот же блок стоит и на широкой странице, и в узкой правой половине
 * первого экрана. Медиазапрос там врал бы — окно большое, а места нет.
 * Обрезанный текст хуже отсутствующей колонки, поэтому лишнее просто уходит.
 */
const COLS =
  'grid grid-cols-[1.9fr_0.7fr_0.5fr] @min-[620px]:grid-cols-[1.7fr_0.9fr_0.7fr_0.5fr] @min-[780px]:grid-cols-[1.5fr_0.8fr_0.6fr_0.4fr_1.4fr]'

type Phase = 'filling' | 'tap' | 'detail'
type Geom = { left: number; top: number; x: number; y: number }

/**
 * Вариант 2. Строки таблицы по очереди улетают в приложение и собираются там
 * витриной, а затем витрина отвечает на нажатие: карточка открывается целиком
 * — с фото, ценой, остатком и адресом склада, которых в тесной таблице
 * не видно. Один круг показывает весь смысл: данные те же, вид другой.
 */
export function HeroFlight() {
  const [phase, setPhase] = useState<Phase>('filling')
  const [flying, setFlying] = useState<number | null>(null)
  const [landed, setLanded] = useState(0)
  const [pick, setPick] = useState(0)
  const [geom, setGeom] = useState<Geom[]>([])

  const hostRef = useRef<HTMLDivElement>(null)
  const rowRefs = useRef<Array<HTMLDivElement | null>>([])
  const slotRefs = useRef<Array<HTMLDivElement | null>>([])
  // Круги считаем в ref: интервалы видят своё замыкание, а не свежий стейт.
  const roundRef = useRef(0)

  /*
   * Траектории считаем заранее и по фактическим позициям: вёрстка резиновая,
   * зашитые пиксели разъехались бы на первой правке ширины. Считать в момент
   * вылета тоже нельзя — анимация успеет начаться до того, как приедут числа.
   */
  useEffect(() => {
    const measure = () => {
      const host = hostRef.current
      if (!host) return

      const hostBox = host.getBoundingClientRect()
      const next: Geom[] = []

      PRODUCTS.forEach((_, index) => {
        const row = rowRefs.current[index]
        const slot = slotRefs.current[index]
        if (!row || !slot) return

        const from = row.getBoundingClientRect()
        const to = slot.getBoundingClientRect()
        next.push({
          left: Math.round(from.left - hostBox.left),
          top: Math.round(from.top - hostBox.top),
          x: Math.round(to.left - from.left),
          y: Math.round(to.top - from.top),
        })
      })

      // Пока открыта карточка, ячеек в разметке нет — старые замеры лучше
      // неполных: иначе после ресайза в этот момент строки летели бы в ноль.
      if (next.length === PRODUCTS.length) setGeom(next)
    }

    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  useEffect(() => {
    // Без анимации показываем итог: собранную витрину с открытой карточкой.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setLanded(PRODUCTS.length)
      setPhase('detail')
      return
    }

    let cancelled = false
    let timers: number[] = []
    const at = (ms: number, fn: () => void) => {
      timers.push(window.setTimeout(fn, ms))
    }

    const loop = () => {
      if (cancelled) return
      timers = []
      setPhase('filling')
      setLanded(0)
      // Каждый круг открываем другую карточку — иначе выглядит как запись.
      setPick(roundRef.current % PRODUCTS.length)
      roundRef.current += 1

      PRODUCTS.forEach((_, index) => {
        at(index * BEAT_MS, () => setFlying(index))
        at(index * BEAT_MS + LAND_MS, () => {
          setFlying(null)
          setLanded(index + 1)
        })
      })

      at(FILLED_MS + READY_MS, () => setPhase('tap'))
      at(FILLED_MS + READY_MS + TAP_MS, () => setPhase('detail'))
      at(FILLED_MS + READY_MS + TAP_MS + DETAIL_MS, loop)
    }

    loop()
    return () => {
      cancelled = true
      timers.forEach((id) => window.clearTimeout(id))
    }
  }, [])

  const ghost = flying === null ? null : geom[flying]
  const ghostItem = flying === null ? null : PRODUCTS[flying]
  const opened = PRODUCTS[pick]!

  const caption =
    phase === 'filling'
      ? 'Строки уходят в приложение как есть — без выгрузок и переноса вручную'
      : phase === 'tap'
        ? 'Витрина собрана: весь склад на экране'
        : 'Нажатие открывает строку целиком — с фото, ценой, остатком и адресом склада'

  return (
    <div
      ref={hostRef}
      className="@container relative rounded-[26px] border border-sand-200 bg-sand-100/60 p-3 shadow-soft sm:p-4"
    >
      <div className="flex flex-col gap-5 @min-[520px]:flex-row @min-[520px]:items-start">
        <div className="min-w-0 flex-1">
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-ink-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-ink-muted/60" />
            Таблица «Склад»
          </p>

          <div className="rounded-2xl border border-sand-200 bg-white p-3 shadow-soft">
            <div className="mb-3 flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-sand-300" />
              <span className="h-2.5 w-2.5 rounded-full bg-sand-300" />
              <span className="h-2.5 w-2.5 rounded-full bg-sand-300" />
              <span className="ml-2 truncate text-xs text-ink-muted">Склад · 412 позиций</span>
            </div>

            <div className="overflow-hidden rounded-xl border border-sand-200">
              <div className={`${COLS} bg-sand-100 text-[11px] font-medium text-ink-muted`}>
                <span className="border-r border-sand-200 px-2 py-2">Наименование</span>
                <span className="hidden border-r border-sand-200 px-2 py-2 @min-[620px]:block">Артикул</span>
                <span className="border-r border-sand-200 px-2 py-2">Цена</span>
                <span className="px-2 py-2 @min-[780px]:border-r @min-[780px]:border-sand-200">Ост.</span>
                <span className="hidden px-2 py-2 @min-[780px]:block">Адрес склада</span>
              </div>

              {PRODUCTS.map((item, position) => (
                <div
                  key={item.code}
                  ref={(node) => {
                    rowRefs.current[position] = node
                  }}
                  className={`${COLS} border-t border-sand-200 text-[11px] transition-colors duration-300 @min-[620px]:text-[12px] ${
                    position === flying ? 'bg-sage-50' : position % 2 === 1 ? 'bg-sand-50/60' : 'bg-white'
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-2 border-r border-sand-200 px-2 py-1.5">
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded @min-[620px]:h-7 @min-[620px]:w-7 ${item.tint}`}>
                      <ProductGlyph kind={item.glyph} className={`h-4 w-4 @min-[620px]:h-5 @min-[620px]:w-5 ${item.ink}`} />
                    </span>
                    <span className="truncate">{item.short}</span>
                  </span>
                  <span className="hidden truncate border-r border-sand-200 px-2 py-2 tabular-nums text-ink-muted @min-[620px]:block">
                    {item.code}
                  </span>
                  <span className="whitespace-nowrap border-r border-sand-200 px-2 py-2 text-right tabular-nums">
                    {item.price}
                  </span>
                  <span className="px-2 py-2 text-right tabular-nums @min-[780px]:border-r @min-[780px]:border-sand-200">
                    {item.stock}
                  </span>
                  <span className="hidden truncate px-2 py-2 text-[11px] text-ink-muted @min-[780px]:block">
                    {item.warehouse}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <p className="mt-3 flex items-start gap-2.5 text-[12px] leading-relaxed text-ink-soft">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sage-500 text-sand-50">
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            {caption}
          </p>
        </div>

        <div className="w-full shrink-0 @min-[520px]:w-[276px]">
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-sage-700">
            <span className="h-1.5 w-1.5 rounded-full bg-sage-500" />
            Приложение «Склад»
          </p>

          <div className="rounded-[26px] border border-sand-300 bg-white p-2 shadow-lift">
            <div className="flex h-[404px] flex-col overflow-hidden rounded-[19px] bg-sand-50">
              <div className="flex items-center gap-2 border-b border-sand-200 bg-white px-3 py-2.5">
                {phase === 'detail' ? (
                  <>
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden className="shrink-0 text-ink-muted">
                      <path d="M10 3 5 8l5 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span className="truncate text-[13px] font-semibold">{opened.short}</span>
                  </>
                ) : (
                  <>
                    <span className="truncate text-[14px] font-semibold">Склад</span>
                    <span className="ml-auto shrink-0 rounded-full bg-sage-100 px-2 py-0.5 text-[10px] tabular-nums text-sage-700">
                      {landed} из {PRODUCTS.length}
                    </span>
                  </>
                )}
              </div>

              {phase === 'detail' ? (
                <DetailScreen item={opened} />
              ) : (
                <div className="grid flex-1 grid-cols-2 content-start gap-2 p-2.5">
                  {PRODUCTS.map((item, position) => {
                    const tapped = phase === 'tap' && position === pick
                    return (
                      <div
                        key={item.code}
                        ref={(node) => {
                          slotRefs.current[position] = node
                        }}
                        className="relative h-[140px]"
                      >
                        {position < landed ? (
                          <div
                            className={`animate-card-in flex h-full flex-col rounded-xl border bg-white p-2 ${
                              tapped ? 'animate-press border-sage-400 shadow-lift' : 'border-sand-200'
                            }`}
                          >
                            <span className={`flex h-[52px] items-center justify-center rounded-lg ${item.tint}`}>
                              <ProductGlyph kind={item.glyph} className={`h-8 w-8 ${item.ink}`} />
                            </span>
                            <p className="mt-1.5 truncate text-[10px] leading-none">{item.short}</p>
                            <p className="mt-1 truncate text-[9px] leading-none text-ink-muted">
                              {item.warehouse.split(',')[0]}
                            </p>
                            <p className="mt-auto text-[12px] font-semibold leading-none tabular-nums">
                              {item.price} ₽
                            </p>
                            <p
                              className={`mt-1 truncate text-[9px] leading-none ${
                                item.stock > 0 ? 'text-sage-700' : 'text-clay-500'
                              }`}
                            >
                              {item.stock > 0 ? `${item.stock} шт` : 'нет в наличии'}
                            </p>
                          </div>
                        ) : (
                          <span className="block h-full rounded-xl border border-dashed border-sand-300/80" />
                        )}

                        {/* Палец: круг расходится там, где произошло нажатие. */}
                        {tapped ? (
                          <span
                            aria-hidden
                            className="animate-tap pointer-events-none absolute left-1/2 top-1/2 h-14 w-14 -translate-x-1/2 -translate-y-1/2 rounded-full bg-sage-500/25"
                          />
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              )}

              <div className="flex border-t border-sand-200 bg-white">
                <span className="flex-1 py-2 text-center text-[11px] font-semibold text-sage-700">
                  Склад
                </span>
                <span className="flex-1 py-2 text-center text-[11px] text-ink-muted">Заявки</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Копия строки: летит от своей строки к своей ячейке в витрине. */}
      {ghost && ghostItem ? (
        <div
          key={flying}
          aria-hidden
          style={
            {
              left: `${ghost.left}px`,
              top: `${ghost.top}px`,
              '--fly-x': `${ghost.x}px`,
              '--fly-y': `${ghost.y}px`,
            } as CSSProperties
          }
          className="animate-fly pointer-events-none absolute z-10 w-[216px] rounded-lg border border-sage-300 bg-white px-2 py-1.5 shadow-lift"
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded ${ghostItem.tint}`}>
              <ProductGlyph kind={ghostItem.glyph} className={`h-5 w-5 ${ghostItem.ink}`} />
            </span>
            <span className="truncate text-[12px]">{ghostItem.short}</span>
          </span>
        </div>
      ) : null}
    </div>
  )
}

/** Открытая карточка: та же строка, но целиком и по-человечески. */
function DetailScreen({ item }: { item: Product }) {
  return (
    <div className="animate-screen-in flex-1 space-y-2.5 overflow-hidden p-2.5">
      <span className={`flex h-[116px] items-center justify-center rounded-xl ${item.tint}`}>
        <ProductGlyph kind={item.glyph} className={`h-16 w-16 ${item.ink}`} />
      </span>

      <p className="text-[13px] font-semibold leading-tight">{item.name}</p>

      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[19px] font-bold tabular-nums">{item.price} ₽</span>
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
