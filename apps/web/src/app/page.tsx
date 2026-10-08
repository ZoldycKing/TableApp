import Link from 'next/link'
import { Fragment } from 'react'
import { HeroFlight } from '@/components/marketing/hero-flight'
import {
  IconBuilder,
  IconCrackedFormula,
  IconFieldTypes,
  IconFormulaFlow,
  IconFunnelOrder,
  IconImport,
  IconPhoneOverflow,
  IconPublish,
  IconRelations,
  IconRowAccess,
  IconScatteredCopies,
  IconScreenshots,
  IconViews,
  Underline,
} from '@/components/marketing/icons'
import { Marquee, ScrollProgress } from '@/components/marketing/motion'
import { StoryChapters } from '@/components/marketing/story-chapters'
import { Reveal } from '@/components/marketing/reveal'
import { Templates } from '@/components/marketing/templates'
import { SiteFooter } from '@/components/marketing/site-footer'
import { SiteHeader } from '@/components/marketing/site-header'
import { JsonLd } from '@/components/marketing/blocks'
import { pageMetadata } from '@/lib/seo'
import { currentMember } from '@/lib/session'
import { SITE_URL } from '@/lib/site-url'
import { PLANS } from '@tableapp/schema'

export const dynamic = 'force-dynamic'

export const metadata = pageMetadata({
  path: '/',
  title: 'TableApp — приложения из таблиц для сотрудников и клиентов',
  description:
    'Загрузите таблицу — получите рабочее приложение: экраны, роли, права до строки и доступ с телефона. Российская платформа, данные хранятся в РФ.',
  exact: true,
})

/**
 * Разметка для поиска.
 *
 * Только то, что правда: кто мы и что это за продукт. Ни отзывов, ни оценок —
 * выдуманный рейтинг в разметке обманывает и поисковик, и человека, а находить
 * такой обман умеют оба.
 */
const SCHEMA = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${SITE_URL}/#organization`,
      name: 'TableApp',
      url: `${SITE_URL}/`,
      email: 'hello@tableapp.ru',
      description:
        'Российская платформа: таблицы превращаются в рабочие приложения для сотрудников и клиентов.',
    },
    {
      '@type': 'SoftwareApplication',
      name: 'TableApp',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      url: `${SITE_URL}/`,
      publisher: { '@id': `${SITE_URL}/#organization` },
      inLanguage: 'ru-RU',
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'RUB',
        description: 'Бесплатный тариф: 2 000 строк и одно опубликованное приложение.',
      },
    },
  ],
}

const HEADLINE = ['Ваши', 'таблицы', 'становятся']

const MARQUEE = [
  'заявки сервисной службы',
  'каталог с фотографиями',
  'личный кабинет клиента',
  'учёт оборудования',
  'приёмка на складе',
  'график выездов',
  'реестр договоров',
  'обучение сотрудников',
]

const PAINS = [
  {
    icon: IconScatteredCopies,
    title: 'Таблица живёт своей жизнью',
    text: 'Файл разошёлся по почте в пяти версиях, и никто не знает, какая настоящая.',
  },
  {
    icon: IconCrackedFormula,
    title: 'Сотрудники ломают формулы',
    text: 'Один неверный клик в ячейке — и отчёт считает не то. Виноватого не найти.',
  },
  {
    icon: IconPhoneOverflow,
    title: 'С телефона работать невозможно',
    text: 'Мастер в поле, курьер в дороге, менеджер на встрече — и у всех Excel на маленьком экране.',
  },
  {
    icon: IconScreenshots,
    title: 'Клиенту нечего показать',
    text: 'Чтобы ответить «на каком этапе мой заказ», приходится слать скриншоты и выгрузки.',
  },
]

const STEPS = [
  {
    icon: IconImport,
    number: '01',
    title: 'Загрузите таблицу',
    text: 'CSV из 1С или выгрузка из Excel. Кодировка, разделитель и типы колонок определяются сами — даже windows-1251 с точкой с запятой.',
    short: 'CSV из 1С или выгрузка из Excel: кодировка и типы колонок определяются сами.',
  },
  {
    icon: IconFunnelOrder,
    number: '02',
    title: 'Наведите порядок',
    text: 'Фильтры, сортировки, группировки, формулы и связи между таблицами. Канбан, календарь и галерея — те же данные, другой взгляд.',
    short: 'Фильтры, формулы и связи. Доска, календарь и галерея — те же данные под другим углом.',
  },
  {
    icon: IconPublish,
    number: '03',
    title: 'Опубликуйте приложение',
    text: 'Экраны собираются по таблице автоматически. Даёте ссылку — сотрудник открывает её на телефоне и работает.',
    short: 'Экраны собираются по таблице. Даёте ссылку — сотрудник работает с телефона.',
  },
]

const FEATURES = [
  { icon: IconFieldTypes, title: 'Таблицы с характером', text: 'Два десятка типов полей: числа с рублями, даты, списки, файлы, связи между таблицами.' },
  { icon: IconFormulaFlow, title: 'Формулы без Excel', text: 'Двадцать пять функций на русских именах полей. Ошибка видна сразу, а не после сохранения.' },
  { icon: IconRelations, title: 'Связи, подстановки и итоги', text: 'Заявка тянет позиции, сумма считается сама. Поправили цену — пересчиталось везде.' },
  { icon: IconViews, title: 'Четыре представления', text: 'Таблица, доска, календарь и галерея. Одни данные — разные взгляды на них.' },
  { icon: IconBuilder, title: 'Конструктор приложений', text: 'Экраны собираются по таблице сами, дальше настраиваются мышкой. Справа живой предпросмотр.' },
  { icon: IconRowAccess, title: 'Права до строки', text: 'Настройте отбор заявок по почте сотрудника. Проверка на сервере: недоступные записи не приходят в браузер.' },
]


/** Числа для короткого блока тарифов — из той же настройки, что и учёт. */
const money = new Intl.NumberFormat('ru-RU')
const freeRows = money.format(PLANS.free.limits.rows)
const startPrice = money.format(PLANS.start.monthlyPrice)

export default async function LandingPage() {
  const member = await currentMember()
  const entry = member ? '/import' : '/login?next=%2Fimport'

  return (
    <div className="min-h-dvh bg-sand-50 text-ink">
      <JsonLd data={SCHEMA} />
      <ScrollProgress />
      {/* Тот же переход к содержимому, что и на остальных страницах. */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-xl focus:bg-ink focus:px-4 focus:py-2.5 focus:text-sm focus:font-medium focus:text-sand-50"
      >
        Перейти к содержимому
      </a>
      <SiteHeader signedIn={Boolean(member)} />

      <main id="main">
        <section className="relative overflow-hidden">
          <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
            <div className="dot-grid absolute inset-0 opacity-[0.5]" />
            <div className="animate-drift absolute -left-40 -top-40 h-[32rem] w-[32rem] rounded-full bg-sage-100 opacity-70 blur-3xl" />
            <div className="animate-drift absolute -right-32 top-24 h-[28rem] w-[28rem] rounded-full bg-clay-400 opacity-[0.13] blur-3xl" />
            <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-sand-50" />
          </div>

          <div className="mx-auto grid w-full max-w-6xl items-start gap-12 px-5 pb-24 pt-14 sm:px-8 lg:grid-cols-[0.82fr_1.18fr] lg:pb-28 lg:pt-20">
            {/* Первый экран показывается сразу: он не ждёт наблюдателя прокрутки. */}
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-sand-300 bg-white/70 px-3 py-1.5 text-xs font-medium text-ink-soft backdrop-blur">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sage-400 opacity-75" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-sage-500" />
                </span>
                Российская платформа · данные хранятся в РФ
              </span>

              {/* Слова заголовка выезжают по очереди — строка оживает. */}
              <h1 className="word-stagger mt-6 font-display text-[2.5rem] font-extrabold leading-[1.03] sm:text-[3.5rem]">
                {/*
                  Пробел стоит между span, а не внутри: внутри inline-block он
                  схлопнулся бы, а заменять его отступом нельзя — тогда пробела
                  не будет и в тексте страницы, и заголовок слипнется
                  для скринридера и поисковика.
                */}
                {HEADLINE.map((word, index) => (
                  <Fragment key={word}>
                    <span style={{ animationDelay: `${index * 90}ms` }}>{word}</span>{' '}
                  </Fragment>
                ))}
                <span
                  className="relative inline-block text-sage-700"
                  style={{ animationDelay: `${HEADLINE.length * 90}ms` }}
                >
                  <span className="accent-word">приложением</span>
                  <Underline className="text-sage-400/70" />
                </span>
              </h1>

              <p className="mt-8 max-w-xl text-lg leading-relaxed text-ink-soft">
                Загрузите таблицу — получите рабочее приложение для сотрудников и клиентов.
                Без программистов, без магазинов приложений, без потери контроля над данными.
              </p>

              <div className="mt-9 flex flex-wrap items-center gap-3">
                {/*
                  Главное действие названо действием, а не обязательством:
                  «загрузить таблицу» человек понимает и может сделать сегодня,
                  «попробовать бесплатно» звучит как подписка.
                */}
                <Link
                  href={entry}
                  className="rounded-xl bg-ink px-6 py-3.5 text-sm font-medium text-sand-50 shadow-soft transition-all hover:-translate-y-0.5 hover:bg-ink/90 hover:shadow-lift"
                >
                  {member ? 'Импортировать таблицу' : 'Загрузить свою таблицу'}
                </Link>
                <Link
                  href="/demo"
                  className="group rounded-xl border border-sand-300 bg-white/60 px-6 py-3.5 text-sm font-medium transition-all hover:-translate-y-0.5 hover:border-ink/25 hover:bg-white"
                >
                  Открыть живое демо
                  <span className="ml-1.5 inline-block transition-transform group-hover:translate-x-1">→</span>
                </Link>
              </div>

              <p className="mt-5 text-sm text-ink-muted">
                Демо открывается без регистрации. Бесплатный тариф — без ограничения по времени и без карты.
              </p>
            </div>

            <HeroFlight />
          </div>
        </section>

        <section className="border-y border-sand-200 bg-white/70">
          <div className="mx-auto w-full max-w-6xl px-5 py-7 sm:px-8">
            <Marquee items={MARQUEE} />
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-5 py-24 sm:px-8">
          <Reveal>
            <h2 className="font-display text-3xl font-extrabold leading-tight sm:text-[2.6rem]">
              Знакомо?
            </h2>
            <p className="mt-4 max-w-2xl text-ink-soft">
              Признаки того, что таблица переросла себя и пора отдавать
              людям приложение, а не файл.
            </p>
          </Reveal>

          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {PAINS.map((pain, index) => (
              <Reveal key={pain.title} delay={index * 90}>
                <div className="flex h-full gap-4 rounded-2xl border border-sand-200 bg-white p-5">
                  <span className="h-fit shrink-0 rounded-xl bg-sand-100 p-2 text-ink">
                    <pain.icon />
                  </span>
                  <div>
                    <h3 className="font-display text-base font-bold">{pain.title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{pain.text}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        <section id="kak" className="scroll-mt-20 border-y border-sand-200 bg-sand-100/60">
          <div className="mx-auto w-full max-w-6xl px-5 py-24 sm:px-8">
            <Reveal>
              <h2 className="max-w-2xl font-display text-3xl font-extrabold leading-tight sm:text-[2.6rem]">
                Три шага от файла
                <br className="hidden sm:block" /> до <span className="accent-word text-sage-700">приложения</span>
              </h2>
              <p className="mt-4 max-w-xl text-ink-soft">
                Ничего не нужно переносить вручную и ничего не нужно программировать.
              </p>
              <p className="mt-6">
                <Link
                  href="/how-it-works"
                  className="text-sm font-medium text-sage-700 underline-offset-4 hover:underline"
                >
                  Как это работает по шагам
                  <span aria-hidden className="ml-1.5 inline-block">→</span>
                </Link>
              </p>
            </Reveal>

            {/*
              Коротко: подробный путь с экранами живёт на своей странице,
              и повторять его здесь целиком значит просить прочитать дважды.
            */}
            <ol className="mt-10 grid gap-4 md:grid-cols-3">
              {STEPS.map((step, index) => (
                <Reveal key={step.number} delay={index * 110}>
                  <li className="flex h-full gap-4 rounded-2xl border border-sand-200 bg-white p-5">
                    <span className="font-display text-2xl font-extrabold text-sage-300">
                      {step.number}
                    </span>
                    <div>
                      <h3 className="font-display text-base font-bold">{step.title}</h3>
                      <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{step.short}</p>
                    </div>
                  </li>
                </Reveal>
              ))}
            </ol>
          </div>
        </section>

        <section id="telefon" className="mx-auto w-full max-w-6xl scroll-mt-20 px-5 py-24 sm:px-8">
          <Reveal>
            <h2 className="max-w-2xl font-display text-3xl font-extrabold leading-tight sm:text-[2.6rem]">
              Дальше всё происходит с <span className="accent-word text-sage-700">телефона</span>
            </h2>
            <p className="mt-4 max-w-2xl text-ink-soft">
              Ни компьютера, ни Excel, ни пересылки файлов: люди вносят данные там,
              где идёт работа, открывают приложение по ссылке и держат его
              на домашнем экране.
            </p>
          </Reveal>

          <Reveal delay={120} className="mt-12">
            <StoryChapters />
          </Reveal>
        </section>

        <section id="vozmozhnosti" className="mx-auto w-full max-w-6xl scroll-mt-20 px-5 py-20 sm:px-8">
          <Reveal>
            <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-start">
              <div>
                <h2 className="font-display text-3xl font-extrabold leading-tight sm:text-[2.6rem]">
                  Сильная база снизу, понятное приложение{' '}
                  <span className="accent-word text-sage-700">сверху</span>
                </h2>
                <p className="mt-4 text-ink-soft">
                  Настройки общие: фильтр, заданный в таблице, действует и в приложении.
                  Ниже — коротко, подробнее с примерами — на странице возможностей.
                </p>
                <p className="mt-6">
                  <Link
                    href="/features"
                    className="text-sm font-medium text-sage-700 underline-offset-4 hover:underline"
                  >
                    Посмотреть на примерах
                    <span aria-hidden className="ml-1.5 inline-block">→</span>
                  </Link>
                </p>
              </div>

              {/*
                Список, а не шесть карточек: это перечень, а не шесть
                самостоятельных объектов, между которыми человек выбирает.
              */}
              <dl className="divide-y divide-sand-200 border-y border-sand-200">
                {FEATURES.map((feature) => (
                  <div key={feature.title} className="flex gap-4 py-4">
                    <span className="mt-0.5 shrink-0 text-ink-soft">
                      <feature.icon />
                    </span>
                    <div>
                      <dt className="font-display text-base font-bold">{feature.title}</dt>
                      <dd className="mt-1 text-sm leading-relaxed text-ink-muted">{feature.text}</dd>
                    </div>
                  </div>
                ))}
              </dl>
            </div>
          </Reveal>
        </section>

        <section id="komu" className="scroll-mt-20 border-y border-sand-200 bg-white/70">
          <div className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-8">
            <Reveal>
              <h2 className="max-w-2xl font-display text-3xl font-extrabold leading-tight sm:text-[2.6rem]">
                С чего начать
              </h2>
              <p className="mt-4 max-w-2xl text-ink-soft">
                Выберите дело, которое ближе к вашему: на его странице показано, как идёт работа
                и что появится у вас. Оттуда же ставится шаблон — таблицы с колонками,
                связями и приложением поверх них.
              </p>
            </Reveal>

            <Reveal delay={120} className="mt-10">
              <Templates />
            </Reveal>
          </div>
        </section>

        <section id="tarify" className="mx-auto w-full max-w-6xl scroll-mt-20 px-5 py-20 sm:px-8">
          <Reveal>
            <div className="rounded-[2rem] border border-sand-200 bg-white px-8 py-12 shadow-soft sm:px-12">
              <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                <div>
                  <h2 className="font-display text-3xl font-extrabold leading-tight sm:text-[2.2rem]">
                    Цена зависит от объёма данных
                  </h2>
                  <p className="mt-4 max-w-xl text-ink-soft">
                    Сколько людей в команде и сколько клиентов открывают приложение — на цену
                    не влияет. Считаются строки, опубликованные приложения, таблицы и файлы.
                  </p>
                  <p className="mt-4 max-w-xl text-sm text-ink-muted">
                    Бесплатный тариф: {freeRows} строк и одно опубликованное приложение, без
                    ограничения по времени. Платные тарифы — от {startPrice} ₽ в месяц
                    за пространство; цены ориентировочные, приём оплаты ещё не подключён.
                  </p>
                </div>

                <Link
                  href="/pricing"
                  className="w-fit rounded-xl border border-sand-300 bg-white px-6 py-3.5 text-sm font-medium transition-all hover:-translate-y-0.5 hover:border-ink/25"
                >
                  Смотреть тарифы
                  <span aria-hidden className="ml-1.5 inline-block">→</span>
                </Link>
              </div>
            </div>
          </Reveal>
        </section>

        <section className="border-t border-sand-200 bg-sand-100/60">
          <div className="mx-auto w-full max-w-3xl px-5 py-24 sm:px-8">
            <Reveal>
              <h2 className="font-display text-3xl font-extrabold leading-tight sm:text-[2.6rem]">
                Частые вопросы
              </h2>
            </Reveal>

            <div className="mt-10 divide-y divide-sand-200 border-y border-sand-200">
              {[
                ['Нужен ли программист?', 'Нет. Таблица загружается файлом, экраны приложения собираются автоматически, дальше всё настраивается мышкой.'],
                ['Где хранятся данные и можно ли их забрать?', 'На серверах в России. Выгрузка таблиц в CSV или книгу Excel доступна в любой момент из интерфейса, без обращения к нам.'],
                ['Сколько людей может пользоваться приложением?', 'Сколько угодно: ни сотрудники, ни клиенты не тарифицируются. Цена зависит от объёма данных.'],
              ].map(([question, answer], index) => (
                <Reveal key={question} delay={index * 70}>
                  <details className="group py-5">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 transition-colors hover:text-sage-700">
                      <span className="font-display text-base font-bold">{question}</span>
                      <span className="shrink-0 text-ink-muted transition-transform duration-300 group-open:rotate-45">
                        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
                          <path d="M9 3.5v11M3.5 9h11" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                        </svg>
                      </span>
                    </summary>
                    <p className="mt-3 text-sm leading-relaxed text-ink-soft">{answer}</p>
                  </details>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-5 py-24 sm:px-8">
          <Reveal>
            {/*
              Блок держится общей стилистики: та же песочная база, рамка
              и акцентное слово. Тёмная плашка выбивалась из страницы.
            */}
            <div className="relative overflow-hidden rounded-[2rem] border border-sand-200 bg-white px-8 py-20 text-center shadow-soft sm:px-16">
              <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
                <div className="dot-grid absolute inset-0 opacity-40" />
                <div className="animate-drift absolute -left-24 -top-24 h-80 w-80 rounded-full bg-sage-100 opacity-70 blur-3xl" />
                <div className="animate-drift absolute -bottom-28 -right-16 h-72 w-72 rounded-full bg-clay-400 opacity-[0.12] blur-3xl" />
              </div>

              <h2 className="font-display text-3xl font-extrabold leading-tight sm:text-[2.6rem]">
                Загрузите таблицу и посмотрите,
                <br className="hidden sm:block" /> что из неё{' '}
                <span className="relative inline-block text-sage-700">
                  <span className="accent-word">получится</span>
                  <Underline className="text-sage-400/70" />
                </span>
              </h2>
              <p className="mx-auto mt-6 max-w-xl text-ink-soft">
                Бесплатный тариф не ограничен по времени: {freeRows} строк и одно
                опубликованное приложение. Карта не нужна — приём оплаты ещё
                не подключён.
              </p>
              <Link
                href={entry}
                className="mt-9 inline-block rounded-xl bg-ink px-8 py-3.5 text-sm font-medium text-sand-50 shadow-soft transition-all hover:-translate-y-0.5 hover:bg-ink/90 hover:shadow-lift"
              >
                {member ? 'Импортировать таблицу' : 'Загрузить свою таблицу'}
              </Link>
            </div>
          </Reveal>
        </section>
      </main>

      <SiteFooter />
    </div>
  )
}
