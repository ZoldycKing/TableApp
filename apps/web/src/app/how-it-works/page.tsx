import { ImportGuideLink } from '@/components/marketing/import-guide'
import { FileXlsIcon, GridFourIcon, LinkIcon } from '@phosphor-icons/react/ssr'
import { CtaSection, FaqList, MarketingShell, PageHero, PrimaryLink, SecondaryLink, Section } from '@/components/marketing/blocks'
import { ProductDemo } from '@/components/marketing/elaya/product-demo'
import { pageMetadata } from '@/lib/seo'
import { currentMember } from '@/lib/session'
import styles from '@/components/marketing/elaya/content-pages.module.css'

export const dynamic = 'force-dynamic'
export const metadata = pageMetadata({ path:'/how-it-works', title:'Как превратить таблицу в приложение', description:'Добавьте данные, настройте экраны и доступ, опубликуйте приложение. Посмотрите каждый шаг на примере Scatta.' })

const QUESTIONS = [
  {
    question: 'Нужно ли переносить данные вручную?',
    answer:
      'Нет. Таблица загружается файлом, колонки сопоставляются по названиям, а то, что не совпало, вы выбираете сами перед загрузкой.',
  },
  {
    question: 'Сколько времени занимает первый раз?',
    answer:
      'Шаблон разворачивается сразу, импорт своей таблицы — минуты. Сколько уйдёт на настройку экранов и ролей, зависит от того, насколько подробно вы хотите их настроить.',
  },
  {
    question: 'Кто видит приложение до публикации?',
    answer:
      'Черновик виден только вам и не входит в лимит опубликованных приложений. После публикации приложение откроется тем, кому вы настроили доступ.',
  },
  {
    question: 'Можно ли потом всё переделать?',
    answer:
      'Да. Приложение — это взгляд на ваши таблицы: экраны, роли и права меняются в любой момент, а данные остаются на месте. Шаблон после установки тоже становится обычными вашими таблицами.',
  },
]

export default async function HowItWorksPage() {
  const member = await currentMember()
  const start = member ? '/import' : '/login?next=%2Fimport'
  return <MarketingShell signedIn={Boolean(member)}>
    <PageHero trail={[{href:'/',label:'Scatta'},{label:'Как это работает'}]} title="От таблицы до приложения." lead="Добавьте данные и настройте нужные разделы. Работайте сами или дайте доступ команде и клиентам." actions={<><PrimaryLink href={start}>Загрузить свою таблицу</PrimaryLink><SecondaryLink href="/templates">Выбрать шаблон</SecondaryLink></>} />
    <Section><ProductDemo /></Section>
    <Section>
      <div className={styles.journey}>
        <article><span>01 / Данные</span><FileXlsIcon size={32} aria-hidden /><h2>Загрузите копию таблицы</h2><p>Подойдёт Excel или CSV. Из Google или Яндекс Таблиц сначала скачайте файл. Перед загрузкой проверьте листы и колонки.</p></article>
        <article><span>02 / Экраны</span><GridFourIcon size={32} aria-hidden /><h2>Подготовьте приложение</h2><p>Выберите разделы и поля, с которыми хотите работать. Если приложением будут пользоваться другие люди, настройте им доступ.</p></article>
        <article><span>03 / Работа</span><LinkIcon size={32} aria-hidden /><h2>Начните пользоваться</h2><p>Откройте приложение с компьютера или телефона. Сохранённые изменения видны в таблицах Scatta. Если нужен доступ другим людям, отправьте им ссылку.</p></article>
      </div>
    </Section>
    <Section width="narrow"><div className={styles.note}><p>Исходный файл не меняется. Автоматической синхронизации с ним нет. Формулы и связи между листами нужно настроить в Scatta.</p><ImportGuideLink /></div></Section>
    <Section title="О начале работы" width="narrow"><FaqList items={QUESTIONS} /></Section>
    <CtaSection title="Попробуйте" accent="на своих данных." text="Бесплатный тариф без ограничения по времени. Карта не нужна." href={start} label="Загрузить свою таблицу" secondary={{href:'/templates',label:'Сначала открыть шаблон'}} />
  </MarketingShell>
}
