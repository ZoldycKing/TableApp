'use server'

import { currentStaffEmail, enrolFromQuestion, questionAppFor } from '@/lib/app-session'

/** Reuse only the verified shared client session; the browser never supplies an identity. */
export async function beginGeneralQuestionAction(slug: string): Promise<{ ok: true; authenticated: boolean } | { ok: false; error: string }> {
  const app = await questionAppFor(slug)
  if (!app) return { ok: false, error: 'Вопросы этому бизнесу сейчас недоступны' }
  const email = await currentStaffEmail()
  if (!email) return { ok: true, authenticated: false }
  if (!await enrolFromQuestion(app, email)) return { ok: false, error: 'Для этого адреса настроен рабочий доступ. Войдите как сотрудник.' }
  return { ok: true, authenticated: true }
}
