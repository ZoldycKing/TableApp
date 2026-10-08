import Link from 'next/link'
import { AppChrome } from '@/components/app-chrome'
import {
  CtaSection,
  MarketingShell,
  PageHero,
  PrimaryLink,
  SecondaryLink,
  Section,
} from '@/components/marketing/blocks'
import { Reveal } from '@/components/marketing/reveal'
import { TemplateGallery } from '@/components/template-gallery'
import { pageMetadata } from '@/lib/seo'
import { currentMember, listMemberships } from '@/lib/session'
import { SOLUTIONS } from '@/lib/solutions'
import { TEMPLATES } from '@/lib/templates/catalog'
import { DEFAULT_APP_ROLES } from '@tableapp/schema'

export const dynamic = 'force-dynamic'

export const metadata = pageMetadata({
  path: '/templates',
  title: 'Шаблоны — готовые таблицы и приложение к ним',
  description:
    'Одиннадцать готовых наборов: заявки, заказы, клиентский портал, производственный учёт, склад, каталог. Таблицы, связи и приложение появляются в вашем пространстве сразу.',
})

/**
 * Шаблоны.
 *
 * Один адрес на двоих. Гостю — витрина, которую можно найти в поиске
 * и прочитать без входа; вошедшему — та же витрина, но с кнопкой «Взять»,
 * которая разворачивает шаблон в его пространство.
 *
 * Прежде этих страниц было две — `/shablony` для сайта и `/templates`
 * для продукта, — с одним и тем же списком. Две страницы с одним текстом
 * это либо дубль в поиске, либо расходящиеся описания, и обычно и то и другое.
 */

const QUESTIONS = [
  {
    question: 'Откуда берутся шаблоны?',
    answer:
      'Это готовые наборы таблиц под частые дела: приём заявок, склад, каталог. Когда вы берёте шаблон, таблицы создаются в вашем пространстве — вашей копией, а не общей с кем-то.',
  },
  {
    question: 'А мои данные?',
    answer:
      'Внутри учебные записи. В каждой таблице можно удалить неизменённые примеры; ваши записи и отредактированные примеры сохранятся. При загрузке Excel или CSV проверьте сопоставление колонок перед импортом.',
  },
  {
    question: 'Что если не подойдёт?',
    answer:
      'Шаблон после установки — обычные ваши таблицы. Переименовывайте колонки, добавляйте свои, удаляйте лишние, меняйте статусы на свои. Никакой связи с шаблоном не остаётся, и обновлять его мы к вам не придём.',
  },
]

export default async function TemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ take?: string }>
}) {
  const member = await currentMember()
  /*
   * Выбор, сделанный до входа. Пришёл параметром и проверяется по каталогу:
   * чужое значение в адресе не должно ничего значить.
   */
  const { take } = await searchParams
  const chosen = TEMPLATES.find((template) => template.id === take)?.id ?? null

  if (member) {
    return (
      <AppChrome
        member={{ email: member.email, workspaceName: member.workspaceName, role: member.role }}
        memberships={await listMemberships(member.userId)}
        activeWorkspaceId={member.workspaceId}
      >
        <main className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-6">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Шаблоны</h1>
          <p className="mt-2 max-w-2xl text-sm text-ink-soft">
            Таблицы и черновик приложения. Замените учебные записи, проверьте права ролей и опубликуйте приложение. В обычных шаблонах ограничение по сотруднику нужно настроить отдельно.
          </p>

          <div className="mt-8">
            <TemplateGallery templates={[...TEMPLATES]} chosen={chosen} />
          </div>

          <section className="mt-12 grid gap-5 border-t border-sand-200 pt-8 md:grid-cols-3">
            {QUESTIONS.map((item) => (
              <div key={item.question}>
                <h2 className="text-sm font-semibold text-ink">{item.question}</h2>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">{item.answer}</p>
              </div>
            ))}
          </section>
        </main>
      </AppChrome>
    )
  }

  return (
    <MarketingShell signedIn={false}>
      <PageHero
        trail={[{ href: '/', label: 'TableApp' }, { label: 'Шаблоны' }]}
        title="Шаблоны"
        lead="Шаблон — это таблицы с нужными колонками, связи между ними и приложение поверх. Внутри строки-примеры: видно, как всё считается. Дальше это ваши таблицы — переименовывайте и меняйте."
        actions={
          <>
            <PrimaryLink href="/login">Начать бесплатно</PrimaryLink>
            <SecondaryLink href="/demo">Открыть живое демо</SecondaryLink>
          </>
        }
      />

      <Section
        title="Готовые шаблоны"
        lead="Одиннадцать наборов под частые дела. Выбирайте по задаче: внутри каждого — состав таблиц, роли и ограничения."
      >
        <div className="grid gap-5 lg:grid-cols-3">
          {TEMPLATES.map((template, index) => {
            const solution = SOLUTIONS.find((item) => item.templateId === template.id)
            const rows = template.tables.reduce((total, table) => total + table.rows.length, 0)
            const roles = template.production
              ? [template.production.copy.director, template.production.copy.operator]
              : template.inventory ? ['Кладовщик', 'Владелец'] : DEFAULT_APP_ROLES.map((role) => role.name)

            return (
              <Reveal key={template.id} delay={(index % 3) * 90}>
                <Link
                  href={`/templates/${template.id}`}
                  className="group flex h-full flex-col rounded-2xl border border-sand-200 bg-white p-7 shadow-soft transition-all duration-300 hover:-translate-y-1.5 hover:border-sage-300 hover:shadow-lift"
                >
                  <span aria-hidden className="text-3xl">
                    {template.emoji}
                  </span>
                  <h2 className="mt-4 font-display text-base font-bold">{template.name}</h2>
                  <p className="mt-2 text-sm text-ink-muted">{template.tagline}</p>
                  <p className="mt-3 text-xs leading-relaxed text-ink-muted">{template.audience}</p>

                  {/*
                    То, по чему шаблоны и выбирают: состав, роли и главное
                    ограничение. Без этого одиннадцать карточек отличаются
                    только эмодзи.
                  */}
                  <dl className="mt-4 flex-1 space-y-1.5 border-t border-sand-200 pt-4 text-xs">
                    <div className="flex gap-2">
                      <dt className="shrink-0 text-ink-muted">Состав</dt>
                      <dd className="text-ink-soft">
                        {template.tables.length} табл. · {rows} строк-примеров
                      </dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="shrink-0 text-ink-muted">Роли</dt>
                      <dd className="text-ink-soft">{roles.join(', ')}</dd>
                    </div>
                    {solution ? (
                      <div className="flex gap-2">
                        <dt className="shrink-0 text-ink-muted">Учтите</dt>
                        <dd className="text-ink-soft">{solution.limits[0]}</dd>
                      </div>
                    ) : null}
                  </dl>

                  <span className="mt-5 text-sm font-medium text-sage-700">
                    Что внутри
                    <span className="ml-1.5 inline-block transition-transform group-hover:translate-x-1">
                      →
                    </span>
                  </span>
                </Link>
              </Reveal>
            )
          })}
        </div>
      </Section>

      <Section title="Что происходит, когда вы нажимаете «Взять шаблон»" tone="white">
        <div className="grid gap-5 md:grid-cols-3">
          {QUESTIONS.map((item, index) => (
            <Reveal key={item.question} delay={index * 100}>
              <div className="h-full rounded-2xl border border-sand-200 bg-sand-50 p-6">
                <h3 className="font-display text-base font-bold">{item.question}</h3>
                <p className="mt-2.5 text-sm leading-relaxed text-ink-muted">{item.answer}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      <Section title="Выбрать по задаче" lead="Если не знаете, с какого шаблона начать, — посмотрите, как устроена работа в вашем деле.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SOLUTIONS.map((solution) => (
            <Link
              key={solution.slug}
              href={`/solutions/${solution.slug}`}
              className="group rounded-2xl border border-sand-200 bg-white p-5 transition-all hover:-translate-y-1 hover:border-sage-300 hover:shadow-lift"
            >
              <span aria-hidden className="text-2xl">
                {solution.emoji}
              </span>
              <p className="mt-3 font-display text-sm font-bold">{solution.name}</p>
              <p className="mt-1.5 text-xs leading-relaxed text-ink-muted">{solution.short}</p>
            </Link>
          ))}
        </div>
      </Section>

      <CtaSection
        title="Возьмите шаблон и загрузите"
        accent="свою таблицу"
        text="При загрузке проверьте сопоставление колонок. Неизменённые примеры удаляются отдельно в каждой таблице. Бесплатный тариф без ограничения по времени, карта не нужна."
        href="/login"
        label="Начать бесплатно"
        secondary={{ href: '/pricing', label: 'Сколько это стоит' }}
      />
    </MarketingShell>
  )
}
