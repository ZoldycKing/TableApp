// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { templateExample } from '@/lib/templates/presentation'
import { GuidedTeamAccess } from './guided-team-access'

afterEach(cleanup)
describe('guided employee draft access', () => {
  it('adds a normalized email with an existing work role while preserving the application rules', () => {
    const { app } = templateExample('zakazy'), change = vi.fn()
    const ui = render(<GuidedTeamAccess app={app} onChange={change} />)
    fireEvent.change(ui.getByRole('textbox', { name: 'Почта сотрудника' }), { target: { value: 'Worker@Example.invalid' } })
    fireEvent.click(ui.getByRole('button', { name: 'Добавить сотрудника' }))
    expect(change).toHaveBeenCalledOnce()
    const next = change.mock.calls[0]![0]
    expect(next.allowlist.at(-1)).toEqual({ email: 'worker@example.invalid', roleId: 'staff', company: '' })
    expect(next.rowAccessRules).toBe(app.rowAccessRules)
    expect(next.accessMode).toBe(app.accessMode)
    expect(next.screens).toBe(app.screens)
  })
  it('keeps existing entries intact when the same address is entered again', () => {
    const example = templateExample('salon').app, change = vi.fn()
    const app = { ...example, allowlist: [{ email: 'master@example.invalid', roleId: 'staff', company: 'Existing' }] }
    const ui = render(<GuidedTeamAccess app={app} onChange={change} />)
    fireEvent.change(ui.getByRole('textbox', { name: 'Почта сотрудника' }), { target: { value: 'MASTER@example.invalid' } })
    fireEvent.click(ui.getByRole('button', { name: 'Добавить сотрудника' }))
    expect(ui.getByRole('alert').textContent).toContain('уже есть')
    expect(change).not.toHaveBeenCalled()
  })
})
