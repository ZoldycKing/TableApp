'use client'

import type { Attachment } from '@tableapp/schema'
import type { ConversationPage } from '@/lib/conversation-types'
import type { UploadAlertInfo } from './conversation-file-ui'

/** Tiny sage-tinted PNG used as a clean image thumbnail in support ticket shots. */
export const DEMO_THUMB_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAUElEQVR42u3PQQkAAAgEsGtmERvY/28E38JgBZaafi0CAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICApcFhy9g8cmCFGgAAAAASUVORK5CYII='

const at = (hours: number, minutes = 0) => {
  const value = new Date(Date.UTC(2026, 10, 24, hours - 3, minutes, 0))
  return value.toISOString()
}

const pdf: Attachment = {
  id: 'att_pdf', key: 'demo/act.pdf', name: 'акт-приёмки.pdf', mime: 'application/pdf', size: 245760, width: null, height: null, scanStatus: 'clean',
}
const photo: Attachment = {
  id: 'att_photo', key: DEMO_THUMB_DATA_URL, name: 'фото-дефекта.png', mime: 'image/png', size: 81920, width: 64, height: 64, scanStatus: 'clean',
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

export const conversationShotDraftFiles: Attachment[] = [pdf]

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
