'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Logo } from '@/components/marketing/logo'
import { ShellIcon } from './icons'
import { HoverLockProvider } from './menu'
import { NavList } from './nav-list'
import { SidebarPanel, type PanelAction } from './sidebar-panel'
import { UserMenu, initialsOf } from './user-menu'
import {
  CLOSE_AFTER,
  COOKIE_VALUE,
  FLOAT,
  HOVERS,
  OPEN_AFTER,
  PANEL,
  SIDEBAR_COOKIE,
  SPACER,
  type SidebarMode,
} from './variant'
import { WorkspaceSwitcher, type ShellWorkspace } from './workspace-switcher'
import { BusinessTree } from './business-tree'
import type { BusinessNavigation } from '@/lib/business-navigation-types'

/**
 * Оболочка платформы: панель слева, работа справа.
 *
 * Разделов было шесть, и верхняя полоса уже не справлялась: «Использование»
 * не помещалось, название пространства обрезалось, почта и кнопка выхода
 * отнимали место у навигации. Тариф и дорожная карта её бы добили.
 *
 * Панель — **плавающая карточка вне потока страницы**: узкая полоска слева,
 * которая по наведению разворачивается поверх содержимого. Раскладка при этом
 * не пересчитывается: таблица на тысячу строк,
 * конструктор приложений и сводка не должны дёргаться оттого, что человек
 * повёл мышь к краю экрана. Закреплённое дерево бизнесов занимает своё место,
 * чтобы владелец мог постоянно видеть ресурсы рядом с открытой страницей.
 */

export function PlatformShell({
  email,
  role,
  workspaceName,
  workspaces,
  activeWorkspaceId,
  businesses,
  initialMode,
  children,
}: {
  email: string
  role: string
  workspaceName: string
  workspaces: ShellWorkspace[]
  activeWorkspaceId?: string
  businesses?: BusinessNavigation[]
  /**
   * Пришло с сервера из куки, и другого пути нет.
   *
   * Сервер обязан знать состояние **до первого кадра**. Реши его в браузере —
   * и человек увидел бы, как панель схлопывается уже после появления страницы.
   */
  initialMode: SidebarMode
  children: ReactNode
}) {
  const pathname = usePathname() ?? ''
  const [mode, setMode] = useState<SidebarMode>(initialMode)
  const [drawer, setDrawer] = useState(false)

  /** Панель развёрнута на время: по наведению или по нажатию. */
  const [peek, setPeek] = useState(false)
  const expanded = mode === 'pinned' || peek
  const variant = expanded ? 'wide' : 'rail'

  /** Открытое меню придерживает уборку: см. `menu.tsx`. */
  const locked = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mounted = useRef(false)
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      if (timer.current !== null) clearTimeout(timer.current)
      timer.current = null
    }
  }, [])

  const later = (fn: () => void, ms: number) => {
    if (!mounted.current) return
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      timer.current = null
      if (mounted.current) fn()
    }, ms)
  }

  const remember = (next: SidebarMode) => {
    setMode(next)
    // Кука, а не localStorage: сервер должен знать состояние до первого кадра.
    // Год — потому что это предпочтение, а не сессия.
    document.cookie = `${SIDEBAR_COOKIE}=${COOKIE_VALUE[next]}; path=/; max-age=31536000; samesite=lax`
  }

  /** Закрепить: панель остаётся развёрнутой — по-прежнему поверх содержимого. */
  const pin = () => {
    setPeek(false)
    remember('pinned')
  }

  /** Открепить: панель сворачивается в полоску и снова слушает наведение. */
  const unpin = () => {
    setPeek(false)
    remember('auto')
  }

  /** Курсор сейчас на панели: по этому решается, можно ли её сворачивать. */
  const hovering = useRef(false)

  const letGo = () => {
    hovering.current = false
    if (mode === 'pinned') return
    // Открытое меню держит панель: человек тянется к пункту, курсор при этом
    // уходит с панели, и без этого меню исчезло бы у него из-под руки.
    later(() => {
      if (!locked.current) setPeek(false)
    }, CLOSE_AFTER)
  }

  /*
   * Наведение разворачивает панель только там, где есть настоящий курсор.
   * На сенсорном экране наведения не существует, и разворачивать по нему
   * значит ловить человека на случайном касании. Спрашиваем у устройства
   * один раз, а не при каждом движении мыши.
   */
  const [hovers, setHovers] = useState(false)
  useEffect(() => {
    const query = window.matchMedia(HOVERS)
    setHovers(query.matches)
    const onChange = (event: MediaQueryListEvent) => setHovers(event.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  const reveal = () => {
    hovering.current = true
    if (!hovers || mode === 'pinned') return
    later(() => setPeek(true), OPEN_AFTER)
  }

  /*
   * Щелчок мимо сворачивает панель, развёрнутую нажатием.
   *
   * Без этого на планшете, где наведения нет, развёрнутая панель висела бы
   * поверх работы, и убрать её было бы нечем, кроме той же кнопки.
   */
  useEffect(() => {
    if (!peek) return
    const onDown = (event: MouseEvent) => {
      if (panel.current?.contains(event.target as Node)) return
      if (locked.current) return
      setPeek(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [peek])

  /*
   * Обработчик замка обязан быть неизменным.
   *
   * Создавался он заново на каждом перерисовывании оболочки — и меню, следящее
   * за ним, перезапускало свой эффект: снимало замок и тут же назначало
   * уборку. Панель уезжала из-под открытого меню ровно тем механизмом,
   * который должен был её удержать.
   */
  const setLock = useCallback((on: boolean) => {
    // A child menu releases its lock during cleanup, after the shell may already be gone.
    if (!mounted.current) return
    locked.current = on
    if (on) return
    // Меню закрылось, а курсор мог уйти ещё раньше: проверяем, не пора ли.
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      timer.current = null
      if (mounted.current && !locked.current) setPeek(false)
    }, CLOSE_AFTER)
  }, [])

  // Панель закрепили — временный показ больше ничего не значит.
  useEffect(() => {
    if (mode === 'pinned') setPeek(false)
  }, [mode])

  const action: PanelAction = !expanded ? 'expand' : mode === 'pinned' ? 'unpin' : 'pin'
  const onAction = () => {
    if (!expanded) return setPeek(true)
    if (mode === 'pinned') return unpin()
    pin()
  }

  return (
    <HoverLockProvider value={setLock}>
      <div className="min-h-dvh bg-sand-50">
        <MobileBar email={email} onOpen={() => setDrawer(true)} />

        <div className="flex">
          {/*
            Под полоску резервируем узкое место. Наведение не меняет раскладку.
            После явного закрепления дерева бизнесов отводим место полной
            панели: рабочая страница остаётся целиком доступной рядом с ней.
          */}
          <div aria-hidden="true" data-rail-spacer className={`hidden shrink-0 md:block ${businesses !== undefined && mode === 'pinned' ? 'w-[304px]' : SPACER}`} />

          {/*
            `min-w-0` обязателен: без него широкая таблица внутри распирает
            колонку, и страница получает боковую прокрутку целиком вместо
            прокрутки одной таблицы.
          */}
          <div className="min-w-0 flex-1">{children}</div>
        </div>

        {/*
          Плавающая карточка: отступы от краёв, скругление, тонкая граница
          и мягкая тень. Анимируется только её ширина — раскладку страницы
          она не трогает, поэтому двести миллисекунд перехода здесь ничего
          не стоят.
        */}
        <div
          ref={panel}
          id="platform-sidebar"
          data-expanded={expanded ? 'open' : 'closed'}
          onMouseEnter={reveal}
          onMouseLeave={letGo}
          onFocus={() => {
            // Внимание с клавиатуры внутри полоски разворачивает её: иначе
            // человек ходит клавишей Tab по значкам без подписей.
            if (mode !== 'pinned') setPeek(true)
          }}
          onBlur={(event) => {
            // Внимание ушло с панели совсем — сворачиваем. Но не из-под
            // курсора: если мышь на панели, человек ею пользуется.
            if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
            if (!hovering.current) letGo()
          }}
          className={`fixed z-40 hidden flex-col overflow-hidden rounded-2xl border border-sand-200 bg-white shadow-soft transition-[width] duration-200 ease-out md:flex ${FLOAT} ${businesses !== undefined && variant === 'wide' ? 'w-[280px]' : PANEL[variant]}`}
        >
          <div className="flex h-full flex-col">
            <SidebarPanel
              pathname={pathname}
              email={email}
              role={role}
              workspaceName={workspaceName}
              workspaces={workspaces}
              activeWorkspaceId={activeWorkspaceId}
              businesses={businesses}
              variant={variant}
              action={action}
              onAction={onAction}
            />
          </div>
        </div>

        <Drawer
          open={drawer}
          onClose={() => setDrawer(false)}
          pathname={pathname}
          role={role}
          email={email}
          workspaceName={workspaceName}
          workspaces={workspaces}
          activeWorkspaceId={activeWorkspaceId}
          businesses={businesses}
        />
      </div>
    </HoverLockProvider>
  )
}

/** Верхняя полоса телефона: плавающей панели там нет и быть не может. */
function MobileBar({ email, onOpen }: { email: string; onOpen: () => void }) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-sand-200 bg-sand-50/90 px-4 backdrop-blur-md md:hidden">
      <button
        type="button"
        onClick={onOpen}
        aria-label="Открыть меню"
        className="flex size-9 items-center justify-center rounded-lg text-ink-soft outline-none transition-colors hover:bg-sand-100 hover:text-ink focus-visible:ring-2 focus-visible:ring-sage-400"
      >
        <ShellIcon name="menu" className="size-5" />
      </button>

      <Link href="/app" className="outline-none focus-visible:ring-2 focus-visible:ring-sage-400">
        <Logo />
      </Link>

      <span
        aria-hidden="true"
        className="ml-auto flex size-8 items-center justify-center rounded-full bg-sage-100 text-sm font-semibold text-ink"
      >
        {initialsOf(email)}
      </span>
    </header>
  )
}

/**
 * Выдвижная панель.
 *
 * Обязательства у неё те же, что у любого окна поверх страницы: Escape
 * закрывает, щелчок по затемнению закрывает, внимание с клавиатуры остаётся
 * внутри, страница под ней не прокручивается. Без последнего человек на
 * телефоне прокручивает то, что под затемнением, и меню выглядит сломанным.
 */
function Drawer({
  open,
  onClose,
  pathname,
  role,
  email,
  workspaceName,
  workspaces,
  activeWorkspaceId,
  businesses,
}: {
  open: boolean
  onClose: () => void
  pathname: string
  role: string
  email: string
  workspaceName: string
  workspaces: ShellWorkspace[]
  activeWorkspaceId?: string
  businesses?: BusinessNavigation[]
}) {
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    const body = document.body
    const before = body.style.overflow
    body.style.overflow = 'hidden'

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
        return
      }
      if (event.key !== 'Tab') return

      /*
       * Внимание держим внутри: без этого Tab из последнего пункта уводит
       * на страницу под затемнением, и человек с клавиатуры оказывается там,
       * куда мышью сейчас не попасть.
       */
      const focusable = panel.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      if (!focusable || focusable.length === 0) return

      const first = focusable[0]!
      const last = focusable[focusable.length - 1]!
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKey)
    // Первым делом — на панель: иначе Tab начинает обход со страницы под ней.
    panel.current?.querySelector<HTMLElement>('a[href], button')?.focus()

    return () => {
      document.removeEventListener('keydown', onKey)
      body.style.overflow = before
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 md:hidden">
      <button
        type="button"
        aria-label="Закрыть меню"
        onClick={onClose}
        className="absolute inset-0 bg-ink/20 backdrop-blur-[2px]"
      />

      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label="Меню платформы"
        className="absolute inset-y-0 left-0 flex w-[300px] max-w-[85vw] flex-col border-r border-sand-200 bg-white"
      >
        <div className="flex items-center gap-2 px-4 pt-4">
          <Logo />
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть меню"
            className="ml-auto flex size-9 items-center justify-center rounded-lg text-ink-soft outline-none transition-colors hover:bg-sand-100 hover:text-ink focus-visible:ring-2 focus-visible:ring-sage-400"
          >
            <ShellIcon name="close" className="size-5" />
          </button>
        </div>

        {businesses === undefined ? <div className="px-3 pt-3">
          <WorkspaceSwitcher
            name={workspaceName}
            workspaces={workspaces}
            activeWorkspaceId={activeWorkspaceId}
            variant="wide"
          />
        </div> : null}

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-3 py-4">
          {businesses !== undefined ? <BusinessTree businesses={businesses} activeWorkspaceId={activeWorkspaceId} pathname={pathname} variant="wide" mobile onNavigate={onClose} /> : null}
          <NavList pathname={pathname} role={role} onNavigate={onClose}
            omitIds={businesses !== undefined ? ['data', 'apps'] : []}
            contextName={businesses !== undefined ? businesses.find(business => business.workspaceId === activeWorkspaceId)?.businessName ?? workspaceName : undefined} />
        </div>

        <div className="border-t border-sand-200 px-3 py-2.5">
          <UserMenu email={email} role={role} variant="wide" />
        </div>
      </div>
    </div>
  )
}
