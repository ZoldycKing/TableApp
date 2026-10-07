'use client'

import { useEffect, useRef, useState } from 'react'
import { ProductGlyph } from './product-glyph'
import { useMotionPlayback } from '@/components/motion/use-motion-playback'

const STEP_MS = 850
const LAST = 5

const ROWS = [
  { name: 'Шуруповёрт 12 В', qty: '4', who: 'Ирина', when: 'вчера, 17:20' },
  { name: 'Набор бит, 32 шт', qty: '20', who: 'Пётр', when: 'вчера, 11:05' },
  { name: 'Уровень лазерный', qty: '2', who: 'Ирина', when: '12 марта' },
]

/**
 * Сцена «заполняется с телефона»: форма на телефоне, и строка сама
 * появляется в таблице. Обратный ход к первому экрану — там данные
 * уходили из таблицы в приложение, здесь возвращаются.
 */
export function SceneFill() {
  const [step, setStep] = useState(0)
  const root = useRef<HTMLDivElement>(null)
  const { playing, reduced } = useMotionPlayback(root)

  useEffect(() => {
    if (reduced) {
      setStep(LAST)
      return
    }

    if (!playing || step >= LAST) return
    const timer = window.setTimeout(() => {
      // На последнем шаге держим результат, а не дёргаем сцену по кругу.
      setStep((value) => (value >= LAST ? LAST : value + 1))
    }, STEP_MS)

    return () => window.clearTimeout(timer)
  }, [playing, reduced, step])

  return (
    <div ref={root} className="flex flex-col gap-5 @min-[560px]:flex-row @min-[560px]:items-start">
      <div className="w-full shrink-0 @min-[560px]:w-[248px]">
        <p className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-sage-700">
          <span className="h-1.5 w-1.5 rounded-full bg-sage-500" />
          Ирина, кладовщик
        </p>

        <div className="rounded-[26px] border border-sand-300 bg-white p-2 shadow-lift">
          <div className="flex h-[326px] flex-col overflow-hidden rounded-[19px] bg-sand-50">
            <div className="border-b border-sand-200 bg-white px-3 py-2.5">
              <span className="text-[13px] font-semibold">Новая приёмка</span>
            </div>

            <div className="flex-1 space-y-2 p-2.5">
              <Field label="Товар" filled={step >= 1} value="Перфоратор 800 Вт" />
              <Field label="Количество" filled={step >= 2} value="12 шт" />

              <div className="rounded-lg border border-sand-200 bg-white px-2.5 py-2">
                <p className="text-[9px] text-ink-muted">Фото с приёмки</p>
                {step >= 3 ? (
                  <span className="animate-card-in mt-1 flex h-[52px] w-[52px] items-center justify-center rounded-md bg-amber-100">
                    <ProductGlyph kind="drill" className="h-7 w-7 text-amber-700" />
                  </span>
                ) : (
                  <span className="mt-1 flex h-[52px] w-[52px] items-center justify-center rounded-md border border-dashed border-sand-300 text-ink-muted">
                    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden>
                      <rect x="2.5" y="5" width="15" height="11" rx="2" stroke="currentColor" strokeWidth="1.5" />
                      <circle cx="10" cy="10.5" r="3" stroke="currentColor" strokeWidth="1.5" />
                    </svg>
                  </span>
                )}
              </div>
            </div>

            <div className="relative p-2.5">
              <div
                className={`rounded-lg bg-sage-500 py-2.5 text-center text-[12px] font-medium text-white ${
                  step === 4 ? 'animate-press' : ''
                }`}
              >
                Сохранить
              </div>
              {step === 4 ? (
                <span
                  aria-hidden
                  className="animate-tap pointer-events-none absolute left-1/2 top-1/2 h-14 w-14 -translate-x-1/2 -translate-y-1/2 rounded-full bg-sage-700/30"
                />
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <p className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-ink-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-ink-muted/60" />
          Таблица «Приёмка» — у всех остальных
        </p>

        <div className="rounded-2xl border border-sand-200 bg-white p-3 shadow-soft">
          <div className="mb-3 flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-sand-300" />
            <span className="h-2.5 w-2.5 rounded-full bg-sand-300" />
            <span className="h-2.5 w-2.5 rounded-full bg-sand-300" />
            <span className="ml-2 truncate text-xs text-ink-muted">
              Приёмка · {step >= LAST ? '1 249' : '1 248'} записей
            </span>
          </div>

          <div className="overflow-hidden rounded-xl border border-sand-200">
            <div className="grid grid-cols-[1.7fr_0.6fr_1fr] @min-[420px]:grid-cols-[1.6fr_0.5fr_0.7fr_0.9fr] bg-sand-100 text-[11px] font-medium text-ink-muted">
              <span className="border-r border-sand-200 px-2 py-2">Товар</span>
              <span className="border-r border-sand-200 px-2 py-2">Кол-во</span>
              <span className="hidden border-r border-sand-200 px-2 py-2 @min-[420px]:block">Кто внёс</span>
              <span className="px-2 py-2">Когда</span>
            </div>

            {step >= LAST ? (
              <div className="animate-card-in grid grid-cols-[1.7fr_0.6fr_1fr] @min-[420px]:grid-cols-[1.6fr_0.5fr_0.7fr_0.9fr] border-t border-sand-200 bg-sage-50 text-[11px]">
                <span className="truncate border-r border-sand-200 px-2 py-2 font-medium">
                  Перфоратор 800 Вт
                </span>
                <span className="border-r border-sand-200 px-2 py-2 tabular-nums">12</span>
                <span className="hidden truncate border-r border-sand-200 px-2 py-2 font-medium @min-[420px]:block">Ирина</span>
                <span className="flex items-center gap-1.5 px-2 py-2 text-sage-700">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-sage-500" />
                  только что
                </span>
              </div>
            ) : null}

            {ROWS.map((row, index) => (
              <div
                key={row.name}
                className={`grid grid-cols-[1.7fr_0.6fr_1fr] @min-[420px]:grid-cols-[1.6fr_0.5fr_0.7fr_0.9fr] border-t border-sand-200 text-[11px] ${
                  index % 2 === 0 ? 'bg-white' : 'bg-sand-50/60'
                }`}
              >
                <span className="truncate border-r border-sand-200 px-2 py-2">{row.name}</span>
                <span className="border-r border-sand-200 px-2 py-2 tabular-nums">{row.qty}</span>
                <span className="hidden truncate border-r border-sand-200 px-2 py-2 text-ink-muted @min-[420px]:block">{row.who}</span>
                <span className="truncate px-2 py-2 text-ink-muted">{row.when}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/** Поле формы: пустое до своего шага, дальше со значением. */
function Field({ label, value, filled }: { label: string; value: string; filled: boolean }) {
  return (
    <div className="rounded-lg border border-sand-200 bg-white px-2.5 py-2">
      <p className="text-[9px] text-ink-muted">{label}</p>
      {filled ? (
        <p className="animate-screen-in truncate text-[12px]">{value}</p>
      ) : (
        <p className="text-[12px] text-ink-muted/40">не заполнено</p>
      )}
    </div>
  )
}
