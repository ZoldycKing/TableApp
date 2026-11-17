import { readFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { buildWorkActPdf } from './dispatch-act'

function pdfText(pdf: Uint8Array) {
  const raw = Buffer.from(pdf).toString('latin1')
  const parts: string[] = []
  for (const match of raw.matchAll(/stream\r?\n([\s\S]*?)endstream/g)) {
    const body = Buffer.from(match[1]!, 'latin1')
    try { parts.push(inflateSync(body).toString('latin1')) } catch { parts.push(match[1]!) }
  }
  return parts.join('\n')
}

const font = readFileSync(new URL('../../public/template-media/dispatch/NotoSans-Regular.ttf', import.meta.url))
const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'))

describe('work act pdf', () => {
  it('embeds Cyrillic, the checklist, the total and the photos on the first page', async () => {
    const pdf = await buildWorkActPdf({
      client: 'Аптека «Здоровье»',
      address: 'Москва, ул. Пятницкая, 18',
      technician: 'Игорь Белов',
      date: '17.11.2026',
      actualTime: '38 мин',
      checklist: [
        { label: 'Отключить группу', done: true },
        { label: 'Заменить лампы', done: true },
      ],
      notes: 'Заменили 6 ламп витрины, проверили автомат.',
      works: [{ name: 'Замена ламп витрины', amount: 2800 }, { name: 'Выезд мастера', amount: 1000 }],
      materials: [{ name: 'Лампа LED 10 Вт', amount: 400 }],
      total: '4 200 ₽',
      photos: [{ bytes: png, mime: 'image/png' }],
      signature: { bytes: png, mime: 'image/png' },
    }, font)
    expect(Buffer.from(pdf.subarray(0, 5)).toString()).toBe('%PDF-')
    const doc = await PDFDocument.load(pdf)
    expect(doc.getPageCount()).toBe(1)
    const text = pdfText(pdf)
    expect(text).toContain('<0410>')
    expect(text).toContain('<0437>')
    expect(text).toContain('ToUnicode')
  })
})
