import { describe, expect, it } from 'vitest'
import { TEMPLATES } from './catalog'
import { templateExample } from './presentation'
import { templateAppPreview } from './app-preview'
import { checkAppReferences } from '../app-references'
import { ANONYMOUS, asRole, canOpenScreen, visitorFor, writableFields } from '../app-roles'
import { draftFromAnonymous, revalidatePending } from '../pending-submission'

describe('ready customer scenarios across templates', () => {
  it('zayavki: preserves client instructions separately from internal notes and shows assigned masters their work details', () => {
    const example = templateExample('zayavki'), config = example.app.customer!
    const field = (key: string) => example.field('zayavki', key).id
    const requestNote = field('requestNote'), comment = field('comment'), photo = field('photo')
    const own = example.rows.find(row => row.tableId === config.tableId)!
    const proof = [{ id: 'visit-proof', key: 'marketing-example/visit.jpg', name: 'visit.jpg', mime: 'image/jpeg', size: 1, width: null, height: null }]
    example.rows = example.rows.map(row => row.tableId !== config.tableId ? row : { ...row, data: { ...row.data,
      [config.assignmentFieldId!]: row.id === own.id ? 'worker@example.invalid' : 'second-worker@example.invalid',
      ...(row.id === own.id ? { [field('client')]: [], [requestNote]: 'Домофон 42, предварительно позвоните.',
        [field('requestAddress')]: 'Адрес онлайн-заявки', [comment]: 'Внутренняя диагностика: нужен переходник.', [photo]: proof } : {}) } })

    const client = templateAppPreview(example, 'client', 'irina@example.com').runtime
    const request = client.tables[config.tableId]!.rows.find(row => row.id === own.id)!
    expect(request.data[requestNote]).toBe('Домофон 42, предварительно позвоните.')
    expect(request.data[field('requestAddress')]).toBe('Адрес онлайн-заявки')
    expect(request.data[field('price')]).toBe(own.data[field('price')])
    for (const key of ['comment', 'photo', 'clientName', 'phone', 'address', 'paid']) expect(request.data).not.toHaveProperty(field(key))
    const create = writableFields(example.app, config.tableId, asRole('client', 'irina@example.com', '', true), 'create')
    expect(create.has(requestNote)).toBe(true)
    expect(create.has(comment)).toBe(false)
    const form = client.app.screens.find(screen => screen.id === config.formScreenId)!
    if (form.type !== 'form') throw new Error('client form')
    expect(form.components.some(component => component.type === 'form_field' && component.fieldId === requestNote)).toBe(true)
    expect(form.components.some(component => component.type === 'form_field' && component.fieldId === comment)).toBe(false)

    const worker = templateAppPreview(example, 'staff', 'worker@example.invalid').runtime
    expect(worker.tables[config.tableId]!.rows.map(row => row.id)).toEqual([own.id])
    const work = worker.tables[config.tableId]!.rows[0]!
    expect(work.data[requestNote]).toBe(request.data[requestNote])
    expect(work.data[field('requestAddress')]).toBe(request.data[field('requestAddress')])
    expect(work.data[comment]).toBe('Внутренняя диагностика: нужен переходник.')
    expect(work.data[photo]).toEqual(proof)
    for (const key of ['price', 'paid', 'customerEmail', 'masterEmail']) expect(work.data).not.toHaveProperty(field(key))
    const writable = writableFields(example.app, config.tableId, asRole('staff', 'worker@example.invalid'), 'update')
    expect(writable.has(requestNote)).toBe(false)
    expect(writable.has(comment)).toBe(true)
    expect(writable.has(photo)).toBe(true)
    const edit = worker.app.screens.find(screen => screen.type === 'form' && screen.mode === 'edit' && screen.tableId === config.tableId)!
    if (edit.type !== 'form') throw new Error('worker form')
    expect(edit.components.find(component => component.type === 'form_field' && component.fieldId === comment)).toMatchObject({ label: 'Внутренние заметки' })
    expect(edit.components.some(component => component.type === 'form_field' && component.fieldId === requestNote)).toBe(false)
  })

  it('zayavki: exposes manual request lookup contacts only to its assigned master without opening the client directory or finances', () => {
    const example = templateExample('zayavki'), config = example.app.customer!
    const own = example.rows.find(row => row.tableId === config.tableId)!, field = (key: string) => example.field('zayavki', key).id
    const contacts = ['clientName', 'phone', 'address'].map(field)
    const clientId = (own.data[field('client')] as string[])[0]!
    const client = example.rows.find(row => row.id === clientId)!
    const secret = 'Закрытая заметка справочника клиентов'
    example.rows = example.rows.map(row => row.id === clientId ? { ...row, data: { ...row.data, [example.field('clients', 'note').id]: secret } }
      : row.tableId !== config.tableId ? row : { ...row, data: { ...row.data,
        [config.assignmentFieldId!]: row.id === own.id ? 'worker@example.invalid' : 'second-worker@example.invalid',
        ...(row.id === own.id ? { [config.emailFieldId]: '', [field('requestName')]: '', [field('requestPhone')]: '', [field('requestAddress')]: '' } : {}) } })
    const worker = templateAppPreview(example, 'staff', 'worker@example.invalid').runtime
    expect(worker.tables[config.tableId]!.rows.map(row => row.id)).toEqual([own.id])
    const request = worker.tables[config.tableId]!.rows[0]!
    for (const [index, key] of ['name', 'phone', 'address'].entries()) {
      expect(request.data[contacts[index]!]).toEqual([client.data[example.field('clients', key).id]])
    }
    expect(worker.tables[example.table('clients').id]?.rows ?? []).toHaveLength(0)
    expect(JSON.stringify(worker)).not.toContain(secret)
    for (const key of ['price', 'paid', 'customerEmail', 'masterEmail', 'client']) expect(request.data).not.toHaveProperty(field(key))
    const writable = writableFields(example.app, config.tableId, asRole('staff', 'worker@example.invalid'), 'update')
    for (const id of contacts) expect(writable.has(id)).toBe(false)
    const other = templateAppPreview(example, 'staff', 'second-worker@example.invalid').runtime
    expect(other.tables[config.tableId]!.rows.some(row => row.id === own.id)).toBe(false)
    const customer = templateAppPreview(example, 'client', 'irina@example.com').runtime
    expect(customer.tables[config.tableId]!.rows.some(row => row.id === own.id)).toBe(false)
  })

  it('dostavka: gives couriers delivery instructions, payment terms and proof only for assigned deliveries', () => {
    const example = templateExample('dostavka'), config = example.app.customer!
    const note = example.field('deliveries', 'note').id, pay = example.field('deliveries', 'pay').id, photo = example.field('deliveries', 'photo').id
    const own = example.rows.find(row => row.tableId === config.tableId)!
    const proof = [{ id: 'delivery-proof', key: 'marketing-example/proof.jpg', name: 'proof.jpg', mime: 'image/jpeg', size: 1, width: null, height: null }]
    example.rows = example.rows.map(row => row.tableId !== config.tableId ? row : { ...row, data: { ...row.data,
      [config.assignmentFieldId!]: row.id === own.id ? 'worker@example.invalid' : 'second-worker@example.invalid',
      [note]: row.id === own.id ? 'Домофон 42, вход со двора.' : 'Инструкция другой доставки', [photo]: proof } })

    const worker = templateAppPreview(example, 'staff', 'worker@example.invalid').runtime
    expect(worker.tables[config.tableId]!.rows.map(row => row.id)).toEqual([own.id])
    const delivery = worker.tables[config.tableId]!.rows[0]!
    expect(delivery.data[note]).toBe('Домофон 42, вход со двора.')
    expect(delivery.data[pay]).toBe(own.data[pay])
    expect(delivery.data[photo]).toEqual(proof)
    expect(delivery.data).not.toHaveProperty(config.emailFieldId)
    expect(delivery.data).not.toHaveProperty(config.assignmentFieldId!)
    const detail = worker.app.screens.find(screen => screen.type === 'detail' && screen.tableId === config.tableId)!
    if (detail.type !== 'detail') throw new Error('worker detail')
    expect(detail.components.some(component => component.type === 'field' && component.fieldId === photo)).toBe(true)

    const other = templateAppPreview(example, 'staff', 'second-worker@example.invalid').runtime
    expect(other.tables[config.tableId]!.rows.length).toBeGreaterThan(0)
    expect(other.tables[config.tableId]!.rows.some(row => row.id === own.id)).toBe(false)
    const client = templateAppPreview(example, 'client', 'irina@example.com').runtime
    expect(client.tables[config.tableId]!.rows).toHaveLength(2)
    expect(client.tables[config.tableId]!.rows.find(row => row.id === own.id)!.data[note]).toBe('Домофон 42, вход со двора.')
    expect(client.tables[config.tableId]!.rows.some(row => Object.hasOwn(row.data, pay) || Object.hasOwn(row.data, photo))).toBe(false)
    const writable = writableFields(example.app, config.tableId, asRole('staff', 'worker@example.invalid'), 'update')
    expect(writable.has(photo)).toBe(true)
    for (const field of [note, pay, config.emailFieldId, config.assignmentFieldId!]) expect(writable.has(field)).toBe(false)
  })

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
