import { describe, expect, it } from 'vitest'
import { newId } from '@tableapp/schema'
import { templateExample } from './presentation'
import { preparePortalUpgrade } from './portal-upgrade'

const fixture = () => {
  const example = templateExample('portal'), table = example.table('orders')
  const form = example.app.screens.find(screen => screen.type === 'form' && screen.mode === 'create')!
  if (form.type !== 'form') throw new Error('wrong fixture')
  const oldForm = { ...form, access: { ...form.access, roles: [] }, components: [...form.components,
    { id: newId('component'), position: 'z', type: 'form_field' as const, fieldId: example.field('orders', 'email').id,
      label: 'Почта', roles: null, visibleWhen: null, required: false, placeholder: null }] }
  const app = { ...example.app, screens: example.app.screens.map(screen => screen.id === form.id ? oldForm : screen) }
  return { ...example, app, table }
}

describe('compatible portal upgrade', () => {
  it('preserves IDs, other screens, allowlist and ownership rules and is idempotent', () => {
    const example = fixture(), source = structuredClone(example.app)
    const upgraded = preparePortalUpgrade(example.app, example.table, example.byTable.get(example.table.id)!)
    expect(example.app).toEqual(source)
    expect(upgraded.app.allowlist).toEqual(source.allowlist)
    expect(upgraded.app.rowAccessRules).toEqual(source.rowAccessRules)
    expect(upgraded.app.screens.map(screen => screen.id)).toEqual(source.screens.map(screen => screen.id))
    const form = upgraded.app.screens.find(screen => screen.type === 'form' && screen.mode === 'create')!
    expect(form.access.roles).toEqual(['client'])
    if (form.type !== 'form') throw new Error('wrong fixture')
    expect(form.components.some(component => component.type === 'form_field' && component.fieldId === example.field('orders', 'email').id)).toBe(false)
    expect(preparePortalUpgrade(upgraded.app, example.table, example.byTable.get(example.table.id)!).app).toEqual(upgraded.app)
  })
  it('refuses foreign tables, missing ownership rules and custom public internal fields', () => {
    const example = fixture(), columns = example.byTable.get(example.table.id)!
    expect(() => preparePortalUpgrade(example.app, { ...example.table, workspaceId: 'foreign-business' }, columns)).toThrow('Портал доработан')
    expect(() => preparePortalUpgrade({ ...example.app, rowAccessRules: [] }, example.table, columns)).toThrow('Портал доработан')
    const form = example.app.screens.find(screen => screen.type === 'form' && screen.mode === 'create')!
    if (form.type !== 'form') throw new Error('wrong fixture')
    form.components.push({ id: newId('component'), position: 'zz', type: 'form_field', fieldId: example.field('orders', 'status').id,
      label: null, roles: null, visibleWhen: null, required: false, placeholder: null })
    expect(() => preparePortalUpgrade(example.app, example.table, columns)).toThrow('Портал доработан')
  })
})
