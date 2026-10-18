// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Attachment, Field, Screen } from '@tableapp/schema'
import type { RuntimeApp } from '@/lib/app-runtime'
import { ScreenView } from './screen-view'

vi.mock('./app-shell', () => ({ EMPTY_LIST_STATE: { query: '', choiceId: null } }))

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const name: Field = { id: 'field_name', tableId: 'table_test', name: 'Что сделано', type: 'text', options: {}, description: null, position: 'a' }
const photo: Field = { ...name, id: 'field_photo', name: 'Фото с выезда', type: 'attachment', options: { maxCount: 5 }, position: 'b' }
const document: Field = { ...photo, id: 'field_document', name: 'Документы', position: 'c' }
const fields = [name, photo, document]
const screen: Screen = {
  id: 'screen_edit', appId: 'app_test', name: 'Работа с заявкой', type: 'form', tableId: 'table_test', mode: 'edit', position: 'a', tab: null,
  access: { public: false, roles: ['staff'], publicFields: [], allowDelete: false }, submitLabel: 'Сохранить', successText: '', successScreenId: null,
  components: fields.map(field => ({ id: `component_${field.id}`, type: 'form_field', fieldId: field.id, label: null, required: false,
    placeholder: null, position: field.position, visibleWhen: null, roles: null })),
}
const file = (id: string): Attachment => ({ id, key: `workspace/${id}.txt`, name: `${id}.txt`, mime: 'text/plain', size: 1, width: null, height: null })
const response = (attachment: Attachment) => ({ json: async () => ({ ok: true, attachment }) }) as Response
function props(attachments: Attachment[] = []) {
  return { screen, table: { id: 'table_test', name: 'Заявки', fields, primaryFieldId: name.id, rows: [] },
    row: { id: 'row_test', version: 3, position: 'a', data: { [name.id]: 'Черновик', [photo.id]: attachments, [document.id]: [] } },
    collection: null, viewer: null, accent: 'violet', relatedTitles: {}, runtime: { app: { id: 'app_test' } } as RuntimeApp,
    onOpenRow: vi.fn(), onOpenScreen: vi.fn(), onAction: vi.fn(), onSubmit: vi.fn(), onDraftChange: vi.fn() }
}
const inputs = (container: HTMLElement) => container.querySelectorAll<HTMLInputElement>('input[type="file"]')
const pick = (input: HTMLInputElement, id: string) => fireEvent.change(input, { target: { files: [new File(['x'], `${id}.txt`, { type: 'text/plain' })] } })

describe('runtime form attachment submission', () => {
  it('blocks native submit during upload, then saves the attachment and locks it during pending save', async () => {
    let finish!: (value: Response) => void
    const fetch = vi.fn(() => new Promise<Response>(resolve => { finish = resolve }))
    vi.stubGlobal('fetch', fetch)
    const initial = props(), ui = render(<ScreenView {...initial} />)
    pick(inputs(ui.container)[0]!, 'proof')
    fireEvent.change(ui.getByLabelText('Что сделано'), { target: { value: 'Работа завершена' } })
    expect((ui.getByRole('button', { name: 'Сохранить' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.submit(ui.container.querySelector('form')!)
    expect(initial.onSubmit).not.toHaveBeenCalled()

    await act(async () => { finish(response(file('proof'))) })
    expect(initial.onSubmit).not.toHaveBeenCalled()
    fireEvent.click(ui.getByRole('button', { name: 'Сохранить' }))
    expect(initial.onSubmit).toHaveBeenCalledWith({ [name.id]: 'Работа завершена', [photo.id]: [file('proof')], [document.id]: [] }, 'edit', 3)

    ui.rerender(<ScreenView {...initial} pending />)
    expect((ui.getByTitle('Убрать файл') as HTMLButtonElement).disabled).toBe(true)
    expect([...inputs(ui.container)].every(input => input.disabled)).toBe(true)
    fireEvent.click(ui.getByTitle('Убрать файл'))
    pick(inputs(ui.container)[1]!, 'late')
    fireEvent.submit(ui.container.querySelector('form')!)
    expect(initial.onSubmit).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(ui.getByRole('link', { name: 'proof.txt' })).toBeTruthy()
  })

  it('waits for each attachment field without overwriting another field or its draft', async () => {
    const finish: ((value: Response) => void)[] = []
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { finish.push(resolve) })))
    const initial = props(), ui = render(<ScreenView {...initial} />)
    pick(inputs(ui.container)[0]!, 'photo')
    pick(inputs(ui.container)[1]!, 'document')
    await act(async () => { finish[0]!(response(file('photo'))) })
    fireEvent.submit(ui.container.querySelector('form')!)
    expect(initial.onSubmit).not.toHaveBeenCalled()
    expect((ui.getByRole('button', { name: 'Сохранить' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(ui.getByLabelText('Что сделано'), { target: { value: 'Оба файла' } })
    await act(async () => { finish[1]!(response(file('document'))) })
    fireEvent.click(ui.getByRole('button', { name: 'Сохранить' }))
    const values = { [name.id]: 'Оба файла', [photo.id]: [file('photo')], [document.id]: [file('document')] }
    expect(initial.onSubmit).toHaveBeenCalledWith(values, 'edit', 3)
    expect(initial.onDraftChange).toHaveBeenLastCalledWith({ values, baseVersion: 3 })
  })

  it('waits for both upload controls when the same attachment field appears twice', async () => {
    const finish: ((value: Response) => void)[] = []
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { finish.push(resolve) })))
    const initial = props(), original = screen.components.find(component => component.type === 'form_field' && component.fieldId === photo.id)!
    const duplicate = { ...screen, components: [...screen.components, { ...original, id: 'component_photo_again', position: 'b1' }] }
    const ui = render(<ScreenView {...initial} screen={duplicate} />)
    pick(inputs(ui.container)[0]!, 'first-proof')
    pick(inputs(ui.container)[1]!, 'second-proof')
    await act(async () => { finish[0]!(response(file('first-proof'))) })
    expect((ui.getByRole('button', { name: 'Сохранить' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.submit(ui.container.querySelector('form')!)
    expect(initial.onSubmit).not.toHaveBeenCalled()

    await act(async () => { finish[1]!(response(file('second-proof'))) })
    expect((ui.getByRole('button', { name: 'Сохранить' }) as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(ui.getByRole('button', { name: 'Сохранить' }))
    expect(initial.onSubmit).toHaveBeenCalledWith({ [name.id]: 'Черновик', [photo.id]: [file('first-proof'), file('second-proof')], [document.id]: [] }, 'edit', 3)
  })

  it('retains existing attachments, text and upload errors after a failed upload and a pending save', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => ({ ok: false, error: 'Файл не загрузился' }) }))
    const initial = props([file('existing')]), ui = render(<ScreenView {...initial} />)
    fireEvent.change(ui.getByLabelText('Что сделано'), { target: { value: 'Сохранённый черновик' } })
    pick(inputs(ui.container)[0]!, 'failed')
    await ui.findByText('Файл не загрузился')
    fireEvent.click(ui.getByRole('button', { name: 'Сохранить' }))
    expect(initial.onSubmit).toHaveBeenCalledWith({ [name.id]: 'Сохранённый черновик', [photo.id]: [file('existing')], [document.id]: [] }, 'edit', 3)
    ui.rerender(<ScreenView {...initial} pending />)
    ui.rerender(<ScreenView {...initial} />)
    expect(ui.getByText('Файл не загрузился')).toBeTruthy()
    expect(ui.getByRole('link', { name: 'existing.txt' })).toBeTruthy()
    expect((ui.getByLabelText('Что сделано') as HTMLInputElement).value).toBe('Сохранённый черновик')
  })

  it('merges uploads that finish together into the same form snapshot', async () => {
    const finish: ((value: Response) => void)[] = []
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { finish.push(resolve) })))
    const initial = props(), ui = render(<ScreenView {...initial} />)
    pick(inputs(ui.container)[0]!, 'photo')
    pick(inputs(ui.container)[1]!, 'document')
    await act(async () => {
      finish[0]!(response(file('photo')))
      finish[1]!(response(file('document')))
    })
    fireEvent.click(ui.getByRole('button', { name: 'Сохранить' }))
    expect(initial.onSubmit).toHaveBeenCalledWith({ [name.id]: 'Черновик', [photo.id]: [file('photo')], [document.id]: [file('document')] }, 'edit', 3)
  })

  it('cancels the old row upload without locking or changing the next row', async () => {
    let finish!: (value: Response) => void
    const fetch = vi.fn((_url, _options) => new Promise<Response>(resolve => { finish = resolve }))
    vi.stubGlobal('fetch', fetch)
    const initial = props(), ui = render(<ScreenView {...initial} />)
    pick(inputs(ui.container)[0]!, 'old-row')
    const signal = fetch.mock.calls[0]![1].signal as AbortSignal
    ui.rerender(<ScreenView {...initial} row={{ ...initial.row, id: 'row_other', version: 4, data: { [name.id]: 'Другая заявка' } }} />)
    expect(signal.aborted).toBe(true)
    await act(async () => { finish(response(file('old-row'))) })
    expect(ui.queryByRole('link', { name: 'old-row.txt' })).toBeNull()
    expect((ui.getByRole('button', { name: 'Сохранить' }) as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(ui.getByRole('button', { name: 'Сохранить' }))
    expect(initial.onSubmit).toHaveBeenCalledWith({ [name.id]: 'Другая заявка' }, 'edit', 4)
  })
})
