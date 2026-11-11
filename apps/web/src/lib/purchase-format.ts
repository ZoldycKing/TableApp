/** Purchase money: always `N NNN,00 ₽` (ru-RU, min 2 fraction digits). */
export function purchaseMoney(value: number): string {
  if (!Number.isFinite(value)) return '—'
  return `${value.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽`
}

/** Purchase dates always include the year: dd.mm.yyyy (avoids overflow-wrap splitting «11.11»). */
export function formatPurchaseDate(raw: string, now = new Date()): string {
  const value = raw.trim()
  if (!value) return ''
  const display = value.match(/^(\d{2})\.(\d{2})\.(\d{4})/)
  if (display) return `${display[1]}.${display[2]}.${display[3]}`
  const iso = Date.parse(value)
  if (!Number.isFinite(iso)) return value
  const date = new Date(iso)
  // Prefer calendar parts from the ISO string when present to avoid TZ day shifts for date-only values.
  const ymd = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (ymd && !/T\d{2}:\d{2}/.test(value)) return `${ymd[3]}.${ymd[2]}.${ymd[1]}`
  const dd = String(date.getDate()).padStart(2, '0')
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const yyyy = date.getFullYear() || now.getFullYear()
  return `${dd}.${mm}.${yyyy}`
}
