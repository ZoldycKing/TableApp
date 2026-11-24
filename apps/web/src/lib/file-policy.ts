/** Shared by upload validation, storage headers and attachment previews. */

function envInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim()
  if (!raw) return fallback
  const value = Number(raw)
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback
}

/** Per-file limit; override with UPLOAD_MAX_BYTES (bytes). Default 15 MB. */
export const MAX_FILE_BYTES = envInt('UPLOAD_MAX_BYTES', 15 * 1024 * 1024)
export const MAX_FILE_MB = Math.max(1, Math.round(MAX_FILE_BYTES / (1024 * 1024)))

/** Per-user uploads per minute across the app; override with UPLOAD_RATE_LIMIT. */
export const UPLOAD_RATE_LIMIT = envInt('UPLOAD_RATE_LIMIT', 120)

export const INLINE_IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
/** HEIC is accepted on upload only when it can be re-encoded to JPEG. */
export const SOURCE_IMAGE_MIME = new Set([...INLINE_IMAGE_MIME, 'image/heic', 'image/heif'])

export const ALLOWED_MIME = new Set([
  ...INLINE_IMAGE_MIME,
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])

export const SCAN_STATUS = ['pending', 'clean', 'infected', 'skipped'] as const
export type ScanStatus = (typeof SCAN_STATUS)[number]

export function isAllowed(mime: string): boolean {
  return ALLOWED_MIME.has(mime)
}

export function isInlineImage(mime: string): boolean {
  return INLINE_IMAGE_MIME.has(mime)
}

function isSvg(name: string, mime: string): boolean {
  return mime.split(';')[0]!.trim().toLowerCase() === 'image/svg+xml' || /\.svg\s*$/i.test(name)
}

function matches(bytes: Uint8Array, offset: number, signature: readonly number[]): boolean {
  return signature.every((byte, index) => bytes[offset + index] === byte)
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return Buffer.from(bytes.subarray(start, start + length)).toString('latin1')
}

function containsAscii(bytes: Uint8Array, needle: string): boolean {
  return Buffer.from(bytes).includes(Buffer.from(needle, 'ascii'))
}

/** Raster and HEIC/HEIF identification from magic bytes. */
export function imageMime(bytes: Uint8Array): string | null {
  if (matches(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png'
  if (matches(bytes, 0, [0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (matches(bytes, 0, [0x47, 0x49, 0x46, 0x38]) && (matches(bytes, 4, [0x37, 0x61]) || matches(bytes, 4, [0x39, 0x61]))) {
    return 'image/gif'
  }
  if (matches(bytes, 0, [0x52, 0x49, 0x46, 0x46]) && matches(bytes, 8, [0x57, 0x45, 0x42, 0x50]) && (
    matches(bytes, 12, [0x56, 0x50, 0x38, 0x20]) || matches(bytes, 12, [0x56, 0x50, 0x38, 0x4c]) || matches(bytes, 12, [0x56, 0x50, 0x38, 0x58])
  )) return 'image/webp'
  // ISO BMFF: ftyp....heic / heif / mif1 / msf1
  if (bytes.byteLength >= 12 && ascii(bytes, 4, 4) === 'ftyp') {
    const brand = ascii(bytes, 8, 4).toLowerCase()
    if (brand === 'heic' || brand === 'heix' || brand === 'hevc' || brand === 'hevx') return 'image/heic'
    if (brand === 'heif' || brand === 'mif1' || brand === 'msf1') return 'image/heif'
    const brands = ascii(bytes, 8, Math.min(64, bytes.byteLength - 8)).toLowerCase()
    if (brands.includes('heic') || brands.includes('heix')) return 'image/heic'
    if (brands.includes('heif') || brands.includes('mif1')) return 'image/heif'
  }
  return null
}

function isExecutable(bytes: Uint8Array): boolean {
  if (matches(bytes, 0, [0x4d, 0x5a])) return true // PE/MZ
  if (matches(bytes, 0, [0x7f, 0x45, 0x4c, 0x46])) return true // ELF
  if (matches(bytes, 0, [0xca, 0xfe, 0xba, 0xbe]) || matches(bytes, 0, [0xcf, 0xfa, 0xed, 0xfe])) return true // Mach-O
  if (matches(bytes, 0, [0x23, 0x21])) { // shebang
    const line = ascii(bytes, 0, Math.min(80, bytes.byteLength)).split(/\r?\n/, 1)[0] ?? ''
    if (/^#!\s*\/.*(bash|sh|python|perl|ruby|node|php)/i.test(line)) return true
  }
  return false
}

function looksLikeHtmlOrSvg(bytes: Uint8Array): boolean {
  const head = Buffer.from(bytes.subarray(0, Math.min(512, bytes.byteLength))).toString('utf8').trimStart().toLowerCase()
  return head.startsWith('<!doctype html') || head.startsWith('<html') || head.startsWith('<svg')
    || /<script[\s>]/i.test(head) || head.startsWith('<?xml') && head.includes('<svg')
}

function isMostlyText(bytes: Uint8Array): boolean {
  if (bytes.byteLength === 0) return false
  let control = 0
  for (let i = 0; i < bytes.byteLength; i += 1) {
    const b = bytes[i]!
    if (b === 0) return false
    if (b < 0x09 || (b > 0x0d && b < 0x20 && b !== 0x1b)) control += 1
  }
  return control / bytes.byteLength < 0.02
}

type OfficeKind = 'docx' | 'xlsx' | 'macro' | 'zip'

/** OOXML packages are ZIP containers; classify by internal paths, reject macros and plain archives. */
function classifyZip(bytes: Uint8Array): OfficeKind | null {
  if (!matches(bytes, 0, [0x50, 0x4b, 0x03, 0x04]) && !matches(bytes, 0, [0x50, 0x4b, 0x05, 0x06]) && !matches(bytes, 0, [0x50, 0x4b, 0x07, 0x08])) {
    return null
  }
  const sample = Buffer.from(bytes.subarray(0, Math.min(bytes.byteLength, 2 * 1024 * 1024))).toString('latin1')
  if (/\[Content_Types\]\.xml/i.test(sample) === false && !sample.includes('word/') && !sample.includes('xl/')) {
    return 'zip'
  }
  if (/macroEnabled|vbaProject|vbaproject/i.test(sample)) return 'macro'
  if (sample.includes('word/')) return 'docx'
  if (sample.includes('xl/')) return 'xlsx'
  return 'zip'
}

/**
 * Detect allowed MIME from file content (magic bytes / structure).
 * Client-declared type and extension are not trusted for allowlisting.
 */
export function detectAllowedMime(bytes: Uint8Array, name = ''): { mime: string } | { error: string } {
  if (bytes.byteLength === 0) return { error: 'Файл пустой. Выберите другой файл.' }
  if (bytes.byteLength > MAX_FILE_BYTES) return { error: `Файл больше ${MAX_FILE_MB} МБ` }
  if (isSvg(name, '') || looksLikeHtmlOrSvg(bytes)) {
    return { error: 'HTML, SVG и скрипты загружать нельзя. Используйте PNG, JPEG, WebP, GIF, PDF, DOCX, XLSX, TXT или CSV.' }
  }
  if (isExecutable(bytes)) {
    return { error: 'Исполняемые файлы и скрипты загружать нельзя.' }
  }

  const image = imageMime(bytes)
  if (image) {
    if (image === 'image/heic' || image === 'image/heif') return { mime: image }
    if (INLINE_IMAGE_MIME.has(image)) return { mime: image }
  }

  if (matches(bytes, 0, [0x25, 0x50, 0x44, 0x46])) return { mime: 'application/pdf' }

  const zip = classifyZip(bytes)
  if (zip === 'macro') {
    return { error: 'Файлы Office с макросами (DOCM, XLSM и подобные) запрещены. Сохраните документ без макросов.' }
  }
  if (zip === 'zip') {
    return { error: 'Архивы загружать нельзя. Прикрепите сам документ или изображение.' }
  }
  if (zip === 'docx') return { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }
  if (zip === 'xlsx') return { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }

  if (isMostlyText(bytes)) {
    // Prefer CSV when the name or first line looks tabular; otherwise plain text.
    const head = Buffer.from(bytes.subarray(0, Math.min(4096, bytes.byteLength))).toString('utf8')
    if (/\.csv\s*$/i.test(name) || /^[^\n]{0,500};[^\n]{0,500}$/m.test(head) || /^[^\n]{0,500},[^\n]{0,500}$/m.test(head) && (head.match(/,/g)?.length ?? 0) >= 2) {
      return { mime: 'text/csv' }
    }
    return { mime: 'text/plain' }
  }

  return { error: 'Этот тип файла не поддерживается. Допустимы изображения (PNG, JPEG, WebP, GIF), PDF, DOCX, XLSX, TXT и CSV.' }
}

export function validateFileMetadata(file: { name: string; type: string; size: number }): string | null {
  if (file.name.length > 255) return 'Имя файла слишком длинное. Сократите его до 255 символов.'
  if (file.size > MAX_FILE_BYTES) return `Файл больше ${MAX_FILE_MB} МБ`
  if (isSvg(file.name, file.type)) {
    return 'SVG не поддерживается. Используйте PNG, JPEG, WebP или GIF.'
  }
  const declared = file.type.split(';')[0]!.trim().toLowerCase()
  if (declared && !SOURCE_IMAGE_MIME.has(declared) && !isAllowed(declared) && declared !== 'application/octet-stream') {
    // Soft client hint only — content check is authoritative. Reject obvious bad types early.
    if (declared === 'text/html' || declared === 'image/svg+xml' || declared.includes('javascript')
      || declared.includes('executable') || declared === 'application/zip' || declared === 'application/x-msdownload'
      || declared.includes('macroenabled')) {
      return 'Этот тип файла не поддерживается'
    }
  }
  return null
}

export function validateFileContent(file: { name: string; type: string; bytes: Uint8Array }): string | null {
  const meta = validateFileMetadata({ ...file, size: file.bytes.byteLength })
  if (meta) return meta
  const detected = detectAllowedMime(file.bytes, file.name)
  if ('error' in detected) return detected.error
  return null
}

/** Resolve the MIME that will be stored after content inspection. */
export function resolvedUploadMime(file: { name: string; bytes: Uint8Array }): { mime: string } | { error: string } {
  return detectAllowedMime(file.bytes, file.name)
}

/**
 * Delivery headers. Inline is allowed only for scrubbed (re-encoded) raster images.
 * Legacy or unmatched metadata always downloads as an attachment with a generic type.
 */
export function fileDeliveryHeaders(
  name: string,
  storedMime: string,
  recordMime = storedMime,
  options?: { scrubbed?: boolean },
): Record<string, string> {
  const consistent = storedMime === recordMime && !isSvg(name, storedMime)
  const scrubbed = Boolean(options?.scrubbed)
  const inline = consistent && scrubbed && isInlineImage(storedMime)
  return {
    'Content-Type': consistent && isAllowed(storedMime) ? storedMime : 'application/octet-stream',
    'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(name)}`,
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "sandbox; default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    'Cache-Control': 'private, no-store',
  }
}

/** Optional separate files origin (empty = same app origin). */
export function filesPublicOrigin(): string {
  return (process.env.NEXT_PUBLIC_FILES_ORIGIN ?? process.env.FILES_PUBLIC_ORIGIN ?? '').replace(/\/$/, '')
}
