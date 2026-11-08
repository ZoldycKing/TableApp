// @vitest-environment jsdom
import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { templateExample } from '@/lib/templates/presentation'
import { previewRuntime } from '@/lib/preview-runtime'
import type { RuntimeTable } from '@/lib/app-runtime'
import { ScreenView } from './screen-view'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/lib/unsaved', () => ({ useUnsaved: vi.fn() }))
vi.mock('./app-shell', () => ({ EMPTY_LIST_STATE: {} }))
vi.mock('@/app/file-actions', () => ({ uploadFileAction: vi.fn() }))
afterEach(cleanup)

describe('a production form reporting values to its parent', () => {
  it('does not reset unchanged input or loop when the parent supplies an equivalent seed', () => {
    const example = templateExample('proizvodstvo'), config = example.app.production!
    const tables: Record<string, RuntimeTable> = Object.fromEntries(example.built.tables.map(table => [table.id, { ...table,
      fields: example.byTable.get(table.id)!, rows: example.rows.filter(row => row.tableId === table.id).map(row => ({ ...row, version: 0 })) }]))
    const runtime = previewRuntime(example.app, example.views, tables, {}, null)
    const form = example.app.screens.find(item => item.type === 'form' && item.mode === 'create' && item.tableId === config.tables.production)!
    function Parent() {
      const [reports, setReports] = useState(0)
      const [revision, setRevision] = useState(0)
      return <><output aria-label="Reports">{reports}</output><button onClick={() => setRevision(revision + 1)}>Refresh parent {revision}</button><ScreenView screen={form} table={runtime.tables[config.tables.production]} row={null} collection={null} viewer={null} accent="green" relatedTitles={runtime.relatedTitles} runtime={runtime} editing initialValues={{}} onValues={() => setReports(count => count + 1)} onAction={() => {}} onOpenRow={() => {}} onOpenScreen={() => {}} onSubmit={() => {}} /></>
    }
    render(<Parent />)
    expect(screen.getByLabelText('Reports').textContent).toBe('1')
    fireEvent.click(screen.getByRole('button', { name: 'Refresh parent 0' }))
    expect(screen.getByLabelText('Reports').textContent).toBe('1')
    fireEvent.change(screen.getByLabelText('Годных изделий'), { target: { value: '5' } })
    expect(screen.getByLabelText('Reports').textContent).toBe('2')
    fireEvent.click(screen.getByRole('button', { name: 'Refresh parent 1' }))
    expect(screen.getByLabelText('Reports').textContent).toBe('2')
    expect((screen.getByLabelText('Годных изделий') as HTMLInputElement).value).toBe('5')
  })
})
