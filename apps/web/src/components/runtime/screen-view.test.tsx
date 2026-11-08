// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Field, Screen } from '@tableapp/schema'
import type { RuntimeApp } from '@/lib/app-runtime'
import { hasUnsaved } from '@/lib/unsaved'
import { ScreenView } from './screen-view'
import { templateExample } from '@/lib/templates/presentation'
import { templateAppPreview } from '@/lib/templates/app-preview'
import { CatalogHub } from './catalog-hub'

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
  it('restores a navigation draft with its original version and reports only user edits', () => {
    const initial = props(4, 'Latest server name'), onDraftChange = vi.fn(), onValues = vi.fn()
    const draft = { values: { [field.id]: 'Draft from previous visit' }, baseVersion: 1 }
    const form = render(<ScreenView {...initial} draft={draft} onDraftChange={onDraftChange} onValues={onValues} />)
    expect((form.getByLabelText('Name') as HTMLInputElement).value).toBe('Draft from previous visit')
    expect(hasUnsaved()).toBe(true)
    expect(onDraftChange).not.toHaveBeenCalled()
    expect(onValues).toHaveBeenLastCalledWith(draft.values)
    form.rerender(<ScreenView {...props(5, 'Changed again')} draft={draft} onDraftChange={onDraftChange} onSubmit={initial.onSubmit} onValues={onValues} />)
    fireEvent.click(form.getByText('Save'))
    expect(initial.onSubmit).toHaveBeenCalledWith(draft.values, 'edit', 1)
    fireEvent.change(form.getByLabelText('Name'), { target: { value: 'Updated draft' } })
    expect(onDraftChange).toHaveBeenLastCalledWith({ values: { [field.id]: 'Updated draft' }, baseVersion: 1 })
    expect(onValues).toHaveBeenLastCalledWith({ [field.id]: 'Updated draft' })
  })
  it('shows an unavailable record without an edit button for a missing row in a non-paged app', () => {
    const initial = props(), detail: Screen = { id: 'detail', appId: 'app_test', name: 'Detail', type: 'detail', tableId: 'table_test', position: 'a1', tab: null,
      access: screen.access, components: [{ id: 'edit', type: 'button', label: 'Изменить', position: 'a1', roles: null, visibleWhen: null, style: 'primary', action: { id: 'open_edit', type: 'open_screen', screenId: screen.id } }] }
    const form = render(<ScreenView {...initial} screen={detail} row={null} />)
    expect(form.getByText('Запись недоступна')).toBeTruthy()
    expect(form.queryByRole('button', { name: 'Изменить' })).toBeNull()
    expect(initial.onAction).not.toHaveBeenCalled()
    form.rerender(<ScreenView {...initial} row={null} />)
    expect(form.queryByLabelText('Name')).toBeNull()
    expect(form.queryByRole('button', { name: 'Save' })).toBeNull()
  })
})

describe('customer catalog and cabinet copy', () => {
  it('shows duration units in standalone and combined salon catalogs without altering prices', () => {
    const example = templateExample('salon'), runtime = templateAppPreview(example, 'guest').runtime
    const table = runtime.tables[runtime.app.booking!.tables.services]!
    const catalog = runtime.app.screens.find(screen => (screen.type === 'list' || screen.type === 'tiles') && runtime.views[screen.source.viewId]?.tableId === table.id)!
    const initial = props(), listState = { query: '', choiceId: null }
    const ui = render(<ScreenView {...initial} runtime={runtime} screen={catalog} table={table} row={null} collection={{ rows: table.rows, shownFields: table.fields }} listState={listState} />)
    expect(ui.getAllByText('60 мин').length).toBeGreaterThan(0)
    expect(ui.getAllByText(/2[\s\u00a0]500/).length).toBeGreaterThan(0)
    ui.rerender(<CatalogHub runtime={{ ...runtime, app: { ...runtime.app, catalogScreenIds: [catalog.id] } }} state={listState} onState={vi.fn()} onOpenRow={vi.fn()} />)
    expect(ui.getAllByText('60 мин').length).toBeGreaterThan(0)
    expect(ui.getAllByText(/2[\s\u00a0]500/).length).toBeGreaterThan(0)
  })
  it('names the empty sales cabinet as orders, while keeping the history separate', () => {
    const example = templateExample('zakazy'), runtime = templateAppPreview(example, 'client', 'irina@example.com', 'Ирина').runtime
    const config = runtime.app.customer!, table = runtime.tables[config.tableId]!, list = runtime.app.screens.find(screen => screen.id === config.listScreenId)!
    const initial = props(), listState = { query: '', choiceId: null }
    const ui = render(<ScreenView {...initial} runtime={runtime} screen={list} table={table} row={null} collection={{ rows: [], shownFields: table.fields }} listState={listState} />)
    expect(ui.getByText('Активных заказов пока нет')).toBeTruthy()
    expect(ui.queryByText(/Активных обращений/)).toBeNull()
    ui.rerender(<ScreenView {...initial} runtime={runtime} screen={list} table={table} row={null} collection={{ rows: [], shownFields: table.fields }} listState={{ ...listState, customerSection: 'history' }} />)
    expect(ui.getByText('История пока пуста')).toBeTruthy()
  })
})
