'use client'

import type { Attachment } from '@tableapp/schema'
import type { ConversationPage } from '@/lib/conversation-types'

const at = (hours: number, minutes = 0) => {
  const value = new Date(Date.UTC(2026, 10, 24, hours - 3, minutes, 0))
  return value.toISOString()
}

const cuffPhoto: Attachment = {
  id: 'att_cuff',
  key: '/template-media/service/cuff-worn.jpg',
  name: 'манжет-износ.jpg',
  mime: 'image/jpeg',
  size: 15919,
  width: 640,
  height: 480,
  scanStatus: 'clean',
}

const estimatePhoto: Attachment = {
  id: 'att_estimate',
  key: '/template-media/service/estimate-1042.jpg',
  name: 'смета-РМ-1042.jpg',
  mime: 'image/jpeg',
  size: 26279,
  width: 720,
  height: 960,
  scanStatus: 'clean',
}

/** Desk drafts for the Bosch repair shot — estimate photo ready to send. */
export const serviceConversationShotDraftFiles: Attachment[] = [estimatePhoto]

/**
 * Thread for РМ-1042 (Bosch / Мария Сидорова / Андрей Морозов):
 * client asks when ready → master sends cuff photo + estimate → (client approves on desk thread / via cabinet button) → internal note.
 * Client shot stops before the approve reply so «Согласовать стоимость» is still actionable.
 */
export function serviceConversationShotPage(staff: boolean): ConversationPage {
  const base = [
    {
      id: 'msg_svc_1', sequence: 1,
      body: 'Добрый день. Подскажите, когда будет готово? Нужна машина к выходным.',
      author: 'Мария Сидорова', mine: !staff, version: 0, createdAt: at(9, 20),
      edited: false, deleted: false, files: [] as Attachment[], canModerate: false, canViewRevisions: false,
    },
    {
      id: 'msg_svc_2', sequence: 2,
      body: 'Мария, добрый день. Манжет люка изношен — приложил фото и смету на 6 200 ₽. После согласования поставим деталь и соберём.',
      author: staff ? 'Вы' : 'Андрей Морозов', mine: staff, version: 0, createdAt: at(10, 45),
      edited: false, deleted: false, files: [cuffPhoto, estimatePhoto], canModerate: staff, canViewRevisions: false,
    },
  ]
  const approved = {
    id: 'msg_svc_3', sequence: 3,
    body: 'Смету согласовываю, можно ставить манжету. Жду готовности.',
    author: 'Мария Сидорова', mine: !staff, version: 0, createdAt: at(12, 5),
    edited: false, deleted: false, files: [] as Attachment[], canModerate: false, canViewRevisions: false,
  }
  return {
    conversationId: 'thread_service_1042',
    enabled: true,
    closed: false,
    staff,
    canManage: staff,
    contextTitle: 'РМ-1042 · Стиральная машина Bosch WLG',
    nextBefore: null,
    notes: staff
      ? [{ id: 'note_svc_1', body: 'Заказали манжету у поставщика, придёт в четверг.', author: 'Андрей Морозов', createdAt: at(11, 40) }]
      : [],
    messages: staff ? [...base, approved] : base,
  }
}
