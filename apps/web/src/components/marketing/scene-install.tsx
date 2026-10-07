'use client'

import { useEffect, useRef, useState } from 'react'
import { useMotionPlayback } from '@/components/motion/use-motion-playback'

const STEP_MS = 1500
const LAST = 2

const POINTS = [
  'Открывается ссылкой в браузере — ставить нечего',
  'Добавляется на домашний экран и запускается как приложение',
  'Обновляется само: у всех сразу актуальная версия',
]

/**
 * Сцена «ставится на телефон»: браузер, «На экран „Домой“», иконка среди
 * остальных. Возражение «нам что, приложение в сторах заказывать» снимается
 * показом, а не абзацем текста.
 */
export function SceneInstall() {
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
      setStep((value) => (value >= LAST ? LAST : value + 1))
    }, STEP_MS)

    return () => window.clearTimeout(timer)
  }, [playing, reduced, step])

  return (
    <div ref={root} className="flex flex-col gap-5 @min-[560px]:flex-row @min-[560px]:items-start">
      <div className="min-w-0 flex-1">
        <p className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-ink-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-ink-muted/60" />
          Без магазинов приложений
        </p>

        <ul className="space-y-2.5">
          {POINTS.map((point) => (
            <li
              key={point}
              className="flex gap-2.5 rounded-xl border border-sand-200 bg-white p-3 text-[12px] leading-relaxed shadow-soft"
            >
              <span className="mt-0.5 shrink-0 text-sage-600">
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
                  <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              {point}
            </li>
          ))}
        </ul>

        <p className="mt-3 text-[12px] leading-relaxed text-ink-soft">
          Ни App Store, ни Google Play, ни установки файлов. Сотруднику приходит
          ссылка — через минуту у него на экране рабочее приложение.
        </p>
      </div>

      <div className="w-full shrink-0 @min-[560px]:w-[248px]">
        <p className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-sage-700">
          <span className="h-1.5 w-1.5 rounded-full bg-sage-500" />
          {step >= LAST ? 'Домашний экран телефона' : 'Ссылка в браузере'}
        </p>

        <div className="rounded-[26px] border border-sand-300 bg-white p-2 shadow-lift">
          <div className="relative flex h-[326px] flex-col overflow-hidden rounded-[19px] bg-sand-50">
            {step >= LAST ? <HomeScreen /> : <BrowserScreen tapping={step === 1} />}
          </div>
        </div>
      </div>
    </div>
  )
}

/** Браузер с листом «Поделиться»: тот самый путь установки на телефоне. */
function BrowserScreen({ tapping }: { tapping: boolean }) {
  return (
    <>
      <div className="flex items-center gap-1.5 border-b border-sand-200 bg-white px-2.5 py-2">
        <span className="flex min-w-0 flex-1 items-center gap-1.5 rounded-full bg-sand-100 px-2.5 py-1.5">
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden className="shrink-0 text-sage-600">
            <rect x="3.5" y="7" width="9" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
            <path d="M5.8 7V5.4a2.2 2.2 0 0 1 4.4 0V7" stroke="currentColor" strokeWidth="1.4" />
          </svg>
          <span className="truncate text-[10px] text-ink-soft">app.tableapp.ru/sklad</span>
        </span>
      </div>

      <div className="flex-1 space-y-2 p-2.5 opacity-60">
        <span className="block h-[52px] rounded-lg bg-sand-200" />
        <span className="block h-3 w-3/4 rounded bg-sand-200" />
        <span className="block h-3 w-1/2 rounded bg-sand-200" />
      </div>

      {/* Лист «Поделиться» приезжает снизу — как в настоящем браузере. */}
      <div className="animate-screen-in absolute inset-x-0 bottom-0 rounded-t-2xl border-t border-sand-200 bg-white p-2.5 shadow-lift">
        <span className="mx-auto mb-2 block h-1 w-10 rounded-full bg-sand-300" />
        <div className="relative">
          <div
            className={`flex items-center gap-2 rounded-lg border border-sage-300 bg-sage-50 px-2.5 py-2 ${
              tapping ? 'animate-press' : ''
            }`}
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-white text-sage-700">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path d="M8 11V3M5 6l3-3 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M3.5 10.5v2h9v-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </span>
            <span className="text-[11px] font-medium">На экран «Домой»</span>
          </div>
          {tapping ? (
            <span
              aria-hidden
              className="animate-tap pointer-events-none absolute left-10 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full bg-sage-500/30"
            />
          ) : null}
        </div>
        <div className="mt-1.5 flex items-center gap-2 rounded-lg px-2.5 py-2 opacity-50">
          <span className="h-6 w-6 shrink-0 rounded bg-sand-200" />
          <span className="text-[11px]">Скопировать ссылку</span>
        </div>
      </div>
    </>
  )
}

/** Домашний экран: наша иконка появляется среди прочих, без стора. */
function HomeScreen() {
  return (
    <div className="flex-1 p-3">
      <div className="grid grid-cols-4 gap-x-3 gap-y-4">
        <span className="h-11 rounded-xl bg-sand-200" />
        <span className="h-11 rounded-xl bg-sand-200" />
        <span className="h-11 rounded-xl bg-sand-200" />
        <span className="h-11 rounded-xl bg-sand-200" />
        <span className="h-11 rounded-xl bg-sand-200" />

        <div className="animate-card-in">
          <span className="flex h-11 items-center justify-center rounded-xl bg-sage-500 text-sand-50 shadow-lift">
            <svg width="20" height="20" viewBox="0 0 16 16" fill="none" aria-hidden>
              <rect x="2" y="2" width="5" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.4" />
              <rect x="9" y="2" width="5" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.4" />
              <rect x="2" y="9" width="5" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.4" />
              <rect x="9" y="9" width="5" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.4" />
            </svg>
          </span>
          <p className="mt-1 text-center text-[9px] font-medium leading-none">Склад</p>
        </div>

        <span className="h-11 rounded-xl bg-sand-200/60" />
        <span className="h-11 rounded-xl bg-sand-200/60" />
      </div>

      <p className="mt-6 rounded-xl border border-sage-200 bg-sage-50 px-3 py-2.5 text-[11px] leading-relaxed text-sage-700">
        Приложение на телефоне. Открывается с иконки, работает на весь экран,
        без адресной строки.
      </p>
    </div>
  )
}
