import Link from 'next/link'
import { MarketingShell } from '@/components/marketing/blocks'
import { SOLUTIONS } from '@/lib/solutions'

export const metadata = {
  title: 'Страница не найдена',
  // Ошибочный адрес в поиске не нужен никому.
  robots: { index: false, follow: false },
}

/**
 * Страница, которой нет.
 *
 * Не заглушка на чёрном фоне, а обычная страница сайта: человек сюда попадает
 * по старой ссылке или опечатке, и ему нужно не извинение, а дорога дальше.
 *
 * Ничего не спрашивает у сервера: ни сессии, ни базы. Страница ошибки, которая
 * сама зависит от работающей базы, — это вторая ошибка поверх первой.
 */
export default function NotFound() {
  return (
    <MarketingShell signedIn={false}>
      <section className="mx-auto w-full max-w-3xl px-5 py-24 text-center sm:px-8">
        <p className="font-display text-6xl font-extrabold text-sage-300">404</p>
        <h1 className="mt-6 font-display text-[2rem] font-extrabold leading-tight sm:text-[2.6rem]">
          Такой страницы нет
        </h1>
        <p className="mx-auto mt-5 max-w-lg text-ink-soft">
          Возможно, в адресе опечатка или страница переехала. Вот куда ходят чаще всего.
        </p>

        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/"
            className="rounded-xl bg-ink px-6 py-3.5 text-sm font-medium text-sand-50 shadow-soft transition-all hover:-translate-y-0.5 hover:bg-ink/90"
          >
            На главную
          </Link>
          <Link
            href="/templates"
            className="rounded-xl border border-sand-300 bg-white/60 px-6 py-3.5 text-sm font-medium transition-all hover:-translate-y-0.5 hover:border-ink/25 hover:bg-white"
          >
            Шаблоны
          </Link>
        </div>

        <div className="mt-14 text-left">
          <h2 className="font-display text-base font-bold">Куда обычно шли</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {SOLUTIONS.map((solution) => (
              <Link
                key={solution.slug}
                href={`/solutions/${solution.slug}`}
                className="group flex items-center gap-3 rounded-2xl border border-sand-200 bg-white px-5 py-4 transition-all hover:-translate-y-0.5 hover:border-sage-300 hover:shadow-lift"
              >
                <span aria-hidden className="text-2xl">
                  {solution.emoji}
                </span>
                <span className="text-sm font-medium">{solution.name}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </MarketingShell>
  )
}
