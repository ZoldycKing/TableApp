import Link from 'next/link'
import { ArrowUpRightIcon } from '@phosphor-icons/react/ssr'
import { InteractiveDemo } from '@/components/marketing/interactive-demo'
import { MarketingShell } from '@/components/marketing/blocks'
import { ANONYMOUS_ID, resolveDemoView, type DemoParams } from '@/lib/demo-view'
import { DEMO_CLIENT_EMAIL, loadDemoWorkspace } from '@/lib/demo-runtime'
import { currentMember } from '@/lib/session'
import { pageMetadata } from '@/lib/seo'
import { PersonalSectionsDemo } from '@/components/marketing/elaya/personal-demo'
import { TableAppStory } from '@/components/marketing/elaya/table-app-story'
import styles from '@/components/marketing/elaya/inner-pages.module.css'
import personal from '@/components/marketing/elaya/personal-demo.module.css'

export const dynamic = 'force-dynamic'
export const metadata = pageMetadata({ path: '/demo', title: 'Попробуйте TableApp без регистрации', description: 'Посмотрите, как сотрудники и клиенты работают с одними данными. Попробуйте бизнес-приложение без регистрации или откройте личный пример.' })

export default async function DemoPage({ searchParams }: { searchParams: Promise<DemoParams & { mode?: string }> }) {
  const [member, params] = await Promise.all([currentMember(), searchParams])
  const business = params.mode !== 'personal'
  const data = loadDemoWorkspace(), app = data.app
  const { role, device, deviceChosen } = resolveDemoView(app, params.role || params.rol ? params : { ...params, role: 'staff' }, DEMO_CLIENT_EMAIL)
  const seen = new Set<string>()
  const roles = [{ id: ANONYMOUS_ID, name: 'Гость' }]
  for (const item of app.roles) {
    const screens = app.screens.filter(screen => screen.access.roles.includes(item.id)).map(screen => screen.id).join(',')
    if (screens && !seen.has(screens) || item.id === role) { roles.push({ id: item.id, name: item.name }); seen.add(screens) }
  }
  return <MarketingShell signedIn={Boolean(member)}><div className={styles.page}>
    <header className={styles.demoIntro} data-demo-background><div><span className={styles.eyebrow}>Попробуйте без регистрации</span><h1>{business ? 'Одни данные. Работа всей команды.' : 'Посмотрите, что получится.'}</h1><p>{business ? 'На примере сервисного центра: измените статус как сотрудник и посмотрите результат глазами клиента.' : 'Три таблицы превращаются в приложение с проектами, делами и бюджетом. Переключайте разделы, открывайте карточки и попробуйте завершить проект.'}</p></div><Link href={member ? '/import' : '/login?next=%2Fimport'} className={styles.textLink}>Загрузить свою таблицу<ArrowUpRightIcon size={18} aria-hidden /></Link></header>
    <nav className={personal.demoChoices} aria-label="Выбор примера"><Link href="/demo" aria-current={business ? 'page' : undefined}>Для бизнеса и команды</Link><Link href="/demo?mode=personal" aria-current={!business ? 'page' : undefined}>Личное использование</Link></nav>
    {business ? <InteractiveDemo key={data.app.id} data={data} initialRole={role} device={device} deviceChosen={deviceChosen} roles={roles} /> : <><TableAppStory audience="personal" /><section className={personal.demoSections} aria-labelledby="demo-sections-title"><div><h2 id="demo-sections-title">Разделы под ваши задачи</h2><p>Выберите планы, расходы или книги. В своём приложении названия и поля настраиваете вы.</p></div><PersonalSectionsDemo /></section></>}
    <div className={styles.demoAfter} data-demo-background><p>{business ? 'Для рабочих задач можно начать с готового шаблона.' : 'Теперь попробуйте со своими данными.'}</p><Link href={business ? '/templates' : member ? '/import' : '/login?next=%2Fimport'} className={styles.primary}>{business ? 'Выбрать шаблон' : 'Загрузить свою таблицу'}<ArrowUpRightIcon size={20} aria-hidden /></Link></div>
  </div></MarketingShell>
}
