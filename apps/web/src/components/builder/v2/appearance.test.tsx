// @vitest-environment jsdom
import {act,cleanup,fireEvent,render,screen,within} from '@testing-library/react'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {appV2Fixture} from './fixture.test-utils'
import {BuilderV2Theme,BuilderV2AppFrame,BuilderV2Account} from './app-frame'
import {BUILDER_V2_COLORS,builderV2Menu,builderV2MenuLabel,builderV2ThemeStyle} from './appearance'
import {BuilderV2AppearanceSettings} from './appearance-settings'
import {PrototypeDialog} from '../prototype/dialog'
import { buildTemplate } from '@/lib/templates/build'
import { salon } from '@/lib/templates/defs/salon'
import { buildBookingV2App } from '@/lib/templates/booking-v2'
vi.mock('../prototype/icons',()=>({ProtoIcon:()=>null}))
beforeEach(()=>{HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','')};HTMLDialogElement.prototype.close=function(){this.removeAttribute('open')}})
afterEach(cleanup)
function menuApp(){const app=appV2Fixture();app.screens=Array.from({length:8},(_,i)=>({...app.screens[0]!,id:`page_${i}`,name:`Экран ${i+1}`,menuLabel:i===6?'Финансы':'',rootIds:[]}));app.screens.push({...app.screens[0]!,id:'hidden',name:'Скрытый раздел',navigation:false},{...app.screens[0]!,id:'card',name:'Карточка записи',contextTableId:'requests'});return app}
it('consolidates an older salon menu without rewriting its saved screens or hiding a custom replacement',()=>{
 const app=buildBookingV2App(buildTemplate({template:salon,workspaceId:'wsp_menu'}),{id:'app_menu',workspaceId:'wsp_menu',name:'Салон',slug:'salon-menu',email:'owner@example.com'})
 const booking=app.booking!,hours=app.screens.find(screen=>screen.id===booking.setupScreenId)!,calendar=app.screens.find(screen=>screen.id===booking.listScreenId)!
 hours.navigation=true;calendar.menuLabel='Записи'
 const snapshot=structuredClone(app)
 expect(builderV2Menu(app).some(screen=>screen.id===hours.id)).toBe(false)
 expect(builderV2MenuLabel(calendar,app)).toBe('Расписание')
 expect(app).toEqual(snapshot)
 const node=app.nodes.find(node=>calendar.rootIds.includes(node.id)&&node.type==='team_calendar')!
 app.nodes=app.nodes.map(item=>item.id===node.id?{id:item.id,name:'Другая коллекция',visibleTo:null,visibleWhen:null,type:'collection' as const,sourceId:app.sources[0]!.id,layout:'cards' as const,titleFieldId:app.booking!.service.name,subtitleFieldId:null,itemIds:[],events:{itemPress:null}}:item)
 expect(builderV2Menu(app).some(screen=>screen.id===hours.id)).toBe(true)
})
it('keeps record screens and hidden screens out of navigation and separates the menu label from the heading',()=>{
 const app=menuApp();expect(builderV2Menu(app)).toHaveLength(8);expect(builderV2MenuLabel(app.screens[6]!)).toBe('Финансы');expect(builderV2MenuLabel(app.screens[0]!)).toBe('Экран 1')
 const navigate=vi.fn();render(<BuilderV2AppFrame app={app} screenId="page_6" title="Подробный финансовый отчёт" onNavigate={navigate}><p>Данные</p></BuilderV2AppFrame>)
 expect(screen.queryByText('Скрытый раздел')).toBeNull();expect(screen.queryByText('Карточка записи')).toBeNull();expect(screen.getByText('Подробный финансовый отчёт')).toBeTruthy()
 const trigger=screen.getByRole('button',{name:'Ещё'});expect(trigger.getAttribute('aria-current')).toBe('true');fireEvent.click(trigger)
 const region=screen.getByRole('region',{name:'Другие разделы'});fireEvent.click(within(region).getByRole('button',{name:'Финансы'}));expect(navigate).toHaveBeenCalledWith('page_6');expect(screen.queryByRole('region',{name:'Другие разделы'})).toBeNull()
})
it('closes the extra navigation on Escape, outside input and a screen change without changing configuration',()=>{
 const app=menuApp(),snapshot=structuredClone(app),props={app,screenId:'page_0',title:'Обзор',onNavigate:vi.fn()},view=render(<BuilderV2AppFrame {...props}>Данные</BuilderV2AppFrame>),trigger=screen.getByRole('button',{name:'Ещё'})
 fireEvent.click(trigger);fireEvent.keyDown(document,{key:'Escape'});expect(trigger.getAttribute('aria-expanded')).toBe('false');expect(document.activeElement).toBe(trigger)
 fireEvent.click(trigger);fireEvent.pointerDown(document.body);expect(trigger.getAttribute('aria-expanded')).toBe('false')
 fireEvent.click(trigger);view.rerender(<BuilderV2AppFrame {...props} screenId="page_1">Данные</BuilderV2AppFrame>);expect(trigger.getAttribute('aria-expanded')).toBe('false');expect(app).toEqual(snapshot)
})
it('does not render an empty navigation and applies phone width to the container rather than only to its contents',()=>{
 const app=menuApp();app.screens.forEach(screen=>screen.navigation=false)
 const view=render(<BuilderV2AppFrame app={app} phone screenId="page_0" title="Личное" onNavigate={vi.fn()}>Данные</BuilderV2AppFrame>);expect(screen.queryByRole('navigation')).toBeNull();expect(view.container.querySelector('[data-phone="true"]')).toBeTruthy();expect(view.container.querySelector('[data-navigation="bottom"]')).toBeTruthy()
})
it('passes only the application presentation to a portaled dialog and preserves the editor outside the theme',()=>{
 const app=appV2Fixture();app.theme={...app.theme,scheme:'dark',accent:'violet'}
 render(<><div data-testid="chrome">Редактор</div><BuilderV2Theme app={app}><PrototypeDialog title="Проверка" onClose={vi.fn()}>Содержимое</PrototypeDialog></BuilderV2Theme></>)
 const dialog=screen.getByRole('dialog',{name:'Проверка'});expect(dialog.getAttribute('data-scheme')).toBe('dark');expect(dialog.style.getPropertyValue('--v2-brand')).toBe(BUILDER_V2_COLORS.violet[1]);expect(screen.getByTestId('chrome').getAttribute('data-scheme')).toBeNull()
})
it('updates appearance without changing screen audiences, authentication or grants',()=>{
 const app=appV2Fixture(),change=vi.fn();render(<BuilderV2AppearanceSettings app={app} onChange={change} onScreens={vi.fn()} onUploadLogo={vi.fn()}/>)
 fireEvent.change(screen.getByLabelText('Тема'),{target:{value:'dark'}});let next=change.mock.calls.at(-1)![0];expect(next.theme.scheme).toBe('dark');expect(next.policy).toEqual(app.policy);expect(next.screens).toEqual(app.screens)
 fireEvent.change(screen.getByLabelText('Меню на компьютере'),{target:{value:'sidebar'}});next=change.mock.calls.at(-1)![0];expect(next.appearance).toEqual({navigation:'sidebar',icon:'apps'});expect(next.authentication).toEqual(app.authentication)
 fireEvent.click(screen.getByRole('button',{name:'Цвет: Бирюзовый'}));expect(change.mock.calls.at(-1)![0].theme.accent).toBe('teal')
})
it('applies a completed logo upload to the latest appearance settings', async () => {
  const app = appV2Fixture(), change = vi.fn()
  let complete!: (result: { ok: true; key: string }) => void
  const upload = vi.fn(() => new Promise<{ ok: true; key: string }>(resolve => { complete = resolve }))
  const props = { app, onChange: change, onScreens: vi.fn(), onUploadLogo: upload }
  const view = render(<BuilderV2AppearanceSettings {...props} />)
  const input = view.container.querySelector<HTMLInputElement>('input[type="file"]')!
  const chooser = vi.spyOn(input, 'click')
  fireEvent.click(screen.getByRole('button', { name: 'Загрузить логотип' }))
  expect(chooser).toHaveBeenCalledOnce()
  fireEvent.change(input, { target: { files: [new File(['image'], 'logo.png', { type: 'image/png' })] } })
  const appearance = { navigation: 'tabs', icon: 'apps', density: 'compact', corners: 'subtle' } as const
  view.rerender(<BuilderV2AppearanceSettings {...props} app={{ ...app, appearance }} />)
  const key = `${app.workspaceId}/builder-logo.${app.id}.${'a'.repeat(32)}`
  await act(async () => complete({ ok: true, key }))
  expect(change).toHaveBeenCalledWith(expect.objectContaining({ appearance, theme: { ...app.theme, logoKey: key } }))
})
it('keeps every offered primary color readable in both light and dark themes',()=>{
 const luminance=(hex:string)=>hex.slice(1).match(/../g)!.map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((sum,x,i)=>sum+x*[.2126,.7152,.0722][i]!,0)
 const contrast=(a:string,b:string)=>{const x=luminance(a),y=luminance(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05)}
 for(const [id,[,light,dark]]of Object.entries(BUILDER_V2_COLORS)){expect(contrast(light,'#ffffff'),id).toBeGreaterThanOrEqual(4.5);expect(contrast(dark,'#18231b'),id).toBeGreaterThanOrEqual(4.5)}
 expect(builderV2ThemeStyle(appV2Fixture().theme)).toHaveProperty('--v2-brand',BUILDER_V2_COLORS.blue[1])
})
it('provides a compact account disclosure with a keyboard return and an ordinary guest sign-in link',()=>{
 const view=render(<BuilderV2Account email="anna@example.invalid" authenticated slug="my-work"/>),summary=screen.getByText('',{selector:'summary'})
 expect(summary.getAttribute('aria-label')).toBe('Аккаунт');const details=summary.parentElement as HTMLDetailsElement;details.open=true
 expect(screen.getByRole('link',{name:'Сменить почту'}).getAttribute('href')).toBe('/a/my-work?login=1')
 fireEvent.keyDown(details,{key:'Escape'});expect(details.open).toBe(false);expect(document.activeElement).toBe(summary)
 details.open=true;fireEvent.pointerDown(document.body);expect(details.open).toBe(false)
 view.rerender(<BuilderV2Account authenticated={false} slug="my-work"/>);expect(screen.getByRole('link',{name:'Войти'}).getAttribute('href')).toBe('/a/my-work?login=1')
})
it('saves salon booking rules from the appearance settings', () => {
  const app = buildBookingV2App(buildTemplate({ template: salon, workspaceId: 'wsp_rules' }), { id: 'app_rules', workspaceId: 'wsp_rules', name: 'Салон', slug: 'salon-rules', email: 'owner@example.com' })
  let current = app
  const onChange = vi.fn((next: typeof app) => { current = next })
  const view = render(<BuilderV2AppearanceSettings app={current} onChange={onChange} onScreens={vi.fn()} onUploadLogo={vi.fn()} />)
  expect(screen.getByRole('group', { name: 'Правила записи' })).toBeTruthy()
  expect(screen.getByRole('heading', { name: 'Правила записи' })).toBeTruthy()
  const show = () => view.rerender(<BuilderV2AppearanceSettings app={current} onChange={onChange} onScreens={vi.fn()} onUploadLogo={vi.fn()} />)
  fireEvent.change(screen.getByLabelText('Шаг слотов'), { target: { value: '30' } })
  show()
  fireEvent.change(screen.getByLabelText('Буфер после приёма'), { target: { value: '15' } })
  show()
  fireEvent.change(screen.getByLabelText('Отмена не позднее чем за'), { target: { value: '24' } })
  expect(current.booking!.slotStepMinutes).toBe(30)
  expect(current.booking!.stepMinutes).toBe(30)
  expect(current.booking!.bufferMinutes).toBe(15)
  expect(current.booking!.cancelDeadlineHours).toBe(24)
})
