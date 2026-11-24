// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { useState } from 'react'
import type { Attachment } from '@tableapp/schema'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FileUpload } from './file-upload'

const file = (id: string): Attachment => ({ id, key: `workspace/${id}.txt`, name: `${id}.txt`, mime: 'text/plain', size: 1, width: null, height: null })
const conversation = { slug: 'business', tableId: 'orders', rowId: 'order-a' }
const response = (attachment: Attachment) => ({ json: async () => ({ ok: true, attachment }) }) as Response
const input = (container: HTMLElement) => container.querySelector<HTMLInputElement>('input[type="file"]')!
const pick = (container: HTMLElement, name: string) => fireEvent.change(input(container), { target: { files: [new File(['x'], name, { type: 'text/plain' })] } })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('attachment upload lifecycle', () => {
  it('keeps successfully uploaded files if a later file fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response(file('a'))).mockRejectedValueOnce(new Error('offline')))
    function Form() {
      const [files, setFiles] = useState<Attachment[]>([])
      return <FileUpload value={files} maxCount={5} compact conversation={conversation} onChange={setFiles} />
    }
    const ui = render(<Form />)
    fireEvent.change(input(ui.container), { target: { files: [new File(['a'], 'a.txt'), new File(['b'], 'b.txt')] } })
    await ui.findByText('Не удалось загрузить файл. Попробуйте ещё раз')
    expect(ui.getByRole('link', { name: /a\.txt/ })).toBeTruthy()
  })

  it('does not restore a removed file when another upload finishes', async () => {
    let finish!: (value: Response) => void
    const fetch = vi.fn((_url: string, options?: RequestInit) => {
      if (options?.method === 'DELETE') return Promise.resolve({ json: async () => ({ ok: true }) } as Response)
      return new Promise<Response>(resolve => { finish = resolve })
    })
    vi.stubGlobal('fetch', fetch)
    function Form() {
      const [files, setFiles] = useState([file('a')])
      return <FileUpload value={files} maxCount={5} compact conversation={conversation} onChange={setFiles} />
    }
    const ui = render(<Form />)
    pick(ui.container, 'b.txt')
    await ui.findByText('Проверяется…')
    const removeUploaded = ui.getByRole('link', { name: /a\.txt/ }).parentElement!.querySelector('button[aria-label="Убрать файл"]')!
    fireEvent.click(removeUploaded)
    expect(ui.queryByRole('link', { name: /a\.txt/ })).toBeNull()
    expect(fetch.mock.calls.some(call => call[1]?.method === 'DELETE')).toBe(true)
    await act(async () => { finish(response(file('b'))) })
    expect(ui.getByRole('link', { name: /b\.txt/ })).toBeTruthy()
    expect(ui.queryByRole('link', { name: /a\.txt/ })).toBeNull()
  })

  it('aborts an in-flight upload when the pending chip is removed', async () => {
    let finish!: (value: Response) => void
    const fetch = vi.fn((_url: string, options?: RequestInit) => new Promise<Response>((resolve, reject) => {
      const signal = options?.signal
      if (signal) signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
      finish = resolve
    }))
    vi.stubGlobal('fetch', fetch)
    const change = vi.fn(), busy = vi.fn()
    const ui = render(<FileUpload value={[]} maxCount={5} compact conversation={conversation} onChange={change} onBusyChange={busy} />)
    pick(ui.container, 'pending.txt')
    expect(await ui.findByText('Проверяется…')).toBeTruthy()
    fireEvent.click(ui.getByRole('button', { name: 'Убрать файл' }))
    await waitFor(() => expect(busy).toHaveBeenLastCalledWith(false))
    expect(ui.queryByText('Проверяется…')).toBeNull()
    expect(change).not.toHaveBeenCalled()
    await act(async () => { finish(response(file('pending'))) })
    expect(change).not.toHaveBeenCalled()
  })

  it('ignores an upload that finishes after switching to another conversation', async () => {
    let finish!: (value: Response) => void
    const fetch = vi.fn((_url, _options) => new Promise<Response>(resolve => { finish = resolve }))
    vi.stubGlobal('fetch', fetch)
    const change = vi.fn(), busy = vi.fn()
    const ui = render(<FileUpload value={[]} maxCount={5} compact conversation={conversation} onChange={change} onBusyChange={busy} />)
    pick(ui.container, 'old.txt')
    const signal = fetch.mock.calls[0]![1].signal as AbortSignal
    ui.rerender(<FileUpload value={[]} maxCount={5} compact conversation={{ ...conversation, rowId: 'order-b' }} onChange={change} onBusyChange={busy} />)
    await act(async () => { finish(response(file('old'))) })
    expect(change).not.toHaveBeenCalled()
    expect(signal.aborted).toBe(true)
    expect(ui.getByRole('button', { name: 'Прикрепить файл' }).hasAttribute('disabled')).toBe(false)
    expect(busy).toHaveBeenLastCalledWith(false)
  })

  it('does not restore already submitted attachments after the editor is disabled and cleared', async () => {
    let finish!: (value: Response) => void
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { finish = resolve })))
    const change = vi.fn(), props = { value: [file('sent')], maxCount: 5, compact: true, conversation, onChange: change }
    const ui = render(<FileUpload {...props} />)
    pick(ui.container, 'late.txt')
    ui.rerender(<FileUpload {...props} value={[]} disabled />)
    ui.rerender(<FileUpload {...props} value={[]} />)
    await act(async () => { finish(response(file('late'))) })
    await waitFor(() => expect(ui.getByRole('button', { name: 'Прикрепить файл' }).hasAttribute('disabled')).toBe(false))
    expect(change).not.toHaveBeenCalled()
    expect(ui.queryByRole('link')).toBeNull()
  })
})
