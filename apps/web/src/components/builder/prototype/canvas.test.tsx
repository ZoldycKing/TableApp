// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PrototypeCanvas } from './canvas'
import { seedPrototype } from './model'

vi.mock('./icons', () => ({ ProtoIcon: () => null }))
afterEach(cleanup)
describe('prototype form retry', () => {
  it('retains entered values after a failed workflow and clears them only after success', () => {
    const value = seedPrototype(), run = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true)
    render(<PrototypeCanvas document={value.document} data={value.data} blocks={value.document.pages.find(page => page.id === 'new')!.blocks} editing={false} selected={null} rowId="" role="owner" onRun={run} onSelect={() => {}} onOpen={() => {}} onAdd={() => {}} />)
    const title = screen.getByLabelText('Название') as HTMLInputElement
    const amount = screen.getByLabelText('Сумма, ₽') as HTMLInputElement
    fireEvent.change(title, { target: { value: 'Проверить принтер' } })
    fireEvent.change(amount, { target: { value: '1800' } })
    fireEvent.click(screen.getByRole('button', { name: /^Добавить$/ }))
    expect(title.value).toBe('Проверить принтер')
    expect(amount.value).toBe('1800')
    fireEvent.click(screen.getByRole('button', { name: /^Добавить$/ }))
    expect(title.value).toBe('')
    expect(run).toHaveBeenLastCalledWith(expect.objectContaining({ flowId: 'create' }), { title: 'Проверить принтер', amount: 1800, note: '' })
  })
})
