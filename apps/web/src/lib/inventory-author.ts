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
