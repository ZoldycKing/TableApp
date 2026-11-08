// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { templateExample } from '@/lib/templates/presentation'
import type { RuntimeTable } from '@/lib/app-runtime'
import { OwnerBookingSetup } from './owner-booking-setup'

vi.mock('@/app/owner-booking-actions', () => ({ setupOwnerBookingMasterAction: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/lib/unsaved', () => ({ useUnsaved: vi.fn() }))
afterEach(() => { cleanup(); sessionStorage.clear() })
const example = templateExample('salon')
const tables: Record<string, RuntimeTable> = Object.fromEntries(example.built.tables.map(table => [table.id, { ...table,
  fields: example.byTable.get(table.id)!, rows: example.rows.filter(row => row.tableId === table.id).map(row => ({ ...row, version: 0 })) }]))
describe('a clear next step after configuring a master', () => {
  it('shows configured masters and opens a new form only when requested', () => {
    render(<OwnerBookingSetup app={example.app} tables={tables} userId="owner" />)
    expect(screen.queryByLabelText('Имя мастера')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Мастера' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Добавить мастера' }))
    expect(screen.getByLabelText('Имя мастера')).toBeTruthy()
    expect(screen.getByLabelText('Почта мастера')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }))
    expect(screen.queryByLabelText('Имя мастера')).toBeNull()
  })
  it('starts with the required form when all example masters have been removed', () => {
    const masters = example.app.booking!.tables.masters
    render(<OwnerBookingSetup app={example.app} tables={{ ...tables, [masters]: { ...tables[masters]!, rows: [] } }} userId="owner" />)
    expect(screen.getByLabelText('Имя мастера')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Сохранить мастера и график' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Отмена' })).toBeNull()
  })
})
