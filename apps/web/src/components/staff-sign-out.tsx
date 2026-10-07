'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { signOutStaffEverywhereAction } from '@/app/auth-actions'

/** Сотруднику хватает одной кнопки: телефон потерян — закрыть везде. */
export function StaffSignOut() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await signOutStaffEverywhereAction()
          router.push('/login')
        })
      }
      className="text-sm text-[var(--color-ink-muted)] underline transition-colors hover:text-ink disabled:opacity-40"
    >
      {pending ? 'Выходим…' : 'Выйти на всех устройствах'}
    </button>
  )
}
