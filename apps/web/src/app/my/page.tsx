import Link from 'next/link'
import { redirect } from 'next/navigation'
import { appsForStaff } from '@/app/auth-actions'
import { StaffSignOut } from '@/components/staff-sign-out'
import { currentStaffEmail } from '@/lib/app-session'
import { PRIVATE_PAGE } from '@/lib/seo'

export const dynamic = 'force-dynamic'

/*
 * В поиске этой странице делать нечего: за ней рабочее пространство.
 * Запрет в robots.txt обход закрывает, но не индексацию — адрес, на который
 * кто-то сослался, попадает в выдачу и без обхода. Отказ говорится здесь.
 */
export const metadata = { title: 'Мои приложения', ...PRIVATE_PAGE }

/**
 * Список приложений сотрудника. Собирается по спискам доступа при каждом
 * заходе, поэтому отражает текущее положение дел: убрали из списка —
 * приложение пропало отсюда сразу.
 */
export default async function MyAppsPage() {
  const email = await currentStaffEmail()
  if (!email) redirect('/login')

  const mine = await appsForStaff(email)

  return (
    <main className="mx-auto w-full max-w-lg px-5 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Ваши приложения</h1>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--color-ink-muted)]">Вход выполнен как {email}</p>
        <StaffSignOut />
      </div>

      {mine.length === 0 ? (
        <p className="mt-8 rounded-xl border border-sand-200 bg-sand-100/60 px-4 py-3 text-sm text-ink-soft">
          Сейчас вам не открыт доступ ни к одному приложению. Попросите добавить
          этот адрес — приложение появится здесь само.
        </p>
      ) : (
        <ul className="mt-8 space-y-2">
          {mine.map((app) => (
            <li key={app.slug}>
              <Link
                href={`/a/${app.slug}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-sand-200 bg-white px-4 py-3 text-sm shadow-soft transition-all hover:-translate-y-0.5 hover:border-sage-300 hover:shadow-lift"
              >
                <span className="font-medium">{app.name}</span>
                <span className="text-ink-muted">→</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
