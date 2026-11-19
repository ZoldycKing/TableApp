import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import type { ChecklistItem, MoneyLine } from './dispatch-stage2'

export type ActImage = { bytes: Uint8Array; mime: 'image/png' | 'image/jpeg' }

export type WorkActInput = {
  client: string
  address: string
  technician: string
  date: string
  /** Short act number, printed in the header. */
  number?: string
  company?: string
  actualTime: string
  checklist: readonly ChecklistItem[]
  notes: string
  works: readonly MoneyLine[]
  materials: readonly MoneyLine[]
  total: string
  photos: readonly ActImage[]
  signature: ActImage | null
  /** Who accepted the work. Falls back to the client name when empty. */
  signerName?: string
  signerPosition?: string
  /** «17.11.2026 в 14:32» */
  signedAt?: string
  noClaims?: boolean
  claims?: string
  signatureRefused?: boolean
  refusalReason?: string
}

/* Brand sage #3F6B5C and status success #1E8E4E — PDF cannot use CSS vars. */
const ink = rgb(63 / 255, 107 / 255, 92 / 255)
const muted = rgb(91 / 255, 90 / 255, 96 / 255)
const line = rgb(218 / 255, 215 / 255, 209 / 255)
const green = rgb(30 / 255, 142 / 255, 78 / 255)

function wrap(font: PDFFont, text: string, size: number, width: number): string[] {
  const source = text.replace(/\s+/g, ' ').trim()
  if (!source) return []
  const lines: string[] = []
  let current = ''
  for (const word of source.split(' ')) {
    const next = current ? `${current} ${word}` : word
    if (font.widthOfTextAtSize(next, size) <= width) current = next
    else {
      if (current) lines.push(current)
      current = word
    }
  }
  if (current) lines.push(current)
  return lines
}

function remarksLine(input: WorkActInput): string {
  if (input.noClaims === false) return input.claims?.trim() || 'не указаны'
  return 'Претензий нет'
}

function refusalStamp(input: WorkActInput): string {
  const when = input.signedAt?.trim() || '—'
  return `Отказ от подписи зафиксирован ${when}`
}

/** «Акт выполненных работ» as a one-page PDF. Cyrillic is drawn with the embedded font. */
export async function buildWorkActPdf(input: WorkActInput, fontBytes: Uint8Array): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  const font = await doc.embedFont(fontBytes, { subset: true })
  const page = doc.addPage([595.28, 841.89])
  const margin = 40
  const width = page.getWidth() - margin * 2
  let y = page.getHeight() - margin

  const text = (value: string, x: number, top: number, size: number, color = ink) => {
    page.drawText(value, { x, y: top - size, size, font, color })
  }
  const rule = (top: number) => {
    page.drawLine({ start: { x: margin, y: top }, end: { x: margin + width, y: top }, thickness: 0.6, color: line })
  }
  text('Акт выполненных работ', margin, y, 18)
  y -= 22
  text([input.company || 'Сервисный выезд', input.number ? `Акт № ${input.number}` : '', input.date].filter(Boolean).join(' · '), margin, y, 11, muted)
  y -= 18
  rule(y)
  y -= 16

  const facts: [string, string][] = [
    ['Клиент', input.client || 'Не указан'],
    ['Адрес', input.address || 'Не указан'],
    ['Мастер', input.technician || 'Не назначен'],
    ['Дата', input.date || 'Не указана'],
    ['Фактическое время', input.actualTime || 'Не указано'],
    ['Сумма', input.total || '0 ₽'],
  ]
  for (const [label, value] of facts) {
    text(label, margin, y, 9, muted)
    const lines = wrap(font, value, 11, width - 150)
    const shown = lines.length ? lines : ['—']
    shown.forEach((row, index) => text(row, margin + 150, y - index * 14, 11))
    y -= Math.max(18, shown.length * 14 + 4)
  }

  const section = (title: string) => {
    y -= 16
    text(title, margin, y, 12)
    y -= 16
    rule(y)
    y -= 14
  }

  const linesOf = (rows: readonly MoneyLine[]) => {
    if (!rows.length) {
      text('Нет', margin, y, 10, muted)
      y -= 16
      return
    }
    for (const row of rows) {
      const name = wrap(font, row.name, 10, width - 120)[0] ?? row.name
      text(name, margin, y, 10)
      const amount = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(row.amount)
      const amountWidth = font.widthOfTextAtSize(amount, 10)
      text(amount, margin + width - amountWidth, y, 10)
      y -= 15
    }
  }

  section('Работы')
  linesOf(input.works)
  section('Материалы')
  linesOf(input.materials)

  section('Чек-лист')
  if (!input.checklist.length) {
    text('Чек-лист не задан', margin, y, 10, muted)
    y -= 16
  } else {
    for (const item of input.checklist.slice(0, 12)) {
      drawCheck(page, margin, y - 11, item.done)
      const label = wrap(font, item.done ? item.label : `${item.label} — не выполнено`, 10, width - 22)[0] ?? item.label
      text(label, margin + 16, y, 10, item.done ? ink : muted)
      y -= 16
    }
  }

  section('Что сделано')
  const notes = wrap(font, input.notes || 'Отчёт не заполнен', 10, width)
  for (const row of notes.slice(0, 6)) {
    text(row, margin, y, 10)
    y -= 14
  }

  if (input.photos.length && y > 180) {
    const drawn: { image: Awaited<ReturnType<PDFDocument['embedPng']>>; }[] = []
    for (const photo of input.photos.slice(0, 4)) {
      try {
        const image = photo.mime === 'image/png' ? await doc.embedPng(photo.bytes) : await doc.embedJpg(photo.bytes)
        drawn.push({ image })
      } catch {
        // A photo that is not a readable JPEG or PNG stays out of the act.
      }
    }
    if (drawn.length) {
      section('Фото')
      let x = margin
      for (const photo of drawn) {
        const size = 64
        page.drawImage(photo.image, { x, y: y - size, width: size, height: size })
        x += size + 8
      }
      y -= 76
    }
  }

  if (y > 160) {
    section('Приёмка работ')
    const signer = input.signerName?.trim() || input.client.trim() || 'Клиент'
    const position = input.signerPosition?.trim()
    const technician = input.technician.trim()
    const acceptanceFacts: [string, string][] = [
      ['Работу принял', position ? `${signer}, ${position}` : signer],
    ]
    if (input.signatureRefused) {
      acceptanceFacts.push(['Статус', refusalStamp(input)])
      acceptanceFacts.push(['Причина', input.refusalReason?.trim() || 'не указана'])
    } else {
      if (input.signedAt?.trim()) acceptanceFacts.push(['Дата подписи', input.signedAt.trim()])
      acceptanceFacts.push(['Замечания', remarksLine(input)])
    }
    acceptanceFacts.push(['Исполнитель', technician || 'не назначен'])
    for (const [label, value] of acceptanceFacts) {
      text(label, margin, y, 9, muted)
      const lines = wrap(font, value, 11, width - 150)
      const shown = lines.length ? lines : ['—']
      shown.forEach((row, index) => text(row, margin + 150, y - index * 14, 11))
      y -= Math.max(18, shown.length * 14 + 4)
    }
    y -= 12
    text('Исполнитель ________________', margin, y, 10)
    text(`/ ${technician || 'не назначен'}`, margin + 210, y, 10)
    y -= 28
    const customer = input.signerName?.trim() || input.client.trim() || 'Заказчик'
    if (!input.signatureRefused && input.signature) {
      try {
        const image = input.signature.mime === 'image/png' ? await doc.embedPng(input.signature.bytes) : await doc.embedJpg(input.signature.bytes)
        page.drawImage(image, { x: margin + 78, y: y - 26, width: 118, height: 30 })
      } catch { /* blank signature line remains */ }
    }
    text('Заказчик ________________', margin, y, 10)
    text(`/ ${customer}`, margin + 210, y, 10)
  }

  return doc.save()
}

function drawCheck(page: PDFPage, x: number, y: number, done: boolean) {
  page.drawRectangle({ x, y, width: 9, height: 9, borderWidth: 1, borderColor: done ? green : muted, color: done ? green : rgb(0.96, 0.96, 0.95) })
  if (done) {
    page.drawLine({ start: { x: x + 2, y: y + 4 }, end: { x: x + 4, y: y + 2 }, thickness: 1.2, color: rgb(1, 1, 1) })
    page.drawLine({ start: { x: x + 4, y: y + 2 }, end: { x: x + 7.5, y: y + 7 }, thickness: 1.2, color: rgb(1, 1, 1) })
    return
  }
  page.drawLine({ start: { x: x + 2, y: y + 4.5 }, end: { x: x + 7, y: y + 4.5 }, thickness: 1.2, color: muted })
}
