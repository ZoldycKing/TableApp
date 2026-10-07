import type { Metadata } from 'next'
import { Metrika } from '@/components/marketing/metrika'
import localFont from 'next/font/local'
import type { ReactNode } from 'react'
import './globals.css'
import { SITE_URL } from '@/lib/site-url'

// Файлы и лицензии включены в репозиторий: сборка не обращается к Google Fonts.
const inter = localFont({
  src: './fonts/inter.woff2',
  weight: '400 600',
  variable: '--font-inter',
  display: 'swap',
})

// Геометрический гротеск с характером — заголовки не выглядят шаблонными.
const unbounded = localFont({
  src: './fonts/unbounded.woff2',
  weight: '500 800',
  variable: '--font-unbounded',
  display: 'swap',
})

// Книжная антиква для выделенных слов на сайте: тёплая и очень читаемая.
const literata = localFont({
  src: './fonts/literata-italic.woff2',
  weight: '500 600',
  style: 'italic',
  adjustFontFallback: 'Times New Roman',
  variable: '--font-literata',
  display: 'swap',
})

/*
 * Адрес сайта нужен метаданным: по нему строятся абсолютные ссылки на картинку
 * для мессенджеров и канонические адреса страниц. Берётся из одного места —
 * [site.ts](apps/web/src/lib/site.ts), — чтобы карта сайта, robots и метаданные
 * не разошлись в написании домена.
 */

const title = 'TableApp — приложения поверх ваших таблиц'
const description =
  'Российская платформа: превращайте таблицы в рабочие приложения для сотрудников и клиентов. Без программистов.'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: title, template: '%s · TableApp' },
  description,
  applicationName: 'TableApp',
  /*
   * Канонического адреса здесь нет намеренно.
   *
   * Он наследуется вниз: стоявший тут «/» делал главную канонической копией
   * для каждой страницы сайта — то есть просил поисковик выбросить из выдачи
   * всё, кроме неё. Свой адрес каждая страница называет сама, помощником
   * из [seo.ts](apps/web/src/lib/seo.ts).
   */
  openGraph: {
    type: 'website',
    locale: 'ru_RU',
    siteName: 'TableApp',
    title,
    description,
  },
  twitter: { card: 'summary_large_image', title, description },
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="ru"
      // Плавная прокрутка нужна для якорей на лендинге, но не при переходе
      // между страницами: без этой отметки Next гасит её целиком.
      data-scroll-behavior="smooth"
      className={`${inter.variable} ${unbounded.variable} ${literata.variable}`}
    >
      <body>
        {children}
        <Metrika />
      </body>
    </html>
  )
}
