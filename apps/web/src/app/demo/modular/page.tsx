import { SiteHeader } from '@/components/marketing/site-header'
import { SiteFooter } from '@/components/marketing/site-footer'
import { TemplateAppPreview } from '@/components/marketing/template-app-preview'
import { modularPilotExample } from '@/lib/templates/modular-pilot-example'
import { pageMetadata } from '@/lib/seo'
import { currentMember } from '@/lib/session'

export const dynamic = 'force-dynamic'
export const metadata = pageMetadata({ path: '/demo/modular', title: 'Проверка модульного приложения', description: 'Услуги и товары в одном приложении бизнеса: каталог, запись и личный кабинет.' })

export default async function ModularDemoPage() {
  const example = modularPilotExample()
  return <><SiteHeader signedIn={Boolean(await currentMember())} /><main className="mx-auto max-w-5xl px-6 py-12">
    <h1 className="text-3xl font-semibold tracking-tight">Услуги и товары в одном приложении</h1>
    <p className="mt-4 max-w-2xl text-sm leading-relaxed text-ink-muted">Предпросмотр связки «салон + товары». Один каталог, отдельные формы записи и заказа, общий кабинет этого бизнеса. Это учебные данные: код 123456 показывает вход, письма не отправляются и обращения не сохраняются. Оплату согласует сотрудник.</p>
    <div className="mt-8 grid gap-8 md:grid-cols-2">
      <TemplateAppPreview example={example} role="guest" title="Первое посещение: общий каталог"
        note="Откройте услугу или товар. Вход появляется после кнопки оформления, а личные данные — после подтверждения почты." />
      <TemplateAppPreview example={example} role="client" email="irina@example.com" name="Ирина" tableId={example.app.booking!.tables.visits} title="После входа: кабинет бизнеса"
        note="Записи и заказы находятся в отдельных разделах одного приложения. Клиенту доступны его обращения и история." />
    </div>
  </main><SiteFooter /></>
}
