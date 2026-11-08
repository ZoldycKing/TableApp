/**
 * Карта публичного сайта.
 *
 * Один список на всё: шапку, подвал, карту сайта и проверки. Раньше адреса
 * жили в трёх местах — в шапке, в подвале и в `sitemap.ts`, — и расходились
 * молча: раздел переименовали в одном, забыли в двух, а человек находил
 * его только из поиска.
 *
 * Модуль намеренно без зависимостей и **без обращений к окружению**: его
 * читает и серверная разметка, и клиентская шапка, и тесты. Сам адрес сайта
 * лежит отдельно — в `lib/site-url.ts`, и попал он туда не для порядка:
 * пока он был здесь, его проверка срабатывала в браузере и роняла скрипты
 * всех публичных страниц. Подробности — в том файле.
 */

import legacyRedirects from './legacy-redirects.json'

export type SiteLink = { href: string; label: string; hint?: string }

/**
 * Публичные страницы.
 *
 * Здесь только то, что имеет смысл в поиске: рабочее пространство, вход
 * и опубликованные приложения клиентов — не отсюда.
 */
export const PUBLIC_ROUTES = {
  home: '/',
  features: '/features',
  howItWorks: '/how-it-works',
  solutions: '/solutions',
  templates: '/templates',
  pricing: '/pricing',
  privacy: '/legal/privacy',
  terms: '/legal/terms',
  offer: '/legal/offer',
} as const

/**
 * Разделы шапки.
 *
 * Шапка ведёт к возможностям, шаблонам и тарифам.
 * Интерактивные примеры открываются на страницах шаблонов.
 * Подробные объяснения и решения доступны из содержимого и подвала.
 */
export const NAV_PRODUCT: SiteLink[] = [
  { href: PUBLIC_ROUTES.features, label: 'Возможности', hint: 'Таблицы, формулы, приложения, права' },
  { href: PUBLIC_ROUTES.howItWorks, label: 'Как это работает', hint: 'От своей таблицы к своему приложению' },
  { href: PUBLIC_ROUTES.templates, label: 'Шаблоны', hint: 'Интерактивные примеры на учебных данных' },
]

export const NAV_SOLUTIONS: SiteLink[] = [
  { href: '/solutions/client-portal', label: 'Кабинет клиента', hint: 'Клиент видит только свой заказ' },
  { href: '/solutions/order-management', label: 'Заявки и выезды', hint: 'Приняли, назначили, видно статус' },
  { href: '/solutions/production', label: 'Производственный учёт', hint: 'Выпуск, нормы, остатки материалов' },
  { href: '/solutions/employee-app', label: 'Рабочее приложение', hint: 'Сотрудник видит своё и работает с телефона' },
  { href: '/solutions/warehouse', label: 'Склад и остатки', hint: 'Что есть и что пора докупать' },
  { href: '/solutions/catalog', label: 'Продажа товаров', hint: 'Каталог, корзина, заказы и кабинет' },
]

export const NAV_MAIN: SiteLink[] = [
  { href: PUBLIC_ROUTES.templates, label: 'Шаблоны' },
  { href: PUBLIC_ROUTES.pricing, label: 'Тарифы' },
]

/** Прямые ссылки плавающей шапки. */
export const NAV_HEADER: SiteLink[] = [
  { href: PUBLIC_ROUTES.features, label: 'Возможности' },
  ...NAV_MAIN,
]

/** Подвал: те же адреса, разложенные по смыслу, без повторения всей шапки. */
export const FOOTER_COLUMNS: { title: string; links: SiteLink[] }[] = [
  {
    title: 'Продукт',
    links: [
      { href: PUBLIC_ROUTES.features, label: 'Возможности' },
      { href: PUBLIC_ROUTES.howItWorks, label: 'Как это работает' },
      { href: PUBLIC_ROUTES.pricing, label: 'Тарифы' },
    ],
  },
  {
    title: 'Для бизнеса',
    links: [
      { href: '/solutions/client-portal', label: 'Кабинет клиента' },
      { href: '/solutions/order-management', label: 'Заявки и выезды' },
      { href: '/solutions/production', label: 'Производственный учёт' },
      { href: PUBLIC_ROUTES.solutions, label: 'Все решения' },
    ],
  },
  {
    title: 'Начать',
    links: [
      { href: PUBLIC_ROUTES.templates, label: 'Шаблоны' },
      { href: '/login', label: 'Войти' },
      { href: '/login?next=%2Fimport', label: 'Загрузить свою таблицу' },
    ],
  },
]

/** Правовые документы: в подвале строкой, а не колонкой. */
export const FOOTER_LEGAL: SiteLink[] = [
  { href: PUBLIC_ROUTES.offer, label: 'Оферта' },
  { href: PUBLIC_ROUTES.terms, label: 'Условия' },
  { href: PUBLIC_ROUTES.privacy, label: 'Обработка данных' },
]

/**
 * Куда ведут старые адреса.
 *
 * Страницы сценариев жили на `/dlya/*`, витрина шаблонов — на `/shablony`.
 * Оставить их рядом с новыми значит выложить в поиск две страницы с одним
 * текстом; убрать молча — потерять тех, у кого ссылка в закладках.
 * Поэтому постоянный переезд, и список лежит здесь, рядом с картой сайта.
 */
export const LEGACY_REDIRECTS: { from: string; to: string }[] = legacyRedirects

/**
 * Разделы рабочего пространства: в поиске им делать нечего.
 *
 * Список нужен и `robots.txt`, и проверке карты сайта: ни один из этих
 * адресов не должен туда попасть.
 */
export const PRIVATE_PREFIXES = [
  '/app',
  '/apps',
  '/t/',
  '/team',
  '/usage',
  '/security',
  '/my',
  '/import',
  '/login',
  '/auth',
  '/api/',
  // Страница подтверждения платежа: она появляется только в проверочном
  // контуре и всё равно открывается лишь владельцу платежа.
  '/pay',
] as const

/**
 * Куда ведёт кнопка «начать с этого шаблона».
 *
 * Выбор человека должен пережить вход: он вернётся на витрину с этим же
 * шаблоном, а не в общий список из одиннадцати. Адрес возврата собирается
 * здесь одним местом — и здесь же проверяется тестом, потому что ошибка
 * в нём видна только тому, кто прошёл весь путь до конца.
 */
export function templateStart(templateId: string, signedIn: boolean): string {
  const target = `/templates?take=${templateId}`
  return signedIn ? target : `/login?next=${encodeURIComponent(target)}`
}

/**
 * Открыт ли сейчас этот раздел.
 *
 * По началу пути, а не по точному совпадению: страница шаблона — это тоже
 * раздел «Шаблоны». Отдельной функцией, потому что от неё зависит и подсветка
 * в меню, и отметка «вы здесь» для тех, кто эту подсветку не видит.
 */
export function isCurrent(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(`${href}/`)
}
