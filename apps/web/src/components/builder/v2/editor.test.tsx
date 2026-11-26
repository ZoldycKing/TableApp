// @vitest-environment jsdom
vi.mock('@/app/builder-v2-logo-actions', () => ({ uploadBuilderV2LogoAction: vi.fn() }))
vi.mock('@/app/builder-v2-form-actions', () => ({ inspectBuilderV2FormAction: vi.fn() }))
vi.mock('@/app/builder-v2-workflow-actions', () => ({ readBuilderV2WorkflowRunsAction: vi.fn(async () => ({ ok: true, runs: [], next: null })) }))
vi.mock('@/app/builder-learning-actions', () => ({ builderLearningAction: vi.fn(async () => ({ ok: true, progress: null })), readBuilderLearningAction: vi.fn(async () => ({ ok: true, progress: null })),confirmBuilderLearningAccessAction:vi.fn() }))
vi.mock('@/app/builder-v2-publish-actions',()=>({publishBuilderV2Action:vi.fn()}))
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { saveBuilderV2DraftAction, reloadBuilderV2DraftAction } from '@/app/builder-v2-actions'
import { AppV2Editor } from './editor'
import { appV2Fixture, fixtureActor, fixtureTables } from './fixture.test-utils'
import { buildBuilderV2Starter } from '@/lib/builder-v2-starter'
import { builderLearningTarget, type BuilderLearningProgress } from '@/lib/builder-learning-types'
import {confirmBuilderLearningAccessAction} from '@/app/builder-learning-actions'
import {publishBuilderV2Action} from '@/app/builder-v2-publish-actions'
import { readBuilderV2DataAction, readBuilderV2RecordAction } from '@/app/builder-v2-data-actions'

vi.mock('@/app/builder-v2-actions', () => ({ saveBuilderV2DraftAction: vi.fn(), reloadBuilderV2DraftAction: vi.fn() }))
vi.mock('@/app/builder-v2-data-actions', () => ({ readBuilderV2DataAction: vi.fn(async () => ({ ok: true, page: { kind: 'collection', rows: [], value: null, total: 0, next: null } })), readBuilderV2RecordAction: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('next/link', () => ({ default: ({ children, prefetch: _prefetch, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { prefetch?: boolean }) => <a {...props}>{children}</a> }))
vi.mock('@/components/marketing/logo', () => ({ Logo: () => <span>Scatta</span> }))
vi.mock('../prototype/icons', () => ({ ProtoIcon: () => null }))

beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks()
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers() })
const mount = (canEdit = true) => render(<AppV2Editor initialApp={appV2Fixture()} initialRevision={'a'.repeat(64)} tables={fixtureTables} actor={fixtureActor} canEdit={canEdit} />)
const rename = (name: string) => fireEvent.change(screen.getByLabelText('Название приложения'), { target: { value: name } })
const tick = () => act(async () => { await vi.advanceTimersByTimeAsync(900) })

it('adds profile and history from the library, changes their settings and saves ordinary editable nodes',async()=>{
  vi.mocked(saveBuilderV2DraftAction).mockResolvedValue({ok:true,revision:'a'.repeat(64)})
  const tables=fixtureTables.map(table=>table.id==='requests'?{...table,fields:[...table.fields,{id:'r_date',name:'Дата события',type:'datetime' as const}]}:table)
  render(<AppV2Editor initialApp={appV2Fixture()} initialRevision={'a'.repeat(64)} tables={tables} actor={fixtureActor} canEdit/>)
  fireEvent.click(screen.getAllByRole('button',{name:'Добавить элемент'})[0]!)
  fireEvent.click(within(screen.getByRole('dialog',{name:'Добавить элемент'})).getByRole('button',{name:/^Профиль/}))
  fireEvent.change(screen.getByLabelText('Текст',{exact:true}),{target:{value:'Наталья'}})
  await tick()
  expect(screen.getByRole('heading',{name:'Наталья'})).toBeTruthy()
  expect(saveBuilderV2DraftAction).toHaveBeenLastCalledWith('app_pilot',expect.objectContaining({nodes:expect.arrayContaining([expect.objectContaining({type:'profile',title:{kind:'literal',value:'Наталья'}})])}),'a'.repeat(64))
  fireEvent.click(screen.getAllByRole('button',{name:'Добавить элемент'})[0]!)
  fireEvent.click(within(screen.getByRole('dialog',{name:'Добавить элемент'})).getByRole('button',{name:/^История/}))
  fireEvent.click(within(screen.getByRole('dialog',{name:'Выберите таблицу'})).getByRole('button',{name:'Добавить элемент'}))
  expect(screen.getByRole('button', { name: 'Внешний вид' }).textContent).toContain('История')
  await tick()
  expect(saveBuilderV2DraftAction).toHaveBeenLastCalledWith('app_pilot',expect.objectContaining({nodes:expect.arrayContaining([expect.objectContaining({type:'collection',layout:'history',dateFieldId:'r_date'})])}),'a'.repeat(64))
})

describe('v2 editor persistence', () => {
  it('confirms access after saving its dialog and opens publication without publishing automatically',async()=>{
    const app=appV2Fixture(),progress:BuilderLearningProgress={version:1,revision:'2026-11-04T00:00:00.000Z',list:'done',record:'done',save:'done',access:'pending',publish:'pending',paused:false,target:builderLearningTarget(app)}
    vi.mocked(confirmBuilderLearningAccessAction).mockResolvedValue({ok:true,progress:{...progress,access:'done',revision:'2026-11-04T00:00:01.000Z'}})
    vi.mocked(saveBuilderV2DraftAction).mockResolvedValue({ok:true,revision:'a'.repeat(64)})
    render(<AppV2Editor initialApp={app} initialRevision={'a'.repeat(64)} tables={fixtureTables} actor={fixtureActor} canEdit initialLearning={progress}/>)
    fireEvent.click(screen.getByRole('button',{name:'Настроить доступ'}));expect(screen.getByRole('dialog',{name:'Доступ к приложению'})).toBeTruthy()
    await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Сохранить доступ'})))
    expect(confirmBuilderLearningAccessAction).toHaveBeenCalledWith(app.id,'a'.repeat(64));expect(screen.getByRole('region',{name:'Первые шаги'}).textContent).toContain('5 из 5')
    await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Открыть публикацию'})))
    expect(screen.getByRole('dialog',{name:'Опубликовать приложение'})).toBeTruthy();expect(publishBuilderV2Action).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button',{name:'Закрыть окно'}));expect(screen.getByRole('region',{name:'Первые шаги'}).textContent).toContain('5 из 5')
  })
  it('shows imported data first and offers a direct path to the list fields without saving a fake change', async () => {
    const original = appV2Fixture()
    const app = buildBuilderV2Starter({ ...original, screens: [], nodes: [], sources: [], workflows: [], homeScreenId: null }, [fixtureTables[0]!], fixtureTables[0]!.id)
    const progress: BuilderLearningProgress = { version: 1, revision: '2026-11-03T00:00:00.000Z', list: 'pending', record: 'pending', save:'pending', access: 'pending', publish: 'pending', paused: false, target: builderLearningTarget(app) }
    window.history.replaceState({ __NA: true, _N: true }, '', '/apps/imported?start=1')
    const replace = vi.spyOn(window.history, 'replaceState')
    render(<AppV2Editor initialApp={app} initialRevision={'a'.repeat(64)} tables={fixtureTables} actor={fixtureActor} canEdit fromImport initialLearning={progress} />)
    expect(screen.getByRole('region', { name: 'Первые шаги' })).toBeTruthy()
    expect(screen.queryByRole('tab', { name: 'Элемент' })).toBeNull()
    expect(window.location.search).not.toContain('start=')
    expect(replace.mock.calls.at(-1)![0]).not.toHaveProperty('__NA')
    expect(replace.mock.calls.at(-1)![0]).not.toHaveProperty('_N')
    replace.mockRestore()
    fireEvent.click(screen.getByRole('button', { name: 'Помощь с этим шагом' }))
    const dialog = screen.getByRole('dialog', { name: `Экран «${fixtureTables[0]!.name}»` })
    expect(dialog.textContent).toContain(`таблицы «${fixtureTables[0]!.name}»`)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Выбрать поля для экрана' }))
    expect(screen.getByRole('region', { name: 'Первые шаги' }).textContent).toContain('1 из 5')
    expect(screen.getByLabelText('Главное поле')).toBeTruthy()
    await tick()
    expect(saveBuilderV2DraftAction).not.toHaveBeenCalled()
  })

  it('marks an undo back to the saved snapshot as saved without sending a new request', async () => {
    mount(); rename('Временная правка')
    fireEvent.click(screen.getByRole('button', { name: 'Отменить изменение' }))
    await tick()
    expect(screen.getByRole('status').textContent).toBe('Сохранено')
    expect(saveBuilderV2DraftAction).not.toHaveBeenCalled()
  })

  it('opens an actual record directly from the contextual hint and leaves the draft alone', async () => {
    const app = appV2Fixture(), target = builderLearningTarget(app)!
    const progress: BuilderLearningProgress = { version: 1, revision: '2026-11-04T00:00:00.000Z', list: 'done', record: 'pending', save: 'pending', access: 'pending', publish: 'pending', paused: false, target }
    const record = { id: 'real_example', tableId: target.tableId, values: { r_title: 'Моя заявка' }, display: { r_title: 'Моя заявка' } }
    vi.mocked(readBuilderV2DataAction).mockResolvedValue({ ok: true, page: { kind: 'collection', rows: [record], value: null, total: 1, next: null } })
    vi.mocked(readBuilderV2RecordAction).mockResolvedValueOnce({ ok: true, record, title: 'Моя заявка', learning: { ...progress, record: 'done', revision: '2026-11-04T00:00:01.000Z' } })
    window.history.replaceState({}, '', '/apps/example')
    render(<AppV2Editor initialApp={app} initialRevision={'a'.repeat(64)} tables={fixtureTables} actor={fixtureActor} canEdit initialLearning={progress} />)
    const hint = screen.getByRole('region', { name: 'Первые шаги' })
    expect(hint.textContent).toContain('Подсказка')
    expect(hint.textContent).toContain(`«${app.screens.find(page => page.id === target.screenId)?.name}»`)
    await act(async () => fireEvent.click(within(hint).getByRole('button', { name: 'Показать карточку' })))
    await tick()
    expect(readBuilderV2RecordAction).toHaveBeenCalledWith(app.id, app, { screenId: target.cardScreenId, recordId: record.id })
    expect(new URLSearchParams(window.location.search).get('row')).toBe(record.id)
    expect(screen.getByRole('region', { name: 'Первые шаги' }).textContent).toContain('3 из 5')
    expect(saveBuilderV2DraftAction).not.toHaveBeenCalled()
    vi.mocked(readBuilderV2DataAction).mockResolvedValue({ ok: true, page: { kind: 'collection', rows: [], value: null, total: 0, next: null } })
  })

  it('serializes edits made during an in-flight save against the returned revision', async () => {
    let finish!: (value: { ok: true; revision: string }) => void
    vi.mocked(saveBuilderV2DraftAction).mockImplementationOnce(() => new Promise(resolve => { finish = resolve })).mockResolvedValue({ ok: true, revision: 'c'.repeat(64) })
    mount(); rename('Первый вариант'); await tick()
    expect(saveBuilderV2DraftAction).toHaveBeenCalledTimes(1)
    rename('Последний вариант')
    await act(async () => { finish({ ok: true, revision: 'b'.repeat(64) }) })
    expect(saveBuilderV2DraftAction).toHaveBeenCalledTimes(2)
    expect(saveBuilderV2DraftAction).toHaveBeenLastCalledWith('app_pilot', expect.objectContaining({ name: 'Последний вариант' }), 'b'.repeat(64))
    expect(screen.getByRole('status').textContent).toBe('Сохранено')
  })

  it('keeps conflicting local edits, stops automatic retries and reloads only after explicit confirmation', async () => {
    vi.mocked(saveBuilderV2DraftAction).mockResolvedValue({ ok: false, conflict: true, error: 'Изменено в другой вкладке' })
    mount(); rename('Мои правки'); await tick()
    expect((screen.getByLabelText('Название приложения') as HTMLInputElement).value).toBe('Мои правки')
    rename('Продолжение моих правок'); await tick()
    expect(saveBuilderV2DraftAction).toHaveBeenCalledTimes(1)
    const before = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(before)
    expect(before.defaultPrevented).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Загрузить серверную версию' }))
    vi.mocked(reloadBuilderV2DraftAction).mockResolvedValueOnce({ ok: false, error: 'Нет соединения' })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Открыть серверную версию' })))
    expect(screen.getByRole('dialog').textContent).toContain('Нет соединения')
    expect((screen.getByLabelText('Название приложения') as HTMLInputElement).value).toBe('Продолжение моих правок')
    vi.mocked(reloadBuilderV2DraftAction).mockResolvedValue({ ok: true, app: { ...appV2Fixture(), name: 'Серверная версия' }, tables: [...fixtureTables], revision: 'd'.repeat(64), publishedRevision: null })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Открыть серверную версию' })))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect((screen.getByLabelText('Название приложения') as HTMLInputElement).value).toBe('Серверная версия')
    const after = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(after)
    expect(after.defaultPrevented).toBe(false)
  })

  it('allows retrying a connection failure without losing local changes and offers no writes to viewers', async () => {
    vi.mocked(saveBuilderV2DraftAction).mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ ok: true, revision: 'b'.repeat(64) })
    const view = mount(); rename('Сохранить позже'); await tick()
    expect(screen.getByRole('alert').textContent).toContain('Проверьте соединение')
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Повторить сохранение' })))
    expect(screen.getByRole('status').textContent).toBe('Сохранено')
    view.unmount(); vi.clearAllMocks(); mount(false)
    expect((screen.getByLabelText('Название приложения') as HTMLInputElement).disabled).toBe(true)
    expect(screen.queryByRole('button', { name: 'Добавить элемент' })).toBeNull()
    await tick(); expect(saveBuilderV2DraftAction).not.toHaveBeenCalled()
  })

  it('refreshes a clean editor on focus with the latest published layout and metadata', async () => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    const updated = appV2Fixture()
    updated.theme.scheme = 'dark'
    const collection = updated.nodes.find(node => node.id === 'request_list')
    if (collection?.type !== 'collection') throw new Error('fixture')
    collection.layout = 'catalog'
    const latest = 'b'.repeat(64)
    vi.mocked(reloadBuilderV2DraftAction).mockResolvedValueOnce({ ok: true, app: updated, tables: [...fixtureTables], revision: latest, publishedRevision: latest })
    mount()
    expect(screen.getByRole('searchbox', { name: 'Поиск: Заявки' }).getAttribute('placeholder')).toBe('Найти в списке')
    await act(async () => { window.dispatchEvent(new Event('focus')) })
    expect(reloadBuilderV2DraftAction).toHaveBeenCalledWith(updated.id, 'a'.repeat(64))
    expect(screen.getByPlaceholderText('Поиск по каталогу').closest('[data-scheme]')?.getAttribute('data-scheme')).toBe('dark')
    expect(screen.getByText('Опубликовано')).toBeTruthy()
    expect(saveBuilderV2DraftAction).not.toHaveBeenCalled()
  })

  it('discards a late refresh result when an edit was saved after the refresh started', async () => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    let finish!: (value: Awaited<ReturnType<typeof reloadBuilderV2DraftAction>>) => void
    vi.mocked(reloadBuilderV2DraftAction).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    vi.mocked(saveBuilderV2DraftAction).mockResolvedValueOnce({ ok: true, revision: 'c'.repeat(64) })
    mount()
    window.dispatchEvent(new Event('focus'))
    rename('Мои новые правки')
    await tick()
    await act(async () => finish({ ok: true, app: { ...appV2Fixture(), name: 'Более ранняя версия' }, tables: [...fixtureTables], revision: 'b'.repeat(64), publishedRevision: null }))
    expect((screen.getByLabelText('Название приложения') as HTMLInputElement).value).toBe('Мои новые правки')
  })
})


it('keeps publish and history in the phone overflow menu without removing the desktop actions', () => {
  mount()
  expect(screen.getByRole('button', { name: 'Доступ' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Опубликовать' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Ещё действия' }))
  const menu = screen.getByRole('menu')
  expect(within(menu).getByRole('menuitem', { name: 'Доступ' })).toBeTruthy()
  expect(within(menu).getByRole('menuitem', { name: 'Опубликовать' })).toBeTruthy()
  expect(within(menu).getByRole('menuitem', { name: 'История' })).toBeTruthy()
  expect(within(menu).getByRole('menuitem', { name: 'Отменить' }).matches(':disabled')).toBe(true)
  expect(within(menu).getByRole('menuitem', { name: 'Повторить' }).matches(':disabled')).toBe(true)
  fireEvent.click(within(menu).getByRole('menuitem', { name: 'Доступ' }))
  expect(screen.getByRole('dialog', { name: 'Доступ к приложению' })).toBeTruthy()
  expect(screen.queryByRole('menu')).toBeNull()
})

it('saves theme and menu changes as an undoable draft without applying the theme to the editor chrome',async()=>{
  vi.mocked(saveBuilderV2DraftAction).mockResolvedValue({ok:true,revision:'a'.repeat(64)})
  mount();fireEvent.click(screen.getAllByRole('button',{name:'Оформление'})[0]!)
  fireEvent.click(screen.getByRole('button', { name: 'Тема' }))
  fireEvent.click(screen.getByRole('option', { name: 'Тёмная' }))
  fireEvent.click(screen.getByRole('button',{name:'Цвет: Фиолетовый'}))
  fireEvent.click(screen.getByRole('button', { name: 'Меню на компьютере' }))
  fireEvent.click(screen.getByRole('option', { name: 'Сбоку' }))
  await tick();expect(saveBuilderV2DraftAction).toHaveBeenLastCalledWith('app_pilot',expect.objectContaining({theme:expect.objectContaining({scheme:'dark',accent:'violet'}),appearance:{navigation:'sidebar',icon:'apps'}}),'a'.repeat(64))
  expect(screen.getByLabelText('Название приложения').closest('[data-scheme]')).toBeNull()
  fireEvent.click(screen.getByRole('button',{name:'Отменить изменение'}));expect(screen.getByRole('button', { name: 'Меню на компьютере' }).textContent).toContain('Снизу')
  fireEvent.click(screen.getByRole('button',{name:'К приложению'}));expect(screen.getByRole('button',{name:/^Приложение$/}).getAttribute('aria-current')).toBe('page')
})
it('allows viewers to inspect appearance without enabling configuration writes',async()=>{
  mount(false);fireEvent.click(screen.getAllByRole('button',{name:'Оформление'})[0]!)
  expect(screen.getByRole('button', { name: 'Тема' }).matches(':disabled')).toBe(true);expect(screen.getByRole('button',{name:'Цвет: Зелёный'}).matches(':disabled')).toBe(true)
  await tick();expect(saveBuilderV2DraftAction).not.toHaveBeenCalled()
})
