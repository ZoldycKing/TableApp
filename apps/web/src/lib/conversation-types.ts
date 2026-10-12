import type { Attachment } from '@tableapp/schema'

export type ConversationMessage = { id: string; sequence: number; body: string; author: string; mine: boolean; version: number;
  createdAt: string; edited: boolean; deleted: boolean; files: Attachment[]; canModerate: boolean; canViewRevisions: boolean }
export type ConversationPage = { conversationId: string | null; enabled: boolean; closed: boolean; staff: boolean; canManage: boolean;
  messages: ConversationMessage[]; nextBefore: number | null; notes: { id: string; body: string; author: string; createdAt: string }[]; contextTitle?: string }

export type ConversationSummary = {
  id: string; slug: string; tableId: string; rowId: string; title: string; customer: string;
  appName: string; detailScreenId: string; preview: string; lastAt: string; unread: number; closed: boolean
}
export type ConversationInboxPage = { items: ConversationSummary[]; next: string | null }
