import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AppShell } from '@/components/runtime/app-shell'
import { DemoStage } from '@/components/marketing/demo-stage'
import { SiteFooter } from '@/components/marketing/site-footer'
import { SiteHeader } from '@/components/marketing/site-header'
import { ANONYMOUS, ANONYMOUS_NAME, asRole, companyOf, roleName } from '@/lib/app-roles'
import { EmptyState } from '@/components/runtime/ui'
import { ANONYMOUS_ID, resolveDemoView } from '@/lib/demo-view'
import { DEMO_CLIENT_EMAIL, loadDemoApp, loadDemoRuntime } from '@/lib/demo-runtime'
import { currentMember } from '@/lib/session'
import { pageMetadata } from '@/lib/seo'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = pageMetadata({
  path: '/demo',
  title: 'Демо: одно приложение глазами разных роле́й',
  description:
    'Посмотрите готовое приложение так, как его видит клиент, сотрудник и случайный человек по ссылке. С компьютера и с телефона. Без регистрации.',
})

/**
 * Демонстрация на сайте.
 *
 * Главное здесь не «посмотрите, как красиво», а «посмотрите, что видит
 * каждый». Права — самое трудное для объяснения словами и самое простое
 * для показа: одно и то же приложение, несколько ролей, разное содержимое.
 *
 * Роль меняется **на сервере**, потому что от неё зависит, что вообще
 * загрузится: закрытые экраны не прячутся в разметке, а не приходят в браузер.
 * Размер экрана — наоборот, чистый показ, и меняется в браузере.
 */

/** Клиент из примеров: его глазами показываем кабинет. */
const DEMO_CLIENT = DEMO_CLIENT_EMAIL

type RoleCopy = {
  lead: string
  /** Какие данные человек видит. */
  sees: string[]
  /** Что он может сделать. Отдельно от данных: это разные вопросы. */
  can: string[]
  /** Какие данные от него закрыты. Запрет действия сюда не относится. */
  hidden: string[]
}

/*
 * Пояснения к ролям демо. Ключи — идентификаторы ролей этого приложения;
 * для роли, которой здесь нет, подпись собирается из её названия: набор ролей
 * задаёт владелец, и перечислять их в коде страницы нельзя.
 *
 * Язык — человеческий. Это витрина, а не документация: слова вроде «правило
 * доступа к строкам» здесь никому ничего не объясняют.
 */
/*
 * Тексты описывают **эту** настройку шаблона, а не то, как могло бы быть.
 * Обещать роли раздел, которого у неё нет, — самый быстрый способ потерять
 * доверие к демонстрации: человек нажмёт и не найдёт.
 */
const ABOUT: Record<string, RoleCopy> = {
  [ANONYMOUS_ID]: {
    lead: 'Человек открыл приложение по ссылке и ещё не вошёл. Витрину и колонки на ней владелец выбирает сам — остальное закрыто.',
    sees: ['витрину услуг с ценами и сроками', 'форму заявки'],
    can: ['посмотреть цены', 'оставить заявку, не заводя аккаунт'],
    hidden: ['кабинет клиента', 'чужие заказы', 'себестоимость и внутренние данные'],
  },
  client: {
    lead: `Клиент вошёл по коду из письма — здесь его роль показана на примере ${DEMO_CLIENT}.`,
    sees: ['ту же витрину, что и все', 'свои заказы', 'статус, срок, сумму и оплату'],
    can: ['следить за ходом работы по каждому заказу'],
    hidden: ['заказы других организаций', 'заметки для своих', 'настройки приложения'],
  },
  staff: {
    lead: 'Ваш сотрудник. Работает с заявками и заказами каждый день.',
    sees: ['все заказы всех клиентов', 'себестоимость услуг', 'сводку по работе', 'заметки для своих'],
    can: ['менять статус, срок и сумму заказа'],
    hidden: ['настройки приложения'],
  },
  manager: {
    // В этом шаблоне у ведущего ровно те же экраны, что у сотрудника.
    // Писать про «расширенный доступ» значило бы обещать несуществующее.
    lead: 'Роль для того, кому вы решите открыть больше. В этом шаблоне ей пока даны те же разделы, что и сотруднику, — разницу задаёте вы в конструкторе.',
    sees: ['все заказы всех клиентов', 'себестоимость услуг', 'сводку по работе', 'заметки для своих'],
    can: ['менять статус, срок и сумму заказа'],
    hidden: ['настройки приложения'],
  },
}

/** Роль, которую владелец завёл и ещё не настроил: это состояние, а не сбой. */
const UNSET_ROLE_LEAD =
  'Пример роли, которой ещё не открыт ни один раздел. Так выглядит любая новая роль, пока владелец не решит, что ей показывать.'

export default async function DemoPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string; rol?: string; device?: string }>
}) {
  const params = await searchParams
  const member = await currentMember()

  const definition = loadDemoApp()
  if (!definition) notFound()

  const { role, device, deviceChosen, viewerEmail } = resolveDemoView(definition, params, DEMO_CLIENT)

  /*
   * «Без входа» — не роль, а отдельное состояние, и в списке ролей его нет.
   * Показываем его первым: именно эту разницу страница и объясняет.
   *
   * Дальше роли делятся на две группы, и делает это сам набор экранов,
   * а не список в коде. Переключатель, где «Ведущий» показывает ровно то же,
   * что «Сотрудник», а «Диспетчер» — пустой экран, выглядит как поломка
   * демонстрации, хотя это настройка приложения. Поэтому главные роли
   * в переключателе, а повторяющие и пустые — строкой под ним, с объяснением.
   */
  const screensOf = (roleId: string) =>
    definition.screens
      .filter((screen) => screen.access.roles.includes(roleId))
      .map((screen) => screen.name)
      .join(' · ')

  const primary: { id: string; name: string }[] = [{ id: ANONYMOUS_ID, name: ANONYMOUS_NAME }]
  const secondary: { id: string; name: string; why: string }[] = []
  const seen = new Map<string, string>()

  for (const item of definition.roles) {
    const key = screensOf(item.id)
    if (key === '') {
      secondary.push({ id: item.id, name: item.name, why: 'роли ещё не открыт ни один раздел' })
      continue
    }
    const same = seen.get(key)
    if (same) {
      secondary.push({ id: item.id, name: item.name, why: `те же разделы, что у роли «${same}»` })
      continue
    }
    seen.set(key, item.name)
    primary.push({ id: item.id, name: item.name })
  }

  // Выбранная роль всегда есть в переключателе, даже если она из второй группы.
  const roles = primary.some((item) => item.id === role)
    ? primary
    : [...primary, { id: role, name: roleName(definition, role) }]
  // Организацию берём из списка доступа: по ней работает правило «видит
  // заказы своей фирмы», и без неё кабинет показал бы на заказ меньше.
  const visitor =
    role === ANONYMOUS_ID ? ANONYMOUS : asRole(role, viewerEmail, companyOf(definition, viewerEmail))

  // Размер экрана сюда не попадает и попасть не может: строки отбираются
  // по роли и почте, а рамка на странице к этому отношения не имеет.
  const runtime = loadDemoRuntime(visitor)
  if (!runtime) notFound()

  const empty = runtime.app.screens.length === 0
  const copy = ABOUT[role]
  const name = role === ANONYMOUS_ID ? ANONYMOUS_NAME : roleName(definition, role)

  /*
   * Начальный экран выбирает само приложение: вошедший попадает на сводку,
   * а гость — на форму, потому что сводка ему не открыта. Подменять это
   * здесь значило бы показывать не то, что человек увидит на самом деле.
   */

  return (
    <div className="min-h-dvh bg-sand-50 text-ink">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-xl focus:bg-ink focus:px-4 focus:py-2.5 focus:text-sm focus:font-medium focus:text-sand-50"
      >
        Перейти к содержимому
      </a>
      <SiteHeader signedIn={Boolean(member)} />

      {/*
        * Вступление короткое намеренно. Раньше на мониторе 1440×900 весь первый
        * экран занимали заголовок, абзац, переключатели и описание роли, а само
        * приложение начиналось у нижнего края — то есть главного на странице
        * было не видно, пока не прокрутишь.
        */}
      <main id="main" className="mx-auto w-full max-w-[94rem] px-5 py-6 sm:px-8 sm:py-8">
        <h1 className="max-w-3xl font-display text-[1.75rem] font-extrabold leading-[1.1] sm:text-[2.25rem]">
          Одно приложение — <span className="accent-word text-sage-700">разные возможности</span>{' '}
          для каждой роли
        </h1>
        <p className="mt-2 max-w-2xl text-base leading-relaxed text-ink-soft">
          Перед вами настоящее приложение из шаблона «Клиентский портал». Переключайте роли,
          открывайте заказы и сравнивайте интерфейс на компьютере и телефоне.
        </p>

        <div className="mt-4">
          <DemoStage
            roles={roles.map((item) => ({ id: item.id, name: item.name }))}
            activeRole={role}
            initialDevice={device}
            deviceChosen={deviceChosen}
            description={
              /*
               * Карточка роли в две строки, подробности — по желанию. Развёрнутые
               * списки «доступно / может / скрыто» занимали четверть первого
               * экрана и отодвигали приложение вниз, а читают их единицы.
               */
              <div className="@container">
                <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm leading-snug text-ink-soft">
                  <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">
                    Вы смотрите как
                  </span>
                  <span className="font-display text-base font-bold tracking-tight text-ink">
                    {name}
                  </span>
                  <span className="min-w-0">{copy?.lead ?? UNSET_ROLE_LEAD}</span>
                </p>

                {copy ? (
                  <details className="group mt-2">
                    <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded text-xs font-medium text-ink-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
                      Что доступно этой роли
                      <span aria-hidden className="transition-transform group-open:rotate-90">
                        ›
                      </span>
                    </summary>
                    <div className="mt-3 grid gap-4 @min-[34rem]:grid-cols-3">
                      <RoleList title="Видит" tone="sage" items={copy.sees} />
                      <RoleList title="Может" tone="sage" items={copy.can} />
                      <RoleList title="Скрыто" tone="muted" items={copy.hidden} />
                    </div>
                  </details>
                ) : (
                  <p className="mt-2 text-xs leading-snug text-ink-muted">
                    Посмотрите{' '}
                    <Link href="/demo?role=staff" className="font-medium text-sage-700 underline">
                      роль сотрудника
                    </Link>{' '}
                    — у неё разделы настроены.
                  </p>
                )}
              </div>
            }
          >
            {empty ? (
              /*
               * Роль без единого экрана — обычное состояние, а не поломка:
               * владелец завёл её и ещё не настроил. Показываем это так же,
               * как приложение показало бы любую другую пустоту.
               */
              <div className="flex h-full items-center justify-center bg-sand-50 p-8">
                <EmptyState
                  icon="grid"
                  title="Нет доступных разделов"
                  hint="Владелец приложения пока не открыл этой роли ни одного экрана. Доступ появится сразу после изменения настроек."
                />
              </div>
            ) : (
              <AppShell key={role} runtime={runtime} viewer={null} demo />
            )}
          </DemoStage>
        </div>

        {secondary.length > 0 ? (
          <p className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs text-ink-muted">
            <span>Ещё роли в этом приложении:</span>
            {secondary.map((item, index) => (
              <span key={item.id}>
                <Link
                  href={`/demo?role=${item.id}`}
                  className="font-medium text-ink-soft underline underline-offset-4 transition-colors hover:text-ink"
                >
                  {item.name}
                </Link>{' '}
                — {item.why}
                {index < secondary.length - 1 ? ';' : '.'}
              </span>
            ))}
          </p>
        ) : null}

        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div className="max-w-2xl space-y-2 text-sm leading-relaxed text-ink-muted">
            <p>
              Здесь приложение работает на вымышленных примерах из шаблона «Клиентский портал».
              Можно переключить роль и увидеть разницу в доступе. Витрина «Услуги и цены» открыта всем по ссылке —
              владелец сам решил, какой раздел показывать без входа и какие колонки в нём
              публиковать. Себестоимость лежит в той же таблице и наружу не уходит.
            </p>
            {/* Техническая подробность — для тех, кто её ищет, а не для всех. */}
            <details className="group">
              <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded font-medium transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
                Как проверить, что данные правда закрыты
                <span aria-hidden className="transition-transform group-open:rotate-90">
                  ›
                </span>
              </summary>
              <p className="mt-2">
                Закрытые разделы не прячутся оформлением — они не приходят в браузер. Откройте
                исходный код страницы от имени «Без входа»: чужих заказов там нет.
              </p>
            </details>
          </div>

          <div className="flex flex-wrap gap-3">
            {/*
              Показан один шаблон — «Клиентский портал», — и кнопка ведёт
              именно к нему, а не в общий список, где его ещё надо найти.
            */}
            <Link
              href="/templates/portal"
              className="rounded-xl bg-ink px-6 py-3.5 text-sm font-medium text-sand-50 shadow-soft transition-all hover:-translate-y-0.5 hover:bg-ink/90"
            >
              Шаблон «Клиентский портал»
            </Link>
            <Link
              href="/solutions/client-portal"
              className="rounded-xl border border-sand-300 bg-white px-6 py-3.5 text-sm font-medium transition-all hover:-translate-y-0.5 hover:border-ink/25"
            >
              Как это устроено
            </Link>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}

/** Два коротких списка вместо абзаца: разницу между ролями так видно сразу. */
function RoleList({
  title,
  tone,
  items,
}: {
  title: string
  tone: 'sage' | 'muted'
  items: readonly string[]
}) {
  return (
    <div>
      <p
        className={`text-xs font-semibold uppercase tracking-wide ${
          tone === 'sage' ? 'text-sage-700' : 'text-ink-muted'
        }`}
      >
        {title}
      </p>
      <ul className="mt-1.5 space-y-1">
        {items.map((item) => (
          <li key={item} className="flex gap-2 text-sm leading-snug text-ink-soft">
            <span aria-hidden className={tone === 'sage' ? 'text-sage-600' : 'text-sand-400'}>
              {tone === 'sage' ? '✓' : '—'}
            </span>
            <span className="min-w-0">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
