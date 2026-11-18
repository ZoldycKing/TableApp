import Link from 'next/link'
import { ArrowRightIcon, ArrowUpRightIcon, CheckIcon, DeviceMobileIcon, PlusIcon, ShieldCheckIcon, TableIcon } from '@phosphor-icons/react/ssr'
import { TemplateIcon } from '@/components/template-icon'
import { DemoRecordsProvider } from '../demo-records'
import { ElayaHeader } from './header'
import { ElayaFooter } from './footer'
import { Appear, Tagline } from './motion'
import { AccessDemo, ProductDemo, ReceiptDemo, SetupSteps } from './product-demo'
import { ImportGuideLink } from '../import-guide'
import site from './site.module.css'
import styles from './landing.module.css'

const TEMPLATES = [
  { id: 'zakazy', title: 'Продажа товаров', text: 'Каталог, корзина и заказы клиентов в одном приложении.' },
  { id: 'sklad', title: 'Склад и остатки', text: 'Товары, приёмка и всё, что пора докупить.' },
  { id: 'zayavki', title: 'Заявки и выезды', text: 'Заявки, исполнители и понятный статус работы.' },
  { id: 'proizvodstvo', title: 'Производство', text: 'Выпуск продукции и расход материалов по нормам.' },
]
export const ELAYA_FAQ = [
  { question: 'Для какого бизнеса подойдёт Scatta?', answer: 'Для магазина, сервиса, мастерской или небольшого производства, где заказы, клиенты или остатки уже ведутся в таблицах. Можно загрузить свои данные или начать с готового шаблона.' },
  { question: 'Нужно ли уметь программировать?', answer: 'Нет. Загрузите данные, выберите вид экранов и настройте доступ в интерфейсе Scatta. Начать можно с готового шаблона.' },
  { question: 'Можно перенести Google или Яндекс Таблицу?', answer: 'Да. Скачайте её в формате Excel или CSV и загрузите в Scatta. Дальше работайте здесь: исходный файл не меняется, автоматической синхронизации с ним нет.' },
  { question: 'Приложение работает на телефоне?', answer: 'Да. Оно открывается по ссылке в браузере телефона или компьютера. На телефоне его можно добавить на домашний экран.' },
  { question: 'Кто увидит мои данные?', answer: 'Вы выбираете, кому доступно приложение и что в нём видно. Можно пользоваться только самому, а позже настроить доступ другим людям.' },
  { question: 'Формулы Excel тоже перенесутся?', answer: 'При загрузке переносятся данные. Формулы Excel, связи между листами и сводные таблицы автоматически не воссоздаются. Расчёты и сводные показатели можно настроить в Scatta.' },
  { question: 'Где будут храниться мои данные?', answer: 'На серверах в России. Таблицы можно выгрузить из своего пространства в Excel или CSV.' },
  { question: 'Нужно платить за каждого сотрудника?', answer: 'Нет. Сотрудники и клиенты отдельно не тарифицируются. Бесплатный тариф включает 2 000 строк и одно опубликованное приложение. Платные тарифы дают больше места для данных и файлов.' },
  { question: 'Можно использовать Scatta для личных задач?', answer: 'Да. Можно собрать приложение для планов, расходов или своих списков и пользоваться только самому. Названия разделов, поля и доступ настраиваете вы.' },
] as const

export function ElayaLanding({ signedIn, entry, freeRows, startPrice }: { signedIn: boolean; entry: string; freeRows: string; startPrice: string }) {
  return <DemoRecordsProvider><div className={`${site.shell} ${styles.home}`} data-elaya-site>
    <a href="#main" className={styles.skip}>Перейти к содержимому</a>
    <ElayaHeader signedIn={signedIn} />
    <main id="main">
      <section className={styles.hero} aria-labelledby="home-title">
        <Appear className={styles.heroCopy}>
          <h1 id="home-title">Приложение<br />для вашего бизнеса.</h1>
          <p>Соберите из своих таблиц приложение для заказов, клиентов и учёта. Настройте рабочие экраны для себя, команды и клиентов.</p>
          <div className={styles.heroAction}><Link href={entry} className={styles.primary}>Создать приложение<ArrowUpRightIcon size={20} aria-hidden /></Link><span className={styles.heroProof}>Бесплатно: {freeRows} строк и одно приложение</span></div>
        </Appear>
        <div className={styles.heroDemo} id="telefon"><ProductDemo /></div>
        <div className={styles.facts}><span><TableIcon aria-hidden />Ваш Excel или CSV</span><span><DeviceMobileIcon aria-hidden />На компьютере и телефоне</span><span><ShieldCheckIcon aria-hidden />Доступ под вашим контролем</span></div>
      </section>

      <section className={styles.benefits} id="vozmozhnosti" aria-labelledby="benefits-title">
        <Appear className={styles.sectionTop}><div><span className={styles.eyebrow}>Ваши рабочие таблицы</span><h2 id="benefits-title">Заказы, клиенты,<br />товары и заявки.</h2></div><p>Соберите приложение под работу своей компании. Свои разделы, поля, расчёты и правила доступа.</p></Appear>
        <div className={styles.feature} id="kak">
          <Appear className={styles.featureCopy}><span className={styles.featureNumber}>01 / Доступ для каждого</span><h2>У каждого<br />своя работа.</h2><p>Клиент проверяет свой заказ. Сотрудник открывает рабочие разделы. Вы решаете, какие данные и действия доступны каждому.</p><Link href="/features#dostup" className={styles.textLink}>Посмотреть разницу<ArrowUpRightIcon size={20} aria-hidden /></Link></Appear>
          <Appear delay={80}><AccessDemo /></Appear>
        </div>
      </section>

      <Tagline />

      <section className={styles.setup} aria-labelledby="setup-title">
        <Appear><span className={styles.eyebrow}>02 / Начало работы</span><h2 id="setup-title">Из файла в приложение.<br />Шаг за шагом.</h2><p className={styles.sectionLead}>Начните со своих данных.<br />Разделы и оформление настройте под себя.</p></Appear>
        <SetupSteps />
        <div className={styles.importHint}><p>После загрузки работайте в Scatta. Исходный файл остаётся у вас и не меняется.</p><ImportGuideLink /></div>
      </section>

      <section className={styles.benefits} id="dlya-biznesa" aria-labelledby="business-title">
        <Appear className={styles.sectionTop}><div><span className={styles.eyebrow}>Работа с общими данными</span><h2 id="business-title">Команда работает.<br />Данные обновляются.</h2></div><p>Один сотрудник принимает товар, другой смотрит остаток. Все работают с актуальными данными в Scatta.</p></Appear>
        <div className={styles.feature}>
          <Appear className={styles.featureCopy}><span className={styles.featureNumber}>Общие данные</span><h2>Приняли товар.<br />Остаток уже в таблице.</h2><p>Сотрудник работает с телефона. Вы видите результат в общей таблице Scatta. Переносить записи вручную не нужно.</p><Link href="/templates/zakazy" className={styles.textLink}>Открыть пример магазина<ArrowUpRightIcon size={20} aria-hidden /></Link></Appear>
          <Appear delay={80}><ReceiptDemo /></Appear>
        </div>
      </section>

      <section className={styles.templates} id="komu" aria-labelledby="templates-title"><div className={styles.templatesInner}>
        <Appear className={styles.sectionTop}><div><span className={styles.eyebrow}>Готовые шаблоны для бизнеса</span><h2 id="templates-title">Продажи, склад<br />и другие задачи.</h2></div><Link href="/templates" className={styles.textLink}>Все шаблоны<ArrowRightIcon size={20} aria-hidden /></Link></Appear>
        <div className={styles.templateGrid}>{TEMPLATES.map((item, index) => <Appear key={item.id} delay={index * 80}><Link href={`/templates/${item.id}`} className={styles.templateCard}><TemplateIcon id={item.id} /><h3>{item.title}</h3><p>{item.text}</p><span>Посмотреть шаблон<ArrowUpRightIcon size={16} aria-hidden /></span></Link></Appear>)}</div>
      </div></section>

      <section className={styles.pricing} id="tarify" aria-labelledby="pricing-title">
        <Appear className={styles.sectionTop}><div><span className={styles.eyebrow}>Без платы за каждого человека</span><h2 id="pricing-title">Сначала попробуйте.<br />Бесплатно.</h2></div><p>Соберите приложение на своих данных и решите, подходит ли вам Scatta.</p></Appear>
        <div className={styles.priceGrid}>
          <Appear className={styles.priceCard}><h3>Для первого приложения</h3><p className={styles.priceDescription}>Без ограничения по времени</p><div className={styles.price}>0 ₽<small>/ месяц</small></div><ul><li><CheckIcon size={20} aria-hidden />{freeRows} строк данных</li><li><CheckIcon size={20} aria-hidden />Одно опубликованное приложение</li><li><CheckIcon size={20} aria-hidden />Клиенты и команда без отдельной платы</li></ul><Link href={entry} className={styles.primary}>Создать приложение<ArrowUpRightIcon size={20} aria-hidden /></Link></Appear>
          <Appear delay={80} className={`${styles.priceCard} ${styles.priceCardPaid}`}><h3>Когда понадобится больше</h3><p className={styles.priceDescription}>Тариф под объём ваших данных</p><div className={styles.price}><span>от</span>{startPrice} ₽<small>/ месяц</small></div><ul><li><CheckIcon size={20} aria-hidden />Больше строк и места для файлов</li><li><CheckIcon size={20} aria-hidden />Больше опубликованных приложений</li><li><CheckIcon size={20} aria-hidden />Цена не зависит от числа людей</li></ul><Link href="/pricing" className={styles.secondary}>Сравнить тарифы<ArrowRightIcon size={20} aria-hidden /></Link></Appear>
        </div>
        <div className={styles.priceFine}><span>Цены предварительные. Приём оплаты ещё не подключён.</span><Link href="/pricing">Все возможности и лимиты</Link></div>
      </section>

      <section className={styles.faq} aria-labelledby="faq-title"><Appear><h2 id="faq-title">Остались вопросы?</h2></Appear><div className={styles.questionList}>{ELAYA_FAQ.map(item => <details key={item.question}><summary>{item.question}<PlusIcon size={20} aria-hidden /></summary><p>{item.answer}</p></details>)}</div></section>

      <section className={styles.closing}><Appear className={styles.closingInner}><div><h2>Соберите приложение<br />для своего бизнеса.</h2><p>Начните со своих таблиц или готового шаблона.</p></div><div className={styles.closingAction}><Link href={entry} className={styles.primary}>Создать приложение<ArrowUpRightIcon size={20} aria-hidden /></Link><span>Начните на бесплатном тарифе</span></div></Appear></section>
    </main>
    <ElayaFooter />
  </div></DemoRecordsProvider>
}
