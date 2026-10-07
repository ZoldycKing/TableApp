import { describe, expect, it } from 'vitest'
import { fileDeliveryHeaders, isAllowed, isInlineImage, MAX_FILE_BYTES, validateFileContent, validateFileMetadata } from './file-policy'

const imageHeaders = [
  ['image/png', 'photo.png', [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  ['image/jpeg', 'photo.jpg', [0xff, 0xd8, 0xff]],
  ['image/gif', 'photo.gif', [...Buffer.from('GIF89a')]],
  ['image/webp', 'photo.webp', [...Buffer.from('RIFF\0\0\0\0WEBPVP8 ')]],
] as const

describe('uploaded file validation', () => {
  it.each(imageHeaders)('recognizes %s for inline display', (type, name, signature) => {
    expect(validateFileContent({ name, type, bytes: new Uint8Array(signature) })).toBeNull()
  })
  it.each(imageHeaders)('rejects SVG disguised as %s', (type, name) => {
    expect(validateFileContent({ name, type, bytes: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>/* synthetic */</script></svg>') })).not.toBeNull()
  })
  it.each([
    { name: 'image.svg', type: 'image/svg+xml' },
    { name: 'image.SVG', type: 'image/png' },
    { name: 'image.png', type: 'IMAGE/SVG+XML; charset=utf-8' },
    { name: 'image.svg ', type: 'text/plain' },
  ])('rejects SVG metadata $name / $type', (file) => {
    expect(validateFileMetadata({ ...file, size: 1 })).toContain('SVG')
  })
  it('rejects a claimed raster format different from its signature', () => {
    expect(validateFileContent({ name: 'photo.jpg', type: 'image/jpeg', bytes: new Uint8Array(imageHeaders[0][2]) })).not.toBeNull()
    expect(validateFileContent({ name: 'empty.png', type: 'image/png', bytes: new Uint8Array() })).not.toBeNull()
  })
  it('checks size before allocating file bytes', () => {
    expect(validateFileMetadata({ name: 'photo.png', type: 'image/png', size: MAX_FILE_BYTES })).toBeNull()
    expect(validateFileMetadata({ name: 'photo.png', type: 'image/png', size: MAX_FILE_BYTES + 1 })).toBe('Файл больше 25 МБ')
  })
  it('does not accept HTML or unknown MIME types', () => {
    expect(isAllowed('text/html')).toBe(false)
    expect(isAllowed('image/svg+xml')).toBe(false)
    expect(isAllowed('application/octet-stream')).toBe(false)
    expect(validateFileMetadata({ name: 'image.png', type: '', size: 1 })).not.toBeNull()
  })
})

describe('delivery of current and legacy files', () => {
  it.each(imageHeaders)('displays %s inline with isolation headers', (mime, name) => {
    const headers = fileDeliveryHeaders(name, mime)
    expect(headers['Content-Type']).toBe(mime)
    expect(headers['Content-Disposition']).toMatch(/^inline;/)
    expect(headers['X-Content-Type-Options']).toBe('nosniff')
    expect(headers['Content-Security-Policy']).toContain('sandbox;')
    expect(headers['Content-Security-Policy']).not.toContain('allow-scripts')
    expect(headers['Cache-Control']).toBe('private, no-store')
  })
  it.each([
    ['old.svg', 'image/svg+xml', 'image/svg+xml'],
    ['old.svg', 'image/png', 'image/png'],
    ['old.png', 'image/svg+xml', 'image/png'],
    ['old.png', 'image/png', 'image/svg+xml'],
    ['old.html', 'text/html', 'text/html'],
  ])('downloads legacy or mismatched metadata %s / %s / %s', (name, mime, recordMime) => {
    const headers = fileDeliveryHeaders(name, mime, recordMime)
    expect(headers['Content-Disposition']).toMatch(/^attachment;/)
    expect(headers['Content-Type']).toBe('application/octet-stream')
    expect(headers['X-Content-Type-Options']).toBe('nosniff')
  })
  it.each(['application/pdf', 'text/plain', 'text/csv', 'application/zip'])('downloads %s instead of creating a document on our origin', (mime) => {
    const headers = fileDeliveryHeaders('document', mime)
    expect(headers['Content-Disposition']).toMatch(/^attachment;/)
    expect(headers['Content-Type']).toBe(mime)
  })
  it('escapes arbitrary filenames without adding response headers', () => {
    const headers = fileDeliveryHeaders('файл\r\nInjected: true.svg', 'image/svg+xml')
    expect(headers['Content-Disposition']).not.toMatch(/[\r\n]/)
    expect(headers['Content-Disposition']).toContain('%0D%0A')
  })
  it('does not advertise SVG as an image preview', () => {
    expect(isInlineImage('image/svg+xml')).toBe(false)
    expect(isInlineImage('image/png')).toBe(true)
  })
})
