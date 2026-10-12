/** Shared by upload validation, storage headers and attachment previews. */
export const MAX_FILE_BYTES = 25 * 1024 * 1024

export const INLINE_IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
export const ALLOWED_MIME = new Set([
  ...INLINE_IMAGE_MIME,
  'application/pdf',
  'text/plain', 'text/csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/zip',
])

export function isAllowed(mime: string): boolean {
  return ALLOWED_MIME.has(mime)
}

export function isInlineImage(mime: string): boolean {
  return INLINE_IMAGE_MIME.has(mime)
}

function isSvg(name: string, mime: string): boolean {
  return mime.split(';')[0]!.trim().toLowerCase() === 'image/svg+xml' || /\.svg\s*$/i.test(name)
}

export function validateFileMetadata(file: { name: string; type: string; size: number }): string | null {
  if (file.name.length > 255) return 'Имя файла слишком длинное. Сократите его до 255 символов.'
  if (file.size > MAX_FILE_BYTES) return 'Файл больше 25 МБ'
  if (isSvg(file.name, file.type)) return 'SVG не поддерживается. Используйте PNG, JPEG, WebP или GIF.'
  if (!isAllowed(file.type)) return 'Этот тип файла не поддерживается'
  return null
}

/** This is format identification, not a complete image decoder. */
function imageMime(bytes: Uint8Array): string | null {
  const matches = (offset: number, signature: readonly number[]) =>
    signature.every((byte, index) => bytes[offset + index] === byte)
  if (matches(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png'
  if (matches(0, [0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (matches(0, [0x47, 0x49, 0x46, 0x38]) && (matches(4, [0x37, 0x61]) || matches(4, [0x39, 0x61]))) return 'image/gif'
  if (matches(0, [0x52, 0x49, 0x46, 0x46]) && matches(8, [0x57, 0x45, 0x42, 0x50]) && (
    matches(12, [0x56, 0x50, 0x38, 0x20]) || matches(12, [0x56, 0x50, 0x38, 0x4c]) || matches(12, [0x56, 0x50, 0x38, 0x58])
  )) return 'image/webp'
  return null
}

export function validateFileContent(file: { name: string; type: string; bytes: Uint8Array }): string | null {
  const error = validateFileMetadata({ ...file, size: file.bytes.byteLength })
  if (error) return error
  if (isInlineImage(file.type) && imageMime(file.bytes) !== file.type) {
    return 'Содержимое файла не соответствует указанному формату изображения'
  }
  return null
}

/** Legacy SVG and unknown or mismatched MIME metadata are never documents on our origin. */
export function fileDeliveryHeaders(name: string, storedMime: string, recordMime = storedMime): Record<string, string> {
  const consistent = storedMime === recordMime && !isSvg(name, storedMime)
  const inline = consistent && isInlineImage(storedMime)
  return {
    'Content-Type': consistent && isAllowed(storedMime) ? storedMime : 'application/octet-stream',
    'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(name)}`,
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "sandbox; default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    'Cache-Control': 'private, no-store',
  }
}
