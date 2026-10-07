// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Field, Screen } from '@tableapp/schema'
import type { RuntimeApp } from '@/lib/app-runtime'
import { hasUnsaved } from '@/lib/unsaved'
import { ScreenView } from './screen-view'

vi.mock('./app-shell', () => ({ EMPTY_LIST_STATE: { search: '', filters: {}, sort: null } }))

afterEach(cleanup)
const field: Field = { id: 'field_name', tableId: 'table_test', name: 'Name', type: 'text', options: {}, description: null, position: 'a1' }
const screen: Screen = {
  id: 'screen_edit', appId: 'app_test', name: 'Edit', type: 'form', tableId: 'table_test', mode: 'edit', position: 'a1', tab: null,
  access: { public: false, roles: ['manager'], publicFields: [], allowDelete: false }, submitLabel: 'Save', successText: '', successScreenId: null,
  components: [{ id: 'component_name', type: 'form_field', fieldId: field.id, label: 'Name', required: false, placeholder: null,
    position: 'a1', visibleWhen: null, roles: null }],
}
function props(version = 0, name = 'Original', rowId = 'row_test') {
  return { screen, table: { id: 'table_test', name: 'Table', fields: [field], primaryFieldId: field.id, rows: [] },
    row: { id: rowId, version, position: 'a1', data: { [field.id]: name } }, collection: null, viewer: null,
    accent: 'violet', relatedTitles: {}, runtime: { app: { id: 'app_test' } } as RuntimeApp,
    onOpenRow: vi.fn(), onOpenScreen: vi.fn(), onAction: vi.fn(), onSubmit: vi.fn() }
}
describe('form snapshots during background updates', () => {
  it('retains unsaved input and submits the version used to begin editing', () => {
    const initial = props()
    const form = render(<ScreenView {...initial} />)
    fireEvent.change(form.getByLabelText('Name'), { target: { value: 'My draft' } })
    expect(hasUnsaved()).toBe(true)
    form.rerender(<ScreenView {...props(1, 'Someone else')} onSubmit={initial.onSubmit} />)
    expect((form.getByLabelText('Name') as HTMLInputElement).value).toBe('My draft')
    fireEvent.click(form.getByText('Save'))
    expect(initial.onSubmit).toHaveBeenCalledWith({ [field.id]: 'My draft' }, 'edit', 0)
    form.unmount()
    expect(hasUnsaved()).toBe(false)
  })
  it('updates a pristine form and its version together', () => {
    const initial = props()
    const form = render(<ScreenView {...initial} />)
    form.rerender(<ScreenView {...props(1, 'Updated')} onSubmit={initial.onSubmit} />)
    expect((form.getByLabelText('Name') as HTMLInputElement).value).toBe('Updated')
    fireEvent.click(form.getByText('Save'))
    expect(initial.onSubmit).toHaveBeenCalledWith({ [field.id]: 'Updated' }, 'edit', 1)
    expect(hasUnsaved()).toBe(false)
  })
  it('opens another row with fresh values and clears the previous draft marker', () => {
    const initial = props()
    const form = render(<ScreenView {...initial} />)
    fireEvent.change(form.getByLabelText('Name'), { target: { value: 'Draft' } })
    form.rerender(<ScreenView {...props(4, 'Another row', 'row_other')} onSubmit={initial.onSubmit} />)
    expect((form.getByLabelText('Name') as HTMLInputElement).value).toBe('Another row')
    expect(hasUnsaved()).toBe(false)
    fireEvent.click(form.getByText('Save'))
    expect(initial.onSubmit).toHaveBeenCalledWith({ [field.id]: 'Another row' }, 'edit', 4)
  })
})
