import Link from 'next/link'
import { ArrowUpRightIcon } from '@phosphor-icons/react/ssr'
import { MarketingShell } from '@/components/marketing/blocks'
import { DeferredAppPreview as AppShell } from '@/components/marketing/deferred-preview'
import { Appear } from '@/components/marketing/elaya/motion'
import { CalculationStory, RoleStory, ViewsStory } from '@/components/marketing/elaya/feature-scenes'
import { DEMO_CLIENT_EMAIL, loadDemoApp, loadDemoRuntime } from '@/lib/demo-runtime'
import { asRole, companyOf } from '@/lib/app-roles'
import { currentMember } from '@/lib/session'
import { pageMetadata } from '@/lib/seo'
import styles from '@/components/marketing/elaya/inner-pages.module.css'

export const dynamic = 'force-dynamic'
export const metadata = pageMetadata({ path:'/features', title:'Возможности TableApp в действии', description:'Посмотрите, как одни записи работают в таблице, на доске и в календаре, как считаются суммы и что видит каждая роль. Попробуйте на учебных данных.' })

export default async function FeaturesPage() {
  const member = await currentMember()
  const app = loadDemoApp()
  const client = loadDemoRuntime(asRole('client',DEMO_CLIENT_EMAIL,companyOf(app,DEMO_CLIENT_EMAIL)))
  const staff = loadDemoRuntime(asRole('staff'))
  client.app.theme.accent='green'; staff.app.theme.accent='green'
  return <MarketingShell signedIn={Boolean(member)}><div className={styles.page}>
    <Appear className={styles.intro}><div><span className={styles.eyebrow}>Возможности в действии</span><h1>Ваши данные.<br />Работа вашего бизнеса.</h1><p>Управляйте заказами, клиентами и рабочими задачами. Выбирайте виды таблиц, настраивайте расчёты и доступ команды.</p></div><Link href="/templates" className={styles.primary}>Открыть шаблоны<ArrowUpRightIcon size={20} aria-hidden /></Link></Appear>
    <section className={styles.featureSection} id="dannye" aria-labelledby="views-title"><Appear className={styles.featureTitle}><div><span className={styles.eyebrow}>01 / Таблицы в кабинете</span><h2 id="views-title">Одни рабочие задачи.<br />Разные способы смотреть.</h2></div><p>Строки таблицы, карточки на доске или записи в календаре. Выберите подходящий вид. Во всех представлениях остаются те же данные.</p></Appear><ViewsStory /></section>
    <section className={styles.featureSection} id="vychisleniya" aria-labelledby="calculation-title"><Appear className={styles.featureTitle}><div><span className={styles.eyebrow}>02 / Расчёты в таблицах</span><h2 id="calculation-title">Изменили количество.<br />Сумма уже пересчитана.</h2></div><p>Настройте формулы для своих данных. Например, считайте сумму заказа по ценам и количеству товаров. Итог обновится после изменения записей.</p></Appear><CalculationStory /></section>
    <section className={styles.featureSection} id="dostup" aria-labelledby="access-title"><span id="prilozheniya" /><Appear className={styles.featureTitle}><div><span className={styles.eyebrow}>03 / Если работаете вместе</span><h2 id="access-title">Каждому свой доступ.<br />Данные общие.</h2></div><p>Когда приложение нужно команде или клиентам, выберите доступные им разделы и записи. Здесь можно сравнить роли на примере сервисного центра.</p></Appear><RoleStory client={<AppShell runtime={client} viewer={null} demo />} staff={<AppShell runtime={staff} viewer={null} demo />} /></section>
    <section className={styles.featureDetails} id="bezopasnost"><h2>Ещё несколько полезных деталей</h2><div className={styles.detailGrid}><div><h3>Ваши данные остаются вашими</h3><p>Загружайте Excel и CSV. Выгружайте таблицы обратно, когда понадобится. Данные хранятся в России.</p></div><div><h3>Вход по коду на почту</h3><p>Клиентам и сотрудникам не нужно запоминать пароль. Доступ к приложению настраивает владелец.</p></div><div><h3>Работа по ссылке</h3><p>Приложение открывается в браузере компьютера и телефона. Его можно добавить на домашний экран.</p></div></div><p className={styles.limitNote}>Для работы нужен интернет. Онлайн-оплата, автоматические уведомления, обмен с 1С и собственные домены приложений пока не подключены.</p></section>
    <div className={styles.closing}><div><h2>Попробуйте своими руками.</h2><p>Откройте готовый шаблон на учебных данных. Свои записи добавите после установки.</p></div><Link href="/templates" className={styles.primary}>Выбрать шаблон<ArrowUpRightIcon size={20} aria-hidden /></Link></div>
  </div></MarketingShell>
}
