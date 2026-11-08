import { describe, expect, it } from 'vitest'
import { TEMPLATES } from './catalog'
import { templateExample } from './presentation'
import { templateAppPreview, templatePreviewRole } from './app-preview'

describe('template phone previews', () => {
  it('opens a visible work screen when an internal template has a closed default customer role', () => {
    const example = templateExample('crm')
    expect(templateAppPreview(example, example.app.roles.find(role => role.isDefault)!.id).runtime.app.screens).toHaveLength(0)
    const preview = templateAppPreview(example, templatePreviewRole(example))
    expect(preview.runtime.app.screens.some(screen => screen.tab !== null)).toBe(true)
    expect(Object.values(preview.runtime.tables).some(table => table.rows.length > 0)).toBe(true)
    expect(templatePreviewRole(templateExample('zakazy'))).toBe('guest')
  })
  it('shows salon customer history without exposing other customers or employee contacts', () => {
    const example = templateExample('salon'), config = example.app.booking!
    const preview = templateAppPreview(example, 'client', 'irina@example.com', 'Ирина')
    const own = preview.runtime.tables[config.tables.visits]!.rows
    expect(own).toHaveLength(3)
    expect(own.some(row => row.data[config.visit.status] === config.statuses.cancelled)).toBe(true)
    expect(own.some(row => row.data[config.visit.status] === config.statuses.completed)).toBe(true)
    expect(JSON.stringify(preview.runtime)).not.toContain('Мария К.')
    expect(JSON.stringify(preview.runtime)).not.toContain('olga@example.com')
    expect(JSON.stringify(preview.bookingData)).not.toContain('irina@example.com')
    expect(JSON.stringify(preview.bookingData)).not.toContain('просила чуть теплее')
    expect(preview.bookingData!.schedule).toHaveLength(42)
  })
  it('uses each installed template’s real screens and keeps internal-only templates closed to customers', () => {
    for (const template of TEMPLATES) {
      const example = templateExample(template.id)
      const role = template.production ? 'director' : template.inventory ? 'staff' : 'manager'
      const preview = templateAppPreview(example, role)
      expect(preview.runtime.app.screens.length, template.id).toBeGreaterThan(0)
      if (template.internalOnly || !template.customer && !template.portal && template.id !== 'salon') {
        const customer = templateAppPreview(example, 'client', 'preview@example.invalid')
        expect(customer.runtime.app.screens.length, template.id).toBe(0)
      }
    }
  })
  it('does not expose private source fields through a public form-prefill button', () => {
    const example = templateExample('portal'), services = example.table('services').id
    const card = example.app.screens.find(screen => screen.type === 'detail' && screen.tableId === services)!
    if (card.type !== 'detail') throw new Error('fixture')
    const button = card.components.find(component => component.type === 'button')!
    if (button.type !== 'button' || button.action.type !== 'open_screen') throw new Error('fixture')
    button.action.initialValues = { [example.field('orders', 'title').id]: { kind: 'field', fieldId: example.field('services', 'cost').id } }
    for (const [role, email] of [['guest', null], ['client', 'petrov@example.ru']] as const) {
      const { runtime } = templateAppPreview(example, role, email)
      const projected = runtime.app.screens.find(screen => screen.id === card.id)!
      if (projected.type !== 'detail') throw new Error('fixture')
      expect(projected.components.some(component => component.id === button.id)).toBe(false)
      expect(JSON.stringify(runtime)).not.toContain(example.field('services', 'cost').id)
    }
  })
})
