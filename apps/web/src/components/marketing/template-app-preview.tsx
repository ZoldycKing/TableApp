import { DeferredTemplatePreview } from './deferred-preview'
import { templateAppPreview } from '@/lib/templates/app-preview'
import type { templateExample } from '@/lib/templates/presentation'
import { PhoneMockup } from '@/components/phone-mockup'
import styles from './elaya/inner-pages.module.css'

export function TemplateAppPreview({ example, role, email, name, title, note, tableId, screenId }: {
  example: ReturnType<typeof templateExample>; role: string; email?: string; name?: string; title: string; note: string; tableId?: string; screenId?: string
}) {
  const initialPreview = templateAppPreview(example, role, email, name)
  const { runtime } = initialPreview
  const signedIn = role === 'guest' && (example.app.customer || example.app.booking) ? templateAppPreview(example, 'client', 'irina@example.com', 'Ирина') : null
  runtime.app.theme.accent = 'green'
  if (signedIn) signedIn.runtime.app.theme.accent = 'green'
  const initial = runtime.app.screens.find(screen => screen.id === screenId)?.id ?? (tableId ? runtime.app.screens.find(screen => (screen.type === 'list' || screen.type === 'tiles') &&
    example.views.find(view => view.id === screen.source.viewId)?.tableId === tableId)?.id : undefined)
  return <figure className="m-0 min-w-0 max-w-full">
    <figcaption className="mb-4 text-sm font-medium text-ink">{title}</figcaption>
    <div className="mx-auto w-full max-w-[25rem]">
      <PhoneMockup height={640}>
        <div className={styles.runtimeTheme} style={{ height: '100%', minHeight: 0 }}><DeferredTemplatePreview initial={initialPreview} signedIn={signedIn} initialScreenId={initial} /></div>
      </PhoneMockup>
    </div>
    <p className="mt-3 text-xs leading-relaxed text-ink-muted">{note}</p>
    <p className="mt-1 text-xs text-ink-muted">Учебные данные. Разделы и карточки можно открыть; изменения не сохраняются.</p>
  </figure>
}
