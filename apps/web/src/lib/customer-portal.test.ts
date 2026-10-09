import { describe, expect, it } from 'vitest'
import { ANONYMOUS, asRole, canEnter, visitorFor, visibleScreensFor, writableFields } from './app-roles'
import { projectRuntime } from './runtime-project'
import { revalidatePending } from './pending-submission'
import { templateExample } from './templates/presentation'
import { TEMPLATES } from './templates/catalog'
import { previewRuntime } from './preview-runtime'

const project = (example: ReturnType<typeof templateExample>, visitor: ReturnType<typeof asRole>) =>
  projectRuntime({ ...example.app, screens: visibleScreensFor(example.app, visitor) }, visitor, Object.fromEntries(example.views.map(view => [view.id, view])),
    example.built.tables, example.byTable, example.rows.map(row => ({ ...row, version: 0 })),
    new Map(example.built.tables.map(table => [table.id, table.primaryFieldId])))

describe('one customer identity, isolated business portals', () => {
  it('a shared login is external in a new business and never carries an employee role', () => {
    const first = templateExample('portal'), second = templateExample('portal')
    first.app.allowlist = [{ email: 'person@example.invalid', roleId: 'manager', company: 'First' }]
    expect(visitorFor(first.app, 'person@example.invalid')).toMatchObject({ roleId: 'manager', enrolled: false, company: 'First' })
    expect(visitorFor(second.app, 'person@example.invalid')).toMatchObject({ roleId: 'client', enrolled: true, company: '' })
  })

  it('the customer can finish the first verified request and submit another one', () => {
    const example = templateExample('portal'), table = example.table('orders')
    const form = example.app.screens.find(screen => screen.type === 'form' && screen.mode === 'create')!
    const visitor = visitorFor(example.app, 'person@example.invalid')
    const values = { [example.field('orders', 'title').id]: 'Request', [example.field('orders', 'sum').id]: 0,
      [example.field('orders', 'status').id]: 'fake-status' }
    const checked = revalidatePending(example.app, { screenId: form.id, tableId: table.id, values }, example.fields, visitor)
    expect(checked).toEqual({ ok: true, values: { [example.field('orders', 'title').id]: 'Request' } })
    expect(writableFields(example.app, table.id, visitor, 'create').size).toBeGreaterThan(0)
    expect(writableFields(example.app, table.id, visitor, 'update').size).toBe(0)
  })

  it('returns only own requests while the public price list stays available after login', () => {
    const example = templateExample('portal'), email = example.field('orders', 'email').id
    const own = example.rows.find(row => row.tableId === example.table('orders').id)!
    own.data[email] = 'person@example.invalid'
    const runtime = project(example, visitorFor(example.app, 'person@example.invalid'))
    expect(runtime.tables[example.table('orders').id]!.rows.map(row => row.id)).toEqual([own.id])
    expect(runtime.tables[example.table('services').id]!.rows.length).toBeGreaterThan(0)
    expect(JSON.stringify(runtime)).not.toContain(example.field('orders', 'note').id)
    expect(runtime.tables[example.table('services').id]!.fields.map(field => field.id)).not.toContain(example.field('services', 'cost').id)
  })

  it('removing an ownership rule closes private data without hiding public services', () => {
    const example = templateExample('portal')
    example.app.rowAccessRules = []
    const runtime = project(example, visitorFor(example.app, 'person@example.invalid'))
    expect(runtime.tables[example.table('orders').id]!.rows).toEqual([])
    expect(runtime.tables[example.table('services').id]!.rows.length).toBeGreaterThan(0)
    const metrics = Object.values(runtime.blocks).filter(value => value.kind === 'metric')
    expect(metrics.every(value => value.kind === 'metric' && !/[1-9]/.test(value.text))).toBe(true)
    example.app.allowlist = [{ email: 'person@example.invalid', roleId: 'client', company: '' }]
    const invited = visitorFor(example.app, 'person@example.invalid')
    expect(project(example, invited).tables[example.table('orders').id]!.rows).toEqual([])
    const preview = previewRuntime(example.app, example.views, Object.fromEntries(example.built.tables.map(table => [table.id,
      { ...table, fields: example.byTable.get(table.id)!, rows: example.rows.filter(row => row.tableId === table.id).map(row => ({ ...row, version: 0 })) }])), {}, invited)
    expect(preview.tables[example.table('orders').id]!.rows).toEqual([])
    expect(preview.tables[example.table('services').id]!.rows.length).toBeGreaterThan(0)
  })

  it('internal template defaults do not invite customers into employee screens', () => {
    for (const template of TEMPLATES) {
      if (['portal', 'zayavki', 'sklad', 'proizvodstvo', 'salon'].includes(template.id)) continue
      const { app } = templateExample(template.id)
      expect(canEnter(app, asRole('client', 'person@example.invalid')), template.id).toBe(false)
      expect(canEnter(app, ANONYMOUS), template.id).toBe(false)
      expect(canEnter(app, asRole('manager')), template.id).toBe(true)
    }
  })
})
