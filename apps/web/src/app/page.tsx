import { ScattaLanding } from '@/components/marketing/scatta/landing'
import { JsonLd } from '@/components/marketing/blocks'
import { pageMetadata } from '@/lib/seo'
import { currentMember } from '@/lib/session'
import { SITE_URL } from '@/lib/site-url'

export const dynamic = 'force-dynamic'

export const metadata = pageMetadata({
  path: '/',
  title: 'Scatta — приложение для вашего дела, собранное за вечер',
  description:
    'Кабинет для команды и страница, где клиенты сами выбирают время, бронируют или оставляют заявку. Шаблон, ваши поля, без программиста.',
  exact: true,
})

const SCHEMA = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${SITE_URL}/#organization`,
      name: 'Scatta',
      url: `${SITE_URL}/`,
      email: 'hello@tableapp.ru',
      description: 'Scatta собирает приложение для записи, броней и заявок из шаблона и ваших данных.',
    },
    {
      '@type': 'SoftwareApplication',
      name: 'Scatta',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      url: `${SITE_URL}/`,
      publisher: { '@id': `${SITE_URL}/#organization` },
      inLanguage: 'ru-RU',
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'RUB',
        description: 'Бесплатный старт без карты.',
      },
    },
  ],
}

export default async function LandingPage() {
  const member = await currentMember()
  const entry = member ? '/import' : '/login?next=%2Fimport'
  return (
    <>
      <JsonLd data={SCHEMA} />
      <ScattaLanding signedIn={Boolean(member)} entry={entry} />
    </>
  )
}
