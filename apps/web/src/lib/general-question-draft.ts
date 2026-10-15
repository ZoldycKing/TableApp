export const GENERAL_QUESTION_SCREEN = '__tableapp_question'
export type GeneralQuestionDraft = { key: string; body: string; requestId: string; ownerId: string | null; active: boolean; login: boolean }
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i

/** A draft stays in this tab and business; a different signed-in person never inherits it. */
export function parseGeneralQuestionDraft(raw: string | null, key: string, ownerId: string | null): GeneralQuestionDraft | null {
  try {
    const value = JSON.parse(raw ?? '') as GeneralQuestionDraft
    if (!value || value.key !== key || typeof value.body !== 'string' || value.body.length > 4000 ||
      typeof value.requestId !== 'string' || !uuid.test(value.requestId) || typeof value.active !== 'boolean' || typeof value.login !== 'boolean' ||
      value.ownerId !== null && (typeof value.ownerId !== 'string' || value.ownerId.length > 200 || value.ownerId !== ownerId)) return null
    return { key, body: value.body, requestId: value.requestId, ownerId, active: value.active, login: value.login && !ownerId }
  } catch { return null }
}
