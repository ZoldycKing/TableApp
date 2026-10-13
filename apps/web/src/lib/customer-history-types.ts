export const CRM_PROFILE_PREFIX = 'profile:'
export type CustomerHistoryItem = { id: string; tableId: string; slug: string; screenId: string; title: string; module: string; kind: string; status: string | null; when: string | null }
export type CustomerHistoryPage = { customer: { name: string; email: string | null; phone: string | null }; items: CustomerHistoryItem[]; kinds: { id: string; name: string }[]; next: string | null; reason?: string }
export type CustomerDirectoryPage = { items: { id: string; name: string; email: string | null; phone: string | null; profile: boolean }[]; next: string | null }
