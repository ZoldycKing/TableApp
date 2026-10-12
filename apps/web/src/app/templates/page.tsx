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
import { findStarter, findTemplate, STARTER_GROUPS, STARTER_TEMPLATES } from '@/lib/templates/catalog'
import { templateRoleNames } from '@/lib/templates/presentation'

export const dynamic = 'force-dynamic'

export const metadata = pageMetadata({
  path: '/templates',
  title: 'Стартовые наборы для бизнеса',
  description:
    'Выберите задачу бизнеса: продажа товаров, запись на услуги, ремонт, выезды, недвижимость или доставка. Кабинет клиента включён. Внутренний учёт — в отдельном разделе.',
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
      'Это готовые сценарии с таблицами, экранами и настройками доступа. Вы выбираете задачу бизнеса, а не собираете отдельно каталог, заказы и кабинет. Таблицы создаются в вашем пространстве — вашей копией.',
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
  const chosen = findStarter(take)?.id ?? null
  const compatibilityTemplate = take === 'portal' ? findTemplate('portal') : undefined

  if (member) {
    return (
      <AppChrome
        member={{ email: member.email, workspaceName: member.workspaceName, role: member.role }}
        memberships={await listMemberships(member.userId)}
        activeWorkspaceId={member.workspaceId}
      >
        <main className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-6">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">С чего начать вашему бизнесу</h1>
          <p className="mt-2 max-w-2xl text-sm text-ink-soft">
            Выберите задачу — получите таблицы и черновик приложения. Кабинет клиента входит в клиентские наборы. Замените примеры, добавьте сотрудников и проверьте доступ перед публикацией.
          </p>

          <div className="mt-8">
            <p className="mb-6 rounded-xl border border-sand-200 bg-sand-50 px-5 py-4 text-sm leading-relaxed text-ink-soft">
              Уже есть приложение бизнеса? Подключите новую возможность в его настройках, чтобы сохранить одну ссылку и кабинет бизнеса.
              {' '}<Link href="/apps" className="font-medium text-sage-700 underline underline-offset-4">Открыть мои приложения</Link>
            </p>
            <TemplateGallery key={chosen ?? compatibilityTemplate?.id ?? 'default'} templates={[...STARTER_TEMPLATES]} chosen={chosen} compatibilityTemplate={compatibilityTemplate} />
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
        title="С чего начать вашему бизнесу"
        lead="Выберите, что делает ваш бизнес. В наборе уже есть таблицы, рабочие экраны и доступ по ролям. Для клиентских сценариев включены каталог, оформление и личный кабинет — отдельно собирать их не нужно."
        actions={
          <>
            <PrimaryLink href="#client-apps">Выбрать задачу</PrimaryLink>
            <SecondaryLink href="/demo">Открыть живое демо</SecondaryLink>
          </>
        }
      />

      <Section title="Кабинет клиента уже включён" width="narrow">
        <p className="text-sm leading-relaxed text-ink-soft">Клиент сначала видит каталог. Открывает товар, услугу или объект и нажимает кнопку оформления. Подтверждает почту, вводит необходимые данные — затем видит своё обращение, статус и историю в кабинете вашего бизнеса. При повторном оформлении действующий вход сохраняется; оплату согласует сотрудник.</p>
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">«Клиентский портал» больше не нужно выбирать как отдельный стартовый набор. Заказы и каталог товаров тоже объединены в «Продажу товаров».</p>
        <Link href="/solutions/client-portal" className="mt-4 inline-block text-sm font-medium text-sage-700 underline underline-offset-4">Как работает кабинет клиента</Link>
      </Section>

      {STARTER_GROUPS.map(group => <Section key={group.id} id={group.id} title={group.name} lead={group.description}>
        <div className="grid gap-5 lg:grid-cols-3">
          {STARTER_TEMPLATES.filter(template => group.templateIds.some(id => id === template.id)).map((template, index) => {
            const solution = SOLUTIONS.find((item) => item.templateId === template.id)
            const rows = template.tables.reduce((total, table) => total + table.rows.length, 0)
            const roles = templateRoleNames(template)

            return (
              <Reveal key={template.id} delay={(index % 3) * 90}>
                <Link
                  href={`/templates/${template.id}`}
                  className="group flex h-full flex-col rounded-2xl border border-sand-200 bg-white p-7 shadow-soft transition-all duration-300 hover:-translate-y-1.5 hover:border-sage-300 hover:shadow-lift"
                >
                  <span aria-hidden className="text-3xl">
                    {template.emoji}
                  </span>
                  <h3 className="mt-4 font-display text-base font-bold">{template.name}</h3>
                  <p className="mt-2 text-sm text-ink-muted">{template.tagline}</p>
                  <p className="mt-3 text-xs leading-relaxed text-ink-muted">{template.audience}</p>

                  {/*
                    То, по чему шаблоны и выбирают: состав, роли и главное
                    ограничение. Без этого карточки отличаются
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
      </Section>)}

      <Section title="Возможности одного приложения" tone="white" width="narrow">
        <p className="text-sm leading-relaxed text-ink-soft">Кабинет клиента и история входят в выбранный сценарий. Запись на услуги, продажи, ремонт, доставка, выезды и недвижимость могут работать в одном приложении. CRM подключается как внутренний инструмент команды. Ссылка сохраняется, а рабочие роли и правила каждого раздела остаются отдельными.</p>
        <p className="mt-3 text-sm leading-relaxed text-ink-muted">Склад и производство пока работают отдельными наборами. Доставка принимает собственные заявки; автоматического переноса заказов курьеру и объединения всех обращений с CRM пока нет.</p>
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">В настройках клиентского приложения можно включить переписку и документы по обращениям. Клиент задаёт вопрос из своей карточки, а ответственный сотрудник отвечает там же.</p>
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
