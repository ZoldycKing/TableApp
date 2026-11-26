'use client'

import Link from 'next/link'
import { useTransition } from 'react'
import { signOutMemberAction } from '@/app/auth-actions'
import { ROLE_LABELS, isKnownRole } from '@/lib/roles'
import { Avatar } from '@/components/ui/avatar'
import { ShellIcon } from './icons'
import { MENU_ITEM, Menu } from './menu'
import { ONLY_NARROW, ONLY_WIDE, type ShellVariant } from './variant'

/** Имя человека из почты, пока настоящего нет: «nikolala13@…» → «nikolala13». */
export function nameFromEmail(email: string): string {
  return email.split('@')[0] || email
}

/**
 * Учётная запись — внизу панели.
 *
 * Здесь всё, что относится к человеку, а не к его делу: он сам, его
 * безопасность и выход. Раньше «Выйти» стояла отдельной кнопкой в один ряд
 * с разделами и соперничала с ними за внимание — при том, что нажимают её
 * реже всего остального.
 *
 * «Безопасность» переехала сюда не для порядка: на той странице только
 * устройства, подтверждение входа и журнал — всё про учётную запись
 * и ничего про рабочее пространство. В списке разделов она отвечала
 * на вопрос, которого там не задают.
 */
export function UserMenu({
  email,
  role,
  variant,
}: {
  email: string
  role: string
  variant: ShellVariant
}) {
  const [pending, startTransition] = useTransition()
  const roleLabel = isKnownRole(role) ? ROLE_LABELS[role] : role

  return (
    <Menu
      label={`Учётная запись: ${email}`}
      // Вверх: кнопка стоит у самого низа панели, и меню, открытое вниз,
      // уезжало за нижний край окна — человек видел одну строчку.
      placement="top"
      minWidth={230}
      trigger={(open) => (
        <span title={email}>
          <span className={ONLY_NARROW[variant]}>
            <Avatar id={email} size={36} />
          </span>

          <span
            className={`items-center gap-2.5 rounded-xl px-2 py-2 transition-colors ${ONLY_WIDE[variant]} ${open ? 'bg-sand-100' : 'hover:bg-sand-100'}`}
          >
            <Avatar id={email} size={32} />
            {/* Почта длинная почти всегда: обрезаем, а не переносим —
                перенос раздвигает низ панели и двигает всё над ним. */}
            <span className="min-w-0 flex-1 text-left">
              <span className="block truncate text-sm font-medium text-ink">{nameFromEmail(email)}</span>
              <span className="block truncate text-xs text-ink-muted">{email}</span>
            </span>
            <ShellIcon name="chevron" className="size-4 shrink-0 text-ink-muted" />
          </span>
        </span>
      )}
    >
      {(close) => (
        <>
          <div className="px-2.5 py-1.5">
            <p className="truncate text-sm font-medium text-ink">{nameFromEmail(email)}</p>
            <p className="truncate text-xs text-ink-muted" title={email}>
              {email}
            </p>
            <p className="mt-0.5 text-xs text-ink-muted">{roleLabel} пространства</p>
          </div>

          <div className="my-1 h-px bg-sand-200" />

          <Link href="/security" role="menuitem" onClick={close} className={MENU_ITEM}>
            <ShellIcon name="shield" className="size-4" />
            Безопасность
          </Link>

          <button
            type="button"
            role="menuitem"
            disabled={pending}
            onClick={() => {
              close()
              startTransition(async () => {
                await signOutMemberAction()
                window.location.href = '/login'
              })
            }}
            className={`${MENU_ITEM} disabled:opacity-40`}
          >
            <ShellIcon name="logout" className="size-4" />
            {pending ? 'Выходим…' : 'Выйти'}
          </button>
        </>
      )}
    </Menu>
  )
}
