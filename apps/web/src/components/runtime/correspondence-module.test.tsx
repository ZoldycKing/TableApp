// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { conversationShotDraftFiles, conversationShotPage } from './conversation-shot'
import { CorrespondenceModule } from './correspondence-module'

vi.mock('@/app/conversation-actions', () => ({
  readConversationAction: vi.fn(),
  sendConversationAction: vi.fn(),
  changeConversationMessageAction: vi.fn(),
  conversationMessageHistoryAction: vi.fn(),
  closeConversationAction: vi.fn(),
  markConversationReadAction: vi.fn(),
}))

afterEach(() => cleanup())

describe('CorrespondenceModule', () => {
  it('binds to a record and shows the staff composer with Клиенту/Заметка and attachments', async () => {
    render(
      <CorrespondenceModule
        slug="demo"
        tableId="tbl_repairs"
        rowId="row_1"
        business
        showContext={false}
        fixture={conversationShotPage(true)}
        fixtureFiles={conversationShotDraftFiles}
      />,
    )
    expect(document.querySelector('[data-correspondence-module][data-table="tbl_repairs"][data-row="row_1"]')).toBeTruthy()
    expect(screen.queryByText('Просрочено')).toBeNull()
    expect(screen.getByRole('radiogroup', { name: 'Режим ответа' }).textContent).toMatch(/Клиенту|Заметка/)
    expect(await screen.findByRole('button', { name: 'Прикрепить файл' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Отправить' })).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'Внутренняя заметка' })).toBeTruthy()
    expect(document.querySelector('[data-internal]')).toBeTruthy()
  })

  it('hides internal notes from the client fixture', async () => {
    render(
      <CorrespondenceModule
        slug="demo"
        tableId="tbl_repairs"
        rowId="row_1"
        showContext={false}
        fixture={conversationShotPage(false)}
      />,
    )
    expect(await screen.findByText('Добрый день. Прикладываю акт и фото по заявке.')).toBeTruthy()
    expect(screen.queryByText('Внутренняя заметка')).toBeNull()
    expect(screen.queryByText('Клиент ждёт ответ по акту.')).toBeNull()
  })
})
