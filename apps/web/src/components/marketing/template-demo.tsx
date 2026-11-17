import { TEMPLATES } from '@/lib/templates/catalog'
import { TemplateExample } from './template-example'
import { BookingTemplateDemo } from './booking-template-demo'
import { DispatchDemo } from '@/components/builder/v2/dispatch-demo'
import { ProjectsDemo } from '@/components/builder/v2/projects-demo'

export const TEMPLATE_DEMO_IDS = TEMPLATES.map(template => template.id)
export function TemplateDemo({ id }: { id: string }) {
  if (id === 'salon') return <BookingTemplateDemo />
  if (id === 'zayavki') return <DispatchDemo />
  if (id === 'proekty') return <ProjectsDemo />
  return <div className="space-y-5"><TemplateExample id={id} /></div>
}
