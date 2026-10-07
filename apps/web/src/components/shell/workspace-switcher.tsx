'use client'

import { useTransition } from 'react'
import { switchWorkspaceAction } from '@/app/team-actions'
import { ShellIcon } from './icons'
import { MENU_ITEM, Menu } from './menu'
import { ONLY_NARROW, ONLY_WIDE, type ShellVariant } from './variant'

export type ShellWorkspace = { workspaceId: string; workspaceName: string }

/** Первая буква названия: ею пространство обозначается, когда панель свёрнута. */
export function workspaceInitial(name: string): string {
  return (name.trim()[0] ?? 'П').toUpperCase()
}

/**
 * Переключатель рабочего пространства.
 *
 * Отдельная понятная кнопка, а не выпадающий список в ряду с навигацией:
 * сменить пространство — это сменить всё, что человек видит ниже, и такое
 * действие не должно выглядеть как ещё один фильтр.
 *
 * Полной почты здесь нет намеренно. Наверху человек отвечает на вопрос «где
 * я работаю», а не «кто я»: второе — внизу, в меню учётной записи.
 */
export function WorkspaceSwitcher({
  name,
  workspaces,
  activeWorkspaceId,
  variant,
}: {
  name: string
  workspaces: ShellWorkspace[]
  activeWorkspaceId?: string
  variant: ShellVariant
}) {
  const [pending, startTransition] = useTransition()
  const several = workspaces.length > 1

  const go = (workspaceId: string, close: () => void) => {
    close()
    startTransition(async () => {
      await switchWorkspaceAction(workspaceId)
      /*
       * Полная перезагрузка, а не переход роутером: смена пространства меняет
       * всё дерево данных, и мягкий переход оставил бы на экране таблицы
       * предыдущего.
       */
      window.location.href = '/app'
    })
  }

  /*
   * Одно пространство — переключать нечего, и выпадающее меню обмануло бы
   * ожидание. Показываем просто название.
   */
  if (!several) {
    return (
      <div title={name}>
        <span
          className={`mx-auto size-9 items-center justify-center rounded-xl bg-sand-100 text-sm font-semibold text-ink-soft ${ONLY_NARROW[variant]}`}
        >
          {workspaceInitial(name)}
        </span>
        <span
          className={`truncate rounded-xl px-2.5 py-2 text-sm font-medium text-ink ${ONLY_WIDE[variant]}`}
        >
          {name}
        </span>
      </div>
    )
  }

  return (
    <Menu
      label={`Рабочее пространство: ${name}`}
      // Вниз: кнопка стоит вверху панели, и места под ней достаточно.
      // Не поместится — перевернётся само.
      placement="bottom"
      minWidth={240}
      trigger={(open) => (
        <span title={name}>
          <span
            className={`mx-auto size-9 items-center justify-center rounded-xl bg-sand-100 text-sm font-semibold text-ink-soft transition-colors hover:bg-sand-200 ${ONLY_NARROW[variant]}`}
          >
            {workspaceInitial(name)}
          </span>

          <span
            className={`items-center gap-2 rounded-xl px-2.5 py-2 transition-colors ${ONLY_WIDE[variant]} ${open ? 'bg-sand-100' : 'hover:bg-sand-100'}`}
          >
            {/* `min-w-0` обязателен: без него длинное название распирает
                панель вместо того, чтобы обрезаться многоточием. */}
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
              {pending ? 'Переключаем…' : name}
            </span>
            <ShellIcon name="chevron" className="size-4 shrink-0 text-ink-muted" />
          </span>
        </span>
      )}
    >
      {(close) => (
        <>
          <p className="px-2.5 py-1.5 text-[11px] uppercase tracking-wide text-ink-muted">
            Пространства
          </p>
          {workspaces.map((workspace) => {
            const active = workspace.workspaceId === activeWorkspaceId
            return (
              <button
                key={workspace.workspaceId}
                type="button"
                role="menuitem"
                disabled={pending}
                aria-current={active ? 'true' : undefined}
                onClick={() => (active ? close() : go(workspace.workspaceId, close))}
                className={`${MENU_ITEM} disabled:opacity-40 ${active ? 'text-ink' : ''}`}
              >
                <span className="min-w-0 flex-1 truncate">{workspace.workspaceName}</span>
                {active ? <ShellIcon name="check" className="size-4 shrink-0 text-sage-600" /> : null}
              </button>
            )
          })}
        </>
      )}
    </Menu>
  )
}
