import Link from 'next/link'
import { ArrowUpRightIcon } from '@phosphor-icons/react/ssr'
import { AppChrome } from '@/components/app-chrome'
import { MarketingShell } from '@/components/marketing/blocks'
import { TemplateGallery } from '@/components/template-gallery'
import { DeferredTemplatePreview } from '@/components/marketing/deferred-preview'
import { ShopTemplateDemo } from '@/components/marketing/shop-template-demo'
import { BookingTemplateDemo } from '@/components/marketing/booking-template-demo'
import { StarterPreviewStage } from '@/components/marketing/starter-preview-stage'
import { SupportDemo } from '@/components/builder/v2/support-demo'
import { TemplateShowcase } from '@/components/marketing/elaya/template-showcase'
import { templateCardCopy } from '@/lib/templates/card-copy'
import { templateAppPreview, templatePreviewRole } from '@/lib/templates/app-preview'
import { templateExampleFromDefinition } from '@/lib/templates/presentation'
import { findStarter, findTemplate, STARTER_TEMPLATES } from '@/lib/templates/catalog'
import { pageMetadata } from '@/lib/seo'
import { currentMember, listMemberships } from '@/lib/session'
import { templateStart } from '@/lib/site'
import styles from '@/components/marketing/elaya/inner-pages.module.css'

export const dynamic = 'force-dynamic'
export const metadata = pageMetadata({ path: '/templates', title: 'Готовые приложения под вашу задачу', description: 'Выберите шаблон для продаж, записи, ремонта, выездов, склада или производства. Посмотрите рабочие экраны и начните со своими данными.' })

export default async function TemplatesPage({ searchParams }: { searchParams: Promise<{ take?: string; preview?: string; view?: string; device?: string }> }) {
  const [member, { take, preview, view, device }] = await Promise.all([currentMember(), searchParams])
  const chosen = findStarter(take)?.id ?? null
  const compatibilityTemplate = take === 'portal' ? findTemplate('portal') : undefined
  if (member && take) return <AppChrome member={{ email: member.email, workspaceName: member.workspaceName, role: member.role }} memberships={await listMemberships(member.userId)} activeWorkspaceId={member.workspaceId}>
    <main className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-6 sm:py-10"><h1 className="text-2xl font-semibold tracking-tight text-ink">Выберите шаблон</h1><div className="mt-5"><TemplateGallery key={chosen ?? compatibilityTemplate?.id ?? 'default'} templates={[...STARTER_TEMPLATES]} chosen={chosen} compatibilityTemplate={compatibilityTemplate} /></div><p className="mt-6 text-sm leading-6 text-ink-soft">Уже есть приложение? <Link href="/apps" className="rounded font-medium text-sage-700 underline underline-offset-4">Добавить возможность в его настройках</Link></p></main>
  </AppChrome>
  const selected = STARTER_TEMPLATES.find(item => item.id === preview) ?? STARTER_TEMPLATES[0]!
  const example = templateExampleFromDefinition(selected)
  return <MarketingShell signedIn={Boolean(member)}><div className={`${styles.page} ${styles.templatesPage}`}>
    <header className={styles.templateIntro}><h1>Готовые приложения</h1><p>Выберите задачу и попробуйте приложение на примере. Затем добавьте свои данные.</p></header>
    <span id="client-apps" /><span id="internal-tools" />
    <TemplateShowcase templates={STARTER_TEMPLATES.map(item => ({ id:item.id, name:item.name, ...templateCardCopy(item), features:[...templateCardCopy(item).features] }))} selectedId={selected.id} canInstall={Boolean(member)} startHref={templateStart(selected.id, Boolean(member))}
      preview={selected.id === 'zakazy' ? <ShopTemplateDemo example={example} path="/templates" view={view} device={device} /> : selected.id === 'salon' ? <BookingTemplateDemo example={example} phone={device === 'phone'} view={view} /> : selected.id === 'podderzhka' ? <SupportDemo view={view} phone={device === 'phone'} /> : <StarterPreviewStage key={selected.id} initialPhone={device === 'phone'}><StarterPreview example={example} /></StarterPreviewStage>} />
    <div className={styles.templateAfter}><p>Внутри учебные примеры. Свои данные добавите во время настройки.</p><Link href={member ? '/import' : '/login?next=%2Fimport'} className={styles.textLink}>Начать со своей таблицы<ArrowUpRightIcon size={18} aria-hidden /></Link></div>
  </div></MarketingShell>
}

function StarterPreview({ example }: { example: ReturnType<typeof templateExampleFromDefinition> }) {
  const role = templatePreviewRole(example)
  const initial = templateAppPreview(example, role)
  initial.runtime.app.theme.accent = 'green'
  const signedIn = role === 'guest' && (example.app.customer || example.app.booking) ? templateAppPreview(example, 'client', 'irina@example.com', 'Ирина') : null
  if (signedIn) signedIn.runtime.app.theme.accent = 'green'
  return <div className={styles.runtimeTheme}><DeferredTemplatePreview initial={initial} signedIn={signedIn} /></div>
}
