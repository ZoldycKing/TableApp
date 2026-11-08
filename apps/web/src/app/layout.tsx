import type { Metadata } from 'next'
import { Metrika } from '@/components/marketing/metrika'
import type { ReactNode } from 'react'
import './globals.css'
import { SITE_URL } from '@/lib/site-url'
import { AgentationDevtools } from '@/components/agentation-devtools'

/*
 * Адрес сайта нужен метаданным: по нему строятся абсолютные ссылки на картинку
 * для мессенджеров и канонические адреса страниц. Берётся из одного места —
 * [site.ts](apps/web/src/lib/site.ts), — чтобы карта сайта, robots и метаданные
 * не разошлись в написании домена.
 */

const title = 'TableApp — приложение для бизнеса из ваших таблиц'
const description =
  'Соберите из своих таблиц приложение для заказов, клиентов и учёта. Настройте рабочие экраны и доступ для себя, сотрудников и клиентов.'

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
    >
      <body>
        {children}
        <Metrika />
        {process.env.NODE_ENV === 'development' ? <AgentationDevtools /> : null}
      </body>
    </html>
  )
}
