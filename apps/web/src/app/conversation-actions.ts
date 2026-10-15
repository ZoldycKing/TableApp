'use server'

import { changeConversationMessage, closeConversation, conversationMessageHistory, readConversation, sendConversation } from '@/lib/conversations'
import { RowWriteError } from '@/lib/row-mutations'
import { listConversationInbox, markConversationRead, type InboxInput } from '@/lib/conversation-inbox'
import { getGeneralMessageAccess, setGeneralMessageAccess } from '@/lib/general-conversation-access'

async function result<T>(run: () => Promise<T>) {
  try { return { ok: true as const, value: await run() } }
  catch (error) { return { ok: false as const, error: error instanceof RowWriteError ? error.message : 'Не удалось загрузить или сохранить переписку. Попробуйте ещё раз.' } }
}
export async function readConversationAction(slug: string, tableId: string, rowId: string, before?: number, business = false) {
  return result(() => readConversation(slug, tableId, rowId, before, business))
}
export async function sendConversationAction(slug: string, tableId: string, rowId: string, input: { body: string; requestId: string; fileIds?: string[]; internal?: boolean }, business = false) {
  return result(() => sendConversation(slug, tableId, rowId, input, business))
}
export async function changeConversationMessageAction(slug: string, tableId: string, rowId: string, id: string, version: number, body: string | null, business = false) {
  return result(() => changeConversationMessage(slug, tableId, rowId, id, version, body, business))
}
export async function conversationMessageHistoryAction(slug: string, tableId: string, rowId: string, id: string, business = false) {
  return result(() => conversationMessageHistory(slug, tableId, rowId, id, business))
}
export async function closeConversationAction(slug: string, tableId: string, rowId: string, closed: boolean, business = false) {
  return result(() => closeConversation(slug, tableId, rowId, closed, business))
}
export async function listConversationInboxAction(input: InboxInput = {}, business = false) {
  return result(() => listConversationInbox(input, business))
}
export async function markConversationReadAction(slug: string, tableId: string, rowId: string, sequence: number, business = false) {
  return result(() => markConversationRead(slug, tableId, rowId, sequence, business))
}

export async function getGeneralMessageAccessAction() {
  const found = await result(getGeneralMessageAccess)
  return found.ok ? { ok: true as const, ...found.value } : found
}

export async function setGeneralMessageAccessAction(userId: string, allowed: boolean) {
  const saved = await result(() => setGeneralMessageAccess(userId, allowed))
  return saved.ok ? { ok: true as const } : saved
}
