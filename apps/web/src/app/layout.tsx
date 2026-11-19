import type { Metadata } from 'next'
import { Metrika } from '@/components/marketing/metrika'
import type { ReactNode } from 'react'
import './globals.css'
import { onest } from './fonts'
import { SITE_URL } from '@/lib/site-url'
import { AgentationDevtools } from '@/components/agentation-devtools'

/*
 * Адрес сайта нужен метаданным: по нему строятся абсолютные ссылки на картинку
 * для мессенджеров и канонические адреса страниц. Берётся из одного места —
 * [site.ts](apps/web/src/lib/site.ts), — чтобы карта сайта, robots и метаданные
 * не разошлись в написании домена.
 */

const title = 'Scatta — приложение для бизнеса из ваших таблиц'
const description =
  'Соберите из своих таблиц приложение для заказов, клиентов и учёта. Настройте рабочие экраны и доступ для себя, сотрудников и клиентов.'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: title, template: '%s · Scatta' },
  description,
  applicationName: 'Scatta',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/brand/favicon/favicon.ico', sizes: 'any' },
      { url: '/brand/favicon/favicon-16.png', sizes: '16x16', type: 'image/png' },
      { url: '/brand/favicon/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/brand/favicon/favicon-48.png', sizes: '48x48', type: 'image/png' },
    ],
    apple: [{ url: '/brand/favicon/apple-touch-icon-180.png', sizes: '180x180', type: 'image/png' }],
  },
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
    siteName: 'Scatta',
    title,
    description,
  },
  twitter: { card: 'summary_large_image', title, description },
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="ru"
      className={onest.variable}
      // Плавная прокрутка нужна для якорей на лендинге, но не при переходе
      // между страницами: без этой отметки Next гасит её целиком.
      data-scroll-behavior="smooth"
    >
      <body className={onest.className}>
        {children}
        <Metrika />
        {process.env.NODE_ENV === 'development' ? <AgentationDevtools /> : null}
      </body>
    </html>
  )
}
