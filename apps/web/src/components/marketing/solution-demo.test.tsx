import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { SolutionDemo } from './solution-demo'
import { TemplateExample } from './template-example'
import { templateAppPreview } from '@/lib/templates/app-preview'
import { templateExample } from '@/lib/templates/presentation'
import { employeeExample } from '@/lib/templates/employee-example'

vi.mock('./template-app-preview', () => ({ TemplateAppPreview: (props: { role: string; title: string; email?: string; note: string; screenId?: string; example: ReturnType<typeof templateExample> }) => <div data-role={props.role} data-email={props.email} data-production-form={Boolean(props.screenId && props.screenId === props.example.app.production?.formScreenId)}>{props.title}<p>{props.note}</p></div> }))
vi.mock('./motion-lab/motion-lab', () => ({ MotionStory: () => null }))

describe('solution demo roles', () => {
  it.each(['employee-app', 'order-management'])('shows a master and dispatcher for %s', slug => {
    const html = renderToStaticMarkup(<SolutionDemo slug={slug} />)
    expect(html).toContain('У мастера: назначенные ему заявки')
    expect(html).toContain('У диспетчера: все заявки')
    expect(html).toContain('data-role="staff"')
    expect(html).not.toContain('data-role="guest"')
    expect(html).not.toContain('data-role="client"')
    expect(html).toContain('worker@example.invalid')
  })
  it('keeps the customer and booking examples in their corresponding scenarios', () => {
    expect(renderToStaticMarkup(<SolutionDemo slug="client-portal" />)).toContain('data-role="client"')
    const salon = renderToStaticMarkup(<TemplateExample id="salon" />)
    expect(salon).toContain('Услуги, цена и длительность')
    expect(salon).toContain('перенести или отменить')
  })
  it('shows actual assigned work and strips financial fields from the master preview', () => {
    const { example, email } = employeeExample('zayavki'), config = example.app.customer!
    const preview = templateAppPreview(example, 'staff', email).runtime
    const visible = preview.tables[config.tableId]!.rows
    expect(visible.length).toBeGreaterThan(0)
    expect(visible.length).toBeLessThan(example.rows.filter(row => row.tableId === config.tableId).length)
    expect(visible.every(row => row.data[example.field('zayavki', 'master').id] === undefined || row.data[example.field('zayavki', 'master').id] === 'Сергей')).toBe(true)
    const price = example.field('zayavki', 'price').id
    expect(visible.every(row => !(price in row.data))).toBe(true)
    expect(templateAppPreview(example, 'staff', 'unassigned@example.invalid').runtime.tables[config.tableId]?.rows ?? []).toHaveLength(0)
  })
  it.each([
    ['client-portal', 'client'], ['catalog', 'guest'], ['warehouse', 'staff'], ['production', 'foreman'],
  ])('focuses %s on one relevant working role', (slug, role) => {
    const html = renderToStaticMarkup(<SolutionDemo slug={slug} />)
    expect(html.match(/data-role=/g)).toHaveLength(1)
    expect(html).toContain(`data-role="${role}"`)
    if (slug === 'production') {
      expect(html).toContain('data-production-form="true"')
      const example = templateExample('proizvodstvo')
      expect(templateAppPreview(example, 'foreman').runtime.app.screens.some(screen => screen.id === example.app.production!.formScreenId)).toBe(true)
    }
  })
})
