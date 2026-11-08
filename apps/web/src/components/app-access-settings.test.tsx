// @vitest-environment jsdom
import { useState } from 'react'
import { cleanup, fireEvent, render, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { App } from '@tableapp/schema'
import { templateExample } from '@/lib/templates/presentation'
import { visitorFor } from '@/lib/app-roles'
import { composeModules } from '@/lib/module-composition'
import { AppAccessSettings } from './app-access-settings'

afterEach(cleanup)
function setup(initial: App) {
  const change = vi.fn()
  const example = templateExample('zakazy')
  const tables = example.built.tables.map(table => ({ ...table, primaryFieldId: null, fields: example.fields.filter(field => field.tableId === table.id) }))
  function Editor() {
    const [app, setApp] = useState(initial)
    return <AppAccessSettings app={app} tables={tables} onChange={next => { change(next); setApp(next) }} />
  }
  return { ...render(<Editor />), change, tables }
}

describe('application access editing', () => {
  it('renames a role without changing role IDs, assignments or row restrictions', () => {
    const app = templateExample('zakazy').app
    const ui = setup(app), role = app.roles[0]!
    const input = ui.getByRole('textbox', { name: `Название роли «${role.name}»` })
    fireEvent.change(input, { target: { value: 'Оператор' } }); fireEvent.blur(input)
    const next = ui.change.mock.lastCall![0] as App
    expect(next.roles[0]).toEqual({ ...role, name: 'Оператор' })
    expect(next.allowlist).toBe(app.allowlist)
    expect(next.rowAccessRules).toBe(app.rowAccessRules)
    expect(next.screens).toBe(app.screens)
    expect(ui.getByRole('button', { name: 'Удалить роль «Оператор»' })).toBeTruthy()
  })

  it('sets exactly one default role and keeps explicit assignments unchanged', () => {
    const base = templateExample('zakazy').app
    const app = { ...base, accessMode: 'public' as const, allowlist: [{ email: 'worker@example.invalid', roleId: base.roles[0]!.id, company: 'Мастерская' }] }
    const role = app.roles.find(role => !role.isDefault)!, ui = setup(app)
    fireEvent.change(ui.getByRole('combobox', { name: 'Роль по умолчанию' }), { target: { value: role.id } })
    const next = ui.change.mock.lastCall![0] as App
    expect(next.roles.filter(role => role.isDefault).map(role => role.id)).toEqual([role.id])
    expect(visitorFor(next, 'new@example.invalid').roleId).toBe(role.id)
    expect(next.allowlist).toBe(app.allowlist)
    expect(next.rowAccessRules).toBe(app.rowAccessRules)
  })

  it('edits a labelled email, role and organization without dropping other entry data', () => {
    const base = templateExample('zakazy').app
    const app = { ...base, allowlist: [{ email: 'worker@example.invalid', roleId: base.roles[0]!.id, company: 'Мастерская' }] }
    const ui = setup(app), email = ui.getByRole('textbox', { name: 'Почта участника 1' })
    fireEvent.change(email, { target: { value: 'New@Example.invalid' } }); fireEvent.blur(email)
    const role = base.roles[1]!
    fireEvent.change(ui.getByRole('combobox', { name: 'Роль для new@example.invalid' }), { target: { value: role.id } })
    const company = ui.getByRole('textbox', { name: 'Организация для new@example.invalid' })
    fireEvent.change(company, { target: { value: 'Цех' } }); fireEvent.blur(company)
    expect(ui.change.mock.lastCall![0].allowlist).toEqual([{ email: 'new@example.invalid', roleId: role.id, company: 'Цех' }])
    fireEvent.click(ui.getByRole('button', { name: 'Убрать доступ для new@example.invalid' }))
    expect(ui.change.mock.lastCall![0].allowlist).toEqual([])
    expect(ui.change.mock.lastCall![0].rowAccessRules).toBe(app.rowAccessRules)
  })

  it('names restriction fields and keeps changes local to the selected rule', () => {
    const app = templateExample('zakazy').app, ui = setup(app)
    const group = within(ui.getByRole('group', { name: 'Ограничение 1' }))
    expect(group.getByRole('combobox', { name: 'Таблица' })).toBeTruthy()
    expect(group.getByRole('combobox', { name: 'Колонка для сравнения' })).toBeTruthy()
    fireEvent.change(group.getByRole('combobox', { name: 'Значение должно совпадать с' }), { target: { value: 'company' } })
    const next = ui.change.mock.lastCall![0] as App
    expect(next.rowAccessRules[0]).toEqual({ ...app.rowAccessRules[0], match: 'company' })
    expect(next.rowAccessRules.slice(1)).toEqual(app.rowAccessRules.slice(1))
    expect(next.roles).toBe(app.roles)
    expect(next.allowlist).toBe(app.allowlist)
    expect(group.getByRole('button', { name: 'Удалить ограничение 1' })).toBeTruthy()
  })

  it('distinguishes assignments for the same email across different modules', () => {
    const sales = templateExample('zakazy'), delivery = templateExample('dostavka')
    const app = composeModules(sales.app, delivery.app, new Map([...sales.views, ...delivery.views].map(view => [view.id, view])))
    app.moduleAccess!.grants = app.modules!.map(module => ({ email: 'worker@example.invalid', moduleId: module.id, roleId: module.roles!.manager! }))
    const ui = setup(app)
    const selects = ui.getAllByRole('combobox', { name: /Роль worker@example.invalid в/ })
    expect(selects).toHaveLength(app.modules!.length)
    expect(new Set(selects.map(select => select.getAttribute('aria-label'))).size).toBe(selects.length)
    const target = app.modules![0]!, role = target.roles!.staff!
    fireEvent.change(selects[0]!, { target: { value: role } })
    const next = ui.change.mock.lastCall![0] as App
    expect(next.moduleAccess!.grants.find(grant => grant.moduleId === target.id)?.roleId).toBe(role)
    expect(next.moduleAccess!.grants.filter(grant => grant.moduleId !== target.id)).toEqual(app.moduleAccess!.grants.filter(grant => grant.moduleId !== target.id))
    expect(next.rowAccessRules).toBe(app.rowAccessRules)
  })
})
