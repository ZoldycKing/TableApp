/** Turn movement author emails / role locals into a human label for inventory UI. */
export function formatInventoryAuthor(raw: string): string {
  const value = raw.trim()
  if (!value) return ''
  const local = (value.includes('@') ? value.slice(0, value.indexOf('@')) : value).trim().toLowerCase()
  if (!local) return ''
  const known: Record<string, string> = {
    owner: 'Иван Орлов',
    'owner-inv': 'Иван Орлов',
    staff: 'Мария Соколова',
    kladovshik: 'Мария Соколова',
    'ivan.orlov': 'Иван Орлов',
    'maria.sokolova': 'Мария Соколова',
    admin: 'Иван Орлов',
    editor: 'Пётр Белов',
    manager: 'Анна Крылова',
  }
  if (known[local]) return known[local]
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

/** Compact journal warehouse label (drop trailing «склад» so meta fits on 390). */
export function formatInventoryJournalWarehouse(raw: string): string {
  const value = raw.trim()
  if (!value) return ''
  return value.replace(/\s+склад$/iu, '').trim() || value
}

/** Compact journal timestamp: «08.11, 10:00» (keep year when not current). */
export function formatInventoryJournalWhen(raw: string, now = new Date()): string {
  const value = raw.trim()
  if (!value) return ''
  const display = value.match(/^(\d{2})\.(\d{2})\.(\d{4})(?:,?\s*(\d{1,2}:\d{2}))?/)
  if (display) {
    const [, dd, mm, yyyy, time] = display
    const date = Number(yyyy) === now.getFullYear() ? `${dd}.${mm}` : `${dd}.${mm}.${yyyy}`
    return time ? `${date}, ${time}` : date
  }
  const iso = Date.parse(value)
  if (!Number.isFinite(iso)) return value
  const date = new Date(iso)
  const dd = String(date.getDate()).padStart(2, '0')
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const yyyy = date.getFullYear()
  const hh = String(date.getHours()).padStart(2, '0')
  const mi = String(date.getMinutes()).padStart(2, '0')
  const hasTime = /T\d{2}:\d{2}/.test(value) || value.includes(',')
  const short = yyyy === now.getFullYear() ? `${dd}.${mm}` : `${dd}.${mm}.${yyyy}`
  return hasTime ? `${short}, ${hh}:${mi}` : short
}
