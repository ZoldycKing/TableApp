import Link from 'next/link'
import { HeroFlight } from './hero-flight'
import { TableToApp } from './table-to-app'
import { AppOutcome } from './app-outcome'
import { DemoRecordsProvider } from './demo-records'
import { Reveal } from './reveal'
import { SiteHeader } from './site-header'
import { SiteFooter } from './site-footer'
import { TemplateIcon } from '@/components/template-icon'
import { SOLUTIONS } from '@/lib/solutions'
import styles from './landing-content.module.css'

const STARTERS = ['catalog', 'warehouse', 'order-management', 'production', 'employee-app']
const QUESTIONS = [
  ['Нужен программист?', 'Нет. Загрузите Excel или CSV либо выберите готовый шаблон. Экраны и доступ можно настроить в сервисе.'],
  ['Где хранятся мои данные?', 'На серверах в России. Таблицы можно выгрузить в Excel или CSV из своего пространства.'],
  ['Нужно платить за каждого человека?', 'Нет. Количество сотрудников и клиентов не влияет на цену. Тариф зависит от объёма данных, файлов и числа приложений.'],
] as const

export function LandingContent({ signedIn, entry, freeRows, startPrice }: {
  signedIn: boolean; entry: string; freeRows: string; startPrice: string
}) {
  const starters = SOLUTIONS.filter(item => !item.capability).sort((a, b) => {
    const order = (slug: string) => { const index = STARTERS.indexOf(slug); return index < 0 ? STARTERS.length : index }
    return order(a.slug) - order(b.slug)
  })

  return <div className={styles.home}><DemoRecordsProvider>
    <a href="#main" className={styles.skip}>Перейти к содержимому</a>
    <SiteHeader signedIn={signedIn} />
    <main id="main">
      <section className={styles.hero} aria-labelledby="home-title">
        <div className={styles.heroTop}>
          <h1 id="home-title" className={styles.title}>
            <span><span>Из таблицы —</span></span>
            <span><span>в приложение.</span></span>
          </h1>
          <div className={styles.heroLead}>
            <p>Загрузите свои данные. Получите приложение для клиентов и команды.</p>
            <Link href={entry} className={styles.primary}>{signedIn ? 'Импортировать таблицу' : 'Загрузить таблицу'}<span aria-hidden>↗</span></Link>
            <Link href="/templates" className={styles.textLink}>Или выбрать готовый шаблон <span aria-hidden>→</span></Link>
          </div>
        </div>
        <div id="telefon" className={styles.heroScene}><TableToApp hero /></div>
      </section>

      <section id="kak" className={styles.working} aria-labelledby="working-title">
        <div className={styles.workingInner}>
          <Reveal className={styles.workingCopy}>
            <h2 id="working-title">Работа<br />с телефона.</h2>
            <p>Сотрудник принимает товар. Остаток меняется в общей таблице — переносить данные вручную не нужно.</p>
            <Link href="/how-it-works" className={styles.textLink}>Как устроен Scatta <span aria-hidden>↗</span></Link>
          </Reveal>
          <Reveal delay={120} className={styles.workingDemo}><HeroFlight interactive /></Reveal>
        </div>
        <div id="vozmozhnosti" className={styles.principles}>
          <Reveal><h3>У каждого свой доступ</h3><p>Вы решаете, какие данные и действия доступны клиенту или сотруднику.</p></Reveal>
          <Reveal delay={90}><h3>Открывается по ссылке</h3><p>В браузере компьютера и телефона. Можно добавить на домашний экран.</p></Reveal>
        </div>
      </section>

      <section id="komu" className={styles.starters} aria-labelledby="starters-title">
        <Reveal className={styles.sectionIntro}>
          <h2 id="starters-title">Начните<br />с готового.</h2>
          <p>Выберите свою задачу.<br />Таблицы и основные экраны уже подготовлены.</p>
        </Reveal>
        <div className={styles.starterList}>
          {starters.map((item, index) => <Reveal key={item.slug} delay={index * 65}>
            <Link href={`/solutions/${item.slug}`} className={styles.starter}>
              <TemplateIcon id={item.templateId ?? 'portal'} className={styles.starterIcon} />
              <span className={styles.starterName}>{item.name}</span>
              <span className={styles.starterDescription}>{item.short}</span>
              <span aria-hidden className={styles.starterArrow}>↗</span>
            </Link>
          </Reveal>)}
        </div>
        <Link href="/templates" className={styles.textLink}>Все шаблоны <span aria-hidden>→</span></Link>
      </section>

      <section id="tarify" className={styles.pricing} aria-labelledby="pricing-title">
        <div className={styles.pricingInner}>
          <Reveal className={styles.priceMain}>
            <h2 id="pricing-title">Начните<br />бесплатно.</h2>
            <p>{freeRows} строк и одно опубликованное приложение. Без ограничения по времени.</p>
            <Link href={entry} className={styles.lightButton}>Создать приложение <span aria-hidden>↗</span></Link>
          </Reveal>
          <Reveal delay={100} className={styles.priceDetails}>
            <span className={styles.price}>0 <span>₽</span></span>
            <p>Клиенты и сотрудники<br />отдельно не тарифицируются.</p>
            <Link href="/pricing" className={styles.lightLink}>Больше данных — тарифы от {startPrice} ₽/мес. <span aria-hidden>↗</span></Link>
            <p className={styles.priceNote}>Цены предварительные. Приём оплаты ещё не подключён.</p>
          </Reveal>
        </div>
      </section>

      <section className={styles.questions} aria-labelledby="questions-title">
        <Reveal><h2 id="questions-title">Остались вопросы?</h2></Reveal>
        <div className={styles.answers}>
          {QUESTIONS.map(([question, answer], index) => <Reveal key={question} delay={index * 60}>
            <details><summary>{question}<span aria-hidden>+</span></summary><p>{answer}</p></details>
          </Reveal>)}
        </div>
      </section>

      <section className={styles.closing}>
        <Reveal><h2>Одни данные.<br />Разные задачи.</h2></Reveal>
        <AppOutcome />
        <div className={styles.closingActions}><Link href={entry} className={styles.primary}>Загрузить свою таблицу <span aria-hidden>↗</span></Link><Link href="/templates" className={styles.textLink}>Открыть шаблоны <span aria-hidden>→</span></Link></div>
      </section>
    </main>
    <SiteFooter />
    </DemoRecordsProvider>
  </div>
}
