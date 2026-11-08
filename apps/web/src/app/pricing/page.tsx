import {
  CtaSection,
  FaqList,
  MarketingShell,
  PageHero,
  Section,
} from '@/components/marketing/blocks'
import { Pricing } from '@/components/marketing/pricing'
import { Reveal } from '@/components/marketing/reveal'
import { pageMetadata } from '@/lib/seo'
import { currentMember } from '@/lib/session'

export const dynamic = 'force-dynamic'

export const metadata = pageMetadata({
  path: '/pricing',
  title: 'Тарифы — платите за объём данных, а не за людей',
  description:
    'Четыре тарифа: бесплатный, Старт, Бизнес и Масштаб. Цена зависит от строк, приложений, таблиц и файлов. Сотрудники и клиенты не тарифицируются.',
})

const COUNTED = [
  {
    title: 'Строки',
    text: 'Считаются записи всех ваших таблиц. Например, 8 клиентов и 100 заказов — это 108 строк. Служебная история изменений, сессии и история входов в лимит не входят.',
  },
  {
    title: 'Опубликованные приложения',
    text: 'Считаются только опубликованные приложения. Черновики не расходуют этот лимит.',
  },
  {
    title: 'Таблицы',
    text: 'В каждом тарифе указан максимум таблиц в рабочем пространстве. Клиенты, заказы, товары и другие таблицы считаются отдельно. Служебная история изменений таблицей не считается.',
  },
  {
    title: 'Файлы',
    text: 'Фотографии и документы, загруженные в таблицы. Допустимый объём хранения зависит от тарифа.',
  },
]

const QUESTIONS = [
  {
    question: 'Сколько стоит каждый сотрудник?',
    answer:
      'Нисколько. Люди не тарифицируются вовсе: ни сотрудники, ни клиенты, открывающие приложение. Считается объём данных.',
  },
  {
    question: 'Что будет, если строки закончатся?',
    answer:
      'Существующие данные и опубликованные приложения продолжают работать: читать, править и удалять можно всегда, выгрузка тоже остаётся. Новые строки добавить будет нельзя, пока не освободите место или не смените тариф.',
  },
  {
    question: 'Оплату уже принимаете?',
    answer:
      'Пока нет. Сейчас доступен бесплатный тариф. Цены платных тарифов предварительные. Если вам нужно больше места для данных, напишите на hello@tableapp.ru, чтобы обсудить объём и условия.',
  },
  {
    question: 'Что происходит при понижении тарифа?',
    answer:
      'Ничего не удаляется и не отключается. Созданное продолжает работать, ограничение действует только на то, что вы добавляете дальше.',
  },
  {
    question: 'Можно ли забрать свои данные?',
    answer:
      'В любой момент: выгрузка таблиц в CSV или книгу Excel прямо из интерфейса, без обращения к нам.',
  },
]

export default async function PricingPage() {
  const member = await currentMember()

  return (
    <MarketingShell signedIn={Boolean(member)}>
      <PageHero
        trail={[{ href: '/', label: 'TableApp' }, { label: 'Тарифы' }]}
        title="Начните бесплатно."
        lead="Начните бесплатно со своих данных. Если понадобится больше места или приложений, выберите подходящий тариф."
      />

      {/*
        Шире остальных разделов: четырём карточкам нужно место, иначе они
        сжимаются до 240 px и цена перестаёт помещаться в отступы. Заголовок
        страницы и вводный текст остаются в обычной ширине.
      */}
      <Section width="plans">
        <Pricing signedIn={Boolean(member)} />
      </Section>

      <Section
        title="Что именно считается"
        lead="Использованный объём виден в кабинете, в разделе «Тариф и лимиты»."
        tone="white"
      >
        <div className="grid gap-5 sm:grid-cols-2">
          {COUNTED.map((item, index) => (
            <Reveal key={item.title} delay={(index % 2) * 100}>
              <div className="h-full rounded-2xl border border-sand-200 bg-sand-50 p-7">
                <h3 className="font-display text-base font-bold">{item.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-ink-muted">{item.text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      <Section title="Частые вопросы" tone="sand" width="narrow">
        <FaqList items={QUESTIONS} />
      </Section>

      <CtaSection
        title="Соберите первое приложение"
        accent="сегодня"
        text="Бесплатный тариф без ограничения по времени и без карты. Выгрузить свои таблицы и уйти можно в любой момент."
        href={member ? '/app' : '/login'}
        label={member ? 'В рабочее пространство' : 'Начать бесплатно'}
        secondary={{ href: '/templates', label: 'Посмотреть шаблоны' }}
      />
    </MarketingShell>
  )
}
