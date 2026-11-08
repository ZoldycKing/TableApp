// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TemplateShowcase, type ShowcaseTemplate } from './template-showcase'

const mocks = vi.hoisted(() => ({ apply: vi.fn(), push: vi.fn(), replace: vi.fn() }))
vi.mock('@/app/template-actions', () => ({ applyTemplateAction: mocks.apply }))
vi.mock('next/navigation', () => ({ useRouter: () => mocks }))
afterEach(() => { cleanup(); vi.resetAllMocks() })
const templates: ShowcaseTemplate[] = [
  { id:'zakazy', name:'Продажа товаров', description:'Принимайте заказы.', features:[{name:'Каталог',description:'Цены и товары.'}] },
  { id:'salon', name:'Салон красоты', description:'Записывайте клиентов.', features:[] },
]
const props = { templates, selectedId:'zakazy', startHref:'/login?next=%2Ftemplates%3Ftake%3Dzakazy', preview:<div>Учебное приложение</div> }

describe('public template choice', () => {
  it('browsing never installs a template and the guest link retains the choice', () => {
    const ui = render(<TemplateShowcase {...props} />)
    fireEvent.click(ui.getByRole('link',{name:'Салон красоты'}))
    expect(mocks.replace).toHaveBeenCalledWith('/templates?preview=salon',{scroll:false})
    expect(mocks.apply).not.toHaveBeenCalled()
    expect(ui.getByRole('link',{name:'Начать с этого шаблона'}).getAttribute('href')).toBe(props.startHref)
  })
  it('double click creates one app and opens its preparation', async () => {
    let resolve!: (value:unknown)=>void
    mocks.apply.mockReturnValue(new Promise(result=>{resolve=result}))
    const ui = render(<TemplateShowcase {...props} canInstall />)
    const button = ui.getByRole('button',{name:'Начать с этого шаблона'})
    fireEvent.click(button); fireEvent.click(button)
    expect(mocks.apply).toHaveBeenCalledExactlyOnceWith('zakazy')
    resolve({ok:true,appId:'new-app'})
    await waitFor(()=>expect(mocks.push).toHaveBeenCalledWith('/setup?app=new-app&step=review'))
  })
  it('shows installation failure inline and allows a retry', async () => {
    mocks.apply.mockResolvedValue({ok:false,error:'Не удалось создать приложение'})
    const ui = render(<TemplateShowcase {...props} canInstall />)
    fireEvent.click(ui.getByRole('button',{name:'Начать с этого шаблона'}))
    await waitFor(()=>expect(ui.getByRole('alert').textContent).toContain('Не удалось создать'))
    await waitFor(()=>expect((ui.getByRole('button',{name:'Начать с этого шаблона'}) as HTMLButtonElement).disabled).toBe(false))
    mocks.apply.mockResolvedValue({ok:true,appId:'retry-app'})
    fireEvent.click(ui.getByRole('button',{name:'Начать с этого шаблона'}))
    await waitFor(()=>expect(mocks.push).toHaveBeenCalledWith('/setup?app=retry-app&step=review'))
  })
})
