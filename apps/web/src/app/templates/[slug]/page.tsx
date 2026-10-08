import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { DEFAULT_APP_ROLES } from '@tableapp/schema'
import {
  CtaSection,
  MarketingShell,
  PageHero,
  PrimaryLink,
  SecondaryLink,
  Section,
} from '@/components/marketing/blocks'
import { ScreenFrame, ScreenTable } from '@/components/marketing/screens'
import { TemplateDemo } from '@/components/marketing/template-demo'
import { Reveal } from '@/components/marketing/reveal'
import { pageMetadata } from '@/lib/seo'
import { currentMember } from '@/lib/session'
import { templateStart } from '@/lib/site'
import { SOLUTIONS } from '@/lib/solutions'
import { findTemplate, TEMPLATES } from '@/lib/templates/catalog'
import type { TemplateDef } from '@/lib/templates/types'
import { templateAccessNote } from '@/lib/templates/presentation'

export const dynamic = 'force-dynamic'

/**
 * Страница шаблона.
 *
 * Отвечает на вопросы в том порядке, в котором их задают: как это выглядит,
 * что появится в пространстве, кто и что сможет делать, что уже настроено,
 * что придётся подготовить самому и чего в этом деле пока нет.
 *
 * Всё выведено из самого описания шаблона — того, по которому он и
 * разворачивается. Второго списка с названиями и обещаниями не существует:
 * разойдись он с кодом, страница начнёт обещать таблицы, которых нет.
 */

export function generateStaticParams() {
  return TEMPLATES.map((template) => ({ slug: template.id }))
}

function plural(count: number, forms: [string, string, string]): string {
  const tens = count % 100
  const ones = count % 10
  if (tens >= 11 && tens <= 14) return forms[2]
  if (ones === 1) return forms[0]
  if (ones >= 2 && ones <= 4) return forms[1]
  return forms[2]
}

/** Роли готового приложения, включая специальные сценарии. */
function rolesOf(template: TemplateDef): string[] {
  if (template.id === 'zayavki') return ['Мастер', 'Диспетчер']
  if (template.inventory) return ['Кладовщик', 'Владелец']
  if (template.production) return [template.production.copy.director, template.production.copy.operator]
  return DEFAULT_APP_ROLES.map((role) => role.name)
}

/**
 * Соседние шаблоны — по делу.
 *
 * Сначала те, кого шаблон сам назвал родственными, потом — с общей отраслью
 * решения. Если набралось меньше трёх, показываем меньше: три случайных
 * соседа на каждой странице подряд ничего не советуют.
 */
function relatedTemplates(template: TemplateDef): TemplateDef[] {
  const picked: TemplateDef[] = []
  const add = (item?: TemplateDef) => {
    if (item && item.id !== template.id && !picked.some((x) => x.id === item.id)) picked.push(item)
  }

  for (const id of template.kin ?? []) add(findTemplate(id))

  if (picked.length < 3) {
    const solution = SOLUTIONS.find((item) => item.templateId === template.id)
    const industries = new Set(solution?.industries ?? [])
    if (industries.size > 0) {
      for (const item of TEMPLATES) {
        const own = SOLUTIONS.find((candidate) => candidate.templateId === item.id)
        if ((own?.industries ?? []).some((name) => industries.has(name))) add(item)
      }
    }
  }

  return picked.slice(0, 3)
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const template = findTemplate(slug)
  if (!template) return {}

  return pageMetadata({
    path: `/templates/${template.id}`,
    title: `Шаблон «${template.name}»`,
    description: `${template.tagline}. ${template.audience}`,
  })
}

export default async function TemplatePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const template = findTemplate(slug)
  if (!template) notFound()

  const member = await currentMember()
  /*
   * Выбор человека переживает вход: он вернётся на витрину с этим же
   * шаблоном, и искать его заново не придётся.
   */
  const start = templateStart(template.id, Boolean(member))

  const roles = rolesOf(template)
  const solution = SOLUTIONS.find((item) => item.templateId === template.id)
  const appTable = template.tables.find((table) => table.key === template.appTable) ?? template.tables[0]!
  /*
   * Границы берём у шаблона, а если их там нет — у решения, к которому
   * он относится. Страница без этого раздела обещала бы больше, чем есть.
   */
  const limits = template.limits ?? solution?.limits ?? []
  const others = relatedTemplates(template)
  const rows = template.tables.reduce((total, table) => total + table.rows.length, 0)
  const relations = template.tables.flatMap((table) =>
    table.fields.filter((field) => field.type === 'relation'),
  ).length
  const computed = template.tables.flatMap(table => table.fields).filter(field => ['formula', 'lookup', 'rollup', 'count'].includes(field.type)).length
  const views = template.tables
    .flatMap((table) => table.views.map((view) => view.name.toLowerCase()))
    .slice(0, 4)
    .join(', ')

  return (
    <MarketingShell signedIn={Boolean(member)}>
      <PageHero
        trail={[
          { href: '/', label: 'TableApp' },
          { href: '/templates', label: 'Шаблоны' },
          { label: template.name },
        ]}
        emoji={template.emoji}
        title={
          <>
            {/*
              Без «inline-block»: он запрещал переносить название внутри
              и на узком экране заголовок вылезал за край блока.
            */}
            Шаблон «{template.name}»
          </>
        }
        lead={template.tagline}
        note={template.audience}
        actions={
          <>
            <PrimaryLink href={start}>
              {member ? 'Взять этот шаблон' : 'Начать с этого шаблона'}
            </PrimaryLink>
            <SecondaryLink href="#primer">Посмотреть пример</SecondaryLink>
            {/* Живое демо собрано из этого шаблона — предлагаем его только здесь. */}
            {template.id === 'portal' ? (
              <SecondaryLink href="/demo">Открыть живое демо</SecondaryLink>
            ) : null}
          </>
        }
      />

      {/* --- Как выглядит --------------------------------------------- */}
      <Section
        id="primer"
        title={template.inventory ? 'Что видят кладовщик и владелец' : 'Как устроена работа с шаблоном'}
        lead="Статичные примеры таблицы и приложения на учебных записях шаблона. После установки вы сможете заменить их своими."
      >
        <TemplateDemo id={template.id} />

        <div className="mt-8 grid gap-4 text-sm leading-relaxed text-ink-soft sm:grid-cols-2">
          <p>
            {template.id === 'zayavki' ? 'Диспетчер создаёт заявки и назначает мастеров по почте. Мастер видит свой список, клиента, телефон и адрес; меняет только статус, фото и комментарий. У диспетчера есть сводка, финансовые поля и список клиентов.' : template.inventory ? 'Шаблон для штучных товаров учитывает начальный запас и поступления. Кладовщик записывает приёмки с телефона. Расход, списание и инвентаризация пока не подключены.' : template.portal ? 'Клиентский кабинет показывает заказы по почте клиента и публичные услуги. Таблица «Обращения» пока не подключена к экранам кабинета.' : template.production ? 'Начальник смены вводит выпуск, директор проверяет материалы, движения и сводку. Расход материалов считается по нормам годного выпуска; брак учитывается отдельно.' : <>Приложение собирается по таблице «{appTable.name}»: список, карточка записи, формы
            добавления и правки, сводка с числами. Дальше всё правится мышкой — что показать,
            что спросить, что скрыть.</>}
          </p>
          <p>
            Открывается в браузере на компьютере и на телефоне, ставится на домашний экран.
            Сотрудник входит по коду из письма, а вы решаете, что ему видно.
            {solution ? (
              <>
                {' '}Как устроена такая работа целиком — на странице решения{' '}
                <Link
                  href={`/solutions/${solution.slug}`}
                  className="font-medium text-sage-700 underline underline-offset-4"
                >
                  «{solution.name}»
                </Link>
                .
              </>
            ) : null}
          </p>
        </div>
      </Section>

      {/* --- Состав --------------------------------------------------- */}
      <Section
        title="Что создаётся в вашем пространстве"
        lead={`${template.tables.length} ${plural(template.tables.length, ['таблица', 'таблицы', 'таблиц'])} и ${rows} учебных записей. В каждой таблице можно удалить неизменённые примеры; ваши записи и отредактированные примеры сохранятся.`}
        tone="white"
      >
        <ScreenFrame device="desktop" title="Состав шаблона">
          <ScreenTable
            caption={`Таблицы шаблона «${template.name}»`}
            columns={['Таблица', 'Колонок', 'Представления']}
            rows={template.tables.map((table) => [
              table.name,
              String(table.fields.length),
              table.views.map((view) => view.name).join(', '),
            ])}
          />
        </ScreenFrame>
      </Section>

      {/* --- Что настроено и что готовить ------------------------------ */}
      <Section title="Что уже настроено, а что готовите вы" width="narrow">
        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <h3 className="font-display text-base font-bold">Создаётся при установке</h3>
            <ul className="mt-3 space-y-2 text-sm leading-relaxed text-ink-soft">
              {[
                `Таблицы с колонками и подсказками — ${template.tables.length}`,
                relations > 0
                  ? `Связи между таблицами — ${relations}`
                  : null,
                computed > 0 ? `Вычисляемые колонки — ${computed}` : null,
                `Сохранённые виды таблиц: ${views}`,
                `Черновик приложения «${template.appName}» с экранами и ролями`,
                'Учебные записи для знакомства с шаблоном',
              ].filter(Boolean).map((line) => (
                <li key={line} className="flex gap-3">
                  <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-sage-400" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="font-display text-base font-bold">Что подготовить вам</h3>
            <ul className="mt-3 space-y-2 text-sm leading-relaxed text-ink-soft">
              {[
                template.inventory ? 'При первом импорте сопоставьте количество с «Начальным остатком». Следующие поступления записывайте приёмками' : 'Свои данные — файлом из Excel или CSV. Проверьте типы и сопоставление колонок перед импортом',
                template.id === 'zayavki' ? 'Почта мастеров и диспетчеров в списке доступа, роль для каждого' : 'Адреса сотрудников и клиентов, которым нужен доступ, и роль для каждого',
                'Свои названия колонок и статусов, если наши не подходят',
                template.id === 'zayavki' ? 'Настоящая «Почта мастера» в каждой назначенной заявке; имя мастера не определяет доступ' : 'Решение, какие строки видит каждая роль: все или только свои',
                'Проверка доступа, затем публикация приложения и отправка ссылки',
              ].map((line) => (
                <li key={line} className="flex gap-3">
                  <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-ink-muted/50" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-8">
          <h3 className="font-display text-base font-bold">Роли приложения</h3>
          <ul className="mt-3 flex flex-wrap gap-2">
            {roles.map((role) => (
              <li
                key={role}
                className="rounded-full border border-sand-300 bg-white px-3 py-1.5 text-sm text-ink-soft"
              >
                {role}
              </li>
            ))}
          </ul>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-muted">
            {templateAccessNote(template)} Названия ролей можно изменить в конструкторе.
          </p>
        </div>
      </Section>

      {/* --- Границы --------------------------------------------------- */}
      {limits.length > 0 ? (
        <Section title="Чего этот шаблон не делает" tone="sand" width="narrow">
          <ul className="max-w-2xl space-y-2.5 text-sm leading-relaxed text-ink-soft">
            {limits.map((limit) => (
              <li key={limit} className="flex gap-3">
                <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-ink-muted/50" />
                <span>{limit}</span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {/* --- Соседние -------------------------------------------------- */}
      <Section title="Похожие шаблоны" tone={limits.length > 0 ? 'plain' : 'sand'}>
        <div className="grid gap-4 sm:grid-cols-3">
          {others.map((item) => (
            <Reveal key={item.id}>
              <Link
                href={`/templates/${item.id}`}
                className="group flex h-full flex-col rounded-2xl border border-sand-200 bg-white p-5 transition-all hover:-translate-y-1 hover:border-sage-300 hover:shadow-lift"
              >
                <span aria-hidden className="text-2xl">
                  {item.emoji}
                </span>
                <p className="mt-3 font-display text-sm font-bold">{item.name}</p>
                <p className="mt-1.5 flex-1 text-xs leading-relaxed text-ink-muted">{item.tagline}</p>
              </Link>
            </Reveal>
          ))}
        </div>
      </Section>

      <CtaSection
        title="Поставьте шаблон и загрузите"
        accent="свою таблицу"
        text="Таблицы появятся в вашем пространстве сразу после установки, примеры внутри показывают, как всё считается. Бесплатный тариф без ограничения по времени, карта не нужна."
        href={start}
        label={member ? 'Взять этот шаблон' : 'Начать с этого шаблона'}
        secondary={{ href: '/pricing', label: 'Сколько это стоит' }}
      />
    </MarketingShell>
  )
}
