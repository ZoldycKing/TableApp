import { describe, expect, it } from 'vitest'
import {
  detectAllowedMime,
  fileDeliveryHeaders,
  isAllowed,
  isInlineImage,
  MAX_FILE_BYTES,
  MAX_FILE_MB,
  validateFileContent,
  validateFileMetadata,
} from './file-policy'

const imageHeaders = [
  ['image/png', 'photo.png', [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  ['image/jpeg', 'photo.jpg', [0xff, 0xd8, 0xff]],
  ['image/gif', 'photo.gif', [...Buffer.from('GIF89a')]],
  ['image/webp', 'photo.webp', [...Buffer.from('RIFF\0\0\0\0WEBPVP8 ')]],
] as const

function zipWithPaths(...paths: string[]): Uint8Array {
  // Minimal store-only ZIP with empty local file entries for path sniffing.
  const parts: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0
  for (const path of paths) {
    const name = Buffer.from(path, 'utf8')
    const local = Buffer.alloc(30 + name.length)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0, 6)
    local.writeUInt16LE(0, 8)
    local.writeUInt16LE(0, 10)
    local.writeUInt16LE(0, 12)
    local.writeUInt32LE(0, 14)
    local.writeUInt32LE(0, 18)
    local.writeUInt32LE(0, 22)
    local.writeUInt16LE(name.length, 26)
    local.writeUInt16LE(0, 28)
    name.copy(local, 30)
    parts.push(local)
    const cen = Buffer.alloc(46 + name.length)
    cen.writeUInt32LE(0x02014b50, 0)
    cen.writeUInt16LE(20, 4)
    cen.writeUInt16LE(20, 6)
    cen.writeUInt16LE(0, 8)
    cen.writeUInt16LE(0, 10)
    cen.writeUInt16LE(0, 12)
    cen.writeUInt16LE(0, 14)
    cen.writeUInt32LE(0, 16)
    cen.writeUInt32LE(0, 20)
    cen.writeUInt32LE(0, 24)
    cen.writeUInt16LE(name.length, 28)
    cen.writeUInt16LE(0, 30)
    cen.writeUInt16LE(0, 32)
    cen.writeUInt16LE(0, 34)
    cen.writeUInt16LE(0, 36)
    cen.writeUInt32LE(0, 38)
    cen.writeUInt32LE(offset, 42)
    name.copy(cen, 46)
    central.push(cen)
    offset += local.length
  }
  const centralDir = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(0, 4)
  end.writeUInt16LE(0, 6)
  end.writeUInt16LE(paths.length, 8)
  end.writeUInt16LE(paths.length, 10)
  end.writeUInt32LE(centralDir.length, 12)
  end.writeUInt32LE(offset, 16)
  end.writeUInt16LE(0, 20)
  return new Uint8Array(Buffer.concat([...parts, centralDir, end]))
}

describe('uploaded file validation', () => {
  it.each(imageHeaders)('recognizes %s from magic bytes', (type, name, signature) => {
    expect(detectAllowedMime(new Uint8Array(signature), name)).toEqual({ mime: type })
    expect(validateFileContent({ name, type: 'application/octet-stream', bytes: new Uint8Array(signature) })).toBeNull()
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
    expect(validateFileContent({ name: 'photo.jpg', type: 'image/jpeg', bytes: new Uint8Array(imageHeaders[0][2]) })).toBeNull()
    expect(detectAllowedMime(new Uint8Array(imageHeaders[0][2]), 'photo.jpg')).toEqual({ mime: 'image/png' })
    expect(validateFileContent({ name: 'empty.png', type: 'image/png', bytes: new Uint8Array() })).not.toBeNull()
  })
  it('checks size before allocating file bytes', () => {
    expect(validateFileMetadata({ name: 'photo.png', type: 'image/png', size: MAX_FILE_BYTES })).toBeNull()
    expect(validateFileMetadata({ name: 'photo.png', type: 'image/png', size: MAX_FILE_BYTES + 1 })).toBe(`Файл больше ${MAX_FILE_MB} МБ`)
  })
  it('does not accept HTML, ZIP archives or unknown MIME types', () => {
    expect(isAllowed('text/html')).toBe(false)
    expect(isAllowed('image/svg+xml')).toBe(false)
    expect(isAllowed('application/octet-stream')).toBe(false)
    expect(isAllowed('application/zip')).toBe(false)
    expect(validateFileMetadata({ name: 'page.html', type: 'text/html', size: 1 })).not.toBeNull()
    expect(detectAllowedMime(Buffer.from('<!DOCTYPE html><html></html>'), 'page.html')).toMatchObject({ error: expect.stringMatching(/HTML|SVG/i) })
    expect(detectAllowedMime(zipWithPaths('readme.txt'), 'archive.zip')).toMatchObject({ error: expect.stringMatching(/Архив/i) })
  })
  it('accepts PDF and OOXML by content, rejects macro-enabled packages', () => {
    expect(detectAllowedMime(Buffer.from('%PDF-1.7\n'), 'doc.pdf')).toEqual({ mime: 'application/pdf' })
    expect(detectAllowedMime(zipWithPaths('[Content_Types].xml', 'word/document.xml'), 'letter.docx')).toEqual({
      mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    })
    expect(detectAllowedMime(zipWithPaths('[Content_Types].xml', 'xl/workbook.xml'), 'sheet.xlsx')).toEqual({
      mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    expect(detectAllowedMime(zipWithPaths('[Content_Types].xml', 'word/document.xml', 'word/vbaProject.bin'), 'macro.docm')).toMatchObject({
      error: expect.stringMatching(/макрос/i),
    })
  })
  it('accepts plain text and CSV by content', () => {
    expect(detectAllowedMime(Buffer.from('hello world\n'), 'note.txt')).toEqual({ mime: 'text/plain' })
    expect(detectAllowedMime(Buffer.from('a,b,c\n1,2,3\n'), 'data.csv')).toEqual({ mime: 'text/csv' })
  })
  it('rejects executables and scripts by magic bytes', () => {
    expect(detectAllowedMime(Buffer.from([0x4d, 0x5a, 0x90, 0x00]), 'tool.exe')).toMatchObject({ error: expect.stringMatching(/Исполняем/i) })
    expect(detectAllowedMime(Buffer.from('#!/usr/bin/env bash\necho hi\n'), 'run.sh')).toMatchObject({ error: expect.stringMatching(/Исполняем|скрипт/i) })
  })
})

describe('delivery of current and legacy files', () => {
  it.each(imageHeaders)('downloads %s as attachment unless scrubbed', (mime, name) => {
    const headers = fileDeliveryHeaders(name, mime)
    expect(headers['Content-Type']).toBe(mime)
    expect(headers['Content-Disposition']).toMatch(/^attachment;/)
    expect(headers['X-Content-Type-Options']).toBe('nosniff')
    expect(headers['Content-Security-Policy']).toContain('sandbox;')
    expect(headers['Content-Security-Policy']).not.toContain('allow-scripts')
    expect(headers['Cache-Control']).toBe('private, no-store')
  })
  it.each(imageHeaders)('displays scrubbed %s inline with isolation headers', (mime, name) => {
    const headers = fileDeliveryHeaders(name, mime, mime, { scrubbed: true })
    expect(headers['Content-Type']).toBe(mime)
    expect(headers['Content-Disposition']).toMatch(/^inline;/)
  })
  it.each([
    ['old.svg', 'image/svg+xml', 'image/svg+xml'],
    ['old.svg', 'image/png', 'image/png'],
    ['old.png', 'image/svg+xml', 'image/png'],
    ['old.png', 'image/png', 'image/svg+xml'],
    ['old.html', 'text/html', 'text/html'],
  ])('downloads legacy or mismatched metadata %s / %s / %s', (name, mime, recordMime) => {
    const headers = fileDeliveryHeaders(name, mime, recordMime, { scrubbed: true })
    expect(headers['Content-Disposition']).toMatch(/^attachment;/)
    expect(headers['Content-Type']).toBe('application/octet-stream')
    expect(headers['X-Content-Type-Options']).toBe('nosniff')
  })
  it.each(['application/pdf', 'text/plain', 'text/csv'])('downloads %s instead of creating a document on our origin', (mime) => {
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
