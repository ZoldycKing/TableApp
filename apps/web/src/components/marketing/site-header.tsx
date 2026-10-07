'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { isCurrent, NAV_MAIN, NAV_PRODUCT, NAV_SOLUTIONS, PUBLIC_ROUTES, type SiteLink } from '@/lib/site'
import { Logo } from './logo'

/**
 * Шапка сайта.
 *
 * Пункты ведут на страницы, а не на якоря главной. Якоря никуда не делись —
 * по ним приходят из старых ссылок, — но навигация, устроенная якорями,
 * означает сайт из одной страницы: в поиске такой сайт представлен ровно
 * одним адресом, чего бы на нём ни было написано.
 */

const GROUPS: { id: string; label: string; items: SiteLink[] }[] = [
  { id: 'product', label: 'Продукт', items: NAV_PRODUCT },
  { id: 'solutions', label: 'Решения', items: NAV_SOLUTIONS },
]

export function SiteHeader({ signedIn }: { signedIn: boolean }) {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)
  /** Какой из выпадающих списков раскрыт. Одновременно — только один. */
  const [menu, setMenu] = useState<string | null>(null)
  const bar = useRef<HTMLDivElement>(null)
  const pathname = usePathname() ?? '/'

  /**
   * Есть ли у устройства настоящее наведение.
   *
   * От этого зависит, что делает щелчок по разделу. С мышью список уже открыт
   * наведением, и переключатель закрывал бы его первым же щелчком — человек
   * нажимал и не понимал, почему меню исчезло. Без наведения (сенсор,
   * клавиатура) щелчок — единственный способ открыть, и он переключает.
   */
  const [hovers, setHovers] = useState(false)
  useEffect(() => {
    const query = window.matchMedia('(hover: hover) and (pointer: fine)')
    setHovers(query.matches)
    const onChange = (event: MediaQueryListEvent) => setHovers(event.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  /** Открытый раздел: по началу пути, а не по точному совпадению. */
  const current = (href: string) => isCurrent(pathname, href)
  const groupCurrent = (items: SiteLink[]) => items.some((item) => current(item.href))

  // Шапка уплотняется после прокрутки: на первом экране она не должна
  // отъедать воздух у заголовка.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  /*
   * Список закрывается щелчком мимо и клавишей Escape — обязательства любого
   * всплывающего меню. Без них человек, передумавший на полпути, остаётся
   * с раскрытым списком поверх страницы.
   */
  useEffect(() => {
    if (!menu) return

    const onDown = (event: MouseEvent) => {
      if (bar.current?.contains(event.target as Node)) return
      setMenu(null)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenu(null)
    }

    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [menu])

  return (
    <header
      className={`sticky top-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'border-b border-sand-200/80 bg-sand-50/85 backdrop-blur-md'
          : 'border-b border-transparent bg-transparent'
      }`}
    >
      <div
        ref={bar}
        className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-6 px-5 sm:px-8"
      >
        <Link href="/" className="transition-opacity hover:opacity-80">
          <Logo />
        </Link>

        <nav aria-label="Разделы сайта" className="hidden items-center gap-0.5 lg:flex">
          {GROUPS.map((group) => (
            <div
              key={group.id}
              className="relative"
              onMouseEnter={() => setMenu(group.id)}
              onMouseLeave={() => setMenu((current) => (current === group.id ? null : current))}
            >
              <button
                type="button"
                aria-expanded={menu === group.id}
                aria-haspopup="true"
                onClick={() =>
                  setMenu((value) => {
                    // С мышью список уже открыт наведением: щелчок его не закрывает.
                    if (hovers) return group.id
                    return value === group.id ? null : group.id
                  })
                }
                className={`flex items-center gap-1 whitespace-nowrap rounded-lg px-2.5 py-2 text-sm transition-colors hover:bg-sand-100 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${
                  groupCurrent(group.items) ? 'font-medium text-ink' : 'text-ink-soft'
                }`}
              >
                {group.label}
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  fill="none"
                  aria-hidden
                  className={`transition-transform duration-200 ${menu === group.id ? 'rotate-180' : ''}`}
                >
                  <path d="M3.5 5.5 7 9l3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>

              {menu === group.id ? (
                <div className="absolute left-0 top-full w-[19rem] pt-2">
                  <div className="rounded-2xl border border-sand-200 bg-white p-2 shadow-lift">
                    {group.items.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setMenu(null)}
                        aria-current={current(item.href) ? 'page' : undefined}
                        className={`block rounded-xl px-3 py-2.5 transition-colors hover:bg-sand-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${
                          current(item.href) ? 'bg-sand-100' : ''
                        }`}
                      >
                        <span className="block text-sm font-medium text-ink">{item.label}</span>
                        {item.hint ? (
                          <span className="mt-0.5 block text-xs leading-relaxed text-ink-muted">
                            {item.hint}
                          </span>
                        ) : null}
                      </Link>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ))}

          {NAV_MAIN.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={current(item.href) ? 'page' : undefined}
              className={`whitespace-nowrap rounded-lg px-2.5 py-2 text-sm transition-colors hover:bg-sand-100 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${
                current(item.href) ? 'font-medium text-ink' : 'text-ink-soft'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 lg:flex">
          <Link
            href="/login"
            className="rounded-lg px-3 py-2 text-sm font-medium text-ink-soft transition-colors hover:bg-sand-100 hover:text-ink"
          >
            Войти
          </Link>
          <Link
            href={signedIn ? '/app' : '/login'}
            className="rounded-xl bg-ink px-4 py-2.5 text-sm font-medium text-sand-50 shadow-soft transition-all hover:-translate-y-px hover:bg-ink/90 hover:shadow-lift"
          >
            {signedIn ? 'В рабочее пространство' : 'Начать бесплатно'}
          </Link>
        </div>

        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-label="Меню"
          aria-expanded={open}
          className="rounded-lg p-2 text-ink transition-colors hover:bg-sand-100 lg:hidden"
        >
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden>
            <path
              d={open ? 'M5 5l12 12M17 5L5 17' : 'M3 6h16M3 11h16M3 16h16'}
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      {open ? (
        <div className="max-h-[calc(100dvh-4rem)] overflow-y-auto border-t border-sand-200 bg-sand-50 px-5 py-3 lg:hidden">
          <nav aria-label="Разделы сайта" className="flex flex-col gap-4">
            {GROUPS.map((group) => (
              <div key={group.id}>
                <p className="px-3 text-[11px] font-medium uppercase tracking-wide text-ink-muted">
                  {group.label}
                </p>
                <div className="mt-1 flex flex-col">
                  {group.items.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      aria-current={current(item.href) ? 'page' : undefined}
                      className={`rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-sand-100 ${
                        current(item.href) ? 'font-medium text-ink' : 'text-ink-soft'
                      }`}
                    >
                      {item.label}
                    </Link>
                  ))}
                  {group.id === 'solutions' ? (
                    <Link
                      href={PUBLIC_ROUTES.solutions}
                      onClick={() => setOpen(false)}
                      className="rounded-lg px-3 py-2.5 text-sm font-medium text-sage-700 transition-colors hover:bg-sand-100"
                    >
                      Все решения
                    </Link>
                  ) : null}
                </div>
              </div>
            ))}

            <div className="flex flex-col border-t border-sand-200 pt-2">
              {NAV_MAIN.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  aria-current={current(item.href) ? 'page' : undefined}
                  className={`rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-sand-100 ${
                    current(item.href) ? 'font-medium text-ink' : 'text-ink-soft'
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </nav>

          <div className="mt-3 flex gap-2 border-t border-sand-200 pt-3">
            <Link
              href="/login"
              className="flex-1 rounded-xl border border-sand-300 px-4 py-2.5 text-center text-sm font-medium"
            >
              Войти
            </Link>
            <Link
              href={signedIn ? '/app' : '/login'}
              className="flex-1 rounded-xl bg-ink px-4 py-2.5 text-center text-sm font-medium text-sand-50"
            >
              {signedIn ? 'В продукт' : 'Начать'}
            </Link>
          </div>
        </div>
      ) : null}
    </header>
  )
}
