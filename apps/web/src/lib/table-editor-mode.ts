export type TableEditorMode = 'grid' | 'records'

export const TABLE_EDITOR_MODE_COOKIE = 'tableapp_table_mode'

function validMode(value: unknown): TableEditorMode | undefined {
  return value === 'grid' || value === 'records' ? value : undefined
}

/** An explicit link wins; ordinary entry uses the last choice or the simpler form. */
export function tableEditorMode(requested: unknown, remembered?: unknown): TableEditorMode {
  return validMode(requested) ?? validMode(remembered) ?? 'records'
}

export function rememberedTableEditorMode(cookie: string): TableEditorMode | undefined {
  const prefix = `${TABLE_EDITOR_MODE_COOKIE}=`
  return validMode(cookie.split(';').map(part => part.trim()).find(part => part.startsWith(prefix))?.slice(prefix.length))
}

export function rememberTableEditorMode(mode: TableEditorMode): void {
  try {
    document.cookie = `${TABLE_EDITOR_MODE_COOKIE}=${mode}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`
  } catch {
    // A blocked preference cookie must not prevent editing or switching modes.
  }
}
