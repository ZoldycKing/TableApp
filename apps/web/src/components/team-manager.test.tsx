// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TeamManager, type TeamRow } from './team-manager'

const actions = vi.hoisted(() => ({ invite: vi.fn(), change: vi.fn(), remove: vi.fn() }))
vi.mock('@/app/team-actions', () => ({ inviteMemberAction: actions.invite, changeRoleAction: actions.change, removeMemberAction: actions.remove }))
const rows: TeamRow[] = [{ userId: 'u1', email: 'owner@example.invalid', name: 'Владелец', role: 'owner', accepted: true, isSelf: true }]
afterEach(() => { cleanup(); vi.resetAllMocks() })

describe('workspace team controls', () => {
  it('keeps membership changes unavailable to nonowners', () => {
    render(<TeamManager rows={rows} canManage={false} />)
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.queryByRole('button', { name: /Пригласить|Исключить/ })).toBeNull()
    expect(screen.getByText(/Приглашать участников и менять роли может владелец/)).toBeTruthy()
    expect(actions.change).not.toHaveBeenCalled()
  })

  it('uses the existing roles and preserves the proposed email after a connection failure', async () => {
    actions.invite.mockRejectedValue(new Error('offline'))
    render(<TeamManager rows={rows} canManage />)
    fireEvent.click(screen.getByRole('button', { name: 'Пригласить участника' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Почта участника' }), { target: { value: 'colleague@example.invalid' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Роль в кабинете' }), { target: { value: 'viewer' } })
    fireEvent.submit(screen.getByRole('textbox', { name: 'Почта участника' }).closest('form')!)
    await screen.findByRole('alert')
    expect(actions.invite).toHaveBeenCalledWith('colleague@example.invalid', 'viewer')
    expect((screen.getByRole('textbox', { name: 'Почта участника' }) as HTMLInputElement).value).toBe('colleague@example.invalid')
  })

  it('shows server refusal when changing a role, without inventing success', async () => {
    actions.change.mockResolvedValue({ ok: false, error: 'Нельзя убрать последнего владельца' })
    render(<TeamManager rows={rows} canManage />)
    fireEvent.change(screen.getByRole('combobox', { name: 'Роль: owner@example.invalid' }), { target: { value: 'editor' } })
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('последнего владельца'))
    expect(actions.change).toHaveBeenCalledWith('u1', 'editor')
  })
})
