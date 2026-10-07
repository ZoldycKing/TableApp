'use server'

import { revalidatePath } from 'next/cache'
import { requireMember } from '@/lib/session'
import { recountWorkspace } from '@/lib/usage'

/**
 * Пересчёт расхода вручную.
 *
 * Нужен на случай, когда снимок разошёлся с правдой: например, строки удалили
 * в обход обычного пути или что-то пошло не так при импорте. Считает только
 * своё пространство — идентификатор берётся из сессии, а не из запроса,
 * поэтому пересчитать чужое нечем.
 */
export async function recountUsageAction(): Promise<{ ok: boolean; error?: string }> {
  const member = await requireMember()
  try {
    await recountWorkspace(member.workspaceId)
    revalidatePath('/usage')
    return { ok: true }
  } catch (error) {
    console.error('[usage] пересчёт не удался', { workspaceId: member.workspaceId, error })
    return { ok: false, error: 'Не удалось пересчитать. Попробуйте ещё раз.' }
  }
}
