import { TEMPLATES } from '@/lib/templates/catalog'
import { TemplateExample } from './template-example'
import { BookingTemplateDemo } from './booking-template-demo'
import { DispatchDemo } from '@/components/builder/v2/dispatch-demo'

export const TEMPLATE_DEMO_IDS = TEMPLATES.map(template => template.id)
export function TemplateDemo({ id }: { id: string }) {
  if (id === 'salon') return <BookingTemplateDemo />
  if (id === 'zayavki') return <DispatchDemo />
  return <div className="space-y-5"><TemplateExample id={id} /></div>
}
