// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen} from '@testing-library/react'
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {BuilderV2AccessDialog} from './access-dialog'
import {appV2Fixture,fixtureTables} from './fixture.test-utils'
import type {AppV2} from '@tableapp/schema/app-v2'
beforeEach(()=>{HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','')};HTMLDialogElement.prototype.close=function(){this.removeAttribute('open')}})
afterEach(cleanup)
describe('published access dialog',()=>{
  it('lets the author choose own rows before fields without granting anything on cancel',()=>{
    const app=appV2Fixture();app.policy.tables=[]
    const save=vi.fn((_app:AppV2)=>null),close=vi.fn()
    render(<BuilderV2AccessDialog app={app} tables={fixtureTables} onSave={save} onClose={close}/>)
    fireEvent.change(screen.getByLabelText('Какие записи видны'),{target:{value:'owned'}})
    expect(screen.getByLabelText('Поле владельца')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('r_title'))
    fireEvent.click(screen.getByRole('button',{name:'Сохранить доступ'}))
    expect(save.mock.calls[0]?.[0]).toMatchObject({policy:{tables:[{tableId:'requests',grants:[{read:{fieldIds:['r_title'],rows:{kind:'owned',property:'email'}}}]}]}})
    expect(app.policy.tables).toEqual([])
  })
  it('keeps permissions local until saved and removes a user explicitly',()=>{
    const app=appV2Fixture(),save=vi.fn(()=>null),close=vi.fn()
    render(<BuilderV2AccessDialog app={app} tables={fixtureTables} onSave={save} onClose={close}/>)
    fireEvent.click(screen.getByRole('tab',{name:'Вход'}))
    fireEvent.change(screen.getByLabelText('Почта пользователя'),{target:{value:' New@Example.com '}})
    fireEvent.click(screen.getByRole('button',{name:'Добавить адрес'}))
    expect(screen.getByText('new@example.com')).toBeTruthy()
    fireEvent.click(screen.getByRole('button',{name:'Отмена'}))
    expect(close).toHaveBeenCalled();expect(save).not.toHaveBeenCalled();expect(app.authentication.members.some(member=>member.email==='new@example.com')).toBe(false)
  })
  it('does not flatten different row scopes into a broader shared read permission',()=>{
    const app=appV2Fixture(),save=vi.fn((_app:AppV2)=>null)
    app.policy.tables[0]!.grants.push({audience:{kind:'roles',roleIds:['owner']},read:{fieldIds:['r_title'],rows:{kind:'owned',fieldId:'r_owner',property:'email'}}})
    render(<BuilderV2AccessDialog app={app} tables={fixtureTables} onSave={save} onClose={()=>{}}/>)
    expect(screen.getByRole('group',{name:'Видимые поля'}).hasAttribute('disabled')).toBe(true)
    expect(screen.getByText(/действуют разные правила чтения/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button',{name:'Сохранить доступ'}));expect(save.mock.calls[0]![0].policy).toEqual(app.policy)
  })
})
