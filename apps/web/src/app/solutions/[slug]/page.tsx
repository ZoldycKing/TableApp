import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  CardGrid,
  CtaSection,
  FaqList,
  Limits,
  MarketingShell,
  PageHero,
  PrimaryLink,
  SecondaryLink,
  Section,
  Workflow,
} from '@/components/marketing/blocks'
import { SolutionDemo } from '@/components/marketing/solution-demo'
import { TemplateIcon } from '@/components/template-icon'
import { Reveal } from '@/components/marketing/reveal'
import { pageMetadata } from '@/lib/seo'
import { currentMember } from '@/lib/session'
import { findSolution, SOLUTIONS } from '@/lib/solutions'
import { findTemplate } from '@/lib/templates/catalog'

export const dynamic = 'force-dynamic'

/**
 * Страница решения.
 *
 * Все устроены одинаково: что сейчас, что появится, как идёт работа, что видно
 * на экране, чего пока нет, вопросы, кнопка. Одинаковость тут не лень,
 * а польза: человек, зашедший на вторую страницу, уже знает, где искать нужное.
 */

export function generateStaticParams() {
  return SOLUTIONS.map((item) => ({ slug: item.slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const solution = findSolution(slug)
  if (!solution) return {}

  return pageMetadata({
    path: `/solutions/${solution.slug}`,
    title: solution.seoTitle,
    description: solution.description,
  })
}

export default async function SolutionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const solution = findSolution(slug)
  if (!solution) notFound()

  const member = await currentMember()
  const template = solution.templateId ? findTemplate(solution.templateId) : undefined
  // Человек с этой страницы идёт за шаблоном: ведём на его страницу, а не
  // на общий список, где ещё надо искать нужный.
  const takeHref = template ? `/templates/${template.id}` : solution.capability ? '/templates#client-apps' : '/how-it-works'
  const related = solution.related
    .map((item) => findSolution(item))
    .filter((item): item is NonNullable<typeof item> => Boolean(item))

  return (
    <MarketingShell signedIn={Boolean(member)}>
      <PageHero
        trail={[
          { href: '/', label: 'TableApp' },
          { href: '/solutions', label: 'Решения' },
          { label: solution.name },
        ]}
        emoji={solution.emoji}
        title={solution.h1}
        lead={solution.lead}
        note={solution.who}
        actions={
          <>
            <PrimaryLink href={takeHref}>
              {template ? 'Посмотреть стартовый набор' : solution.capability ? 'Выбрать сценарий бизнеса' : 'Как собрать приложение'}
            </PrimaryLink>
            <SecondaryLink href="#primer">Посмотреть пример</SecondaryLink>
            {/* Живое демо собрано из этого шаблона — предлагаем его только здесь. */}
            {solution.slug === 'client-portal' ? (
              <SecondaryLink href="/demo">Открыть живое демо</SecondaryLink>
            ) : null}
          </>
        }
      />

      <Section id="primer" title={solution.example.title} lead="Статичные примеры на учебных данных. Подписи различают рабочее пространство владельца и приложение по ссылке." tone="white">
        <SolutionDemo slug={solution.slug} />
      </Section>

      <Section title="Как это устроено сейчас" width="narrow">
        <ul className="space-y-3">
          {solution.pains.map((pain, index) => (
            <Reveal key={pain} delay={index * 80}>
              <li className="flex gap-3 rounded-xl border border-sand-200 bg-white px-5 py-4 text-sm leading-relaxed text-ink-soft shadow-soft">
                <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-clay-400" />
                <span>{pain}</span>
              </li>
            </Reveal>
          ))}
        </ul>
      </Section>

      <Section title="Как идёт работа" tone="white" width="narrow">
        <Workflow steps={solution.workflow} />
      </Section>

      <Section title="Что это меняет">
        <CardGrid items={solution.blocks} />
      </Section>

      {template ? (
        <Section title="Шаблон, с которого начинают" width="narrow">
          <Reveal>
            <div className="rounded-2xl border border-sand-200 bg-white p-7 shadow-soft">
              <TemplateIcon id={template.id} />
              <h3 className="mt-4 font-display text-lg font-bold">{template.name}</h3>
              <p className="mt-2 text-sm text-ink-muted">{template.tagline}</p>
              <ul className="mt-5 space-y-2">
                {template.gives.map((line) => (
                  <li key={line} className="flex gap-2.5 text-sm leading-relaxed text-ink-soft">
                    <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-sage-400" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
              <Link
                href={`/templates/${template.id}`}
                className="mt-6 inline-block w-fit rounded-xl bg-ink px-5 py-2.5 text-sm font-medium text-sand-50 transition-all hover:-translate-y-0.5 hover:bg-ink/90"
              >
                Что внутри шаблона
              </Link>
            </div>
          </Reveal>
        </Section>
      ) : null}

      <Section width="narrow">
        <Reveal>
          <Limits items={solution.limits} />
        </Reveal>
      </Section>

      <Section title="Частые вопросы" tone="sand" width="narrow">
        <FaqList items={solution.faq} />
      </Section>

      <Section title="Смотрят ещё" tone="white">
        <div className="grid gap-4 sm:grid-cols-3">
          {related.map((item) => (
            <Link
              key={item.slug}
              href={`/solutions/${item.slug}`}
              className="group rounded-2xl border border-sand-200 bg-sand-50 p-5 transition-all hover:-translate-y-1 hover:border-sage-300 hover:bg-white hover:shadow-lift"
            >
              <span aria-hidden className="text-2xl">
                {item.emoji}
              </span>
              <p className="mt-3 font-display text-sm font-bold">{item.name}</p>
              <p className="mt-1.5 text-xs leading-relaxed text-ink-muted">{item.short}</p>
            </Link>
          ))}
          <Link
            href="/features"
            className="group rounded-2xl border border-sand-200 bg-sand-50 p-5 transition-all hover:-translate-y-1 hover:border-sage-300 hover:bg-white hover:shadow-lift"
          >
            <span aria-hidden className="text-2xl">
              🧩
            </span>
            <p className="mt-3 font-display text-sm font-bold">Возможности</p>
            <p className="mt-1.5 text-xs leading-relaxed text-ink-muted">
              Из чего это собрано: таблицы, формулы, роли, приложения
            </p>
          </Link>
        </div>
      </Section>

      <CtaSection
        title="Попробуйте на"
        accent="своих данных"
        text="Возьмите шаблон и загрузите в него свою таблицу из Excel — колонки сопоставятся по названиям. Бесплатный тариф без ограничения по времени, карта не нужна."
        href={member ? '/app' : '/login'}
        label={member ? 'В рабочее пространство' : 'Начать бесплатно'}
        secondary={{ href: '/pricing', label: 'Сколько это стоит' }}
      />
    </MarketingShell>
  )
}
