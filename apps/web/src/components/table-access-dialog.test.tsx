// @vitest-environment jsdom
import { cleanup,fireEvent,render,waitFor } from '@testing-library/react'
import { afterEach,beforeAll,describe,expect,it,vi } from 'vitest'
import { TableAccessDialog } from './table-access-dialog'
const tables=[{id:'orders',name:'Заказы'},{id:'finance',name:'Финансы'}]
beforeAll(()=>{HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','')};HTMLDialogElement.prototype.close=function(){this.removeAttribute('open')}})
afterEach(cleanup)
describe('table access settings',()=>{
  it('retains choices after a server refusal and restores background scroll on cancel',async()=>{
    const save=vi.fn(async()=>({ok:false as const,error:'Роль изменилась'})),close=vi.fn()
    const view=render(<TableAccessDialog name="Сотрудник" role="editor" tables={tables} initialAccess={{orders:'edit',finance:'none'}} onSave={save} onClose={close}/>)
    expect(document.body.style.overflow).toBe('hidden')
    fireEvent.change(view.getByRole('combobox',{name:'Доступ: Финансы'}),{target:{value:'view'}})
    fireEvent.click(view.getByRole('button',{name:'Сохранить доступ'}))
    await waitFor(()=>expect(view.getByRole('alert').textContent).toContain('Роль изменилась'))
    expect((view.getByRole('combobox',{name:'Доступ: Финансы'}) as HTMLSelectElement).value).toBe('view')
    fireEvent.click(view.getByRole('button',{name:'Отмена'}));expect(close).toHaveBeenCalledOnce()
    view.unmount();expect(document.body.style.overflow).not.toBe('hidden')
  })
  it('keeps the viewer ceiling and explicitly restores all-table defaults',async()=>{
    const save=vi.fn(async()=>({ok:true as const}))
    const view=render(<TableAccessDialog name="Читатель" role="viewer" tables={tables} initialAccess={{orders:'view'}} onSave={save} onClose={()=>{}}/>)
    expect(view.queryByRole('option',{name:'Редактирование'})).toBeNull()
    fireEvent.click(view.getByRole('radio',{name:'Все таблицы'}))
    expect(view.queryByRole('combobox')).toBeNull()
    fireEvent.click(view.getByRole('button',{name:'Сохранить доступ'}))
    await waitFor(()=>expect(save).toHaveBeenCalledWith(null))
  })
})
