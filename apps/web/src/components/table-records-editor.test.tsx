// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { normalizeFieldOptions, type Field } from '@tableapp/schema'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { TableRecordsEditor } from './table-records-editor'
import { hasUnsaved } from '@/lib/unsaved'

vi.mock('@/components/file-upload', () => ({ FileUpload: () => null }))
const text: Field = { id: 'name', tableId: 't', name: 'Название', type: 'text', description: null, position: 'a1', options: normalizeFieldOptions('text', {}) } as Field
const number = { ...text, id: 'price', name: 'Цена', type: 'number', position: 'a2', options: normalizeFieldOptions('number', {}) } as Field
const relation = { ...text, id: 'product', name: 'Товар', type: 'relation', position: 'a3', options: normalizeFieldOptions('relation', { tableId: 'products', allowMultiple: false }) } as Field
const rows = [{ id: 'r1', position: 'a1', version: 3, data: { name: 'Заказ 104', price: 1200, product: ['p1'] } }, { id: 'r2', position: 'a2', version: 2, data: { name: 'Заказ 103', price: 680 } }]
const props = { rows, fields: [text, number, relation], titleField: text, selectedRowId: 'r1', relatedTitles: { products: [{ id: 'p1', title: 'Ежедневник A5' }, { id: 'p2', title: 'Планер' }] }, readOnly: false, onSelect: vi.fn(), onAdd: vi.fn(), onSave: vi.fn(async () => ({ ok: true as const })), onDirtyChange: vi.fn() }
afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('record editor shares real row and field identities', () => {
  it.each([false, true])('moves focus into the opened record and restores its list button (readonly=%s)', readOnly => {
    function Harness() {
      const [selected, setSelected] = useState<string | null>(null)
      return <TableRecordsEditor {...props} readOnly={readOnly} selectedRowId={selected} onSelect={setSelected} />
    }
    const view = render(<Harness />)
    const recordButton = view.getByRole('button', { name: /Заказ 104/ })
    fireEvent.click(recordButton)
    expect(document.activeElement).toBe(view.getByRole('heading', { name: 'Заказ 104' }))
    fireEvent.click(view.getByRole('button', { name: /Все записи/ }))
    expect(document.activeElement).toBe(recordButton)
    expect(props.onSave).not.toHaveBeenCalled()
  })

  it('saves a changed field on blur with the original conflict base', async () => {
    const view = render(<TableRecordsEditor {...props} />)
    const input = view.getByRole('textbox', { name: 'Название' })
    fireEvent.change(input, { target: { value: 'Заказ 104 — уточнён' } })
    expect(hasUnsaved()).toBe(true)
    fireEvent.blur(input)
    await waitFor(() => expect(props.onSave).toHaveBeenCalledWith('r1', 'name', 'Заказ 104 — уточнён', 'Заказ 104'))
    await waitFor(() => expect(hasUnsaved()).toBe(false))
  })

  it('keeps rejected input and conflict base through a server refresh', async () => {
    const save = vi.fn(async () => ({ ok: false as const, error: 'Поле уже изменено другим сотрудником' }))
    const view = render(<TableRecordsEditor {...props} onSave={save} />)
    fireEvent.change(view.getByRole('textbox', { name: 'Название' }), { target: { value: 'Моя правка' } })
    fireEvent.blur(view.getByRole('textbox', { name: 'Название' }))
    await waitFor(() => expect(view.getByRole('alert').textContent).toContain('Поле уже изменено'))
    const refreshed = [{ ...rows[0]!, version: 4, data: { ...rows[0]!.data, name: 'Правка коллеги' } }, rows[1]!]
    view.rerender(<TableRecordsEditor {...props} rows={refreshed} onSave={save} />)
    expect((view.getByRole('textbox', { name: 'Название' }) as HTMLInputElement).value).toBe('Моя правка')
    fireEvent.click(view.getByRole('button', { name: 'Сохранить изменения' }))
    await waitFor(() => expect(save).toHaveBeenLastCalledWith('r1', 'name', 'Моя правка', 'Заказ 104'))
    fireEvent.click(view.getByRole('button', { name: 'Вернуть сохранённое значение' }))
    expect((view.getByRole('textbox', { name: 'Название' }) as HTMLInputElement).value).toBe('Правка коллеги')
    await waitFor(() => expect(hasUnsaved()).toBe(false))
  })

  it('normalizes numbers and sends relationship IDs rather than displayed titles', async () => {
    const view = render(<TableRecordsEditor {...props} />)
    fireEvent.change(view.getByRole('textbox', { name: 'Цена' }), { target: { value: '1 250,50' } })
    fireEvent.blur(view.getByRole('textbox', { name: 'Цена' }))
    await waitFor(() => expect(props.onSave).toHaveBeenCalledWith('r1', 'price', 1250.5, 1200))
    fireEvent.change(view.getByRole('combobox', { name: 'Товар' }), { target: { value: 'p2' } })
    fireEvent.blur(view.getByRole('combobox', { name: 'Товар' }))
    await waitFor(() => expect(props.onSave).toHaveBeenCalledWith('r1', 'product', ['p2'], ['p1']))
  })

  it('retains invalid numbers without sending a destructive null value', async () => {
    const view = render(<TableRecordsEditor {...props} />)
    fireEvent.change(view.getByRole('textbox', { name: 'Цена' }), { target: { value: 'не число' } })
    fireEvent.blur(view.getByRole('textbox', { name: 'Цена' }))
    expect(view.getByRole('alert').textContent).toContain('Введите число')
    expect(props.onSave).not.toHaveBeenCalled()
    expect((view.getByRole('textbox', { name: 'Цена' }) as HTMLInputElement).value).toBe('не число')
  })

  it('shows readonly values with no creation or form mutation controls', () => {
    const view = render(<TableRecordsEditor {...props} readOnly />)
    expect(view.queryAllByRole('textbox')).toHaveLength(0)
    expect(view.queryByRole('button', { name: '+ Запись' })).toBeNull()
    expect(view.queryByRole('button', { name: 'Сохранить изменения' })).toBeNull()
    expect(view.getByText('Ежедневник A5')).toBeTruthy()
    expect(props.onSave).not.toHaveBeenCalled()
  })

  it('selects a stable record ID after rows are reordered', () => {
    const view = render(<TableRecordsEditor {...props} selectedRowId="r2" rows={[rows[1]!, rows[0]!]} />)
    expect((view.getByRole('textbox', { name: 'Название' }) as HTMLInputElement).value).toBe('Заказ 103')
    fireEvent.click(view.getByRole('button', { name: /Заказ 104/ }))
    expect(props.onSelect).toHaveBeenCalledWith('r1')
  })

  it('keeps a rejected draft visible when a refreshed table no longer contains the row', async () => {
    const save = vi.fn(async () => ({ ok: false as const, error: 'Строка удалена' }))
    const view = render(<TableRecordsEditor {...props} onSave={save} />)
    fireEvent.change(view.getByRole('textbox', { name: 'Название' }), { target: { value: 'Не потерять этот текст' } })
    fireEvent.blur(view.getByRole('textbox', { name: 'Название' }))
    await waitFor(() => expect(save).toHaveBeenCalled())
    view.rerender(<TableRecordsEditor {...props} rows={[rows[1]!]} onSave={save} />)
    expect((view.getByRole('textbox', { name: 'Название' }) as HTMLInputElement).value).toBe('Не потерять этот текст')
    expect(view.getByText(/Эта запись удалена или больше недоступна/)).toBeTruthy()
    expect((view.getByRole('button', { name: 'Сохранить изменения' }) as HTMLButtonElement).disabled).toBe(true)
    expect(hasUnsaved()).toBe(true)
  })

  it('does not overwrite a field edited while another field is saving', async () => {
    let release!: (value: { ok: true }) => void
    const first = new Promise<{ ok: true }>(resolve => { release = resolve })
    const save = vi.fn().mockReturnValueOnce(first).mockResolvedValue({ ok: true })
    const view = render(<TableRecordsEditor {...props} onSave={save} />)
    fireEvent.change(view.getByRole('textbox', { name: 'Название' }), { target: { value: 'Обновлённый заказ' } })
    fireEvent.submit(view.container.querySelector('form')!)
    fireEvent.change(view.getByRole('textbox', { name: 'Цена' }), { target: { value: '1990' } })
    release({ ok: true })
    await waitFor(() => expect(save).toHaveBeenCalledWith('r1', 'price', 1990, 1200))
    await waitFor(() => expect((view.getByRole('textbox', { name: 'Цена' }) as HTMLInputElement).value).toBe('1990'))
    expect(save).not.toHaveBeenCalledWith('r1', 'price', 1200, 1200)
  })

  it('waits for a pending blur save before allowing navigation', async () => {
    let release!: (value: { ok: true }) => void
    let guard: (() => Promise<boolean>) | null = null
    const pending = new Promise<{ ok: true }>(resolve => { release = resolve })
    const save = vi.fn(() => pending)
    const view = render(<TableRecordsEditor {...props} onSave={save} registerLeaveGuard={next => { guard = next }} />)
    fireEvent.change(view.getByRole('textbox', { name: 'Название' }), { target: { value: 'Сохранить и перейти' } })
    fireEvent.blur(view.getByRole('textbox', { name: 'Название' }))
    const allowed = guard!()
    release({ ok: true })
    expect(await allowed).toBe(true)
    await waitFor(() => expect(hasUnsaved()).toBe(false))
  })

  it('keeps the current form when a list search hides the selected record', () => {
    const view = render(<TableRecordsEditor {...props} allRows={rows} />)
    fireEvent.change(view.getByRole('textbox', { name: 'Название' }), { target: { value: 'Несохранённая правка' } })
    view.rerender(<TableRecordsEditor {...props} allRows={rows} rows={[rows[1]!]} />)
    expect((view.getByRole('textbox', { name: 'Название' }) as HTMLInputElement).value).toBe('Несохранённая правка')
    expect(view.queryByText(/Эта запись удалена/)).toBeNull()
  })
})
