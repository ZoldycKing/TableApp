// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react'
import { normalizeFieldOptions, type Field } from '@tableapp/schema'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DataGrid } from './data-grid'

vi.mock('@/components/file-upload', () => ({ AttachmentPreview: () => null, FileUpload: () => null }))
const field = { id: 'name', tableId: 't', name: 'Название', type: 'text', description: null, position: 'a1', options: normalizeFieldOptions('text', {}) } as Field
const checkbox = { ...field, id: 'done', name: 'Готово', type: 'checkbox', options: normalizeFieldOptions('checkbox', {}) } as Field
const row1 = { id: 'r1', position: 'a1', data: { name: 'Первая', done: false } }
const row2 = { id: 'r2', position: 'a2', data: { name: 'Вторая', done: true } }
const mutation = vi.fn()
const props = { fields: [field, checkbox], groups: [{ key: '', value: null, rows: [row1, row2] }], isGrouped: false, onSetCell: mutation, onAddRow: mutation, onDeleteRow: mutation, onRenameField: mutation, onEditField: mutation, onAddField: mutation }
afterEach(() => { cleanup(); vi.clearAllMocks() })
describe('readonly grid and stable selection', () => {
  it('blocks keyboard, double click, checkbox and schema mutations in readonly mode', () => {
    const view = render(<DataGrid {...props} readOnly />)
    const cells = view.getAllByRole('gridcell')
    const grid = view.getByRole('grid')
    fireEvent.click(cells[1]!)
    for (const key of ['Enter', 'F2', 'Delete', 'Backspace']) fireEvent.keyDown(grid, { key })
    fireEvent.doubleClick(cells[1]!)
    fireEvent.click(cells[2]!)
    fireEvent.keyDown(grid, { key: ' ' })
    fireEvent.doubleClick(cells[2]!)
    expect(view.queryByRole('button', { name: '+ Строка' })).toBeNull()
    expect(view.queryByTitle('Удалить строку')).toBeNull()
    expect(view.queryByTitle('Настройки поля «Название»')).toBeNull()
    expect(view.container.querySelector('input:not([readonly])')).toBeNull()
    expect(mutation).not.toHaveBeenCalled()
  })

  it('restores the selected row by ID after reorder and reports keyboard changes', () => {
    const select = vi.fn()
    const view = render(<DataGrid {...props} selectedRowId="r2" onSelectRow={select} />)
    expect(view.getByText('Вторая').closest('td')!.className).toContain('ring-sage-400')
    view.rerender(<DataGrid {...props} selectedRowId="r2" onSelectRow={select} groups={[{ key: '', value: null, rows: [row2, row1] }]} />)
    expect(view.getByText('Вторая').closest('td')!.className).toContain('ring-sage-400')
    fireEvent.keyDown(view.getByRole('grid'), { key: 'ArrowDown' })
    expect(select).toHaveBeenCalledWith('r1')
  })
})
