// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ create: vi.fn(), push: vi.fn() }))
vi.mock('@/app/actions', () => ({ createTableAction: mocks.create }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: ReactNode } & Record<string, unknown>) => <a href={href} {...rest}>{children}</a> }))

const { TableDirectory } = await import('./table-directory')
const tables = [{ id: 'tbl_services', name: 'Услуги', icon: 'tag' }]

afterEach(cleanup)
beforeEach(() => { mocks.create.mockReset(); mocks.push.mockReset() })

describe('business table directory', () => {
  it('lets a viewer open existing data while hiding write entry points', () => {
    render(<TableDirectory tables={tables} businessName="ИП Иванов" canCreate={false} />)
    expect(screen.getByRole('link', { name: 'Услуги' }).getAttribute('href')).toBe('/t/tbl_services')
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
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/t/tbl_created'))
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
})
