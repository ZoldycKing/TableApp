import { cookies } from 'next/headers'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { PlatformShell } from '@/components/shell/platform-shell'
import { modeFromCookie, SIDEBAR_COOKIE } from '@/components/shell/variant'
import { loadBusinessNavigation } from '@/lib/business-navigation'
import { OwnerHelp } from './owner-help'

export type ChromeMember = { email: string; workspaceName: string; role: string }
export type ChromeWorkspace = { workspaceId: string; workspaceName: string }

/**
 * Оболочка платформы вокруг страницы.
 *
 * Серверная нарочно: состояние боковой панели лежит в куке, и прочитать её
 * надо **до** первого кадра. Иначе страница рисуется с развёрнутой панелью,
 * а через мгновение схлопывается — и всё содержимое прыгает на полторы сотни
 * пикселей влево у человека на глазах.
 *
 * Имя и набор свойств оставлены прежними: девять страниц зовут её одинаково,
 * и переезд навигации не повод их трогать.
 */
export async function AppChrome({
  member,
  memberships,
  activeWorkspaceId,
  wide = false,
  children,
}: {
  member: ChromeMember
  memberships?: ChromeWorkspace[]
  activeWorkspaceId?: string
  children: ReactNode
  /**
   * Осталось от верхней полосы, где оно задавало ширину ряда.
   *
   * Содержимое задаёт свою ширину. Контекст пространства выравнивается
   * по обычной странице или по широкому редактору таблицы.
   */
  wide?: boolean
}) {
  const [store, businesses] = await Promise.all([cookies(), loadBusinessNavigation()])

  /*
   * Куки нет — панель спрятана: место на экране принадлежит работе. Старые
   * значения читаются дальше, разбор один и лежит рядом с самой панелью.
   */
  const mode = modeFromCookie(store.get(SIDEBAR_COOKIE)?.value)

  return (
    <PlatformShell
      email={member.email}
      role={member.role}
      workspaceName={member.workspaceName}
      workspaces={memberships ?? []}
      activeWorkspaceId={activeWorkspaceId}
      businesses={businesses}
      initialMode={mode}
    >
      <nav aria-label="Текущее пространство" className={`mx-auto flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1 px-5 pt-5 text-sm sm:px-6 ${wide ? '' : 'w-full max-w-6xl'}`}>
        <span className="text-ink-muted">Пространство</span>
        <Link href="/app" className="min-w-0 break-words font-medium text-sage-700 underline-offset-4 hover:underline">{member.workspaceName}</Link>
      </nav>
      {children}
      <OwnerHelp />
    </PlatformShell>
  )
}
