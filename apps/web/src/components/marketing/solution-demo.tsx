import { TemplateDemo } from './template-demo'

const TEMPLATES_BY_SOLUTION: Record<string, string> = {
  'client-portal': 'zakazy', 'order-management': 'zayavki', production: 'proizvodstvo',
  'employee-app': 'zayavki', warehouse: 'sklad', catalog: 'zakazy',
}
export const DEMO_SLUGS = Object.keys(TEMPLATES_BY_SOLUTION)
export function SolutionDemo({ slug }: { slug: string }) {
  const id = TEMPLATES_BY_SOLUTION[slug]
  return id ? <TemplateDemo id={id} /> : null
}
