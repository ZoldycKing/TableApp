// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { fieldSchema, normalizeFieldOptions } from '@tableapp/schema'
import { FormFieldInput } from './form-field'
vi.mock('@/components/file-upload', () => ({ FileUpload: () => null }))
afterEach(cleanup)
it('shows and saves wall-clock time in the field timezone without UTC or browser shifts', () => {
  const field = fieldSchema.parse({ id: 'date', tableId: 'table', name: 'Когда', type: 'datetime', description: null, position: 'a',
    options: normalizeFieldOptions('datetime', { timeZone: 'Asia/Novosibirsk' }) })
  const onChange = vi.fn()
  const ui = render(<FormFieldInput field={field} value="2026-10-08T03:00:00Z" required={false} placeholder={null} relatedOptions={[]} onChange={onChange} />)
  const input = ui.container.querySelector('input')!
  expect(input.value).toBe('2026-10-08T10:00')
  fireEvent.change(input, { target: { value: '2026-10-08T10:30' } })
  expect(onChange).toHaveBeenCalledWith('2026-10-08T03:30:00.000Z')
  expect(ui.getByText('Часовой пояс: Asia/Novosibirsk')).toBeTruthy()
})
