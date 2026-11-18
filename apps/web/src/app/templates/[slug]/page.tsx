import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, permanentRedirect } from 'next/navigation'
import { ArrowRightIcon } from '@phosphor-icons/react/ssr'
import { CardGrid, CtaSection, Limits, MarketingShell, PageHero, PrimaryLink, SecondaryLink, Section } from '@/components/marketing/blocks'
import { TemplateDemo } from '@/components/marketing/template-demo'
import { ShopTemplateDemo } from '@/components/marketing/shop-template-demo'
import { BookingTemplateDemo } from '@/components/marketing/booking-template-demo'
import { DispatchDemo } from '@/components/builder/v2/dispatch-demo'
import { ProjectsDemo } from '@/components/builder/v2/projects-demo'
import { TemplateIcon } from '@/components/template-icon'
import { pageMetadata } from '@/lib/seo'
import { currentMember } from '@/lib/session'
import { templateStart } from '@/lib/site'
import { SOLUTIONS } from '@/lib/solutions'
import { findStarter, findTemplate, STARTER_TEMPLATES, TEMPLATES } from '@/lib/templates/catalog'
import type { TemplateDef } from '@/lib/templates/types'
import { templateAccessNote, templateRoleNames } from '@/lib/templates/presentation'
import { templateCardCopy } from '@/lib/templates/card-copy'
import { templateStartSteps } from '@/lib/templates/start-copy'
import { WorkSteps } from '@/components/marketing/work-story'
import styles from '@/components/marketing/elaya/content-pages.module.css'

export const dynamic = 'force-dynamic'
export function generateStaticParams() { return TEMPLATES.map(template => ({slug:template.id})) }

function relatedTemplates(template: TemplateDef): TemplateDef[] {
  const picked: TemplateDef[] = []
  const add = (item?: TemplateDef) => {
    if (item && item.id !== template.id && !picked.some((x) => x.id === item.id)) picked.push(item)
  }

  for (const id of template.kin ?? []) add(findStarter(id))

  if (picked.length < 3) {
    const solution = SOLUTIONS.find((item) => item.templateId === template.id)
    const industries = new Set(solution?.industries ?? [])
    if (industries.size > 0) {
      for (const item of STARTER_TEMPLATES) {
        const own = SOLUTIONS.find((candidate) => candidate.templateId === item.id)
        if ((own?.industries ?? []).some((name) => industries.has(name))) add(item)
      }
    }
  }

  return picked.slice(0, 3)
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  if (slug === 'portal') return { ...pageMetadata({ path: '/solutions/client-portal', title: 'Кабинет клиента', description: 'Кабинет клиента входит в клиентские стартовые наборы: свои обращения, статусы и история в приложении бизнеса.' }), robots: { index: false, follow: true } }
  if (slug === 'katalog') return pageMetadata({ path: '/templates/zakazy', title: 'Шаблон «Продажа товаров»', description: 'Каталог, корзина, оформление заказа и личный кабинет клиента в одном приложении.' })
  const template = findTemplate(slug)
  if (!template) return {}

  return pageMetadata({
    path: `/templates/${template.id}`,
    title: `Шаблон «${template.name}»`,
    description: `${template.tagline}. ${template.audience}`,
  })
}

export default async function TemplatePage({ params, searchParams }: { params: Promise<{slug:string}>; searchParams: Promise<{view?:string; device?:string}> }) {
  const [{slug}, {view, device}] = await Promise.all([params, searchParams])
  if (slug === 'katalog') permanentRedirect('/templates/zakazy')
  if (slug === 'portal') permanentRedirect('/solutions/client-portal')
  const template = findTemplate(slug)
  if (!template) notFound()
  const member = await currentMember()
  const start = templateStart(template.id, Boolean(member))
  const copy = templateCardCopy(template)
  const solution = SOLUTIONS.find(item => item.templateId === template.id)
  const limits = template.limits ?? solution?.limits ?? []
  const roles = templateRoleNames(template)
  const others = relatedTemplates(template)
  const shop = template.id === 'zakazy'
  const salon = template.id === 'salon'
  const dispatch = template.id === 'zayavki'
  const projects = template.id === 'proekty'
  return <MarketingShell signedIn={Boolean(member)}>
    <PageHero trail={[{href:'/',label:'Scatta'},{href:'/templates',label:'Шаблоны'},{label:template.name}]} icon={<TemplateIcon id={template.id} className="size-12" />} title={template.name} lead={copy.description} note={template.audience} actions={<><PrimaryLink href={start}>Начать с этого шаблона</PrimaryLink><SecondaryLink href="#primer">Посмотреть экраны</SecondaryLink></>} />
    {shop && <Section id="primer" title="Попробуйте магазин"><ShopTemplateDemo path="/templates/zakazy" view={view} device={device} /></Section>}
    {salon && <Section id="primer" title="Попробуйте салон"><BookingTemplateDemo view={view} phone={device === 'phone'} /></Section>}
    {dispatch && <Section id="primer" title="Попробуйте заявки"><DispatchDemo view={view} phone={device === 'phone'} /></Section>}
    {projects && <Section id="primer" title="Попробуйте проекты"><ProjectsDemo view={view} /></Section>}
    <Section title="Что уже подготовлено"><CardGrid columns={3} items={copy.features.map(item => ({title:item.name || template.name,text:item.description.charAt(0).toUpperCase()+item.description.slice(1)}))} /></Section>
    {!shop && !salon && !dispatch && !projects && <Section id="primer" title="Экраны этого шаблона" lead="Открывайте разделы и карточки на учебных данных. Изменения не сохраняются."><TemplateDemo id={template.id} /></Section>}
    <Section title="Что заполнить перед запуском">
      <WorkSteps steps={templateStartSteps(template)} />
      <div className={styles.templateRoles} aria-label="Подготовленные роли">{roles.map(role => <span key={role}>{role}</span>)}</div>
      <p className="mt-6 max-w-3xl text-sm leading-6 text-ink-soft">{templateAccessNote(template)}</p>
    </Section>
    {limits.length ? <Section width="narrow"><Limits items={limits} /></Section> : copy.note ? <Section width="narrow"><p className={styles.note}>{copy.note}</p></Section> : null}
    {others.length ? <Section title="Другие шаблоны"><div className={styles.solutionGrid}>{others.map(item => <Link key={item.id} href={`/templates/${item.id}`} className={styles.solutionCard}><TemplateIcon id={item.id} /><div><h2>{item.name}</h2><p>{templateCardCopy(item).description}</p><span>Посмотреть шаблон <ArrowRightIcon size={16} aria-hidden /></span></div></Link>)}</div></Section> : null}
    <CtaSection title="Начните с" accent="готового приложения." text="Свои данные и доступ добавите во время настройки. Приложение останется черновиком до публикации." href={start} label="Начать с этого шаблона" secondary={{href:'/templates',label:'Все шаблоны'}} />
  </MarketingShell>
}
