import Link from 'next/link'
import { CheckIcon } from '@phosphor-icons/react/ssr'
import styles from './elaya/pricing.module.css'
import controls from './elaya/inner-pages.module.css'
import { PLAN_ORDER, PLANS, type Plan } from '@tableapp/schema'

/**
 * Тарифы на сайте.
 *
 * Считаются из той же конфигурации, по которой работают ограничения
 * в продукте: [plans.ts](packages/schema/src/plans.ts). Второй список
 * с ценами здесь был, и он разошёлся с правдой — сайт обещал тысячу строк
 * на пробу, а продукт давал две тысячи и называл тариф иначе. Человек
 * замечает это на странице расхода, и это худшее место для такой встречи.
 */

const money = new Intl.NumberFormat('ru-RU')

function priceOf(plan: Plan): string {
  return plan.monthlyPrice === 0 ? 'бесплатно' : `${money.format(plan.monthlyPrice)} ₽`
}

/** Мегабайты и гигабайты словами: «262 144 000 байт» не значит ничего. */
export function filesOf(bytes: number): string {
  const gb = bytes / 1024 ** 3
  return gb >= 1 ? `${money.format(Math.round(gb))} ГБ файлов` : `${Math.round(bytes / 1024 ** 2)} МБ файлов`
}

/**
 * Склонение по числу: «1 приложение», «2 приложения», «5 приложений».
 *
 * Без него в карточке тарифа стояло «5 опубликованных приложения» —
 * мелочь, которую замечают все и которая сразу говорит, как сделано остальное.
 */
function plural(count: number, forms: [string, string, string]): string {
  const tens = count % 100
  const ones = count % 10
  if (tens >= 11 && tens <= 14) return forms[2]
  if (ones === 1) return forms[0]
  if (ones >= 2 && ones <= 4) return forms[1]
  return forms[2]
}

/** Что входит в тариф — четырьмя строками, в том же порядке, что и учёт. */
export function limitsOf(plan: Plan): string[] {
  const apps = plan.limits.publishedApps
  const tables = plan.limits.tables
  return [
    `${money.format(plan.limits.rows)} ${plural(plan.limits.rows, ['строка', 'строки', 'строк'])}`,
    `${apps} ${plural(apps, ['опубликованное приложение', 'опубликованных приложения', 'опубликованных приложений'])}`,
    `${tables} ${plural(tables, ['таблица', 'таблицы', 'таблиц'])}`,
    filesOf(plan.limits.fileBytes),
  ]
}

export function Pricing({ signedIn = false }: { signedIn?: boolean }) {
  return <div>
    <p className={styles.availability}>Сейчас доступен бесплатный тариф без ограничения по времени. Платные тарифы пока нельзя подключить, их цены предварительные.</p>
    <div className={styles.grid}>{PLAN_ORDER.map(id => {
      const plan = PLANS[id]
      const free = plan.monthlyPrice === 0
      return <article className={styles.card} data-free={free} key={id}>
        <h2>{plan.name}</h2>
        <p className={styles.price}>{free ? '0 ₽' : priceOf(plan)}</p>
        <p className={styles.period}>в месяц за пространство</p>
        <p className={styles.fit}>{plan.fit}</p>
        <ul>{[...limitsOf(plan), 'Без платы за каждого человека'].map(line => <li key={line}><CheckIcon size={16} aria-hidden />{line}</li>)}</ul>
        {free ? <Link className={controls.primary} href={signedIn ? '/app' : '/login'}>Начать бесплатно</Link> : <a className={controls.secondary} href={`mailto:hello@tableapp.ru?subject=${encodeURIComponent(`Тариф «${plan.name}»`)}`}>Обсудить тариф</a>}
      </article>
    })}</div>
  </div>
}
