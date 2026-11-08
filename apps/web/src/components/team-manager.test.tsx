// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach,beforeAll, describe, expect, it, vi } from 'vitest'
import { TeamManager, type TeamRow } from './team-manager'

const actions = vi.hoisted(() => ({ invite: vi.fn(), change: vi.fn(), remove: vi.fn(),access:vi.fn() }))
vi.mock('@/app/team-actions', () => ({ inviteMemberAction: actions.invite, changeRoleAction: actions.change, removeMemberAction: actions.remove,setMemberTableAccessAction:actions.access }))
const rows: TeamRow[] = [{ userId: 'u1', email: 'owner@example.invalid', name: 'Владелец', role: 'owner', accepted: true, isSelf: true }]
afterEach(() => { cleanup(); vi.resetAllMocks() })
beforeAll(()=>{HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','')};HTMLDialogElement.prototype.close=function(){this.removeAttribute('open')}})

describe('workspace team controls', () => {
  it('saves a member allowlist only after explicit confirmation',async()=>{
    actions.access.mockResolvedValue({ok:true})
    const member:TeamRow={userId:'staff',email:'staff@example.invalid',name:null,role:'editor',accepted:true,isSelf:false}
    render(<TeamManager rows={[...rows,member]} canManage tables={[{id:'orders',name:'Заказы'},{id:'finance',name:'Финансы'}]}/>)
    fireEvent.click(screen.getByRole('button',{name:'Доступ к таблицам: staff@example.invalid'}))
    fireEvent.click(screen.getByRole('radio',{name:'Выбранные таблицы'}))
    fireEvent.change(screen.getByRole('combobox',{name:'Доступ: Заказы'}),{target:{value:'edit'}})
    expect(actions.access).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button',{name:'Сохранить доступ'}))
    await waitFor(()=>expect(actions.access).toHaveBeenCalledWith('staff',{orders:'edit',finance:'none'}))
    await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull())
    expect(actions.invite).not.toHaveBeenCalled()
  })
  it('stages invitation permissions before calling the invite action',async()=>{
    actions.invite.mockResolvedValue({ok:true,hint:null})
    render(<TeamManager rows={rows} canManage tables={[{id:'orders',name:'Заказы'}]}/>)
    fireEvent.click(screen.getByRole('button',{name:'Пригласить участника'}))
    fireEvent.change(screen.getByRole('textbox',{name:'Почта участника'}),{target:{value:'new@example.invalid'}})
    fireEvent.click(screen.getByRole('button',{name:/Таблицы: все/}))
    fireEvent.click(screen.getByRole('radio',{name:'Выбранные таблицы'}))
    fireEvent.change(screen.getByRole('combobox',{name:'Доступ: Заказы'}),{target:{value:'view'}})
    fireEvent.click(screen.getByRole('button',{name:'Готово'}))
    await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull())
    expect(actions.invite).not.toHaveBeenCalled();expect(actions.access).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button',{name:'Отправить приглашение'}))
    await waitFor(()=>expect(actions.invite).toHaveBeenCalledWith('new@example.invalid','editor',{orders:'view'}))
  })
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

  it('does not offer operations that would remove the last owner', () => {
    render(<TeamManager rows={rows} canManage />)
    expect(screen.queryByRole('combobox', { name: 'Роль: owner@example.invalid' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Исключить owner@example.invalid' })).toBeNull()
    expect(screen.getByText(/сначала назначьте ещё одного/)).toBeTruthy()
  })

  it('shows server refusal when changing a role, without inventing success', async () => {
    actions.change.mockResolvedValue({ ok: false, error: 'Нельзя убрать последнего владельца' })
    render(<TeamManager rows={[...rows, { ...rows[0]!, userId: 'u2', email: 'second@example.invalid', isSelf: false }]} canManage />)
    fireEvent.change(screen.getByRole('combobox', { name: 'Роль: owner@example.invalid' }), { target: { value: 'editor' } })
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('последнего владельца'))
    expect(actions.change).toHaveBeenCalledWith('u1', 'editor')
  })
})
