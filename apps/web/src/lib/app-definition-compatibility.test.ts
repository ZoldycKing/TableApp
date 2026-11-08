import { appSchema } from '@tableapp/schema'
import { readAppDefinition } from '@tableapp/schema/app-definition'
import { describe, expect, it, vi } from 'vitest'
import { TEMPLATES } from './templates/catalog'
import { templateExample } from './templates/presentation'
import { templateAppPreview } from './templates/app-preview'

describe('version-aware reading preserves legacy template access', () => {
  it('keeps every installed template and its role projections equivalent', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-01T05:00:00.000Z'))
    try {
      for (const template of TEMPLATES) {
        const example = templateExample(template.id), stored: unknown = JSON.parse(JSON.stringify(example.app))
        const before = appSchema.parse(stored), read = readAppDefinition(stored)
        expect(read.ok, template.id).toBe(true)
        if (!read.ok || read.formatVersion !== 1) throw new Error(`Legacy template was not readable: ${template.id}`)
        expect(read.app, template.id).toEqual(before)
        const original = JSON.stringify(stored)
        const variants = new Set(['guest', ...example.app.roles.map(role => role.id)])
        for (const role of variants) {
          const oldProjection = templateAppPreview({ ...example, app: before }, role, role === 'guest' ? null : 'irina@example.com')
          const newProjection = templateAppPreview({ ...example, app: read.app }, role, role === 'guest' ? null : 'irina@example.com')
          expect(newProjection, `${template.id}: ${role}`).toEqual(oldProjection)
        }
        expect(JSON.stringify(stored)).toBe(original)
      }
    } finally { vi.useRealTimers() }
  })
})
