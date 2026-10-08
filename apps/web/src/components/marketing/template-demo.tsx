import { TEMPLATES } from '@/lib/templates/catalog'
import { TemplateExample } from './template-example'
import { MotionStory } from './motion-lab/motion-lab'

export const TEMPLATE_DEMO_IDS = TEMPLATES.map(template => template.id)
export function TemplateDemo({ id }: { id: string }) {
  return <div className="space-y-5">
    {id === 'zayavki' ? <div><p className="mb-2 text-[13px] font-medium text-ink">Иллюстрация доски в рабочем пространстве</p><MotionStory variantId="workflow" /><p className="mt-2 text-xs text-ink-muted">Перетаскивание карточки меняет статус заявки. В приложении статус меняют через форму.</p></div> : null}
    <TemplateExample id={id} />
  </div>
}
