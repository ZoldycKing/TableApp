'use client'

import Link from 'next/link'
import { Logo } from '@/components/marketing/logo'
import { ShellIcon } from './icons'
import { NavList } from './nav-list'
import { UserMenu } from './user-menu'
import { ROW, type ShellVariant } from './variant'
import { WorkspaceSwitcher, type ShellWorkspace } from './workspace-switcher'
import { BusinessTree } from './business-tree'
import type { BusinessNavigation } from '@/lib/business-navigation-types'

/**
 * Содержимое боковой панели.
 *
 * Отдельно от самой панели, потому что рисуется в двух видах — полоской
 * и целиком — и потому что то же содержимое уходит в выдвижное меню
 * на телефоне. Три копии означали бы три расходящиеся навигации.
 */

/** Что делает единственная кнопка управления панелью. */
export type PanelAction = 'expand' | 'pin' | 'unpin'

const WORDS: Record<PanelAction, { label: string; hint: string; icon: string }> = {
  expand: {
    label: 'Развернуть панель',
    hint: 'Развернуть панель',
    icon: 'expand',
  },
  pin: {
    label: 'Закрепить панель',
    hint: 'Закрепить панель: она останется развёрнутой',
    icon: 'pin',
  },
  unpin: {
    label: 'Открепить панель',
    hint: 'Открепить панель: она свернётся в полоску и будет разворачиваться по наведению',
    icon: 'collapse',
  },
}

export function SidebarPanel({
  pathname,
  email,
  role,
  workspaceName,
  workspaces,
  activeWorkspaceId,
  businesses,
  variant,
  action,
  onAction,
}: {
  pathname: string
  email: string
  role: string
  workspaceName: string
  workspaces: ShellWorkspace[]
  activeWorkspaceId?: string
  businesses?: BusinessNavigation[]
  variant: ShellVariant
  /**
   * Кнопка называет действие, а не состояние.
   *
   * Прежде она называлась «Скрыть меню», и человек, увидевший развёрнутую
   * по наведению панель, не понимал, как оставить её себе.
   */
  action: PanelAction
  onAction: () => void
}) {
  const words = WORDS[action]

  /*
   * У развёрнутой панели кнопка стоит наверху, рядом с названием: закрыть
   * панель ищут там же, где закрывают любое окно. У полоски наверху места
   * нет — там она внизу, и там же единственная: развернуть полоску
   * больше нечем.
   */
  const button = (
    <button
      type="button"
      onClick={onAction}
      aria-label={words.label}
      title={words.hint}
      aria-expanded={variant === 'wide'}
      aria-controls="platform-sidebar"
      className="flex size-8 shrink-0 items-center justify-center rounded-lg text-ink-muted outline-none transition-colors hover:bg-sand-100 hover:text-ink focus-visible:ring-2 focus-visible:ring-sage-400"
    >
      <ShellIcon name={words.icon} className="size-4" />
    </button>
  )

  return (
    <>
      <div className="flex flex-col gap-3 px-3 pt-3">
        <div className="flex items-center gap-1">
          <Link
            href="/app"
            aria-label="Scatta — обзор пространства"
            className={`flex h-9 min-w-0 flex-1 items-center rounded-xl outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-sage-400 ${ROW[variant]}`}
          >
            <Logo mark={variant === 'rail'} height={variant === 'rail' ? 28 : 26} />
          </Link>

          {variant === 'wide' ? button : null}
        </div>

        {businesses === undefined ? <WorkspaceSwitcher
          name={workspaceName}
          workspaces={workspaces}
          activeWorkspaceId={activeWorkspaceId}
          variant={variant}
        /> : null}
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overflow-x-hidden px-3 py-4">
        {businesses !== undefined ? <BusinessTree businesses={businesses} activeWorkspaceId={activeWorkspaceId} pathname={pathname} variant={variant} /> : null}
        <NavList pathname={pathname} role={role} variant={variant}
          omitIds={businesses?.find(business=>business.workspaceId===activeWorkspaceId)?.tableLimited?['overview','templates','apps','messages','team','usage',...(variant==='wide'?['data']:[])]:businesses !== undefined && variant === 'wide' ? ['data', 'apps'] : []}
          contextName={businesses !== undefined ? businesses.find(business => business.workspaceId === activeWorkspaceId)?.workspaceName ?? workspaceName : undefined} />
      </div>

      <div className="px-3 py-2.5">
        <UserMenu email={email} role={role} variant={variant} />
      </div>

      {variant === 'wide' ? null : <div className="flex justify-center px-3 pb-3">{button}</div>}
    </>
  )
}
