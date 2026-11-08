import Link from 'next/link'
import {
  CtaSection,
  MarketingShell,
  PageHero,
  PrimaryLink,
  SecondaryLink,
  Section,
} from '@/components/marketing/blocks'
import { ArrowRightIcon } from '@phosphor-icons/react/ssr'
import styles from '@/components/marketing/elaya/content-pages.module.css'
import { TemplateIcon } from '@/components/template-icon'
import { pageMetadata } from '@/lib/seo'
import { currentMember } from '@/lib/session'
import { SOLUTIONS } from '@/lib/solutions'

export const dynamic = 'force-dynamic'

export const metadata = pageMetadata({
  path: '/solutions',
  title: 'Решения — заявки, кабинет клиента, производство и склад',
  description:
    'Шесть дел, ради которых заводят таблицу: заявки и выезды, кабинет клиента, производственный учёт, склад, каталог и рабочее приложение для сотрудников.',
})

/**
 * Список решений.
 *
 * Две оси: по делу и по отрасли — человек приходит либо с задачей, либо
 * с собой. Отдельных страниц под отрасли не делаем: за каждой стоят те же
 * решения, названные другими словами, и пять тонких страниц с переписанным
 * текстом хуже честного списка.
 */
export default async function SolutionsPage() {
  const member = await currentMember()

  return (
    <MarketingShell signedIn={Boolean(member)}>
      <PageHero
        trail={[{ href: '/', label: 'TableApp' }, { label: 'Решения' }]}
        title="Как TableApp помогает в работе."
        lead="Выберите рабочую задачу и посмотрите, как с ней справляются клиент, сотрудник и руководитель."
        actions={
          <>
            <PrimaryLink href="/demo">Попробовать демо</PrimaryLink>
            <SecondaryLink href="/templates">Выбрать шаблон</SecondaryLink>
          </>
        }
      />

      <Section><div className={styles.solutionGrid}>{SOLUTIONS.map(item => <Link key={item.slug} href={`/solutions/${item.slug}`} className={styles.solutionCard}><TemplateIcon id={item.templateId ?? 'portal'} /><div><h2>{item.task}</h2><p>{item.short}</p><span>Как идёт работа <ArrowRightIcon size={16} aria-hidden /></span></div></Link>)}</div></Section>

      <CtaSection
        title="Начните с"
        accent="готового шаблона"
        text="Выбрали, как хотите работать? В шаблонах уже подготовлены нужные таблицы и экраны. Останется добавить свои данные."
        href="/templates"
        label="Открыть шаблоны"
        secondary={{ href: '/how-it-works', label: 'Как это работает' }}
      />
    </MarketingShell>
  )
}
