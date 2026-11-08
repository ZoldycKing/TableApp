export type AppEntry = { e: string; r?: string }

export function appEntry(screenId: unknown, rowId: unknown): AppEntry | undefined {
  const id = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/
  if (typeof screenId !== 'string' || !id.test(screenId)) return undefined
  return { e: screenId, ...(typeof rowId === 'string' && id.test(rowId) ? { r: rowId } : {}) }
}

export function appEntryPath(slug: string, entry?: AppEntry): string {
  return `/a/${encodeURIComponent(slug)}${entry ? `?${new URLSearchParams(entry)}` : ''}`
}
