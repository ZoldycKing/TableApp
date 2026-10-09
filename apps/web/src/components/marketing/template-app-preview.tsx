import { AppShell } from '@/components/runtime/app-shell'
import { templateAppPreview } from '@/lib/templates/app-preview'
import type { templateExample } from '@/lib/templates/presentation'
import { DeviceFrame } from './demo-stage'

export function TemplateAppPreview({ example, role, email, name, title, note, tableId }: {
  example: ReturnType<typeof templateExample>; role: string; email?: string; name?: string; title: string; note: string; tableId?: string
}) {
  const { runtime, viewer, bookingData } = templateAppPreview(example, role, email, name)
  const initial = tableId ? runtime.app.screens.find(screen => (screen.type === 'list' || screen.type === 'tiles') &&
    example.views.find(view => view.id === screen.source.viewId)?.tableId === tableId)?.id : undefined
  return <figure className="m-0 min-w-0 max-w-full">
    <figcaption className="mb-3 text-[13px] font-medium text-ink">{title}</figcaption>
    <div className="mx-auto w-full max-w-[25rem]">
      <DeviceFrame device="mobile" height={640} bezel={12}>
        <AppShell runtime={runtime} viewer={viewer} demo initialScreenId={initial} demoBookingData={bookingData} />
      </DeviceFrame>
    </div>
    <p className="mt-3 text-xs leading-relaxed text-ink-muted">{note}</p>
    <p className="mt-1 text-xs text-ink-muted">Учебные данные. Разделы и карточки можно открыть; изменения не сохраняются.</p>
  </figure>
}
