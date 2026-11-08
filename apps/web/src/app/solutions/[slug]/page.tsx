import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CtaSection, FaqList, Limits, MarketingShell, PageHero, PrimaryLink, SecondaryLink, Section } from '@/components/marketing/blocks'
import { SolutionDemo } from '@/components/marketing/solution-demo'
import { WorkSteps } from '@/components/marketing/work-story'
import { TemplateIcon } from '@/components/template-icon'
import { ArrowRightIcon } from '@phosphor-icons/react/ssr'
import styles from '@/components/marketing/elaya/content-pages.module.css'
import { pageMetadata } from '@/lib/seo'
import { currentMember } from '@/lib/session'
import { findSolution, SOLUTIONS, solutionEntry } from '@/lib/solutions'

export const dynamic = 'force-dynamic'

export function generateStaticParams() {
  return SOLUTIONS.map(item => ({ slug: item.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const solution = findSolution((await params).slug)
  return solution ? pageMetadata({ path: `/solutions/${solution.slug}`, title: solution.seoTitle, description: solution.description }) : {}
}

export default async function SolutionPage({ params }: { params: Promise<{ slug: string }> }) {
  const solution = findSolution((await params).slug)
  if (!solution) notFound()
  const member = await currentMember()
  const entry = solutionEntry(solution)
  const related = solution.related.map(findSolution).filter(item => item !== undefined)

  return <MarketingShell signedIn={Boolean(member)}>
    <PageHero
      trail={[{ href: '/', label: 'TableApp' }, { href: '/solutions', label: 'Решения' }, { label: solution.name }]}
      icon={<TemplateIcon id={solution.templateId ?? 'portal'} className="size-12" />}
      title={solution.h1}
      lead={solution.lead}
      note={solution.who}
      actions={<><PrimaryLink href={entry.href}>{entry.label}</PrimaryLink><SecondaryLink href="#primer">Посмотреть пример</SecondaryLink></>}
    />
    <Section title="Как идёт работа">
      <WorkSteps steps={solution.workflow} />
      <div className={styles.storyOutcome}><h3>{solution.outcome.title}</h3><p>{solution.outcome.text}</p></div>
    </Section>
    <Section id="primer" title={solution.example.title} lead={solution.slug === 'employee-app' || solution.slug === 'order-management' ? solution.example.instruction : undefined}>
      <SolutionDemo slug={solution.slug} />
    </Section>
    <Section width="narrow"><Limits items={solution.limits} /></Section>
    <Section title="Частые вопросы" width="narrow"><FaqList items={solution.faq} /></Section>
    <Section title="Другие рабочие задачи">
      <div className={styles.solutionGrid}>{related.map(item => <Link key={item.slug} href={`/solutions/${item.slug}`} className={styles.solutionCard}>
        <TemplateIcon id={item.templateId ?? 'portal'} />
        <div><h2>{item.task}</h2><p>{item.short}</p><span>Посмотреть пример <ArrowRightIcon size={16} aria-hidden /></span></div>
      </Link>)}</div>
    </Section>
    <CtaSection
      title={solution.templateId ? 'Начните с' : 'Попробуйте на'}
      accent={solution.templateId ? 'готового шаблона.' : 'своих данных.'}
      text={solution.templateId ? 'Посмотрите, что уже подготовлено и какие данные нужно добавить перед запуском.' : solution.slug === 'client-portal' ? 'Выберите задачу: продажи, запись или ремонт. Кабинет клиента уже входит в эти шаблоны.' : 'Загрузите Excel или CSV. Затем выберите разделы, поля и доступ для своей команды.'}
      href={entry.href}
      label={entry.label}
      secondary={{ href: '/pricing', label: 'Посмотреть тарифы' }}
    />
  </MarketingShell>
}
