// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ImportScreen } from './import-screen'
import { Results } from './parts'
import { PrepareApp } from '../prepare-app'
import type { SheetSetup } from '@/lib/import-plan'

const mocks = vi.hoisted(() => ({ inspect: vi.fn(), read: vi.fn(), quota: vi.fn(), import: vi.fn(), create: vi.fn(), push: vi.fn() }))
vi.mock('@/app/import-actions', () => ({ inspectWorkbookAction: mocks.inspect, readSheetsAction: mocks.read, quotaAction: mocks.quota, importSheetAction: mocks.import }))
vi.mock('@/app/app-actions', () => ({ createTablesAppAction: mocks.create }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }))

const grid = [['Товар', 'Категория', 'Цена', 'Остаток'], ['Ежедневник А5', 'Ежедневники', '1200', '8'], ['Блокнот', 'Блокноты', '680', '15']]
const sheet = (name = 'Товары', hidden = false) => ({ name, hidden, rows: 2, columns: 4, header: grid[0]!, blockers: [], notes: [] })
const quota = { rowsLeft: 2000, tablesLeft: 10 }
const upload = (ui: ReturnType<typeof render>) => fireEvent.change(ui.getByLabelText('Файл Excel или CSV'), { target: { files: [new File(['sample'], 'Товары.xlsx')] } })
beforeEach(() => {
  vi.resetAllMocks()
  mocks.inspect.mockResolvedValue({ ok: true, sheets: [sheet()], quota })
  mocks.read.mockResolvedValue({ ok: true, sheets: [{ name: 'Товары', info: sheet(), grid }], quota })
  mocks.quota.mockResolvedValue(quota)
  mocks.import.mockResolvedValue({ ok: true, tableId: 'tbl_imported', tableName: 'Товары', added: 2, repeat: false })
  mocks.create.mockResolvedValue({ ok: true, appId: 'app_imported' })
})
afterEach(cleanup)

describe('first import', () => {
  it('opens the automatic starter after confirmed import without asking for the same tables again', async () => {
    const ui = render(<ImportScreen automaticApp />)
    upload(ui)
    fireEvent.click(await ui.findByRole('button', { name: 'Загрузить данные' }))
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith(expect.stringMatching(/^\/import\/run_[a-z0-9]+\?table=tbl_imported$/)))
    expect(mocks.create).not.toHaveBeenCalled()
    expect(ui.queryByRole('button', { name: 'Создать приложение' })).toBeNull()
  })

  it('waits for a failed sheet to be retried and keeps the selected first section', async () => {
    mocks.inspect.mockResolvedValue({ ok: true, sheets: [sheet(), sheet('Архив')], quota })
    mocks.read.mockResolvedValue({ ok: true, sheets: [{ name: 'Товары', info: sheet(), grid }, { name: 'Архив', info: sheet('Архив'), grid }], quota })
    mocks.import.mockResolvedValueOnce({ ok: true, tableId: 'tbl_products', tableName: 'Товары', added: 2, repeat: false }).mockResolvedValueOnce({ ok: false, error: 'Соединение прервалось' }).mockResolvedValueOnce({ ok: true, tableId: 'tbl_archive', tableName: 'Архив', added: 2, repeat: true })
    const ui = render(<ImportScreen automaticApp />)
    upload(ui)
    fireEvent.click(await ui.findByRole('checkbox', { name: /Архив/ }))
    fireEvent.click(ui.getByRole('button', { name: 'Проверить выбранные данные' }))
    fireEvent.change(await ui.findByLabelText('Первым откроется раздел'), { target: { value: 'Архив' } })
    fireEvent.click(ui.getByRole('button', { name: 'Загрузить 2 листа' }))
    const retry = await ui.findByRole('button', { name: 'Повторить загрузку: 1' })
    expect(mocks.push).not.toHaveBeenCalled()
    expect(ui.queryByRole('button', { name: 'Создать приложение' })).toBeNull()
    fireEvent.click(retry)
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith(expect.stringMatching(/\?table=tbl_archive$/)))
    expect(mocks.import).toHaveBeenCalledTimes(3)
    expect(mocks.import.mock.calls[1]![0].runId).toBe(mocks.import.mock.calls[2]![0].runId)
  })

  it('previews a single visible sheet directly, keeps column controls optional and opens an app on the imported table', async () => {
    const ui = render(<ImportScreen />)
    upload(ui)
    const preview = await ui.findByRole('table', { name: 'Предпросмотр данных' })
    expect(ui.queryByText('В книге один лист')).toBeNull()
    expect(within(preview).queryByRole('combobox')).toBeNull()
    expect(within(preview).getByText('Ежедневник А5')).toBeTruthy()
    expect(mocks.import).not.toHaveBeenCalled()
    const columns = ui.getByRole('button', { name: 'Настроить колонки' }) as HTMLButtonElement
    await waitFor(() => expect(columns.disabled).toBe(false))
    fireEvent.click(columns)
    fireEvent.change(within(preview).getByRole('textbox', { name: 'Название колонки 3' }), { target: { value: 'Цена, ₽' } })
    fireEvent.click(ui.getByRole('button', { name: 'Завершить настройку колонок' }))
    expect(within(preview).getByText('Цена, ₽')).toBeTruthy()
    fireEvent.click(ui.getByRole('button', { name: 'Загрузить данные' }))
    const create = await ui.findByRole('button', { name: 'Создать приложение' })
    expect(mocks.import.mock.calls[0]![0].fields.some((field: { name: string }) => field.name === 'Цена, ₽')).toBe(true)
    expect(ui.getByRole('link', { name: 'Открыть таблицу «Товары»' }).getAttribute('href')).toBe('/t/tbl_imported')
    expect(ui.queryByRole('link', { name: /Продолжить подготовку/ })).toBeNull()
    fireEvent.click(create)
    await waitFor(() => expect(mocks.create).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ tableIds: ['tbl_imported'], name: 'Товары' })))
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/apps/app_imported'))
  })

  it.each(['hidden', 'multiple'])('still asks which sheets to use for a %s workbook', async kind => {
    mocks.inspect.mockResolvedValue({ ok: true, sheets: kind === 'hidden' ? [sheet('Товары', true)] : [sheet(), sheet('Архив')], quota })
    const ui = render(<ImportScreen />)
    upload(ui)
    const choice = await ui.findByRole('checkbox', { name: /Товары/ }) as HTMLInputElement
    await waitFor(() => expect(ui.getByRole('button', { name: kind === 'hidden' ? 'Выберите лист' : 'Проверить выбранные данные' })).toBeTruthy())
    expect(mocks.read).not.toHaveBeenCalled()
    expect(choice.checked).toBe(kind !== 'hidden')
    if (kind === 'hidden') fireEvent.click(choice)
    fireEvent.click(ui.getByRole('button', { name: 'Проверить выбранные данные' }))
    await ui.findByRole('table', { name: 'Предпросмотр данных' })
    expect(mocks.read.mock.calls[0]![0].get('sheets')).toBe('["Товары"]')
  })

  it('keeps the import run key when retrying a lost response and does not offer an app before confirmed success', async () => {
    mocks.import.mockRejectedValueOnce(new Error('connection lost')).mockResolvedValueOnce({ ok: true, tableId: 'tbl_imported', tableName: 'Товары', added: 2, repeat: true })
    const ui = render(<ImportScreen />)
    upload(ui)
    fireEvent.click(await ui.findByRole('button', { name: 'Загрузить данные' }))
    const retry = await ui.findByRole('button', { name: 'Повторить загрузку: 1' })
    expect(ui.queryByRole('button', { name: 'Создать приложение' })).toBeNull()
    fireEvent.click(retry)
    await ui.findByRole('button', { name: 'Создать приложение' })
    expect(mocks.import).toHaveBeenCalledTimes(2)
    expect(mocks.import.mock.calls[0]![0].runId).toBe(mocks.import.mock.calls[1]![0].runId)
  })

  it('reports an inspection failure in place and allows selecting the file again', async () => {
    mocks.inspect.mockRejectedValueOnce(new Error('offline'))
    const ui = render(<ImportScreen />)
    upload(ui)
    expect((await ui.findByRole('alert')).textContent).toContain('Не удалось прочитать файл')
    upload(ui)
    await ui.findByRole('table', { name: 'Предпросмотр данных' })
    expect(mocks.inspect).toHaveBeenCalledTimes(2)
  })
})

describe('continue from saved data', () => {
  it('keeps the imported result in place while an app is being prepared', async () => {
    let finish!: (value: unknown) => void
    mocks.create.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const setup: SheetSetup = { name: 'Товары', grid, info: sheet(), typeOverrides: {}, nameOverrides: {}, destination: { kind: 'new', name: 'Товары' }, mapping: {}, outcome: { status: 'done', tableId: 'tbl_imported', added: 2, text: 'Добавлено 2 строки' } }
    const more = vi.fn()
    const ui = render(<Results setups={[setup]} busy={false} more={1} onMore={more} onRetry={() => {}} />)
    fireEvent.click(ui.getByRole('button', { name: 'Создать приложение' }))
    const next = ui.getByRole('button', { name: 'Загрузить остальные листы: 1' }) as HTMLButtonElement
    expect(next.disabled).toBe(true)
    fireEvent.click(next)
    expect(more).not.toHaveBeenCalled()
    finish({ ok: false, error: 'Повторите подготовку' })
    await ui.findByRole('alert')
    expect(next.disabled).toBe(false)
  })
  it('creates one draft after a double click and keeps the selected source after a rejection', async () => {
    let finish!: (value: unknown) => void
    mocks.create.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const ui = render(<PrepareApp tables={[{ id: 'first', name: 'Клиенты' }, { id: 'second', name: 'Товары' }]} />)
    fireEvent.click(ui.getByRole('checkbox', { name: 'Клиенты' }))
    const create = ui.getByRole('button', { name: 'Создать приложение' })
    fireEvent.click(create); fireEvent.click(create)
    expect(mocks.create).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ tableIds: ['second'], name: 'Моё приложение', purpose: 'business' }))
    finish({ ok: false, error: 'Не удалось подготовить' })
    await ui.findByRole('alert')
    expect((ui.getByRole('checkbox', { name: 'Товары' }) as HTMLInputElement).checked).toBe(true)
    expect((ui.getByRole('checkbox', { name: 'Клиенты' }) as HTMLInputElement).checked).toBe(false)
    fireEvent.click(ui.getByRole('button', { name: 'Создать приложение' }))
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/apps/app_imported'))
  })

  it('includes all selected sheets in one private draft and reuses its request after a lost response', async () => {
    mocks.create.mockRejectedValueOnce(new Error('lost response'))
    const ui = render(<PrepareApp tables={[{ id: 'expenses', name: 'Расходы' }, { id: 'projects', name: 'Проекты' }]} />)
    fireEvent.change(ui.getByRole('textbox', { name: 'Название приложения' }), { target: { value: 'Мои дела' } })
    fireEvent.click(ui.getByRole('radio', { name: 'Только для меня' }))
    fireEvent.click(ui.getByRole('button', { name: 'Создать приложение' }))
    await ui.findByRole('alert')
    fireEvent.click(ui.getByRole('button', { name: 'Создать приложение' }))
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/apps/app_imported'))
    expect(mocks.create.mock.calls[0]![0]).toEqual(mocks.create.mock.calls[1]![0])
    expect(mocks.create.mock.calls[0]![0]).toMatchObject({ tableIds: ['expenses', 'projects'], name: 'Мои дела', purpose: 'personal' })
  })

  it('returns to the existing app after importing from its setup and opens the data editor directly', () => {
    const setup: SheetSetup = { name: 'Товары', grid, info: sheet(), typeOverrides: {}, nameOverrides: {}, destination: { kind: 'existing', tableId: 'tbl_existing' }, mapping: {}, outcome: { status: 'done', tableId: 'tbl_existing', added: 2, text: 'Добавлено 2 строки' } }
    const ui = render(<Results setups={[setup]} busy={false} more={0} onMore={() => {}} onRetry={() => {}} returnAppId="existing-app" />)
    expect(ui.getByRole('link', { name: 'Вернуться к настройке приложения' }).getAttribute('href')).toBe('/setup?app=existing-app&step=data')
    expect(ui.getByRole('link', { name: 'Открыть таблицу «Товары»' }).getAttribute('href')).toBe('/t/tbl_existing')
    expect(ui.queryByRole('button', { name: 'Создать приложение' })).toBeNull()
    expect(mocks.create).not.toHaveBeenCalled()
  })
})
