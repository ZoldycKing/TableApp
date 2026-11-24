'use client'

import type { Attachment } from '@tableapp/schema'
import type { ConversationPage } from '@/lib/conversation-types'
import type { UploadAlertInfo } from './conversation-file-ui'

/** Real demo photo for clean image thumbnails in support ticket shots. */
export const DEMO_PHOTO_URL = '/template-media/dispatch/act-photo.jpg'

const at = (hours: number, minutes = 0) => {
  const value = new Date(Date.UTC(2026, 10, 24, hours - 3, minutes, 0))
  return value.toISOString()
}

const pdf: Attachment = {
  id: 'att_pdf', key: 'demo/act.pdf', name: 'акт-приёмки.pdf', mime: 'application/pdf', size: 245760, width: null, height: null, scanStatus: 'clean',
}
const photo: Attachment = {
  id: 'att_photo', key: DEMO_PHOTO_URL, name: 'фото-дефекта.jpg', mime: 'image/jpeg', size: 280075, width: 1152, height: 864, scanStatus: 'clean',
}
const pending: Attachment = {
  id: 'att_pending', key: 'demo/pending.bin', name: 'схема.xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', size: 12000, width: null, height: null, scanStatus: 'pending',
}
const blocked: Attachment = {
  id: 'att_blocked', key: 'demo/blocked.bin', name: 'invoice.exe', mime: 'application/octet-stream', size: 0, width: null, height: null, scanStatus: 'infected',
}

export const conversationShotAlert: UploadAlertInfo = {
  fileName: 'invoice.exe',
  kind: 'type',
  message: 'Файл «invoice.exe» не загружен: такой тип не поддерживается.',
}

const draftDoc: Attachment = {
  id: 'att_draft_doc', key: 'demo/comment.docx', name: 'комментарий.docx',
  mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 18432, width: null, height: null, scanStatus: 'clean',
}

export const conversationShotDraftFiles: Attachment[] = [pdf, draftDoc]

export function conversationShotPage(staff: boolean): ConversationPage {
  return {
    conversationId: 'thread_demo',
    enabled: true,
    closed: false,
    staff,
    canManage: staff,
    contextTitle: 'Т-1042 · Не пришёл товар',
    nextBefore: null,
    notes: staff ? [{ id: 'note_1', body: 'Клиент ждёт ответ по акту.', author: 'Анна Волкова', createdAt: at(11, 5) }] : [],
    messages: [
      {
        id: 'msg_1', sequence: 1, body: 'Добрый день. Прикладываю акт и фото по заявке.',
        author: 'Ольга Семёнова', mine: !staff, version: 0, createdAt: at(10, 12),
        edited: false, deleted: false, files: [pdf, photo], canModerate: false, canViewRevisions: false,
      },
      {
        id: 'msg_2', sequence: 2, body: 'Приняли документы. Ещё один файл проверяется, а вредоносное вложение заблокировали.',
        author: staff ? 'Вы' : 'Анна Волкова', mine: staff, version: 0, createdAt: at(12, 0),
        edited: false, deleted: false, files: [pending, blocked], canModerate: staff, canViewRevisions: false,
      },
    ],
  }
}

export type ConversationShotBundle = {
  preview: ConversationPage
  previewFiles: Attachment[]
  previewAlert: UploadAlertInfo
}
