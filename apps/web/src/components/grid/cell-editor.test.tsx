// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { normalizeFieldOptions, type Field } from '@tableapp/schema'
import { CellEditor } from './cell-editor'
const field: Field = { id: 'date', tableId: 'table', name: 'Date', type: 'datetime', description: null, position: 'a1',
  options: normalizeFieldOptions('datetime', { timeZone: 'America/New_York' }) as Extract<Field, { type: 'datetime' }>['options'] }
afterEach(cleanup)
describe('datetime editing uses the configured field zone', () => {
  it('does not shift a timestamp when it is opened and committed unchanged', () => {
    const commit = vi.fn(), instant = '2026-03-14T02:30:00.000Z'
    const { container } = render(<CellEditor field={field} value={instant} onCommit={commit} onCancel={() => {}} />)
    const input = container.querySelector('input')!
    expect(input.value).toBe('2026-03-13T22:30')
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(commit).toHaveBeenCalledWith(instant, 'below')
  })
})
