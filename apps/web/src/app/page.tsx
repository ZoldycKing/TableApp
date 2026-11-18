import { ELAYA_FAQ, ElayaLanding } from '@/components/marketing/elaya/landing'
import { JsonLd } from '@/components/marketing/blocks'
import { pageMetadata } from '@/lib/seo'
import { currentMember } from '@/lib/session'
import { SITE_URL } from '@/lib/site-url'
import { PLANS } from '@tableapp/schema'

export const dynamic = 'force-dynamic'

export const metadata = pageMetadata({
  path: '/',
  title: 'Scatta — приложение для бизнеса из ваших таблиц',
  description:
    'Соберите из Excel или CSV приложение для заказов, клиентов и учёта. Настройте рабочие экраны и доступ для себя, сотрудников и клиентов.',
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
      name: 'Scatta',
      url: `${SITE_URL}/`,
      email: 'hello@tableapp.ru',
      description:
        'Scatta помогает собрать приложение для бизнеса на основе собственных таблиц.',
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
        description: 'Бесплатный тариф: 2 000 строк и одно опубликованное приложение.',
      },
    },
    {
      '@type': 'FAQPage',
      mainEntity: ELAYA_FAQ.map(item => ({
        '@type': 'Question',
        name: item.question,
        acceptedAnswer: { '@type': 'Answer', text: item.answer },
      })),
    },
  ],
}

const money = new Intl.NumberFormat('ru-RU')

export default async function LandingPage() {
  const member = await currentMember()
  const entry = member ? '/import' : '/login?next=%2Fimport'
  return <>
    <JsonLd data={SCHEMA} />
    <ElayaLanding signedIn={Boolean(member)} entry={entry} freeRows={money.format(PLANS.free.limits.rows)} startPrice={money.format(PLANS.start.monthlyPrice)} />
  </>
}
