'use client'

import { useEffect, useState } from 'react'

const ROLE_MS = 2400

const ROLES = [
  { id: 'dispatcher', name: 'Ольга, диспетчер', short: 'Ольга', hint: 'видит все заявки и меняет статусы', screen: 'Все заявки' },
  { id: 'master', name: 'Игорь, мастер', short: 'Игорь', hint: 'видит только свои выезды', screen: 'Мои выезды' },
  { id: 'client', name: 'Клиент по ссылке', short: 'клиент', hint: 'видит только свой заказ', screen: 'Мой заказ' },
] as const

const REQUESTS = [
  { code: '№ 1042', title: 'Ремонт витрины', who: 'Игорь', status: 'В работе', tone: 'bg-sage-100 text-sage-700' },
  { code: '№ 1041', title: 'Замена насоса', who: 'Пётр', status: 'Новая', tone: 'bg-clay-400/20 text-clay-500' },
  { code: '№ 1039', title: 'ТО холодильника', who: 'Игорь', status: 'Готово', tone: 'bg-sand-200 text-ink-soft' },
  { code: '№ 1036', title: 'Монтаж полок', who: 'Анна', status: 'Готово', tone: 'bg-sand-200 text-ink-soft' },
]

/**
 * Сцена «одна ссылка — все в деле»: адрес один, а список у каждого свой.
 * Права до строки проще показать сменой роли, чем описать словами.
 */
export function SceneShare() {
  const [role, setRole] = useState(0)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const timer = window.setInterval(() => {
      setRole((value) => (value + 1) % ROLES.length)
    }, ROLE_MS)

    return () => window.clearInterval(timer)
  }, [])

  const active = ROLES[role]!
  const visible =
    active.id === 'dispatcher'
      ? REQUESTS
      : active.id === 'master'
        ? REQUESTS.filter((item) => item.who === 'Игорь')
        : REQUESTS.slice(0, 1)

  return (
    <div className="flex flex-col gap-5 @min-[560px]:flex-row @min-[560px]:items-start">
      <div className="min-w-0 flex-1">
        <p className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-ink-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-ink-muted/60" />
          Одна ссылка на приложение
        </p>

        <div className="flex items-center gap-2 rounded-xl border border-sand-200 bg-white p-2 shadow-soft">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sand-100 text-ink-muted">
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M6.5 9.5 9.5 6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M7 5.5 8.6 3.9a2.4 2.4 0 0 1 3.5 3.5L10.5 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M9 10.5 7.4 12.1a2.4 2.4 0 0 1-3.5-3.5L5.5 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </span>
          <span className="min-w-0 flex-1 truncate text-[12px] tabular-nums text-ink-soft">
            app.tableapp.ru/zayavki
          </span>
          <span className="shrink-0 rounded-lg bg-ink px-2.5 py-1.5 text-[11px] font-medium text-sand-50">
            Скопировать
          </span>
        </div>

        <div className="mt-3 space-y-2">
          {ROLES.map((item, index) => (
            <div
              key={item.id}
              className={`flex items-center gap-3 rounded-xl border p-2.5 transition-all duration-300 ${
                index === role
                  ? 'border-sage-300 bg-white shadow-soft'
                  : 'border-sand-200 bg-white/50'
              }`}
            >
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold transition-colors duration-300 ${
                  index === role ? 'bg-sage-500 text-sand-50' : 'bg-sand-200 text-ink-muted'
                }`}
              >
                {item.name.slice(0, 1)}
              </span>
              <div className="min-w-0">
                <p className="truncate text-[12px] font-medium">{item.name}</p>
                <p className="truncate text-[11px] text-ink-muted">{item.hint}</p>
              </div>
            </div>
          ))}
        </div>

        <p className="mt-3 text-[12px] leading-relaxed text-ink-soft">
          Адрес один, срез у каждого свой — проверка на сервере, чужие строки
          не доходят до браузера. Ни сотрудники, ни клиенты не тарифицируются.
        </p>
      </div>

      <div className="w-full shrink-0 @min-[560px]:w-[248px]">
        <p className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-sage-700">
          <span className="h-1.5 w-1.5 rounded-full bg-sage-500" />
          Что видит {active.short}
        </p>

        <div className="rounded-[26px] border border-sand-300 bg-white p-2 shadow-lift">
          <div className="flex h-[326px] flex-col overflow-hidden rounded-[19px] bg-sand-50">
            <div className="flex items-center justify-between gap-2 border-b border-sand-200 bg-white px-3 py-2.5">
              <span className="truncate text-[13px] font-semibold">{active.screen}</span>
              <span className="shrink-0 rounded-full bg-sand-100 px-2 py-0.5 text-[10px] tabular-nums text-ink-muted">
                {visible.length}
              </span>
            </div>

            <div key={active.id} className="animate-screen-in flex-1 space-y-2 p-2.5">
              {visible.map((item, index) => (
                <div
                  key={item.code}
                  style={{ animationDelay: `${index * 70}ms` }}
                  className="animate-card-in rounded-xl border border-sand-200 bg-white p-2.5"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[12px] font-medium">{item.title}</span>
                    <span className="shrink-0 text-[10px] tabular-nums text-ink-muted">{item.code}</span>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] ${item.tone}`}>
                      {item.status}
                    </span>
                    <span className="truncate text-[10px] text-ink-muted">{item.who}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex border-t border-sand-200 bg-white">
              <span className="flex-1 py-2 text-center text-[11px] font-semibold text-sage-700">
                Заявки
              </span>
              <span className="flex-1 py-2 text-center text-[11px] text-ink-muted">Календарь</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
