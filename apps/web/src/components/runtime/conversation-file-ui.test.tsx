// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react'
import type { Attachment } from '@tableapp/schema'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConversationAttachmentChip, ConversationPendingChip, formatAttachmentSize } from './conversation-file-ui'

afterEach(() => cleanup())

const pdf: Attachment = {
  id: 'att_pdf', key: 'demo/act.pdf', name: 'акт-приёмки.pdf', mime: 'application/pdf',
  size: 245760, width: null, height: null, scanStatus: 'clean',
}

describe('conversation attachment chips', () => {
  it('formats sizes for draft chips and exposes a 32px remove control', () => {
    expect(formatAttachmentSize(245760)).toBe('240 КБ')
    const remove = vi.fn()
    const ui = render(<ConversationAttachmentChip item={pdf} removable onRemove={remove} />)
    expect(ui.getByRole('link', { name: /акт-приёмки\.pdf · 240 КБ/ })).toBeTruthy()
    const button = ui.getByRole('button', { name: 'Убрать файл' })
    expect(button.getAttribute('title')).toBe('Убрать файл')
    expect(button.className).toMatch(/h-8/)
    expect(button.className).toMatch(/w-8/)
    fireEvent.click(button)
    expect(remove).toHaveBeenCalledOnce()
  })

  it('cancels an uploading pending chip from the same remove control', () => {
    const remove = vi.fn()
    const ui = render(<ConversationPendingChip name="схема.xlsx" onRemove={remove} />)
    fireEvent.click(ui.getByRole('button', { name: 'Убрать файл' }))
    expect(remove).toHaveBeenCalledOnce()
  })
})
