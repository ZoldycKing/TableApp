import { describe, expect, it } from 'vitest'
import { TEMPLATES } from './catalog'
import { templateExample } from './presentation'
import { templateAppPreview } from './app-preview'

describe('template phone previews', () => {
  it('shows salon customer history without exposing other customers or employee contacts', () => {
    const example = templateExample('salon'), config = example.app.booking!
    const preview = templateAppPreview(example, 'client', 'irina@example.com', 'Ирина')
    const own = preview.runtime.tables[config.tables.visits]!.rows
    expect(own).toHaveLength(2)
    expect(own.some(row => row.data[config.visit.status] === config.statuses.cancelled)).toBe(true)
    expect(JSON.stringify(preview.runtime)).not.toContain('Мария К.')
    expect(JSON.stringify(preview.runtime)).not.toContain('olga@example.com')
    expect(JSON.stringify(preview.bookingData)).not.toContain('irina@example.com')
    expect(JSON.stringify(preview.bookingData)).not.toContain('просила чуть теплее')
    expect(preview.bookingData!.schedule).toHaveLength(42)
  })
  it('uses each installed template’s existing screens and keeps unfinished customer scenarios closed', () => {
    for (const template of TEMPLATES) {
      const example = templateExample(template.id)
      const role = template.production ? 'director' : template.inventory ? 'staff' : 'manager'
      const preview = templateAppPreview(example, role)
      expect(preview.runtime.app.screens.length, template.id).toBeGreaterThan(0)
      if (!template.portal && template.id !== 'salon') {
        const customer = templateAppPreview(example, 'client', 'preview@example.invalid')
        expect(customer.runtime.app.screens.length, template.id).toBe(0)
      }
    }
  })
})
