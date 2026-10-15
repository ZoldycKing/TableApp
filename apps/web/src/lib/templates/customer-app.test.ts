import { describe, expect, it } from 'vitest'
import { TEMPLATES } from './catalog'
import { templateExample } from './presentation'
import { templateAppPreview } from './app-preview'
import { checkAppReferences } from '../app-references'
import { ANONYMOUS, canOpenScreen, visitorFor, writableFields } from '../app-roles'
import { draftFromAnonymous, revalidatePending } from '../pending-submission'

describe('ready customer scenarios across templates', () => {
  it.each(['zakazy', 'katalog'])('%s: uses a separate terminal return status and validates its binding', id => {
    const example = templateExample(id), config = example.app.customer!, returned = config.stock!.returnedStatus!
    const catalog = { tableIds: new Set(example.built.tables.map(table => table.id)), fields: new Map(example.fields.map(field => [field.id, field])), views: new Map(example.views.map(view => [view.id, view])) }
    const status = example.fields.find(field => field.id === config.statusFieldId)!
    expect(status.type === 'single_select' && status.options.choices.find(choice => choice.id === returned)?.name).toBe('Возвращён')
    expect(config.terminalStatuses).toContain(returned)
    expect(config.cancellableStatuses).not.toContain(returned)
    for (const invalid of [config.cancelStatus, config.logistics!.deliveredStatus, config.stock!.confirmedStatus, 'missing-status']) {
      const changed = structuredClone(example.app)
      changed.customer!.stock!.returnedStatus = invalid
      expect(checkAppReferences(changed, catalog)).not.toBeNull()
    }
    const legacy = structuredClone(example.app)
    delete legacy.customer!.stock!.returnedStatus
    expect(checkAppReferences(legacy, catalog)).toBeNull()
  })
  for (const template of TEMPLATES.filter(template => template.customer && !template.internalOnly)) {
    it(`${template.id}: first/repeat intake, own history and assigned staff are isolated`, () => {
      const example = templateExample(template.id), config = example.app.customer!
      expect(checkAppReferences(example.app, { tableIds: new Set(example.built.tables.map(table => table.id)), fields: new Map(example.fields.map(field => [field.id, field])), views: new Map(example.views.map(view => [view.id, view])) })).toBeNull()
      const customer = templateAppPreview(example, 'client', 'irina@example.com', 'Ирина')
      expect(customer.runtime.business?.name).toBeTruthy()
      expect(customer.runtime.tables[config.tableId]!.rows).toHaveLength(2)
      expect(customer.runtime.tables[config.tableId]!.rows.some(row => config.terminalStatuses.includes(String(row.data[config.statusFieldId])))).toBe(true)
      expect(JSON.stringify(customer.runtime)).not.toContain('other2@example.invalid')
      expect(JSON.stringify(customer.runtime)).not.toContain('worker@example.invalid')
      const form = example.app.screens.find(screen => screen.id === config.formScreenId)!
      expect(canOpenScreen(form, ANONYMOUS)).toBe(false)
      const guest = templateAppPreview(example, 'guest').runtime
      expect(guest.app.screens.some(screen => screen.type === 'form')).toBe(false)
      expect(guest.app.screens.filter(screen => screen.tab)).toHaveLength(1)
      const card = guest.app.screens.find(screen => screen.id === config.catalog!.detailScreenId)
      if (!config.cart) expect(card?.type === 'detail' && card.components.some(component => component.type === 'button' && component.action.type === 'open_screen' && component.action.screenId === config.formScreenId)).toBe(true)
      const visitor = visitorFor(example.app, 'new-person@example.invalid')
      const allowed = writableFields(example.app, config.tableId, visitor, 'create')
      expect(allowed.has(config.statusFieldId)).toBe(false)
      expect(allowed.has(config.emailFieldId)).toBe(false)
      expect(writableFields(example.app, config.tableId, visitor, 'update').size).toBe(0)
      const values: Record<string, unknown> = {}
      if (form.type !== 'form') throw new Error('form')
      for (const component of form.components) if (component.type === 'form_field' && component.required) {
        const field = example.fields.find(field => field.id === component.fieldId)!
        values[field.id] = field.type === 'relation' ? [example.rows.find(row => row.tableId === field.options.tableId)!.id] : field.type === 'phone' ? '+7 900 000-00-00' : 'Тестовое обращение'
      }
      values[config.statusFieldId] = config.terminalStatuses[0]
      const draft = draftFromAnonymous(example.app, form, values)
      expect(draft.ok).toBe(false)
      const pending = revalidatePending(example.app, { screenId: form.id, tableId: config.tableId, values }, example.fields, visitor)
      expect(pending.ok).toBe(true)
      if (pending.ok) expect(config.statusFieldId in pending.values).toBe(false)
      const staff = templateAppPreview(example, 'staff', 'unassigned@example.invalid')
      expect(staff.runtime.tables[config.tableId]?.rows ?? []).toHaveLength(0)
      expect(canOpenScreen(example.app.screens.find(screen => screen.id === config.listScreenId)!, visitorFor(example.app, 'new-person@example.invalid'))).toBe(true)
    })
  }
})
