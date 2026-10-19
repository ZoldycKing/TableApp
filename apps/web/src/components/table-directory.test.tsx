// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ create: vi.fn(), createApp: vi.fn(), push: vi.fn() }))
vi.mock('@/app/actions', () => ({ createTableAction: mocks.create }))
vi.mock('@/app/app-actions', () => ({ createAppAction: mocks.createApp }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: ReactNode } & Record<string, unknown>) => <a href={href} {...rest}>{children}</a> }))

const { TableDirectory } = await import('./table-directory')
const { TableOverview } = await import('./table-overview')
const tables = [{ id: 'tbl_services', name: 'Услуги', icon: 'tag', rowCount: 12, fieldCount: 2,
  createdAt: '2026-10-01T12:00:00.000Z', updatedAt: '2026-10-19T12:00:00.000Z',
  fields: [{ id: 'fld_title', name: 'Название', type: 'text', description: null }, { id: 'fld_price', name: 'Цена', type: 'number', description: null }], apps: [], relations: [] }]

afterEach(cleanup)
beforeEach(() => { mocks.create.mockReset(); mocks.createApp.mockReset(); mocks.push.mockReset() })

describe('business table directory', () => {
  it('lets a viewer open existing data while hiding write entry points', () => {
    render(<TableDirectory tables={tables} businessName="ИП Иванов" canCreate={false} />)
    expect(screen.getByRole('link', { name: 'Услуги' }).getAttribute('href')).toBe('/tables/tbl_services')
    expect(screen.getByText('Записей:', { exact: false }).textContent).toContain('12')
    expect(screen.queryByRole('button', { name: 'Новая таблица' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Загрузить Excel или CSV' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Выбрать шаблон' })).toBeNull()
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('creates through the existing authorized action and opens the returned table', async () => {
    mocks.create.mockResolvedValue({ ok: true, tableId: 'tbl_created' })
    render(<TableDirectory tables={tables} businessName="ИП Иванов" canCreate />)
    fireEvent.click(screen.getByRole('button', { name: 'Новая таблица' }))
    fireEvent.change(screen.getByLabelText('Название таблицы'), { target: { value: '  Клиенты  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Создать' }))
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/tables/tbl_created'))
    expect(mocks.create).toHaveBeenCalledExactlyOnceWith('Клиенты')
  })

  it('keeps the name and business page when the server rejects creation', async () => {
    mocks.create.mockResolvedValue({ ok: false, error: 'Лимит таблиц исчерпан' })
    render(<TableDirectory tables={[]} businessName="ИП Иванов" canCreate />)
    fireEvent.click(screen.getByRole('button', { name: 'Новая таблица' }))
    fireEvent.change(screen.getByLabelText('Название таблицы'), { target: { value: 'Клиенты' } })
    fireEvent.click(screen.getByRole('button', { name: 'Создать' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Лимит таблиц исчерпан')
    expect((screen.getByLabelText('Название таблицы') as HTMLInputElement).value).toBe('Клиенты')
    expect(mocks.push).not.toHaveBeenCalled()
  })

  it('opens one shared table in view mode or either editor without mixing them', () => {
    render(<TableOverview table={tables[0]!} businessName="ИП Иванов" canEdit />)
    expect(screen.getByRole('link', { name: 'Посмотреть таблицу' }).getAttribute('href')).toBe('/t/tbl_services?mode=grid&readonly=1')
    expect(screen.queryByRole('link', { name: /Таблицей/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Редактировать' }))
    expect(screen.getByRole('link', { name: /Таблицей/ }).getAttribute('href')).toBe('/t/tbl_services?mode=grid')
    expect(screen.getByRole('link', { name: /По записям/ }).getAttribute('href')).toBe('/t/tbl_services?mode=records')
    expect(screen.getByText('Оба способа изменяют одни и те же данные.')).toBeTruthy()
  })

  it('hides editor and application creation for viewers on the overview', () => {
    render(<TableOverview table={tables[0]!} businessName="ИП Иванов" canEdit={false} />)
    expect(screen.queryByRole('button', { name: 'Редактировать' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Подготовить приложение' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Посмотреть таблицу' })).toBeTruthy()
  })

  it('prepares a real application and opens its builder after server success', async () => {
    mocks.createApp.mockResolvedValue({ ok: true, appId: 'app_services' })
    render(<TableOverview table={tables[0]!} businessName="ИП Иванов" canEdit />)
    fireEvent.click(screen.getByRole('button', { name: 'Подготовить приложение' }))
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/apps/app_services'))
    expect(mocks.createApp).toHaveBeenCalledExactlyOnceWith('tbl_services')
  })

  it('groups fields of one source table in one relation block', () => {
    const relation = { sourceId: 'tbl_services', sourceName: 'Услуги', multiple: false }
    render(<TableOverview table={{ ...tables[0]!, relations: [
      { ...relation, fieldId: 'fld_master', fieldName: 'Мастер', targetId: 'tbl_masters', targetName: 'Мастера' },
      { ...relation, fieldId: 'fld_type', fieldName: 'Категория', targetId: 'tbl_types', targetName: 'Категории' },
    ] }} businessName="ИП Иванов" canEdit />)
    expect(screen.getAllByRole('heading', { name: 'Эта таблица использует данные других таблиц' })).toHaveLength(1)
    expect(screen.getByRole('link', { name: 'Мастера' }).getAttribute('href')).toBe('/tables/tbl_masters')
    expect(screen.getByRole('link', { name: 'Категории' }).getAttribute('href')).toBe('/tables/tbl_types')
  })
})
