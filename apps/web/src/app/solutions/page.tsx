import Link from 'next/link'
import {
  CtaSection,
  MarketingShell,
  PageHero,
  PrimaryLink,
  SecondaryLink,
  Section,
} from '@/components/marketing/blocks'
import { Reveal } from '@/components/marketing/reveal'
import { pageMetadata } from '@/lib/seo'
import { currentMember } from '@/lib/session'
import { INDUSTRIES, SOLUTIONS } from '@/lib/solutions'

export const dynamic = 'force-dynamic'

export const metadata = pageMetadata({
  path: '/solutions',
  title: 'Решения — заявки, кабинет клиента, производство и склад',
  description:
    'Шесть дел, ради которых заводят таблицу: заявки и выезды, кабинет клиента, производственный учёт, склад, каталог и рабочее приложение для сотрудников.',
})

/**
 * Список решений.
 *
 * Две оси: по делу и по отрасли — человек приходит либо с задачей, либо
 * с собой. Отдельных страниц под отрасли не делаем: за каждой стоят те же
 * решения, названные другими словами, и пять тонких страниц с переписанным
 * текстом хуже честного списка.
 */
export default async function SolutionsPage() {
  const member = await currentMember()

  return (
    <MarketingShell signedIn={Boolean(member)}>
      <PageHero
        trail={[{ href: '/', label: 'TableApp' }, { label: 'Решения' }]}
        title="Решения"
        lead="Дела, ради которых чаще всего заводят таблицу и потом с ней мучаются. За каждым — рабочее приложение, а не ещё один файл."
        actions={
          <>
            <PrimaryLink href="/templates">Посмотреть шаблоны</PrimaryLink>
            <SecondaryLink href="/demo">Открыть живое демо</SecondaryLink>
          </>
        }
      />

      <Section title="По задаче" lead="Выберите то, что ближе к вашей работе.">
        <div className="grid gap-5 sm:grid-cols-2">
          {SOLUTIONS.map((item, index) => (
            <Reveal key={item.slug} delay={(index % 2) * 100}>
              <Link
                href={`/solutions/${item.slug}`}
                className="group flex h-full flex-col rounded-2xl border border-sand-200 bg-white p-7 shadow-soft transition-all duration-300 hover:-translate-y-1.5 hover:border-sage-300 hover:shadow-lift"
              >
                <span aria-hidden className="text-3xl">
                  {item.emoji}
                </span>
                <h2 className="mt-4 font-display text-lg font-bold">{item.name}</h2>
                <p className="mt-2.5 flex-1 text-sm leading-relaxed text-ink-muted">{item.short}</p>
                <span className="mt-5 text-sm font-medium text-sage-700">
                  Подробнее
                  <span className="ml-1.5 inline-block transition-transform group-hover:translate-x-1">
                    →
                  </span>
                </span>
              </Link>
            </Reveal>
          ))}
        </div>
      </Section>

      <Section
        title="По отрасли"
        lead="Если своей задачи не нашли — найдите себя. За каждой отраслью стоят те же решения, названные вашими словами."
        tone="white"
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {INDUSTRIES.map((industry, index) => (
            <Reveal key={industry.name} delay={(index % 3) * 90}>
              <div className="h-full rounded-2xl border border-sand-200 bg-sand-50 p-6">
                <h3 className="font-display text-base font-bold">{industry.name}</h3>
                <p className="mt-2 text-sm text-ink-muted">{industry.text}</p>
                <ul className="mt-4 space-y-1.5">
                  {industry.slugs.map((slug) => {
                    const solution = SOLUTIONS.find((item) => item.slug === slug)
                    if (!solution) return null
                    return (
                      <li key={slug}>
                        <Link
                          href={`/solutions/${slug}`}
                          className="text-sm text-sage-700 underline-offset-4 transition-colors hover:underline"
                        >
                          {solution.name}
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      <CtaSection
        title="Начните с"
        accent="готового шаблона"
        text="Таблицы, связи и приложение поверх них появляются в вашем пространстве сразу после установки. Внутри примеры — видно, как всё считается."
        href="/templates"
        label="Открыть шаблоны"
        secondary={{ href: '/how-it-works', label: 'Как это работает' }}
      />
    </MarketingShell>
  )
}
