/**
 * Разбор CSV без внешних зависимостей.
 *
 * Русский Excel по умолчанию сохраняет CSV в windows-1251 с точкой с запятой
 * в качестве разделителя. Файл, выгруженный бухгалтером, почти никогда не UTF-8,
 * и если это не распознать автоматически, онбординг ломается на первом же шаге.
 */

const BOM_UTF8 = [0xef, 0xbb, 0xbf]

export type Encoding = 'utf-8' | 'windows-1251'

export function detectEncoding(bytes: Uint8Array): Encoding {
  if (bytes.length >= 3 && BOM_UTF8.every((b, i) => bytes[i] === b)) return 'utf-8'

  // Валидный UTF-8 распознаётся по структуре продолжающих байтов.
  let i = 0
  let sawMultibyte = false
  while (i < bytes.length) {
    const byte = bytes[i]!
    if (byte < 0x80) { i++; continue }
    let extra = 0
    if (byte >= 0xc2 && byte <= 0xdf) extra = 1
    else if (byte >= 0xe0 && byte <= 0xef) extra = 2
    else if (byte >= 0xf0 && byte <= 0xf4) extra = 3
    else return 'windows-1251'

    if (i + extra >= bytes.length) return 'windows-1251'
    for (let k = 1; k <= extra; k++) {
      const next = bytes[i + k]!
      if (next < 0x80 || next > 0xbf) return 'windows-1251'
    }
    sawMultibyte = true
    i += extra + 1
  }
  // Чистый ASCII декодируется одинаково в обеих кодировках.
  return sawMultibyte || bytes.length === 0 ? 'utf-8' : 'utf-8'
}

export function decodeBytes(bytes: Uint8Array): string {
  const encoding = detectEncoding(bytes)
  const text = new TextDecoder(encoding).decode(bytes)
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

const CANDIDATE_DELIMITERS = [';', ',', '\t', '|'] as const
export type Delimiter = (typeof CANDIDATE_DELIMITERS)[number]

/** Разделитель выбирается по тому, какой даёт стабильное число колонок по строкам. */
export function detectDelimiter(text: string): Delimiter {
  const sample = text.split(/\r?\n/).filter((line) => line.trim() !== '').slice(0, 20)
  if (sample.length === 0) return ','

  let best: Delimiter = ','
  let bestScore = -1

  for (const delimiter of CANDIDATE_DELIMITERS) {
    const counts = sample.map((line) => splitLine(line, delimiter).length)
    const first = counts[0]!
    if (first < 2) continue
    const consistent = counts.filter((c) => c === first).length / counts.length
    const score = consistent * 100 + first
    if (score > bestScore) {
      bestScore = score
      best = delimiter
    }
  }
  return best
}

function splitLine(line: string, delimiter: string): string[] {
  return parseRows(line, delimiter)[0] ?? []
}

/** Полноценный разбор с кавычками, экранированием "" и переводами строк внутри ячеек. */
export function parseRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  let i = 0

  const pushCell = () => { row.push(cell); cell = '' }
  const pushRow = () => { pushCell(); rows.push(row); row = [] }

  while (i < text.length) {
    const ch = text[i]!

    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i += 2; continue }
        quoted = false
        i++
        continue
      }
      cell += ch
      i++
      continue
    }

    if (ch === '"' && cell === '') { quoted = true; i++; continue }
    if (ch === delimiter) { pushCell(); i++; continue }
    if (ch === '\r') { i++; continue }
    if (ch === '\n') { pushRow(); i++; continue }

    cell += ch
    i++
  }

  if (cell !== '' || row.length > 0) pushRow()
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

export function parseCsv(input: Uint8Array | string): string[][] {
  const text = typeof input === 'string' ? input : decodeBytes(input)
  return parseRows(text, detectDelimiter(text))
}
