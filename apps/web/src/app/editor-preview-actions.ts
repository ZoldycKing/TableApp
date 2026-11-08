'use server'

import { appSchema } from '@tableapp/schema'
import { authorizeApp } from '@/lib/authorize'
import { validateAppReferences } from '@/lib/app-references'
import { loadEditorPreview, type EditorPreview } from '@/lib/editor-preview'

/** Read-only draft preview; never saves or publishes the submitted definition. */
export async function editorPreviewAction(appId: string, definition: unknown, role: string, email: string, company: string): Promise<{ ok: true; preview: EditorPreview } | { ok: false; error: string }> {
  const auth = await authorizeApp(appId, false)
  if (!auth.ok) return auth
  const parsed = appSchema.safeParse(definition)
  if (!parsed.success || parsed.data.id !== appId || parsed.data.workspaceId !== auth.member.workspaceId ||
    typeof role !== 'string' || !['editor', 'anonymous', ...parsed.data.roles.map(role => role.id)].includes(role) ||
    typeof email !== 'string' || email.length > 254 || typeof company !== 'string' || company.length > 200) return { ok: false, error: 'Проверьте настройки предпросмотра.' }
  const invalid = await validateAppReferences(parsed.data)
  if (invalid) return { ok: false, error: invalid }
  try { return { ok: true, preview: await loadEditorPreview(auth.member.workspaceId, parsed.data, role, email, company) } }
  catch { return { ok: false, error: 'Не удалось обновить предпросмотр. Повторите попытку.' } }
}
