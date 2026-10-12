import Link from 'next/link'
import { SOLUTIONS } from '@/lib/solutions'
import { STARTER_TEMPLATES } from '@/lib/templates/catalog'

/**
 * Решения на главной.
 *
 * Раньше здесь висели шесть выдуманных связок, которых в продукте не было, —
 * человек читал «Клиенты и сделки» и не находил этого нигде. Теперь карточки
 * ведут на страницы решений, за которыми стоят настоящие шаблоны.
 */
export function Templates() {
  return (
    <div>
      <div className="grid gap-5 sm:grid-cols-2">
        {SOLUTIONS.map((item) => (
          <Link
            key={item.slug}
            href={`/solutions/${item.slug}`}
            className="group flex h-full gap-4 rounded-2xl border border-sand-200 bg-white p-5 shadow-soft transition-all duration-300 hover:-translate-y-1 hover:border-sage-300 hover:shadow-lift"
          >
            <span aria-hidden className="h-fit shrink-0 text-2xl">{item.emoji}</span>
            <span className="min-w-0">
              <span className="block font-display text-base font-bold">
                {item.name}
                <span
                  aria-hidden
                  className="ml-1.5 inline-block text-sage-700 opacity-0 transition-all group-hover:translate-x-1 group-hover:opacity-100"
                >
                  →
                </span>
              </span>
              <span className="mt-1.5 block text-sm leading-relaxed text-ink-muted">{item.short}</span>
            </span>
          </Link>
        ))}
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
        <Link
          href="/templates"
          className="rounded-xl border border-sand-300 bg-white px-5 py-3 text-sm font-medium transition-all hover:-translate-y-0.5 hover:border-ink/25"
        >
          Все шаблоны
        </Link>
        <p className="text-sm text-ink-muted">
          {/* Число берётся из каталога: приписать лишний шаблон словами нельзя. */}
          {STARTER_TEMPLATES.length} стартовых наборов для клиентов и внутреннего учёта. Кабинет клиента включён в клиентские сценарии.
        </p>
      </div>
    </div>
  )
}
