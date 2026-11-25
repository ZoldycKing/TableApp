import Link from 'next/link'
import { redirect } from 'next/navigation'
import { appsForStaff, businessesForClient } from '@/app/auth-actions'
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
 * Platform account home.
 *
 * Working apps (owner/staff) stay in «Ваши приложения». Client activity is a
 * separate «Где вы клиент» list: business name + logo + link only — never
 * orders, statuses, messages or counts from those businesses.
 */
export default async function MyAppsPage() {
  const email = await currentStaffEmail()
  if (!email) redirect('/login')

  const mine = await appsForStaff(email)
  const clientBusinesses = await businessesForClient(email)

  return (
    <main className="platform-surface mx-auto w-full max-w-lg px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Ваши приложения</h1>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--color-ink-muted)]">Вход выполнен как {email}</p>
        <StaffSignOut />
      </div>

      {mine.length === 0 ? (
        <p className="mt-8 text-sm text-ink-soft">
          Рабочих приложений пока нет. Для рабочего доступа попросите руководителя
          добавить вашу почту.
        </p>
      ) : (
        <ul className="mt-8 space-y-2">
          {mine.map((app) => (
            <li key={app.slug}>
              <Link
                href={`/a/${app.slug}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-sand-200 bg-white px-4 py-3 text-sm shadow-soft transition-all hover:-translate-y-0.5 hover:border-sage-300 hover:shadow-lift"
              >
                <span className="min-w-0 break-words">
                  <span className="block font-medium">{app.businessName}</span>
                  <span className="block text-xs text-ink-muted">{app.name}</span>
                </span>
                <span className="text-ink-muted">→</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <section className="mt-12" aria-labelledby="client-businesses-heading">
        <h2 id="client-businesses-heading" className="text-lg font-semibold tracking-tight text-sage-800">
          Где вы клиент
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          Кабинет каждого бизнеса открывается по его ссылке. Здесь только названия.
        </p>
        {clientBusinesses.length === 0 ? (
          <p className="mt-4 text-sm text-ink-soft">
            Пока нет бизнесов, где у вас есть клиентская активность.
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {clientBusinesses.map((business) => (
              <li key={business.businessId}>
                <Link
                  href={`/a/${business.slug}`}
                  className="flex items-center gap-3 rounded-xl border border-sand-200 bg-white px-4 py-3 text-sm shadow-soft transition-all hover:-translate-y-0.5 hover:border-sage-300 hover:shadow-lift"
                >
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-sage-100 text-sm font-semibold text-sage-800"
                    aria-hidden
                  >
                    {business.logoUrl ? (
                      <img src={business.logoUrl} alt="" width={40} height={40} className="h-full w-full object-cover" />
                    ) : (
                      business.businessName.trim().charAt(0).toUpperCase() || '·'
                    )}
                  </span>
                  <span className="min-w-0 flex-1 break-words font-medium">{business.businessName}</span>
                  <span className="text-ink-muted">→</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
